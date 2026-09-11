// Smoke test de la découverte des communautés : pagination, affinage, exclusion.
//
// Ce qu'un écran à deux communautés ne peut pas montrer :
//
//   · une page pleine, puis la suivante, sans recouvrement ni trou ;
//   · une page demandée au-delà du dernier rang qui rend la **dernière** plutôt
//     qu'un écran blanc — le cas d'un filtre qui se resserre en page 4 ;
//   · `exclude=mine` qui retire ce qu'on anime ou a rejoint, et son absence qui
//     ne retire rien : c'est l'écran qui demande, pas la session qui décide ;
//   · un terme sous le seuil qui est **ignoré** au lieu de vider la liste.
//
// Le script crée son propre formateur et ses communautés, et les retire à la
// fin, y compris en cas d'échec : il n'ajoute rien de durable à la base de dev.
//
//   bun scripts/smoke-communautes-pagination.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
/** Préfixe unique à cette exécution : il sert de terme de recherche. */
const MARQUE = `Ess${Date.now().toString(36)}`
const COMBIEN = 14
const PAR_PAGE = 12

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

interface Reponse {
  status: number
  items: { id: string; name: string }[]
  meta?: { total: number; page: number; pageSize: number }
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

  const sienne = await db.community.findFirst({
    where: { trainerId: trainer.trainerProfile.id, status: 'active' },
    select: { id: true, name: true, visibility: true },
  })
  if (!sienne) throw new Error('communauté du formateur introuvable')

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

  const get = async (query: string, authenticated = false): Promise<Reponse> => {
    const res = await fetch(`${BASE}/api/communities?${query}`, {
      headers: authenticated ? { cookie } : {},
    })
    const body = (await res.json().catch(() => null)) as {
      data?: { id: string; name: string }[]
      meta?: { total: number; page: number; pageSize: number }
    } | null
    return { status: res.status, items: body?.data ?? [], meta: body?.meta }
  }

  // Un second formateur porte les communautés d'essai : posées sur le premier,
  // `exclude=mine` les retirerait toutes et il n'y aurait plus rien à paginer.
  const figurant = await db.user.create({
    data: { email: `pagination-${MARQUE}@essai.test`, role: 'TRAINER', fullName: 'Figurant Pagination' },
  })
  const figurantProfile = await db.trainerProfile.create({
    data: { userId: figurant.id, verifiedLegalName: 'Figurant Pagination', approvedAt: new Date() },
  })

  try {
    await db.community.createMany({
      data: Array.from({ length: COMBIEN }, (_, i) => ({
        trainerId: figurantProfile.id,
        name: `${MARQUE} communauté ${String(i + 1).padStart(2, '0')}`,
        slug: `${MARQUE.toLowerCase()}-communaute-${i + 1}`,
        description: 'Communauté créée par le smoke test de pagination.',
        priceFcfa: 1_000 + i,
        status: 'active',
        visibility: 'PUBLIC',
      })),
    })

    console.log(`\nPagination — ${COMBIEN} communautés d'essai, ${PAR_PAGE} par page`)
    const p1 = await get(`search=${MARQUE}&page=1`)
    check('la première page répond', p1.status === 200, `HTTP ${p1.status}`)
    check('elle est pleine', p1.items.length === PAR_PAGE, `${p1.items.length} carte(s)`)
    check('le total est annoncé', p1.meta?.total === COMBIEN, `${p1.meta?.total}`)
    check('la taille de page est annoncée', p1.meta?.pageSize === PAR_PAGE, `${p1.meta?.pageSize}`)

    const p2 = await get(`search=${MARQUE}&page=2`)
    check('la deuxième page porte le reste', p2.items.length === COMBIEN - PAR_PAGE, `${p2.items.length} carte(s)`)
    // Ni recouvrement ni trou : l'union des deux pages, c'est l'ensemble.
    const vus = new Set([...p1.items, ...p2.items].map((c) => c.id))
    check('aucune carte en double ni manquante', vus.size === COMBIEN, `${vus.size} distincte(s)`)

    // Le cas du filtre qui se resserre : on était en page 4, il n'y a plus que
    // deux pages. Rendre vide donnerait un écran blanc pour une liste pleine.
    const trop = await get(`search=${MARQUE}&page=99`)
    check(
      'une page hors bornes rend la dernière',
      trop.meta?.page === 2 && trop.items.length > 0,
      `page ${trop.meta?.page}, ${trop.items.length} carte(s)`,
    )

    console.log('\nLe terme, et le seuil')
    const uneLettre = await get(`search=${MARQUE[0]}&page=1`)
    check(
      'une seule lettre est ignorée, pas vidante',
      uneLettre.items.length > 0,
      `${uneLettre.items.length} carte(s)`,
    )
    const rien = await get('search=zzzzzzzzzz-aucune-chance&page=1')
    check('un terme sans résultat rend une liste vide', rien.status === 200 && rien.items.length === 0 && rien.meta?.total === 0)

    console.log("\nL'exclusion est demandée, pas déduite de la session")
    const sansExclusion = await get('page=1', true)
    const avecExclusion = await get('exclude=mine&page=1', true)
    // Sa communauté n'est trouvable que si elle est publique : une privée sort
    // de toutes les surfaces publiques (arbitrage 81), et le contrôle serait
    // alors vide de sens.
    if (sienne.visibility === 'PUBLIC') {
      const total = sansExclusion.meta?.total ?? 0
      const pages = Math.ceil(total / PAR_PAGE)
      let trouvee = false
      for (let p = 1; p <= pages && !trouvee; p++) {
        const page = await get(`page=${p}`, true)
        trouvee = page.items.some((c) => c.id === sienne.id)
      }
      check('sans `exclude`, sa propre communauté reste trouvable', trouvee)
    } else {
      console.log('  · sa communauté est privée : contrôle sans objet')
    }
    check(
      'avec `exclude=mine`, elle disparaît',
      !avecExclusion.items.some((c) => c.id === sienne.id),
    )
    check(
      'et le total baisse en conséquence',
      (avecExclusion.meta?.total ?? 0) < (sansExclusion.meta?.total ?? 0),
      `${avecExclusion.meta?.total} contre ${sansExclusion.meta?.total}`,
    )
    // Sans session, `exclude=mine` n'a personne à exclure : il ne doit pas
    // faire disparaître la liste pour autant.
    const anonyme = await get('exclude=mine&page=1')
    check('sans session, `exclude=mine` ne retire rien', anonyme.items.length > 0, `${anonyme.items.length} carte(s)`)
  } finally {
    await db.community.deleteMany({ where: { trainerId: figurantProfile.id } })
    await db.trainerProfile.delete({ where: { id: figurantProfile.id } })
    await db.user.delete({ where: { id: figurant.id } })
    const reste = await db.community.count({ where: { name: { startsWith: MARQUE } } })
    check('la base de dev est rendue telle quelle', reste === 0, `${reste} communauté(s) d'essai restante(s)`)
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
