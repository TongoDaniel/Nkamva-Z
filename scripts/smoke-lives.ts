// Smoke test des lives, du stockage et de la facture, contre la base de dev.
//
//   bun scripts/smoke-lives.ts
//
// Vit dans le projet, pas dans un dossier temporaire : il doit résoudre
// `@/lib/*` et le client Prisma généré.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

async function cookieFor(userId: string, trainerId: string | null) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, role: true, sessionsValidAfter: true },
  })
  const token = await encode({
    token: {
      userId, email: user.email, role: user.role, adminRole: null, trainerId,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  return `next-auth.session-token=${token}`
}

async function main() {
  const trainerProfile = await db.trainerProfile.findFirstOrThrow({
    select: { id: true, userId: true },
  })
  const community = await db.community.create({
    data: {
      trainerId: trainerProfile.id,
      name: 'Communauté de vérification',
      slug: `smoke-lives-${Date.now()}`,
      priceFcfa: 5000,
    },
  })
  const learner = await db.user.findFirstOrThrow({
    where: { role: 'LEARNER', deletedAt: null, suspendedAt: null },
    select: { id: true, email: true },
  })
  await db.communitySubscription.create({
    data: {
      communityId: community.id, learnerId: learner.id, status: 'ACTIVE',
      periodStart: new Date(Date.now() - 86_400_000),
      periodEnd: new Date(Date.now() + 30 * 86_400_000),
      provider: 'STRIPE',
    },
  })

  const trainerCookie = await cookieFor(trainerProfile.userId, trainerProfile.id)
  const learnerCookie = await cookieFor(learner.id, null)

  const call = (cookie: string) => async (path: string, init?: RequestInit) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { cookie, 'content-type': 'application/json', ...(init?.headers || {}) },
    })
    return { status: res.status, body: await res.text() }
  }
  const asTrainer = call(trainerCookie)
  const asLearner = call(learnerCookie)

  console.log(`communauté : ${community.slug}`)
  console.log(`apprenant  : ${learner.email}\n`)

  // 1 — programmer
  const scheduled = await asTrainer('/api/lives', {
    method: 'POST',
    body: JSON.stringify({
      communityId: community.id,
      title: 'Revue de checklists QA',
      description: 'On passe en revue vos checklists.',
      scheduledStartAt: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 45,
    }),
  })
  console.log('1. programmation :', scheduled.status)
  if (scheduled.status !== 201) throw new Error(scheduled.body)
  const sessionId = JSON.parse(scheduled.body).data.id as string

  // 2 — un passant n'entre pas
  const stranger = await db.user.findFirst({
    where: {
      role: 'LEARNER', deletedAt: null,
      id: { notIn: [learner.id, trainerProfile.userId] },
      communitySubscriptions: { none: { communityId: community.id } },
    },
    select: { id: true },
  })
  if (stranger) {
    const denied = await call(await cookieFor(stranger.id, null))(`/api/lives/${sessionId}`)
    console.log('2. non-membre    :', denied.status, JSON.parse(denied.body).error?.code)
  }

  // 3 — ouvrir la séance : c'est ici que LiveKit est réellement sollicité
  const started = await asTrainer(`/api/lives/${sessionId}`, {
    method: 'POST', body: JSON.stringify({ action: 'start' }),
  })
  console.log('3. ouverture     :', started.status)
  const session = await db.liveSession.findUniqueOrThrow({ where: { id: sessionId } })
  console.log('   salle LiveKit :', session.roomName)
  console.log('   egress        :', session.egressId ?? '(aucun — stockage ou droits egress)')

  // 4 — l'apprenant entre, lève la main, écrit
  const joined = await asLearner(`/api/lives/${sessionId}`)
  const room = JSON.parse(joined.body).data
  console.log('\n4. entrée apprenant :', joined.status)
  console.log('   jeton de salle    :', room.token ? 'émis' : 'aucun')
  console.log('   transport         :', room.transportConfigured ? 'configuré' : 'absent')
  await asLearner(`/api/lives/${sessionId}`, {
    method: 'POST', body: JSON.stringify({ action: 'hand', raised: true }),
  })
  await asLearner(`/api/lives/${sessionId}`, {
    method: 'POST', body: JSON.stringify({ action: 'message', body: 'Le replay sera dispo ?' }),
  })

  // 5 — le formateur coupe, puis donne la parole
  console.log('   couper micro      :', (await asTrainer(`/api/lives/${sessionId}`, {
    method: 'POST', body: JSON.stringify({ action: 'mute', userId: learner.id, muted: true }),
  })).status)
  console.log('   donner la parole  :', (await asTrainer(`/api/lives/${sessionId}`, {
    method: 'POST', body: JSON.stringify({ action: 'mute', userId: learner.id, muted: false }),
  })).status)
  const after = await db.liveParticipant.findFirstOrThrow({
    where: { sessionId, userId: learner.id },
  })
  console.log('   main baissée      :', after.handRaisedAt === null)

  // 6 — rendu des écrans
  const html = async (path: string, cookie: string) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie } })
    return { status: res.status, text: await res.text() }
  }
  const console_ = await html(`/formateur/lives/${sessionId}/console`, trainerCookie)
  const roomPage = await html(`/mes-lives/live/${sessionId}`, learnerCookie)
  const agenda = await html('/mes-lives', learnerCookie)
  console.log('\n6. rendu des écrans')
  console.log('   console          :', console_.status,
    '· « Enregistrement en cours » :', console_.text.includes('Enregistrement en cours'),
    '· démo :', console_.text.includes('Écran de démonstration'))
  console.log('   salle apprenant  :', roomPage.status,
    '· titre :', roomPage.text.includes('Revue de checklists QA'),
    '· salon :', roomPage.text.includes('replay sera dispo'))
  console.log('   agenda           :', agenda.status,
    '· séance listée :', agenda.text.includes('Revue de checklists QA'))
  console.log('   frontière erreur :',
    [console_, roomPage, agenda].some((p) => p.text.includes('Une erreur est survenue')))

  // 7 — clore : le replay doit exister quoi qu'il arrive (arbitrage 38)
  const ended = await asTrainer(`/api/lives/${sessionId}`, {
    method: 'POST', body: JSON.stringify({ action: 'end' }),
  })
  console.log('\n7. clôture       :', ended.status, ended.body)
  const replay = await db.replay.findUnique({ where: { sessionId } })
  console.log('   replay          :', replay?.status)

  // 8 — stockage et facture
  const storage = await asTrainer('/api/trainer/storage')
  const s = JSON.parse(storage.body).data
  console.log('\n8. stockage      :', storage.status,
    `· quota ${Math.round(s.quotaBytes / 1024 ** 3)} Go · ${s.tiers} palier(s) · palier à ${s.tierPriceFcfa} FCFA`)
  const bumped = await asTrainer('/api/trainer/storage', {
    method: 'PATCH', body: JSON.stringify({ tiers: 1 }),
  })
  console.log('   +1 palier       :', bumped.status,
    `· quota ${Math.round(JSON.parse(bumped.body).data.quotaBytes / 1024 ** 3)} Go`)

  const invoices = await asLearner('/api/me/invoices')
  const list = JSON.parse(invoices.body).data as Array<{ id: string; number: string }>
  console.log('   factures        :', invoices.status, `· ${list.length} pièce(s)`)
  if (list[0]) {
    const pdf = await fetch(`${BASE}/api/me/invoices/${list[0].id}?pdf=1`, {
      headers: { cookie: learnerCookie },
    })
    const buf = Buffer.from(await pdf.arrayBuffer())
    console.log('   PDF             :', pdf.status,
      `· ${pdf.headers.get('content-type')} · ${buf.length} octets · en-tête ${buf.subarray(0, 5).toString()}`)
  }

  // 9 — nettoyage
  await db.trainerProfile.update({ where: { id: trainerProfile.id }, data: { storageTiers: 0 } })
  await db.replay.deleteMany({ where: { communityId: community.id } })
  await db.liveMessage.deleteMany({ where: { sessionId } })
  await db.liveParticipant.deleteMany({ where: { sessionId } })
  await db.liveSession.deleteMany({ where: { communityId: community.id } })
  await db.communitySubscription.deleteMany({ where: { communityId: community.id } })
  await db.notification.deleteMany({ where: { type: { in: ['LIVE_SCHEDULED', 'REPLAY_AVAILABLE'] } } })
  await db.auditLog.deleteMany({ where: { targetId: community.id } })
  await db.community.delete({ where: { id: community.id } })
  console.log('\n9. nettoyage effectué')
}

main()
  .catch((err) => { console.error('ÉCHEC :', err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
