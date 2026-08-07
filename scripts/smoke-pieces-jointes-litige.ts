/**
 * Vérification des pièces jointes de litige.
 *
 *   bun run dev                                  # dans un autre terminal
 *   bun scripts/smoke-pieces-jointes-litige.ts
 *
 * ⚠️ **Ce script ne dépose volontairement aucun objet.** Il va jusqu'à l'URL
 * présignée, puis s'arrête : `AWS_BUCKET_NAME` du `.env` de développement vaut
 * `nkamva-production`, et un `PUT` écrirait pour de vrai dans le stockage de
 * production. Le maillon non couvert est donc le seul `putToPresignedUrl()` du
 * navigateur — déjà exercé par le dépôt de documents d'entreprise, qui emprunte
 * exactement le même helper.
 *
 * Ce qu'il contrôle, et qui était intestable jusqu'ici puisque rien n'appelait
 * la route :
 *
 *   1. la présignature crée bien une `PendingAttachment` en attente ;
 *   2. la clé se **consomme** en accompagnant un message du fil ;
 *   3. elle ne se consomme qu'une fois, et jamais par quelqu'un d'autre ;
 *   4. les garde-fous de format et de taille refusent avant la présignature ;
 *   5. le formulaire de réponse propose réellement le dépôt.
 */
