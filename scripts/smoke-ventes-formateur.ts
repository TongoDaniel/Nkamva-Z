// Smoke test de l'historique des ventes (F7.11), contre le serveur de dev.
//
//   bun scripts/smoke-ventes-formateur.ts
//   KEEP=1 bun scripts/smoke-ventes-formateur.ts   (laisse le jeu de données)
//
// Crée un formateur, une ressource et quatre achats couvrant les quatre cas qui
// se lisent différemment — encaissé, remboursé, échoué, en litige — puis
// demande la page avec une session forgée et vérifie ce qui en sort.
//
// Les assertions portent sur le HTML **rendu par le serveur** : la page est un
// composant serveur, le tableau y est déjà complet. On y cherche des montants
// et des libellés, pas un code HTTP — une page qui plante au rendu peut
// répondre 200 si une frontière d'erreur l'absorbe (§12.2).
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const KEEP = process.env.KEEP === '1'

let echecs = 0
function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

/** Le texte visible, débarrassé des balises et des marqueurs RSC. */
function texteDe(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;| | /g, ' ')
    .replace(/\s+/g, ' ')
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
}

async function main() {
  const marque = `smoke-ventes-${Date.now()}`

  const trainerUser = await db.user.create({
    data: { email: `${marque}@nkamva.test`, role: 'TRAINER', fullName: 'Formatrice Ventes' },
  })
  const profile = await db.trainerProfile.create({
    data: { userId: trainerUser.id, verifiedLegalName: 'Formatrice Ventes', approvedAt: new Date() },
  })
  await db.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

  const course = await db.course.create({
    data: {
      trainerId: profile.id,
      slug: marque,
      title: 'Spiritualité et finance',
      blurb: 'Un guide',
      description: 'Un guide complet.',
      category: 'dev', format: 'pdf', priceFcfa: 2000,
      status: 'published', publishedAt: new Date(),
    },
  })

  async function achat(opts: {
    amountFcfa: number; status: string; refunded?: boolean; dispute?: boolean
  }) {
    const trainerShareFcfa = Math.round(opts.amountFcfa * 0.85)
    const learner = await db.user.create({
      data: { email: `${marque}-${Math.random().toString(36).slice(2, 8)}@nkamva.test`, role: 'LEARNER' },
    })
    return db.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: opts.amountFcfa, commissionRate: 0.15,
        trainerShareFcfa, platformShareFcfa: opts.amountFcfa - trainerShareFcfa,
        provider: 'STRIPE', providerStatus: opts.status as never,
        providerTransactionId: `pi_${Math.random().toString(36).slice(2, 12)}`,
        ...(opts.refunded ? { refundedAt: new Date(), refundAmountFcfa: opts.amountFcfa } : {}),
        ...(opts.dispute ? { providerDisputeActive: true } : {}),
      },
    })
  }

  await achat({ amountFcfa: 2000, status: 'SUCCEEDED' })
  await achat({ amountFcfa: 5000, status: 'SUCCEEDED' })
  await achat({ amountFcfa: 3000, status: 'SUCCEEDED', refunded: true })
  await achat({ amountFcfa: 9000, status: 'FAILED' })

  const token = await encode({
    token: {
      userId: trainerUser.id, email: trainerUser.email, role: 'TRAINER',
      adminRole: null, trainerId: profile.id,
      sessionsValidAfter: new Date(0).toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  try {
    console.log(`\nHistorique des ventes — ${BASE}/formateur/ventes\n`)

    const res = await fetch(`${BASE}/formateur/ventes`, { headers: { cookie } })
    const html = await res.text()
    const texte = texteDe(html)
    const liens = hrefs(html)

    console.log('1. La page se rend, et rend le tableau')
    verifier('statut 200', res.status === 200, `statut ${res.status}`)
    verifier('le titre est là', texte.includes('Mes ventes'))
    verifier('les quatre lignes sont présentes',
      (texte.match(/Spiritualité et finance/g) ?? []).length >= 4,
      `${(texte.match(/Spiritualité et finance/g) ?? []).length} occurrence(s)`)

    console.log('\n2. Les trois montants sont nommés (F7.11)')
    // 2 000 encaissés → 300 retenus, 1 700 pour le formateur.
    verifier('le brut apparaît', texte.includes('2 000 FCFA'))
    verifier('la commission apparaît', texte.includes('300 FCFA'))
    verifier('le net apparaît', texte.includes('1 700 FCFA'))
    verifier('le taux figé sur la vente est affiché', texte.includes('15 %'))

    console.log('\n3. Les totaux excluent ce qui n\'a pas été encaissé')
    // 2 000 + 5 000 = 7 000 encaissés. Ni les 3 000 remboursés, ni les 9 000
    // échoués n'y entrent.
    verifier('le total brut vaut les seules ventes encaissées', texte.includes('7 000 FCFA'))
    verifier('le remboursement est dit à côté', texte.includes('3 000 FCFA') && texte.includes('remboursée'))
    verifier('les 9 000 échoués ne sont pas dans le total',
      !texte.includes('16 000 FCFA') && !texte.includes('11 000 FCFA'))

    console.log('\n4. Les statuts se distinguent')
    verifier('« Encaissée » figure', texte.includes('Encaissée'))
    verifier('« Remboursée » figure', texte.includes('Remboursée'))
    verifier('« Échouée » figure', texte.includes('Échouée'))

    console.log('\n5. Les points d\'entrée existent')
    verifier('un renvoi vers le portefeuille', liens.includes('/formateur/portefeuille'))
    const dashboard = texteDe(await (await fetch(`${BASE}/formateur`, { headers: { cookie } })).text())
    verifier('le tableau de bord mène ici', dashboard.includes('Voir le détail de mes ventes'))
  } finally {
    if (KEEP) {
      console.log(`\n(KEEP=1 — jeu de données conservé, formateur ${trainerUser.email})`)
      console.log(`cookie: ${cookie}`)
    } else {
      const learners = await db.purchase.findMany({
        where: { trainerId: profile.id }, select: { learnerId: true },
      })
      await db.purchase.deleteMany({ where: { trainerId: profile.id } })
      await db.course.deleteMany({ where: { trainerId: profile.id } })
      await db.wallet.deleteMany({ where: { trainerId: profile.id } })
      await db.trainerProfile.delete({ where: { id: profile.id } })
      await db.user.deleteMany({
        where: { id: { in: [trainerUser.id, ...learners.map((l) => l.learnerId)] } },
      })
    }
  }

  console.log(echecs === 0 ? '\nTout passe.\n' : `\n${echecs} échec(s).\n`)
  await db.$disconnect()
  process.exit(echecs === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
