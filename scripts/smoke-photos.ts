// Smoke test des photos de profil — la sienne, et celle d'un groupe.
//
//   bun scripts/smoke-photos.ts
//
// ## Ce qu'il éprouve, et ce qu'il ne peut pas éprouver
//
// Toute la chaîne **sauf le dépôt lui-même** : qui a le droit de demander une
// URL, ce qui est refusé avant qu'un octet ne parte, ce que la confirmation
// accepte d'enregistrer, ce que le retrait efface, et qui peut lire la photo
// d'un autre.
//
// Le dépôt réel manque exprès. Le `.env` de développement pointe le seau de
// **production** (`AWS_BUCKET_NAME=nkamva-production`) : déposer une image
// d'essai depuis cette machine la déposerait chez les vrais utilisateurs. Une
// **présignature**, elle, n'écrit rien — c'est une signature, pas un appel au
// stockage : on peut donc vérifier tout ce qui l'entoure sans rien salir.
//
// Ce qui reste à jouer à la main, une fois le seau d'essai en place : choisir
// une image dans `/profil`, la voir arriver dans la barre haute et dans la
// messagerie, la remplacer, la retirer.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Même recette que les autres smoke tests : `userId` et non `sub`. */
async function cookieFor(email: string) {
  const user = await db.user.findFirst({
    where: { email },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  if (!user) throw new Error(`compte absent : ${email} — lancez d'abord scripts/jeu-messagerie.ts`)
  const token = await encode({
    token: {
      userId: user.id,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  return { user, cookie: `next-auth.session-token=${token}` }
}

async function call(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const texte = await res.text()
  let json: any = null
  try {
    json = JSON.parse(texte)
  } catch {
    /* une redirection n'a pas de corps */
  }
  return { status: res.status, json, location: res.headers.get('location') }
}

const PNG = { mimeType: 'image/png', sizeBytes: 120_000 }

async function main() {
  const koffi = await cookieFor('koffi@essai.nkamva.test')
  // Le test retire pour de bon la photo du compte d'essai : on note ce qu'elle
  // était pour la remettre à la fin, sinon deux passages de suite laisseraient
  // le jeu de `jeu-messagerie.ts` sans portrait.
  const photoInitiale = await db.user.findUnique({
    where: { id: koffi.user.id },
    select: { avatarUrl: true },
  })
  const awa = await cookieFor('awa@essai.nkamva.test')
  const communaute = await db.community.findFirst({
    where: { trainerId: awa.user.trainerProfile!.id, status: 'active' },
    select: { id: true, visibility: true },
  })
  if (!communaute) throw new Error("la communauté d'essai d'Awa est absente")

  // --- Ce qui est refusé avant qu'un octet ne parte ------------------------
  console.log('\nCe qui est refusé avant le dépôt')

  const anonyme = await call('POST', '/api/me/avatar', { body: PNG })
  check('un visiteur ne demande pas d\'URL de dépôt', anonyme.status === 401, `HTTP ${anonyme.status}`)

  const pdf = await call('POST', '/api/me/avatar', {
    cookie: koffi.cookie,
    body: { mimeType: 'application/pdf', sizeBytes: 1000 },
  })
  check('un PDF est refusé', pdf.json?.error?.code === 'MIME_NOT_ALLOWED', `HTTP ${pdf.status}`)

  const trop = await call('POST', '/api/me/avatar', {
    cookie: koffi.cookie,
    body: { mimeType: 'image/png', sizeBytes: 3_000_000 },
  })
  check('au-delà de 2 Mo, refusé', trop.json?.error?.code === 'SIZE_EXCEEDS_LIMIT', `HTTP ${trop.status}`)

  // --- La présignature ------------------------------------------------------
  console.log('\nLa présignature (aucune écriture dans le seau)')

  const presign = await call('POST', '/api/me/avatar', { cookie: koffi.cookie, body: PNG })
  check('une URL est émise', presign.status === 201 && Boolean(presign.json?.data?.uploadUrl), `HTTP ${presign.status}`)
  const cle: string | undefined = presign.json?.data?.s3Key
  check(
    'la clé est rangée sous le compte qui la demande',
    Boolean(cle?.startsWith(`user-avatars/${koffi.user.id}/`)),
    cle,
  )

  // --- La confirmation ------------------------------------------------------
  console.log('\nLa confirmation')

  const volee = await call('POST', '/api/me/avatar/confirm', {
    cookie: koffi.cookie,
    body: { s3Key: `user-avatars/${awa.user.id}/avatar-vole.png`, mimeType: 'image/png' },
  })
  check(
    "la clé d'un autre compte est refusée",
    volee.json?.error?.code === 'UPLOAD_NOT_FOUND',
    `HTTP ${volee.status}`,
  )

  // Le cas qui distingue « stockage absent » de « objet absent ». Avec R2
  // configuré, confirmer une clé que personne n'a déposée doit échouer : sans
  // ce garde, une clé fantôme entrerait en base et l'écran afficherait un rond
  // vide sans que rien ne le signale.
  const fantome = await call('POST', '/api/me/avatar/confirm', {
    cookie: koffi.cookie,
    body: { s3Key: cle ?? `user-avatars/${koffi.user.id}/avatar-fantome.png`, mimeType: 'image/png' },
  })
  const stockage = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_BUCKET_NAME)
  if (stockage) {
    check(
      "un objet jamais déposé n'entre pas en base",
      fantome.json?.error?.code === 'UPLOAD_NOT_FOUND',
      `HTTP ${fantome.status}`,
    )
  } else {
    check(
      'sans stockage configuré, la confirmation passe (rien à vérifier)',
      fantome.status === 200,
      `HTTP ${fantome.status}`,
    )
  }

  // --- Le retrait -----------------------------------------------------------
  console.log('\nLe retrait')

  const retrait = await call('DELETE', '/api/me/avatar', { cookie: koffi.cookie })
  check('retirer répond sans erreur', retrait.status === 200, `HTTP ${retrait.status}`)
  check('et ne rend plus aucune adresse', retrait.json?.data?.avatarUrl === null)

  const encore = await call('DELETE', '/api/me/avatar', { cookie: koffi.cookie })
  check('retirer deux fois ne casse rien', encore.status === 200, `HTTP ${encore.status}`)

  const apres = await db.user.findUnique({
    where: { id: koffi.user.id },
    select: { avatarS3Key: true, avatarUrl: true },
  })
  check(
    'les deux origines sont bien effacées',
    apres?.avatarS3Key === null && apres?.avatarUrl === null,
    JSON.stringify(apres),
  )

  // --- La photo d'un groupe -------------------------------------------------
  console.log('\nLa photo du groupe')

  const parUnMembre = await call('POST', `/api/trainer/communities/${communaute.id}/avatar`, {
    cookie: koffi.cookie,
    body: PNG,
  })
  check(
    "un membre ne dépose pas la photo du groupe",
    parUnMembre.status === 403,
    `HTTP ${parUnMembre.status}`,
  )

  const parLAnimatrice = await call('POST', `/api/trainer/communities/${communaute.id}/avatar`, {
    cookie: awa.cookie,
    body: PNG,
  })
  check(
    "l'animatrice obtient son URL",
    parLAnimatrice.status === 201,
    `HTTP ${parLAnimatrice.status}`,
  )
  const cleGroupe: string | undefined = parLAnimatrice.json?.data?.s3Key
  check(
    'rangée sous un préfixe distinct de celui de la bannière',
    Boolean(cleGroupe?.startsWith(`community-avatars/${communaute.id}/`)),
    cleGroupe,
  )

  // --- Qui peut voir la photo d'un autre ------------------------------------
  console.log("\nL'adresse qui sert les photos")

  const sansPhoto = await call('GET', `/api/media/users/${koffi.user.id}/avatar`, {
    cookie: awa.cookie,
  })
  check('sans photo déposée, 404', sansPhoto.status === 404, `HTTP ${sansPhoto.status}`)

  const inconnu = await call('GET', '/api/media/users/00000000-0000-4000-8000-000000000000/avatar')
  check('un identifiant inconnu ne dit pas qu\'il est inconnu', inconnu.status === 404, `HTTP ${inconnu.status}`)

  const groupeSansPhoto = await call('GET', `/api/media/communities/${communaute.id}/avatar`)
  check(
    'un groupe sans photo, 404',
    groupeSansPhoto.status === 404,
    `HTTP ${groupeSansPhoto.status}`,
  )

  if (photoInitiale?.avatarUrl) {
    await db.user.update({
      where: { id: koffi.user.id },
      data: { avatarUrl: photoInitiale.avatarUrl },
    })
    console.log(`
  (photo d'essai de Koffi remise : ${photoInitiale.avatarUrl})`)
  }

  console.log(
    failures === 0
      ? '\nTout est vert. Reste le dépôt réel, à jouer sur un seau d\'essai.\n'
      : `\n${failures} échec(s).\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