import { createHash } from 'node:crypto'
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'
import { ATTACHMENT_MAX_SIZE_BYTES } from '../src/lib/disputes'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function cookieForUser(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  const token = await encode({
    token: {
      userId: user.id,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
      sub: user.id,
      email: user.email,
    },
    secret: SECRET,
  })
  return `next-auth.session-token=${token}`
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const readable = (page: string) => page.replaceAll('<!-- -->', '').replaceAll('&#x27;', "'")

async function main() {
  // Un litige encore ouvert, sinon `postDisputeMessage` refuse (DISPUTE_CLOSED)
  // et le contrôle accuserait la pièce jointe d'un refus qui ne la concerne pas.
  const dispute = await db.dispute.findFirst({
    where: { status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } },
    select: { id: true, learnerId: true, status: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!dispute) {
    console.log('Aucun litige ouvert en base — lancer le seed. Contrôle impossible.')
    process.exitCode = 1
    return
  }
  console.log(`Litige ${dispute.id.slice(0, 8)}… (${dispute.status})\n`)

  const learner = await cookieForUser(dispute.learnerId)
  const keys: string[] = []

  const presign = (body: unknown, cookie = learner) =>
    fetch(`${BASE}/api/me/disputes/attachments/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })

  try {
    // ---- 1. Présignature -------------------------------------------------
    const res = await presign({
      mimeType: 'image/png',
      sizeBytes: 24_000,
      sha256: sha('capture-de-controle'),
      disputeId: dispute.id,
    })
    const body = (await res.json()) as { data?: { uploadUrl?: string; s3Key?: string } }
    if (body.data?.s3Key) keys.push(body.data.s3Key)

    check(
      'POST …/attachments/upload — 201 avec URL présignée et clé',
      res.status === 201 && Boolean(body.data?.uploadUrl) && Boolean(body.data?.s3Key),
      `reçu ${res.status}`,
    )
    // La clé n'est pas un détail d'implémentation : elle est le seul lien entre
    // le dépôt et le message, et elle doit porter l'émetteur.
    check(
      'la clé est rangée sous dispute-attachments/<émetteur>/',
      (body.data?.s3Key ?? '').startsWith(`dispute-attachments/${dispute.learnerId}/`),
      body.data?.s3Key,
    )

    const pending = body.data?.s3Key
      ? await db.pendingAttachment.findFirst({
          where: { s3Key: body.data.s3Key },
          select: { status: true, scope: true, disputeId: true, expiresAt: true },
        })
      : null
    check(
      'une PendingAttachment est créée, en attente, sur le bon litige',
      pending?.status === 'PENDING' &&
        pending.scope === 'DISPUTE' &&
        pending.disputeId === dispute.id &&
        pending.expiresAt > new Date(),
    )

    // ---- 2. La clé se consomme avec un message --------------------------
    const message = await fetch(`${BASE}/api/me/disputes/${dispute.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: learner },
      body: JSON.stringify({
        body: 'Contrôle automatique — smoke-pieces-jointes-litige.',
        attachments: [body.data?.s3Key],
      }),
    })
    const messageBody = (await message.json()) as { data?: { id?: string; attachments?: string[] } }
    check(
      'POST …/messages — 201, et le message porte la pièce',
      message.status === 201 && messageBody.data?.attachments?.[0] === body.data?.s3Key,
      `reçu ${message.status} ${JSON.stringify(messageBody).slice(0, 160)}`,
    )
    const consumed = body.data?.s3Key
      ? await db.pendingAttachment.findFirst({
          where: { s3Key: body.data.s3Key },
          select: { status: true, consumedAt: true },
        })
      : null
    check(
      'la PendingAttachment passe à CONSUMED',
      consumed?.status === 'CONSUMED' && consumed.consumedAt !== null,
    )

    // ---- 3. Une clé ne sert qu'une fois --------------------------------
    const replay = await fetch(`${BASE}/api/me/disputes/${dispute.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: learner },
      body: JSON.stringify({
        body: 'Contrôle automatique — rejeu de la même pièce.',
        attachments: [body.data?.s3Key],
      }),
    })
    check(
      'rejouer la même clé est refusé',
      replay.status >= 400,
      `reçu ${replay.status} : une pièce consommée a été acceptée une seconde fois`,
    )

    // ---- 4. Les garde-fous refusent avant la présignature ---------------
    const badMime = await presign({
      mimeType: 'application/zip',
      sizeBytes: 1_000,
      sha256: sha('zip'),
    })
    check('un format non autorisé est refusé', badMime.status >= 400, `reçu ${badMime.status}`)

    const tooBig = await presign({
      mimeType: 'image/png',
      sizeBytes: ATTACHMENT_MAX_SIZE_BYTES + 1,
      sha256: sha('trop-gros'),
    })
    check(
      `au-delà de ${Math.round(ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024)} Mo, c'est refusé`,
      tooBig.status >= 400,
      `reçu ${tooBig.status}`,
    )

    const anonymous = await fetch(`${BASE}/api/me/disputes/attachments/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType: 'image/png', sizeBytes: 1_000, sha256: sha('anon') }),
    })
    check('un visiteur non connecté est refusé en 401', anonymous.status === 401, `reçu ${anonymous.status}`)

    // Une clé présignée par quelqu'un d'autre ne doit pas se rattacher : c'est
    // le contrôle qui protège le dossier d'un tiers.
    const other = await db.user.findFirst({
      where: { role: 'LEARNER', id: { not: dispute.learnerId } },
      select: { id: true },
    })
    if (other) {
      const foreign = await presign(
        { mimeType: 'image/png', sizeBytes: 2_000, sha256: sha('etranger') },
        await cookieForUser(other.id),
      )
      const foreignBody = (await foreign.json()) as { data?: { s3Key?: string } }
      if (foreignBody.data?.s3Key) keys.push(foreignBody.data.s3Key)
      const stolen = await fetch(`${BASE}/api/me/disputes/${dispute.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: learner },
        body: JSON.stringify({
          body: 'Contrôle automatique — pièce présignée par un autre compte.',
          attachments: [foreignBody.data?.s3Key],
        }),
      })
      check(
        "la pièce d'un autre émetteur est refusée",
        stolen.status >= 400,
        `reçu ${stolen.status}`,
      )
    }

    // ---- 5. Le formulaire propose le dépôt -----------------------------
    const page = readable(
      await (
        await fetch(`${BASE}/mes-litiges/${dispute.id}`, { headers: { cookie: learner } })
      ).text(),
    )
    check(
      '/mes-litiges/<id> propose « Joindre un fichier »',
      page.includes('Joindre un fichier') && !page.includes('Une erreur est survenue'),
    )
    check(
      'les contraintes sont annoncées avant le choix du fichier',
      page.includes('PNG, JPEG, WebP ou PDF') && page.includes('5 Mo par fichier'),
    )
  } finally {
    // Les messages de contrôle restent dans le fil : `postDisputeMessage` fait
    // avancer la machine à états, et les supprimer laisserait le litige dans un
    // statut sans la trace qui l'explique. Seules les clés non consommées sont
    // retirées — aucun objet n'a été déposé, il n'y a rien à nettoyer côté seau.
    if (keys.length) {
      const removed = await db.pendingAttachment.deleteMany({
        where: { s3Key: { in: keys }, status: 'PENDING' },
      })
      console.log(`\n${removed.count} pièce(s) présignée(s) non consommée(s) supprimée(s).`)
    }
  }

  console.log(
    failures ? `\n${failures} contrôle(s) en échec.` : '\nChaîne des pièces jointes complète.',
  )
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
