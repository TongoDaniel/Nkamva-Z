// ==========================================================================
// Lot 10 — Recette du scénario nominal, de l'inscription au revenu encaissé
// ==========================================================================
//
//   bun scripts/recette-nominale.ts
//   KEEP=1 bun scripts/recette-nominale.ts   (laisse le jeu de données)
//
// Les smoke tests des lots précédents vérifient chacun **un** défaut corrigé.
// Celui-ci vérifie que la chaîne tient bout à bout : une personne s'inscrit,
// devient formatrice, publie, vend, et retire son argent. C'est le parcours
// que l'audit du 1er septembre 2026 appelait le scénario nominal, et rien ne
// le jouait en entier.
//
// ## Par où il passe, et pourquoi
//
// Par les **services**, pas par les écrans. Trois raisons, toutes assumées :
//
//   · l'inscription réelle exige un code reçu par courriel, et le `.env` de
//     développement porte une clé Resend **active** — la recette enverrait de
//     vrais messages à des adresses en `.test`, qui rebondissent ;
//   · le règlement réel passe par Stripe, et un smoke test n'a pas à créer des
//     paiements chez un fournisseur. Le raccourci de simulation existe pour
//     ça, sous double verrou (hors production **et** variable explicite) : ce
//     script pose la variable pour lui-même, dans son propre processus ;
//   · le dépôt réel écrit dans le seau **de production** (`AWS_BUCKET_NAME`),
//     ce qu'aucune recette ne doit faire.
//
// Ce qui est donc éprouvé ici, ce sont les **règles** : les mêmes fonctions que
// les routes appellent, dans l'ordre où un vrai parcours les appelle. Les
// écrans, eux, sont vérifiés par les smoke tests de chaque lot.
//
// ## Ce qu'il ne remplace pas
//
// Un essai par une personne réelle, sans assistance. Cette recette dit que la
// mécanique tient ; elle ne dit pas qu'elle se comprend.

import { config } from 'dotenv'

config()

// Avant tout import de service : le raccourci de règlement se lit à l'appel,
// mais autant que l'intention soit posée en tête de fichier.
process.env.ALLOW_PAYMENT_SIMULATION = '1'
// Le courriel bascule sur son repli journalisé, le stockage sur le sien.
process.env.RESEND_API_KEY = ''
process.env.AWS_ACCESS_KEY_ID = ''
process.env.AWS_SECRET_ACCESS_KEY = ''
process.env.STRIPE_SECRET_KEY = ''

const { PrismaClient } = await import('@prisma/client')
const { createApplication, submitApplication, approveApplication } =
  await import('../src/lib/trainer-applications')
const { initiateActivationPayment } = await import('../src/lib/trainer-activation')
const { createCommunity, linkCourseToCommunity } = await import('../src/lib/communities')
const { createCourse, publishCourse } = await import('../src/lib/courses')
const { initiatePurchase } = await import('../src/lib/purchases')
const { updateReadingPosition, listMyResources, checkCourseAccess } =
  await import('../src/lib/access')
const { getTrainerSalesSummary, listTrainerSales } = await import('../src/lib/trainer-stats')
const { requestPayout } = await import('../src/lib/payouts')
const { getMySubscription, canTrainerWrite } = await import('../src/lib/subscriptions')
const { quotePrice } = await import('../src/lib/pricing')

const db = new PrismaClient()
const KEEP = process.env.KEEP === '1'

let echecs = 0
function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}
function etape(titre: string) {
  console.log(`\n${titre}`)
}

