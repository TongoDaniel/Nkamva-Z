// Smoke test des annonces d'un achat encaissé (F12.5 à F12.7), contre la base
// de dev et les vraies fonctions du domaine.
//
//   bun scripts/smoke-notifications-achat.ts
//
// Ce que les tests unitaires ne montrent pas : que l'e-mail **part** vraiment,
// avec le bon destinataire et le bon sujet. Commenter `RESEND_API_KEY` avant de
// lancer — `sendEmail()` bascule alors sur son repli et journalise
// `[EMAIL:DEV]` au lieu d'envoyer. Sans cette précaution, ce script expédie de
// vrais courriels.
//
// Il crée ses données et les efface ensuite, y compris en cas d'échec.
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config()

// Hermétique, comme `tests/setup.ts` et pour les mêmes raisons. Sans les deux
// premières lignes, ce script ouvrirait une vraie session Stripe ; sans la
// troisième, l'achat resterait en attente et il n'y aurait tout simplement rien
// à annoncer — c'est le faux négatif qu'on a rencontré au premier essai.
//
// Assigner `''` plutôt que `delete` : sous bun, la suppression réinjecte `.env`
// à la lecture suivante et la clé réapparaît.
process.env.STRIPE_SECRET_KEY = ''
process.env.PAWAPAY_API_TOKEN = ''
process.env.ALLOW_PAYMENT_SIMULATION = '1'

const db = new PrismaClient()
let echecs = 0

function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

/** Les e-mails réellement partis, interceptés sur la console. */
const envoyes: Array<{ to: string; subject: string }> = []

function interceptEmails() {
  const vrai = console.log
  console.log = (...args: unknown[]) => {
    if (args[0] === '[EMAIL:DEV]' && args[1] && typeof args[1] === 'object') {
      const p = args[1] as { to?: string; subject?: string }
      if (p.to && p.subject) envoyes.push({ to: p.to, subject: p.subject })
      return
    }
    vrai(...args)
  }
  return () => { console.log = vrai }
}

async function main() {
  const marque = `smoke-notif-${Date.now()}`
  const restore = interceptEmails()

  const { createCourse, publishCourse } = await import('@/lib/courses')
  const { initiatePurchase } = await import('@/lib/purchases')

  const trainer = await db.user.create({
    data: { email: `${marque}-formatrice@nkamva.test`, role: 'TRAINER', fullName: 'Formatrice' },
  })
  const profile = await db.trainerProfile.create({
    data: {
      userId: trainer.id,
      verifiedLegalName: 'Formatrice Smoke',
      approvedAt: new Date(Date.now() - 40 * 86_400_000),
    },
  })
  await db.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

  const course = await createCourse(profile.id, trainer.id, {
    title: `Ressource ${marque}`,
    blurb: 'Recette des annonces',
    description: 'Ressource créée par le smoke test des notifications.',
    category: 'dev', format: 'video', priceFcfa: 20_000, level: 'Avancé',
    durationSeconds: 3600,
  })
  await db.course.update({
    where: { id: course.id },
    data: {
      contentS3Key: `course-assets/${course.id}/fixture.mp4`,
      contentSizeBytes: 1024, contentMimeType: 'video/mp4',
    },
  })
  await publishCourse(course.id, profile.id, trainer.id)

  const learner = await db.user.create({
    data: { email: `${marque}-apprenant@nkamva.test`, role: 'LEARNER', fullName: 'Apprenant' },
  })

  try {
    console.log(`\nAnnonces d'un achat encaissé — ${marque}\n`)

    await initiatePurchase(course.id, learner.id, 'STRIPE')

    const pourAcheteur = await db.notification.findMany({ where: { userId: learner.id } })
    const pourFormateur = await db.notification.findMany({ where: { userId: trainer.id } })

    console.log('1. Les deux parties sont prévenues dans le produit')
    verifier("l'acheteur a son reçu",
      pourAcheteur.some(n => n.type === 'PURCHASE_CONFIRMED'),
      `types : ${pourAcheteur.map(n => n.type).join(', ') || 'aucun'}`)
    verifier('le formateur apprend sa vente',
      pourFormateur.some(n => n.type === 'COURSE_SOLD'),
      `types : ${pourFormateur.map(n => n.type).join(', ') || 'aucun'}`)

    console.log('\n2. Les e-mails partent, aux bonnes adresses')
    const versAcheteur = envoyes.filter(e => e.to === learner.email)
    const versFormateur = envoyes.filter(e => e.to === trainer.email)
    verifier("un e-mail pour l'acheteur", versAcheteur.length === 1,
      `${versAcheteur.length} e-mail(s) : ${versAcheteur.map(e => e.subject).join(' | ')}`)
    verifier('un e-mail pour le formateur', versFormateur.length === 1,
      `${versFormateur.length} e-mail(s) : ${versFormateur.map(e => e.subject).join(' | ')}`)

    console.log('\n3. Le partage est nommé, pas à calculer')
    const vente = pourFormateur.find(n => n.type === 'COURSE_SOLD')
    verifier('les trois montants figurent dans l\'annonce',
      Boolean(vente && vente.body.includes('20') && vente.body.includes('3') && vente.body.includes('17')),
      `corps : « ${vente?.body ?? '—'} »`)

    console.log('\n4. Une préférence coupée éteint le relationnel, pas le transactionnel')
    await db.user.update({ where: { id: learner.id }, data: { relationalEmails: false } })
    const avant = envoyes.length
    const { notifyWithEmail, TRANSACTIONAL } = await import('@/lib/notification')
    await notifyWithEmail(learner.id, { type: 'MESSAGE', title: 'T', body: 'B' },
      { subject: 'relationnel', title: 'T', paragraphs: ['x'] }, 'relationalEmails')
    verifier("le relationnel se tait", envoyes.length === avant)
    await notifyWithEmail(learner.id, { type: 'PURCHASE_CONFIRMED', title: 'T', body: 'B' },
      { subject: 'transactionnel', title: 'T', paragraphs: ['x'] }, TRANSACTIONAL)
    verifier('le transactionnel part quand même', envoyes.length === avant + 1)
  } finally {
    restore()
    // Nettoyage : l'ordre suit les dépendances, du plus feuille au plus racine.
    await db.notification.deleteMany({ where: { userId: { in: [learner.id, trainer.id] } } })
    await db.auditLog.deleteMany({ where: { actorId: { in: [learner.id, trainer.id] } } })
    await db.invoice.deleteMany({ where: { userId: learner.id } })
    await db.walletDebit.deleteMany({ where: { wallet: { trainerId: profile.id } } })
    await db.purchase.deleteMany({ where: { learnerId: learner.id } })
    await db.course.deleteMany({ where: { trainerId: profile.id } })
    await db.wallet.deleteMany({ where: { trainerId: profile.id } })
    await db.trainerProfile.delete({ where: { id: profile.id } })
    await db.user.deleteMany({ where: { id: { in: [learner.id, trainer.id] } } })
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
