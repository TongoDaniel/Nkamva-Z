// Smoke test du parcours d'adhésion, contre la base de dev réelle.
//
// Vit dans le projet et non dans un dossier temporaire : il doit résoudre
// `@/lib/*` et le client Prisma généré.
//
//   bun scripts/smoke-adhesion.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

async function main() {
  // La base de dev n'en porte aucune : le smoke crée la sienne et la retire.
  let created = false
  let community = await db.community.findFirst({
    where: { status: 'active' },
    select: { id: true, slug: true, name: true, priceFcfa: true, trainerId: true },
  })
  if (!community) {
    const trainerProfile = await db.trainerProfile.findFirst({ select: { id: true } })
    if (!trainerProfile) throw new Error('aucun formateur en base de dev')
    community = await db.community.create({
      data: {
        trainerId: trainerProfile.id,
        name: 'Communauté de vérification',
        slug: `smoke-${Date.now()}`,
        description: 'Créée par scripts/smoke-adhesion.ts, supprimée à la fin.',
        priceFcfa: 5000,
      },
      select: { id: true, slug: true, name: true, priceFcfa: true, trainerId: true },
    })
    created = true
  }

  // Un apprenant qui n'est pas le formateur de cette communauté et n'y adhère
  // pas déjà.
  const trainer = await db.trainerProfile.findUnique({
    where: { id: community.trainerId },
    select: { userId: true },
  })
  const learner = await db.user.findFirst({
    where: {
      role: 'LEARNER', deletedAt: null, suspendedAt: null,
      id: { not: trainer!.userId },
      communitySubscriptions: { none: { communityId: community.id, status: { in: ['ACTIVE', 'PAST_DUE', 'BANNED'] } } },
    },
    select: { id: true, email: true },
  })
  if (!learner) throw new Error('aucun apprenant disponible pour le test')

  console.log(`communauté : ${community.name} (${community.slug}) — ${community.priceFcfa} FCFA`)
  console.log(`apprenant  : ${learner.email}`)

  // Le jeton reproduit ce que pose le callback `jwt` : `userId` et non `sub`,
  // et `issuedAt` figé — sans lui, `isSessionRevoked` fait tomber la session.
  const full = await db.user.findUniqueOrThrow({
    where: { id: learner.id },
    select: { sessionsValidAfter: true },
  })
  const token = await encode({
    token: {
      userId: learner.id,
      email: learner.email,
      role: 'LEARNER',
      adminRole: null,
      trainerId: null,
      sessionsValidAfter: full.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { cookie, 'content-type': 'application/json', ...(init?.headers || {}) },
    })
    const body = await res.text()
    return { status: res.status, body }
  }

  // 1 — état initial
  console.log('\n1. état initial')
  console.log(' ', (await call(`/api/communities/${community.slug}/adhesion`)).body)

  // 2 — adhérer (le webhook simulé confirme le paiement en dev)
  console.log('\n2. adhésion')
  const join = await call(`/api/communities/${community.slug}/adhesion`, {
    method: 'POST', body: JSON.stringify({ provider: 'CINETPAY' }),
  })
  console.log(' ', join.status, join.body)
  if (join.status !== 200) throw new Error('adhésion refusée')

  const purchaseId = JSON.parse(join.body).data.purchaseId as string

  // 3 — la souscription existe, le portefeuille du formateur est crédité
  const sub = await db.communitySubscription.findFirst({
    where: { communityId: community.id, learnerId: learner.id, status: { in: ['ACTIVE', 'PAST_DUE', 'BANNED'] } },
  })
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } })
  console.log('\n3. après paiement')
  console.log('  achat        :', purchase?.providerStatus, purchase?.amountFcfa, 'FCFA')
  console.log('  souscription :', sub?.status, '→', sub?.periodEnd.toISOString().slice(0, 10))

  // 4 — la fiche publique rend le bon pavé, et la page d'adhésion redirige
  const page = await fetch(`${BASE}/communautes/${community.slug}`, { headers: { cookie } })
  const html = await page.text()
  console.log('\n4. rendu de la fiche publique')
  console.log('  statut HTTP        :', page.status)
  console.log('  « Vous êtes membre »:', html.includes('Vous êtes membre'))
  console.log('  « Résilier »        :', html.includes('Résilier'))
  console.log('  frontière d\'erreur  :', html.includes('Une erreur est survenue') || html.includes('nk-error'))

  // 5 — résilier, puis se raviser
  console.log('\n5. résiliation puis reprise')
  console.log('  DELETE :', (await call(`/api/communities/${community.slug}/adhesion`, { method: 'DELETE' })).status)
  const canceled = await fetch(`${BASE}/communautes/${community.slug}`, { headers: { cookie } })
  const canceledHtml = await canceled.text()
  console.log('  « Reprendre mon adhésion » :', canceledHtml.includes('Reprendre mon adh'))
  console.log('  POST reprise :', (await call(`/api/communities/${community.slug}/adhesion/reprise`, { method: 'POST' })).status)

  // 6 — une seconde adhésion est refusée
  const again = await call(`/api/communities/${community.slug}/adhesion`, {
    method: 'POST', body: JSON.stringify({ provider: 'STRIPE' }),
  })
  console.log('\n6. seconde adhésion :', again.status, again.body)

  // 7 — remise en état : le smoke ne laisse ni membre ni communauté derrière lui
  if (sub) await db.communitySubscription.delete({ where: { id: sub.id } })
  await db.purchase.deleteMany({ where: { communityId: community.id } })
  if (created) {
    await db.auditLog.deleteMany({ where: { targetId: community.id } })
    await db.community.delete({ where: { id: community.id } })
  } else if (sub) {
    await db.community.update({
      where: { id: community.id },
      data: { membersCount: { decrement: 1 } },
    })
  }
  console.log('\n7. nettoyage effectué')
}

main()
  .catch((err) => { console.error('ÉCHEC :', err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
