/**
 * Smoke bout-en-bout du règlement d'une échéance d'adhésion par mobile money,
 * contre le vrai bac à sable PawaPay (campagne du 12 octobre 2026, B1).
 *
 *   DATABASE_URL=postgresql://nkamva@localhost:5433/nkamva_uc bun scripts/smoke-renouvellement-adhesion.ts
 *
 * Le défaut tenait en une phrase : l'échéance portait un `cp_<uuid>` jamais
 * envoyé à PawaPay, et « Régler » le rendait tel quel — rien n'arrivait sur le
 * téléphone. Les tests unitaires règlent par simulation ; seul ce script prouve
 * que le dépôt **existe chez PawaPay**, qu'il aboutit, et que la réconciliation
 * rouvre l'adhésion.
 *
 * ⚠️ Il écrit dans la base qu'on lui désigne (un formateur, une communauté, un
 * apprenant, tous préfixés `smoke-renouvellement`) et joue le renouvellement sur
 * **toute** la base. Il refuse donc la base de dev `nkamva` : lui donner une
 * copie jetable (`CREATE DATABASE … TEMPLATE nkamva`). Il refuse aussi un
 * PawaPay de production. Les courriels sont coupés.
 */

// Avant tout import du code : `email.ts` lit la clé à l'envoi, mais rien ne
// doit partir d'un smoke test.
process.env.RESEND_API_KEY = ''

const dbName = (() => {
  try { return new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, '') } catch { return '' }
})()
if (!dbName || dbName === 'nkamva') {
  console.error(`✗ Base refusée (« ${dbName || 'aucune'} ») : désigner une copie jetable par DATABASE_URL.`)
  process.exit(1)
}

const { db } = await import('../src/lib/db')
const { pawapayConfig, checkDeposit } = await import('../src/lib/pawapay')
const { renewDueMemberships, initiateMembershipPayment, RENEWAL_SOURCE } = await import('../src/lib/memberships')
const { reconcilePurchase } = await import('../src/lib/purchases')

/** MSISDN de test du bac à sable (docs.pawapay.io/v2/docs/test_numbers). */
const PAYER = { phoneNumber: '237653456789', provider: 'MTN_MOMO_CMR' }
const PRICE = 500
const DAY = 86_400_000

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`)
  else { failures++; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const config = pawapayConfig()
if (!config || !config.baseUrl.includes('sandbox')) {
  console.error('✗ PawaPay absent ou en production : ce script ne tourne que sur le bac à sable.')
  process.exit(1)
}
const [{ current_database: connected }] =
  await db.$queryRaw<{ current_database: string }[]>`select current_database()`
check('base désignée', connected === dbName, connected)
if (connected !== dbName) process.exit(1)

// --- Un membre dont le mois réglé vient de finir ---------------------------

const tag = `smoke-renouvellement-${Date.now()}`
const trainerUser = await db.user.create({
  data: { email: `${tag}-formateur@example.test`, role: 'TRAINER', fullName: 'Smoke Formatrice' },
})
const trainer = await db.trainerProfile.create({ data: { userId: trainerUser.id, approvedAt: new Date() } })
await db.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
const community = await db.community.create({
  data: { trainerId: trainer.id, name: `Smoke ${tag}`, slug: tag, priceFcfa: PRICE, commissionRate: 0.15 },
})
const learner = await db.user.create({
  data: { email: `${tag}-membre@example.test`, role: 'LEARNER', countryCode: 'CM', fullName: 'Smoke Membre' },
})
const paidUntil = new Date(Date.now() - DAY)
await db.communitySubscription.create({
  data: {
    communityId: community.id, learnerId: learner.id, status: 'ACTIVE', provider: 'PAWAPAY',
    periodStart: new Date(paidUntil.getTime() - 30 * DAY), periodEnd: paidUntil,
  },
})

// --- Le renouvellement ouvre l'échéance, sans transaction -------------------

await renewDueMemberships(new Date())
const due = await db.purchase.findFirst({
  where: { learnerId: learner.id, communityId: community.id, providerStatus: 'PENDING' },
})
check('échéance ouverte', !!due, due ? `${due.amountFcfa} FCFA` : 'aucune')
check('aucune transaction inventée', due?.providerTransactionId === null, String(due?.providerTransactionId))
check('marquée comme renouvellement', due?.acquisitionSource === RENEWAL_SOURCE)
if (!due) process.exit(1)

// --- « Régler » ouvre un vrai dépôt ----------------------------------------

const intent = await initiateMembershipPayment(community.id, learner.id, 'PAWAPAY', null, PAYER)
check('règlement sur la même ligne', intent.purchaseId === due.id)
check('confirmation sur le téléphone', intent.nextStep === 'CONFIRM_ON_PHONE', intent.nextStep)
check('identifiant PawaPay (UUID nu)',
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(intent.providerTransactionId),
  intent.providerTransactionId)

// Le cœur de B1 : PawaPay connaît ce dépôt. Avant le correctif, il ne l'avait
// jamais reçu.
let deposit = null as Awaited<ReturnType<typeof checkDeposit>>
for (let i = 0; i < 15; i++) {
  deposit = await checkDeposit(intent.providerTransactionId)
  if (deposit && ['COMPLETED', 'FAILED'].includes(deposit.status)) break
  await sleep(2_000)
}
check('dépôt connu de PawaPay', !!deposit, deposit ? deposit.status : 'introuvable')
check('dépôt abouti', deposit?.status === 'COMPLETED', deposit?.status ?? '')

// --- La réconciliation rouvre l'adhésion -----------------------------------
// Aucun rappel n'atteint localhost : c'est le chemin de rattrapage qui conclut.

const reconciled = await reconcilePurchase(intent.providerTransactionId)
check('achat réglé', reconciled.status === 'SUCCEEDED', reconciled.status)
const sub = await db.communitySubscription.findFirstOrThrow({
  where: { learnerId: learner.id, communityId: community.id },
})
check('adhésion de nouveau active', sub.status === 'ACTIVE', sub.status)
check('terme avancé d\'un mois', sub.periodEnd.getTime() > paidUntil.getTime(), sub.periodEnd.toISOString())
const wallet = await db.wallet.findFirstOrThrow({ where: { trainerId: trainer.id } })
check('formatrice créditée de sa part', wallet.balance === Math.round(PRICE * 0.85), `${wallet.balance} FCFA`)

await db.$disconnect()
console.log(failures ? `\n${failures} échec(s).` : '\nTout a tenu.')
process.exit(failures ? 1 : 0)