async function main() {
  const marque = `recette-${Date.now()}`
  const cree: { users: string[] } = { users: [] }

  console.log(`\nRecette du scénario nominal — ${new Date().toLocaleString('fr-FR')}`)

  // ------------------------------------------------------------------ 1 ---
  etape('1. Une personne s\'inscrit')

  const formatrice = await db.user.create({
    data: {
      email: `${marque}-formatrice@nkamva.test`,
      role: 'LEARNER',
      fullName: 'Awa Sarr',
      emailVerifiedAt: new Date(),
    },
  })
  cree.users.push(formatrice.id)
  verifier('le compte naît apprenant', formatrice.role === 'LEARNER')

  // ------------------------------------------------------------------ 2 ---
  etape('2. Elle candidate pour former')

  await createApplication(formatrice.id, {
    slogan: 'Le montage sans y passer ses nuits',
    description: 'Quinze ans de post-production, transmis simplement.',
    domains: ['Design'],
    experienceYears: 15,
    desiredCadence: 'MONTHLY',
  })
  const dossier = await db.trainerApplication.findFirstOrThrow({
    where: { userId: formatrice.id },
  })
  verifier('le dossier est ouvert en brouillon', dossier.status === 'DRAFT')

  // Les trois pièces obligatoires. Elles sont posées directement : leur dépôt
  // écrirait dans le seau de production.
  for (const type of ['ID_CARD', 'DIPLOMA', 'VIDEO'] as const) {
    await db.trainerDocument.create({
      data: {
        applicationId: dossier.id, type, status: 'PENDING', isCurrent: true,
        s3Key: `trainer-docs/${dossier.id}/${type}`,
        mimeType: type === 'VIDEO' ? 'video/mp4' : 'application/pdf',
        sizeBytes: 1024, sha256: `sha-${type}-${marque}`,
      },
    })
  }
  await submitApplication(formatrice.id)
  const soumis = await db.trainerApplication.findUniqueOrThrow({ where: { id: dossier.id } })
  verifier('le dossier part à l\'instruction', soumis.status === 'SUBMITTED')
  verifier('le compte passe en attente', (await db.user.findUniqueOrThrow({
    where: { id: formatrice.id }, select: { role: true },
  })).role === 'PENDING_TRAINER')

  // ------------------------------------------------------------------ 3 ---
  etape('3. Un administrateur approuve')

  const admin = await db.user.create({
    data: {
      email: `${marque}-admin@nkamva.test`, role: 'ADMIN', adminRole: 'SUPER_ADMIN',
      fullName: 'Administration', emailVerifiedAt: new Date(),
    },
  })
  cree.users.push(admin.id)

  await approveApplication(dossier.id, {
    verifiedLegalName: 'Awa Sarr',
    expectedUpdatedAt: soumis.updatedAt.toISOString(),
    actorId: admin.id,
  })
  const approuve = await db.trainerApplication.findUniqueOrThrow({ where: { id: dossier.id } })
  verifier('le dossier est approuvé', approuve.status === 'APPROVED')

  // ------------------------------------------------------------------ 4 ---
  etape("4. L'espace s'ouvre — au règlement, ou à l'approbation si c'est gratuit")

  // **C'est le règlement qui fait le formateur** — sauf quand il n'y a rien à
  // régler. La grille actuelle est à zéro (la gratuité court jusqu'au
  // 31 décembre 2026, et le montant payant n'a jamais été arbitré : §14), donc
  // l'approbation ouvre l'espace directement. Exiger un paiement de zéro
  // fermerait la porte à toute la cohorte de lancement.
  //
  // La recette éprouve **la branche qui s'applique**, et dit laquelle : le jour
  // où un montant sera fixé, c'est l'autre qui se jouera ici, sans réécriture.
  const tarif = await quotePrice('MONTHLY')
  const gratuit = tarif.payableFcfa === 0
  console.log(
    `     (abonnement à ${tarif.payableFcfa} FCFA — branche « ${gratuit ? 'gratuite' : 'payante'} »)`,
  )

  const ouvertALApprobation =
    (await db.trainerProfile.findUnique({ where: { userId: formatrice.id } })) !== null

  if (gratuit) {
    verifier("l'espace s'ouvre à l'approbation, faute de montant à régler", ouvertALApprobation)
  } else {
    verifier("l'approbation seule n'ouvre pas l'espace", !ouvertALApprobation)
    const activation = await initiateActivationPayment(formatrice.id, 'STRIPE')
    // Le raccourci de simulation règle sur place et rend `ALREADY_SETTLED` :
    // toute autre issue signifierait qu'on est parti chez un fournisseur, ce
    // qu'une recette ne doit pas faire.
    verifier('le paiement se règle sans quitter le script',
      activation.nextStep === 'ALREADY_SETTLED', String(activation.nextStep))
  }

  const profil = await db.trainerProfile.findUnique({ where: { userId: formatrice.id } })
  verifier("l'espace formateur existe", profil !== null)
  verifier('le compte est devenu formateur', (await db.user.findUniqueOrThrow({
    where: { id: formatrice.id }, select: { role: true },
  })).role === 'TRAINER')

  const abonnement = profil ? await getMySubscription(profil.id) : null
  verifier('une première période court',
    abonnement?.subscriptionStatus === 'ACTIVE' && abonnement.subscriptionCurrentPeriodEnd !== null,
    `${abonnement?.subscriptionStatus} jusqu'au ${abonnement?.subscriptionCurrentPeriodEnd}`)
  verifier('elle peut écrire', profil ? await canTrainerWrite(profil.id) : false)

  if (!profil) {
    console.log('\nL\'espace ne s\'est pas ouvert : la suite n\'a plus de sens.\n')
    await db.$disconnect()
    process.exit(1)
  }

  // ------------------------------------------------------------------ 5 ---
  etape('5. Elle ouvre sa communauté et publie une ressource')

  const communaute = await createCommunity(profil.id, formatrice.id, {
    name: `Studio ${marque}`,
    description: 'Le suivi des montages, semaine après semaine.',
    priceFcfa: 7_500,
  })
  verifier('la communauté est ouverte', communaute.status === 'active')

  const ressource = await createCourse(profil.id, formatrice.id, {
    title: 'Monter une séquence en trente minutes',
    blurb: 'Le rythme avant les effets.',
    description: 'Un atelier court, du dérushage à l\'export.',
    category: 'Design',
    format: 'video',
    priceFcfa: 20_000,
    level: 'débutant',
  })
  verifier('la ressource naît en brouillon', ressource.status === 'draft')
  // La durée ne se saisit plus (F3.8) : elle naîtra du fichier déposé.
  verifier('sans durée déclarée', ressource.durationSeconds === null)

  // Ce que la confirmation d'un dépôt écrirait, y compris la durée mesurée.
  await db.course.update({
    where: { id: ressource.id },
    data: {
      contentS3Key: `course-assets/${ressource.id}/content.mp4`,
      contentSizeBytes: BigInt(180_000_000),
      contentMimeType: 'video/mp4',
      durationSeconds: 1_800,
    },
  })
  const publiee = await publishCourse(ressource.id, profil.id, formatrice.id)
  verifier('elle se publie', publiee.status === 'published')

  const incluse = await createCourse(profil.id, formatrice.id, {
    title: 'Fiches de dérushage',
    blurb: 'Les gabarits que j\'utilise.',
    description: 'Trois fiches à imprimer, prêtes à l\'emploi.',
    category: 'Design', format: 'pdf', priceFcfa: 5_000,
  })
  await db.course.update({
    where: { id: incluse.id },
    data: {
      contentS3Key: `course-assets/${incluse.id}/fiches.pdf`,
      contentSizeBytes: BigInt(240_000), contentMimeType: 'application/pdf',
      pageCount: 12,
    },
  })
  await publishCourse(incluse.id, profil.id, formatrice.id)
  await linkCourseToCommunity(communaute.id, incluse.id, profil.id, formatrice.id)
  verifier('une seconde ressource entre dans la communauté',
    (await db.course.findUniqueOrThrow({ where: { id: incluse.id } })).circuit === 'COMMUNITY')

  // ------------------------------------------------------------------ 6 ---
  etape('6. Un apprenant achète la ressource vendue')

  const apprenant = await db.user.create({
    data: {
      email: `${marque}-apprenant@nkamva.test`, role: 'LEARNER',
      fullName: "Koffi N'Da", emailVerifiedAt: new Date(),
    },
  })
  cree.users.push(apprenant.id)

  const achat = await initiatePurchase(ressource.id, apprenant.id, 'STRIPE')
  verifier("l'achat se règle", achat.nextStep === 'ALREADY_SETTLED', String(achat.nextStep))

  const regle = await db.purchase.findUniqueOrThrow({ where: { id: achat.purchaseId } })
  verifier('le paiement est confirmé', regle.providerStatus === 'SUCCEEDED')
  // Arbitrage : la commission est figée sur la vente, jamais recalculée.
  verifier('la commission est figée sur la vente', regle.commissionRate === 0.15)
  verifier('la part formatrice vaut 85 %', regle.trainerShareFcfa === 17_000,
    String(regle.trainerShareFcfa))

  const acces = await checkCourseAccess(ressource.id, apprenant.id)
  verifier("l'accès est ouvert", acces.granted)

  const facture = await db.invoice.findFirst({ where: { purchaseId: achat.purchaseId } })
  verifier('une facture est émise', facture !== null)

  const avis = await db.notification.findMany({
    where: { userId: { in: [apprenant.id, formatrice.id] } },
    select: { userId: true, type: true },
  })
  verifier("l'acheteur est prévenu", avis.some((n) => n.userId === apprenant.id))
  verifier('la formatrice aussi', avis.some((n) => n.userId === formatrice.id))

  // ------------------------------------------------------------------ 7 ---
  etape('7. Il consulte, et sa position est gardée')

  await updateReadingPosition(ressource.id, apprenant.id, { watchedSeconds: 600 })
  const vue = await db.courseView.findUniqueOrThrow({
    where: { courseId_learnerId: { courseId: ressource.id, learnerId: apprenant.id } },
  })
  verifier('la position est enregistrée', vue.watchedSeconds === 600)

  const mesRessources = await listMyResources(apprenant.id)
  verifier('la ressource achetée est dans sa liste',
    mesRessources.items.some((i) => i.course?.id === ressource.id))
  verifier('elle est marquée commencée', mesRessources.counts.started === 1)

  // ------------------------------------------------------------------ 8 ---
  etape('8. La formatrice voit sa vente et son revenu')

  const ventes = await listTrainerSales(profil.id, 1, 20)
  verifier('la vente est dans son historique',
    ventes.rows.some((v) => v.id === achat.purchaseId),
    `${ventes.total} ligne(s)`)

  const resume = await getTrainerSalesSummary(profil.id)
  verifier('le brut encaissé vaut le prix', resume.grossFcfa === 20_000, String(resume.grossFcfa))
  verifier('le net vaut 85 %', resume.netFcfa === 17_000, String(resume.netFcfa))
  // Les chiffres viennent d'une source unique : la commission n'est jamais
  // recopiée dans un écran.
  verifier('la commission retenue est cohérente',
    resume.grossFcfa - resume.netFcfa === 3_000, String(resume.grossFcfa - resume.netFcfa))

  const portefeuille = await db.wallet.findUniqueOrThrow({ where: { trainerId: profil.id } })
  verifier('le portefeuille est crédité', portefeuille.balance === 17_000, String(portefeuille.balance))

  // ------------------------------------------------------------------ 9 ---
  etape('9. Elle demande son retrait')

  // Le moyen de versement est posé **vérifié et hors carence** : sa
  // vérification passe par une comparaison de noms chez l'opérateur, qu'une
  // recette n'a pas à appeler. Le délai de sécurité de 72 h est une règle
  // réelle — on la respecte en datant la vérification d'il y a cinq jours,
  // pas en la contournant.
  const moyen = await db.payoutMethod.create({
    data: {
      trainerId: profil.id,
      type: 'MOBILE_MONEY',
      accountNature: 'INDIVIDUAL',
      verifiedLegalNameAtCreation: 'Awa Sarr',
      trainerEmailSnapshot: formatrice.email,
      holderName: 'Awa Sarr',
      mobileOperator: 'MTN_MOMO',
      mobilePhone: '+237690000000',
      verificationStatus: 'VERIFIED',
      carenceUntil: new Date(Date.now() - 2 * 86_400_000),
    },
  })

  // Le plancher de retrait est de 10 000 FCFA : les 17 000 encaissés le
  // passent. C'est aussi ce qui rend la recette réaliste — une seule vente
  // suffit à toucher son revenu.
  try {
    const retrait = await requestPayout(profil.id, formatrice.id, 17_000)
    verifier('le retrait est demandé', Boolean(retrait))
    verifier('pour le montant disponible', retrait.amountFcfa === 17_000, String(retrait.amountFcfa))
    verifier('sur le moyen vérifié', retrait.payoutMethodId === moyen.id)
    verifier('et il attend une instruction',
      retrait.status === 'PENDING' || retrait.status === 'AUTO_APPROVED'
        || retrait.status === 'IN_REVIEW',
      String(retrait.status))
  } catch (err) {
    verifier('le retrait est demandé', false,
      `refus : ${err instanceof Error ? err.message : String(err)}`)
  }

  // ----------------------------------------------------------------- bilan --
  if (KEEP) {
    console.log(`\n(KEEP=1 — jeu conservé, formatrice ${formatrice.email})`)
  } else {
    const profileId = profil.id
    await db.payout.deleteMany({ where: { trainerId: profileId } })
    await db.payoutMethod.deleteMany({ where: { trainerId: profileId } })
    // Une facture tient à un achat **ou** à une échéance d'abonnement (depuis
    // que l'abonnement payant est facturé), et retient aussi son destinataire :
    // les trois liens sont `Restrict`, il faut les défaire avant le reste.
    await db.invoice.deleteMany({
      where: {
        OR: [
          { purchase: { trainerId: profileId } },
          { subscriptionCharge: { trainerId: profileId } },
          { userId: { in: cree.users } },
        ],
      },
    })
    await db.walletDebit.deleteMany({ where: { wallet: { trainerId: profileId } } })
    await db.courseView.deleteMany({ where: { course: { trainerId: profileId } } })
    await db.purchase.deleteMany({ where: { trainerId: profileId } })
    await db.communityCourse.deleteMany({ where: { communityId: communaute.id } })
    await db.communitySubscription.deleteMany({ where: { communityId: communaute.id } })
    await db.conversation.deleteMany({ where: { communityId: communaute.id } })
    await db.community.deleteMany({ where: { id: communaute.id } })
    await db.course.deleteMany({ where: { trainerId: profileId } })
    await db.subscriptionCharge.deleteMany({ where: { trainerId: profileId } })
    await db.subscriptionPayment.deleteMany({ where: { trainerId: profileId } })
    await db.wallet.deleteMany({ where: { trainerId: profileId } })
    await db.trainerActivationPayment.deleteMany({ where: { applicationId: dossier.id } })
    await db.trainerDocument.deleteMany({ where: { applicationId: dossier.id } })
    await db.trainerProfile.deleteMany({ where: { id: profileId } })
    await db.trainerApplication.deleteMany({ where: { id: dossier.id } })
    await db.notification.deleteMany({ where: { userId: { in: cree.users } } })
    await db.auditLog.deleteMany({ where: { actorId: { in: cree.users } } })
    await db.user.deleteMany({ where: { id: { in: cree.users } } })
  }

  console.log(
    echecs === 0
      ? '\nLe scénario nominal passe de bout en bout.\n'
      : `\n${echecs} étape(s) en échec.\n`,
  )
  await db.$disconnect()
  process.exit(echecs === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
