// Smoke test de la **destination** d'une ressource (arbitrages 47, 136, 137).
//
// Ce que le typecheck ne dit pas, et qu'un écran ne montre qu'à moitié :
//
//   · une ressource créée « incluse » naît au circuit COMMUNITY, à 0 FCFA, et
//     avec sa ligne de liaison — les trois dans la même transaction ;
//   · un brouillon n'est annoncé **nulle part**, ni sur la fiche publique de la
//     communauté ni dans son compteur de ressources incluses ;
//   · la destination reste modifiable tant que le brouillon n'a rien engagé, et
//     la liaison est alors bornée, jamais supprimée ;
//   · le rayon des ressources éteint refuse la création (arbitrage 136).
//
// Le script crée ses propres données et les retire à la fin, y compris en cas
// d'échec : il n'ajoute rien de durable à la base de dev.
//
//   bun scripts/smoke-destination-ressource.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const MARQUE = `Essai destination ${Date.now()}`

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const trainer = await db.user.findFirst({
    where: {
      deletedAt: null,
      suspendedAt: null,
      trainerProfile: { isNot: null, is: { communities: { some: { status: 'active' } } } },
    },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  if (!trainer?.trainerProfile) throw new Error('aucun formateur avec communauté ouverte en base de dev')

  const community = await db.community.findFirst({
    where: { trainerId: trainer.trainerProfile.id, status: 'active' },
    select: { id: true, slug: true, name: true, resourcesEnabled: true },
  })
  if (!community) throw new Error('communauté introuvable')

  // Même recette que les autres smoke tests : `userId` et non `sub`, `issuedAt`
  // figé sinon `isSessionRevoked` fait tomber la session.
  const token = await encode({
    token: {
      userId: trainer.id,
      email: trainer.email,
      role: trainer.role,
      adminRole: trainer.adminRole,
      trainerId: trainer.trainerProfile.id,
      sessionsValidAfter: trainer.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  const send = async (path: string, method: string, body: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as
      | { data?: { id: string; circuit: string; priceFcfa: number }; error?: { code: string } }
      | null
    return { status: res.status, json }
  }

  const base = {
    title: MARQUE,
    blurb: "Une ressource d'essai, créée puis retirée par le smoke test.",
    description: "Elle ne doit jamais survivre à ce script, ni apparaître nulle part.",
    category: 'Développement',
    format: 'pdf',
  }

  /** Tout ce que le script a créé, retiré dans le `finally`. */
  const created: string[] = []
  const shelfWasEnabled = community.resourcesEnabled

  try {
    console.log(`\nCréation « incluse » — ${BASE} (formateur ${trainer.email})`)
    const inclus = await send('/api/trainer/courses', 'POST', {
      ...base,
      priceFcfa: 0,
      circuit: 'COMMUNITY',
    })
    check('la création est acceptée', inclus.status === 201, `HTTP ${inclus.status} ${inclus.json?.error?.code ?? ''}`)
    const courseId = inclus.json?.data?.id
    if (!courseId) throw new Error('pas de ressource créée : la suite du scénario est sans objet')
    created.push(courseId)

    const row = await db.course.findUnique({
      where: { id: courseId },
      select: { circuit: true, priceFcfa: true, status: true, communityLinks: { select: { communityId: true, unlinkedAt: true } } },
    })
    check('elle naît au circuit communautaire', row?.circuit === 'COMMUNITY', String(row?.circuit))
    check('sans prix à l’unité', row?.priceFcfa === 0, `${row?.priceFcfa} FCFA`)
    check('en brouillon', row?.status === 'draft', String(row?.status))
    // Le point qui compte : sans cette ligne, la ressource ne serait visible
    // nulle part — ni en vente, ni sur l'étagère.
    check(
      'et déjà rattachée à la communauté',
      row?.communityLinks.length === 1 && row.communityLinks[0].unlinkedAt === null,
      `${row?.communityLinks.length ?? 0} liaison(s)`,
    )

    console.log('\nUn brouillon ne s’annonce nulle part')
    const fiche = await fetch(`${BASE}/communautes/${community.slug}`)
    const html = fiche.status === 200 ? await fiche.text() : ''
    check('la fiche publique répond', fiche.status === 200, `HTTP ${fiche.status}`)
    // L'assertion porte sur le titre, qui est unique à cette exécution. Les
    // marqueurs RSC coupent les nœuds de texte : on cherche donc le titre tel
    // qu'il apparaîtrait dans un attribut ou un fragment, sans espace insécable.
    check('elle ne cite pas le brouillon', !html.includes(MARQUE))
    const annuaire = await fetch(`${BASE}/api/communities?search=${encodeURIComponent(community.name.slice(0, 4))}`)
    const listed = (await annuaire.json()) as { data: { id: string; includedCount: number }[] }
    const carte = listed.data.find((c) => c.id === community.id)
    check(
      'le compteur de la carte ne le compte pas',
      carte ? carte.includedCount === 0 : true,
      carte ? `${carte.includedCount} incluse(s)` : 'communauté non listée (privée ?)',
    )

    console.log('\nLa destination change, tant que rien n’est engagé')
    const versVente = await send(`/api/trainer/courses/${courseId}`, 'PATCH', {
      circuit: 'MARKETPLACE',
      priceFcfa: 5000,
    })
    check('le passage à la vente est accepté', versVente.status === 200, `HTTP ${versVente.status} ${versVente.json?.error?.code ?? ''}`)
    const apres = await db.course.findUnique({
      where: { id: courseId },
      select: { circuit: true, priceFcfa: true, communityLinks: { select: { unlinkedAt: true } } },
    })
    check('le circuit a basculé', apres?.circuit === 'MARKETPLACE', String(apres?.circuit))
    check('le prix est celui demandé', apres?.priceFcfa === 5000, `${apres?.priceFcfa} FCFA`)
    check(
      'la liaison est bornée, pas supprimée',
      apres?.communityLinks.length === 1 && apres.communityLinks[0].unlinkedAt !== null,
      `${apres?.communityLinks.length ?? 0} ligne(s)`,
    )

    console.log('\nCe que le serveur refuse')
    const tropBasPrix = await send('/api/trainer/courses', 'POST', {
      ...base,
      title: `${MARQUE} (prix)`,
      priceFcfa: 100,
      circuit: 'MARKETPLACE',
    })
    if (tropBasPrix.json?.data?.id) created.push(tropBasPrix.json.data.id)
    check(
      'un prix sous le plancher, en vente',
      tropBasPrix.status === 400 && tropBasPrix.json?.error?.code === 'PRICE_TOO_LOW',
      `HTTP ${tropBasPrix.status} ${tropBasPrix.json?.error?.code ?? ''}`,
    )

    // Arbitrage 136 — on ne garnit pas une étagère qu'on a soi-même éteinte.
    // Le réglage est remis dans le `finally`, quoi qu'il arrive ici.
    await db.community.update({ where: { id: community.id }, data: { resourcesEnabled: false } })
    const rayonEteint = await send('/api/trainer/courses', 'POST', {
      ...base,
      title: `${MARQUE} (rayon)`,
      priceFcfa: 0,
      circuit: 'COMMUNITY',
    })
    if (rayonEteint.json?.data?.id) created.push(rayonEteint.json.data.id)
    check(
      'une inclusion, rayon des ressources éteint',
      rayonEteint.status === 409 && rayonEteint.json?.error?.code === 'COMMUNITY_RESOURCES_DISABLED',
      `HTTP ${rayonEteint.status} ${rayonEteint.json?.error?.code ?? ''}`,
    )
  } finally {
    await db.community.update({
      where: { id: community.id },
      data: { resourcesEnabled: shelfWasEnabled },
    })
    if (created.length > 0) {
      await db.communityCourse.deleteMany({ where: { courseId: { in: created } } })
      await db.course.deleteMany({ where: { id: { in: created } } })
    }
    const reste = await db.course.count({ where: { title: { startsWith: 'Essai destination ' } } })
    check('la base de dev est rendue telle quelle', reste === 0, `${reste} ressource(s) d'essai restante(s)`)
  }

  console.log(failures === 0 ? '\nTout est vert.\n' : `\n${failures} échec(s).\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
