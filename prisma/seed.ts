// ==========================================================================
// Jeu de démonstration NkamVa
// ==========================================================================
//
//   bun prisma/seed.ts
//
// Reconstruit une plateforme entière : catalogue, communautés vivantes, achats,
// litiges instruits, candidatures en cours, retraits versés, tarifs administrés.
// De quoi ouvrir n'importe quel écran — apprenant, formateur ou administration —
// et le trouver habité.
//
// ── Deux principes, et ils expliquent presque tout le fichier ───────────────
//
// **1. Le seed pilote le produit, il ne peuple pas la base.**
//
// Une adhésion naît d'`initiateMembershipPayment` puis du crédit de
// portefeuille, comme après un vrai paiement. Une candidature devient un profil
// par `approveApplication`, qui crée aussi le portefeuille et ouvre la première
// période d'abonnement. Un litige passe par `openDispute`, qui pose l'instantané
// de consommation, gèle la part du formateur et suspend l'accès.
//
// Écrire ces lignes à la main irait dix fois plus vite et produirait des états
// que le code de production ne sait pas fabriquer — donc des écrans qui
// mentent, et des bogues qu'on ne verrait qu'en production. Là où le service
// refuse légitimement ce que le scénario demande (antidater un tarif, par
// exemple), c'est écrit et justifié sur place.
//
// **2. Le jeu montre aussi ce qui va mal.**
//
// Un catalogue tout vert ne prouve rien. On y trouve donc un paiement en
// attente, deux paiements refusés, une ressource retirée sur signalement, un
// membre banni d'un salon, un compte restreint, un abonnement formateur
// impayé, un moyen de paiement rejeté, un retrait refusé et une candidature
// recalée. Ce sont ces écrans-là qui n'ont jamais été regardés.
//
// ── Purge ───────────────────────────────────────────────────────────────────
//
// Le script **vide les données applicatives** avant de semer. Les machines à
// états ci-dessus ne sont pas rejouables : `approveApplication` crée un profil,
// elle ne le met pas à jour ; `requestPayout` refuse un second retrait en vol.
// Un seed idempotent devrait les contourner, donc mentir. Le schéma et les
// migrations, eux, ne sont jamais touchés.
// ==========================================================================

import { createHash } from 'node:crypto'

import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'
import { creditWalletOnPurchase } from '../src/lib/wallet'
import { setTariff, createDiscount } from '../src/lib/pricing'
import { createApplication, submitApplication, approveApplication, rejectDocuments, rejectApplicationFinal } from '../src/lib/trainer-applications'
import { requestDocumentUpload, confirmDocumentUpload } from '../src/lib/trainer-documents'
import { createCourse, publishCourse } from '../src/lib/courses'
import { linkCourseToCommunity } from '../src/lib/communities'
import { initiateMembershipPayment, cancelMembership } from '../src/lib/memberships'
import { issueNominativeInvitation, issueShareLink, revokeInvitation, acceptGiftInvitation } from '../src/lib/invitations'
import { createPost, replyToPost, togglePinned } from '../src/lib/community-space'
import { openConversation, sendMessage } from '../src/lib/messaging'
import { scheduleLiveSession, startLiveSession, endLiveSession, cancelLiveSession, joinLiveSession, postLiveMessage, markReplayReady } from '../src/lib/lives'
import { openDispute, askLearner, postDisputeMessage, resolveDispute } from '../src/lib/disputes'
import { contestDispute } from '../src/lib/trainer-disputes'
import { createReport, resolveReport } from '../src/lib/reports'
import { applySanction } from '../src/lib/user-sanctions'
import { createPayoutMethod, verifyPayoutMethod, rejectPayoutMethod, expirePayoutMethodCarence } from '../src/lib/payout-methods'
import { requestPayout, approvePayout, rejectPayout, markPayoutPaid } from '../src/lib/payouts'
import { settleSubscriptionCharge } from '../src/lib/subscriptions'
import { issueInvoiceQuietly } from '../src/lib/invoices'
import { toggleFavorite } from '../src/lib/favorites'
import { isS3Configured } from '../src/lib/s3'

import { bootstrapSuperAdmins, SUPER_ADMINS } from '../scripts/bootstrap-admins.mjs'
import { resetApplicationData } from './seed/reset'
import { buildPdf, buildMp4, uploadCourseContent } from './seed/assets'
import {
  ADMINS, TRAINERS, APPLICANTS, LEARNERS, COURSES, COMMUNITIES, POSTS, CONVERSATIONS, LIVES,
  DEV_PASSWORD, MAILBOX, addressFor,
} from './seed/data'
import {
  PURCHASES, MEMBERSHIPS, INVITATIONS, VIEWS, FAVORITE_COURSES, FAVORITE_COMMUNITIES,
  DISPUTES, REPORTS, PAYOUT_METHODS, PAYOUTS, TARIFFS, DISCOUNTS, SETTINGS,
} from './seed/scenario'

const DAY = 86_400_000
const COMMISSION = 0.15

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY)
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY)
}

/** Horodatage d'un événement passé, à une heure crédible de la journée. */
function at(daysBack: number, hour: number, minute = 0): Date {
  const d = daysAgo(daysBack)
  d.setHours(hour, minute, 0, 0)
  return d
}

/** Fraîcheur exigée par les gardes optimistes (`expectedUpdatedAt`). */
async function freshDisputeStamp(id: string): Promise<string> {
  const row = await db.dispute.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })
  return row.updatedAt.toISOString()
}

const sha256 = (payload: Buffer) =>
  createHash('sha256').update(payload).digest('hex')

// Registres de correspondance clé → identifiant, remplis au fil des phases.
const userIdByKey = new Map<string, string>()
const trainerProfileIdByKey = new Map<string, string>()
const applicationIdByKey = new Map<string, string>()
const courseIdByKey = new Map<string, string>()
const communityIdByKey = new Map<string, string>()
const purchaseIdByRef = new Map<string, string>()

const uid = (key: string) => {
  const id = userIdByKey.get(key)
  if (!id) throw new Error(`Compte inconnu : ${key}`)
  return id
}
const tpid = (key: string) => {
  const id = trainerProfileIdByKey.get(key)
  if (!id) throw new Error(`Profil formateur inconnu : ${key}`)
  return id
}
const cid = (key: string) => {
  const id = communityIdByKey.get(key)
  if (!id) throw new Error(`Communauté inconnue : ${key}`)
  return id
}

const notes: string[] = []
function note(message: string) {
  notes.push(message)
  console.log(`   · ${message}`)
}

function step(title: string) {
  console.log(`\n▸ ${title}`)
}

// ==========================================================================
// 1 — Comptes
// ==========================================================================

async function seedAccounts(passwordHash: string) {
  step('Comptes')

  for (const admin of ADMINS) {
    const user = await db.user.create({
      data: {
        email: addressFor(admin.key),
        fullName: admin.fullName,
        role: 'ADMIN',
        adminRole: admin.adminRole,
        passwordHash,
        emailVerifiedAt: new Date(),
        createdAt: daysAgo(500),
      },
    })
    userIdByKey.set(admin.key, user.id)
  }

  for (const learner of LEARNERS) {
    const user = await db.user.create({
      data: {
        email: addressFor(learner.key),
        fullName: learner.fullName,
        preferredName: learner.preferredName ?? null,
        countryCode: learner.countryCode,
        bio: learner.bio ?? null,
        passwordHash,
        emailVerifiedAt: new Date(),
        createdAt: daysAgo(learner.createdDaysAgo),
      },
    })
    userIdByKey.set(learner.key, user.id)
  }

  note(`${ADMINS.length} administrateurs, ${LEARNERS.length} apprenants`)
}

// ==========================================================================
// 2 — Tarification
// ==========================================================================
//
// Les deux générations de tarifs ne se posent pas de la même façon, et c'est
// voulu. `setTariff` refuse une date d'effet dans le passé (décision 59 :
// interdiction de rétroactivité) — elle a raison, et le seed ne contourne pas
// la règle par une variante « spéciale démonstration » du service. L'historique
// est donc écrit directement, la bascule courante passe par le service, qui
// borne le tarif précédent comme il le ferait en production.

async function seedPricing() {
  step('Tarification')
  const superAdmin = uid('admin')

  for (const tariff of TARIFFS.filter((t) => t.amountFcfa === 0)) {
    await db.platformTariff.create({
      data: {
        kind: tariff.kind,
        cadence: tariff.cadence,
        amountFcfa: tariff.amountFcfa,
        validFrom: daysAgo(tariff.validFromDaysAgo),
        label: tariff.label,
        createdById: superAdmin,
      },
    })
  }

  for (const tariff of TARIFFS.filter((t) => t.amountFcfa > 0)) {
    await setTariff({
      kind: tariff.kind,
      cadence: tariff.cadence,
      amountFcfa: tariff.amountFcfa,
      // Le service impose une date d'effet non passée : c'est maintenant.
      validFrom: new Date(),
      label: tariff.label,
      actorId: superAdmin,
    })
  }

  for (const setting of SETTINGS) {
    await db.setting.create({
      data: { ...setting, updatedById: superAdmin },
    })
  }

  note(`${TARIFFS.length} tarifs (dont la gratuité de lancement, bornée), ${SETTINGS.length} réglages`)
}

// ==========================================================================
// 3 — Candidatures formateur
// ==========================================================================
//
// Tous les formateurs du jeu naissent d'une candidature réellement instruite :
// c'est `approveApplication` qui crée le profil, le portefeuille et la première
// période d'abonnement. Les trois pièces sont déposées par la vraie chaîne —
// présignature, téléversement, confirmation avec contrôle du nombre magique —
// pour que la Modération puisse les ouvrir depuis sa console.

async function uploadApplicationDocuments(userId: string, fullName: string) {
  const pieces = [
    { type: 'ID_CARD' as const, mimeType: 'application/pdf', file: buildPdf(`Piece d'identite — ${fullName}`, 'Document de demonstration, sans valeur legale.'), name: 'cni.pdf' },
    { type: 'DIPLOMA' as const, mimeType: 'application/pdf', file: buildPdf(`Justificatif d'expertise — ${fullName}`, 'Attestation de demonstration.'), name: 'attestation.pdf' },
    { type: 'VIDEO' as const, mimeType: 'video/mp4', file: buildMp4(48 * 1024), name: 'presentation.mp4' },
  ]

  for (const piece of pieces) {
    const { documentId, uploadUrl } = await requestDocumentUpload(userId, {
      type: piece.type,
      mimeType: piece.mimeType,
      sizeBytes: piece.file.length,
      sha256: sha256(piece.file),
      originalFileName: piece.name,
    })

    if (isS3Configured()) {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': piece.mimeType, 'content-length': String(piece.file.length) },
        body: new Uint8Array(piece.file),
      })
      if (!response.ok) throw new Error(`Téléversement de ${piece.type} refusé (${response.status})`)
    }

    await confirmDocumentUpload(userId, documentId)
  }
}

async function seedTrainers(passwordHash: string) {
  step('Formateurs')
  const moderation = uid('moderation')

  for (const trainer of TRAINERS) {
    const user = await db.user.create({
      data: {
        email: addressFor(trainer.key),
        fullName: trainer.fullName,
        countryCode: trainer.countryCode,
        phone: trainer.phone,
        passwordHash,
        emailVerifiedAt: new Date(),
        createdAt: daysAgo(trainer.approvedDaysAgo + 14),
      },
    })
    userIdByKey.set(trainer.key, user.id)

    const application = await createApplication(user.id, {
      slogan: trainer.slogan,
      description: trainer.description,
      websiteUrl: trainer.websiteUrl ?? null,
      domains: trainer.domains,
      experienceYears: trainer.experienceYears,
    })
    applicationIdByKey.set(trainer.key, application.id)

    await uploadApplicationDocuments(user.id, trainer.fullName)
    const submitted = await submitApplication(user.id)
    await approveApplication(application.id, {
      verifiedLegalName: trainer.legalName,
      expectedUpdatedAt: submitted.updatedAt.toISOString(),
      actorId: moderation,
    })

    const profile = await db.trainerProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: { id: true },
    })
    trainerProfileIdByKey.set(trainer.key, profile.id)

    // Antériorité. Le score KYC exige trente jours d'ancienneté (critère 3) et
    // les écrans datent l'arrivée du formateur : sans ce recul, tout le monde
    // serait arrivé aujourd'hui, et personne ne pourrait retirer ses gains.
    if (trainer.approvedDaysAgo > 0) {
      const approvedAt = daysAgo(trainer.approvedDaysAgo)
      await db.trainerProfile.update({
        where: { id: profile.id },
        data: { approvedAt, createdAt: approvedAt },
      })
      await db.trainerApplication.update({
        where: { id: application.id },
        data: { createdAt: daysAgo(trainer.approvedDaysAgo + 7), submittedAt: daysAgo(trainer.approvedDaysAgo + 2), approvedAt, reviewedAt: approvedAt },
      })
    }
  }

  note(`${TRAINERS.length} formateurs approuvés, pièces déposées et dossiers instruits`)
}

async function seedPendingApplications(passwordHash: string) {
  step('Candidatures en cours')
  const moderation = uid('moderation')

  for (const applicant of APPLICANTS) {
    const user = await db.user.create({
      data: {
        email: addressFor(applicant.key),
        fullName: applicant.fullName,
        countryCode: applicant.countryCode,
        passwordHash,
        emailVerifiedAt: new Date(),
        createdAt: daysAgo(applicant.submittedDaysAgo + 5),
      },
    })
    userIdByKey.set(applicant.key, user.id)

    const application = await createApplication(user.id, {
      slogan: applicant.slogan,
      description: applicant.description,
      domains: applicant.domains,
      experienceYears: applicant.experienceYears,
    })
    applicationIdByKey.set(applicant.key, application.id)

    await uploadApplicationDocuments(user.id, applicant.fullName)
    const submitted = await submitApplication(user.id)

    if (applicant.outcome === 'RESUBMISSION_PENDING') {
      const idCard = await db.trainerDocument.findFirstOrThrow({
        where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
        select: { id: true },
      })
      await rejectDocuments(application.id, {
        rejections: [{ documentId: idCard.id, rejectionReason: applicant.rejectionReason! }],
        expectedUpdatedAt: submitted.updatedAt.toISOString(),
        actorId: moderation,
      })
    } else if (applicant.outcome === 'REJECTED') {
      await rejectApplicationFinal(application.id, {
        reason: applicant.rejectionReason!,
        expectedUpdatedAt: submitted.updatedAt.toISOString(),
        actorId: moderation,
      })
    }

    await db.trainerApplication.update({
      where: { id: application.id },
      data: { createdAt: daysAgo(applicant.submittedDaysAgo + 2), submittedAt: daysAgo(applicant.submittedDaysAgo) },
    })
  }

  note(APPLICANTS.map((a) => `${a.fullName} → ${a.outcome}`).join(', '))
}

// ==========================================================================
// 4 — Catalogue
// ==========================================================================

async function seedCourses() {
  step('Catalogue')
  let published = 0
  let drafts = 0
  let uploadedBytes = 0

  for (const seed of COURSES) {
    const trainerProfileId = tpid(seed.trainerKey)
    const trainerUserId = uid(seed.trainerKey)

    const course = await createCourse(trainerProfileId, trainerUserId, {
      title: seed.title,
      blurb: seed.blurb,
      description: seed.description,
      category: seed.category,
      format: seed.format,
      priceFcfa: seed.priceFcfa,
      level: seed.level,
      durationSeconds: seed.durationSeconds,
      lessonsCount: seed.lessonsCount,
      learnPoints: seed.learnPoints,
      includes: seed.includes,
    })
    courseIdByKey.set(seed.key, course.id)

    const state = seed.state ?? 'published'
    if (state === 'draft') {
      drafts++
      continue
    }

    // Une vidéo est livrée en MP4, tout le reste en PDF : le kit, le modèle
    // Notion et le tableur sont distribués sous forme de dossier documentaire.
    const isVideo = seed.format === 'video'
    const file = isVideo
      ? buildMp4(160 * 1024)
      : buildPdf(seed.title, seed.blurb)

    const uploaded = await uploadCourseContent(
      course.id,
      trainerProfileId,
      trainerUserId,
      isVideo ? 'video' : 'pdf',
      file,
    )
    if (!uploaded) {
      // `publishCourse` refuse une ressource sans contenu, et elle a raison :
      // sans stockage configuré, mieux vaut un brouillon qu'une vente à vide.
      drafts++
      continue
    }
    uploadedBytes += file.length

    await publishCourse(course.id, trainerProfileId, trainerUserId)
    await db.course.update({
      where: { id: course.id },
      data: {
        publishedAt: daysAgo(seed.publishedDaysAgo ?? 30),
        createdAt: daysAgo((seed.publishedDaysAgo ?? 30) + 5),
        // Arbitrage 47 — une ressource incluse dans une communauté sort du
        // circuit marchand : elle ne se vend plus à l'unité.
        ...(seed.communityKey ? { circuit: 'COMMUNITY' as const } : {}),
      },
    })
    published++
  }

  note(`${published} ressources publiées, ${drafts} brouillons, ${Math.round(uploadedBytes / 1024)} Ko déposés`)
}

// ==========================================================================
// 5 — Communautés
// ==========================================================================
//
// Seule création écrite directement du jeu : **aucune route ni aucun service
// ne crée de communauté**. Le formateur ne peut donc pas ouvrir la sienne
// depuis l'application — c'est un manque du produit, pas un raccourci du seed,
// et il est signalé comme tel dans le compte rendu final.

async function seedCommunities() {
  step('Communautés')

  for (const seed of COMMUNITIES) {
    const community = await db.community.create({
      data: {
        trainerId: tpid(seed.trainerKey),
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        rules: seed.rules,
        priceFcfa: seed.priceFcfa,
        commissionRate: COMMISSION,
        visibility: seed.visibility,
        forumEnabled: seed.forumEnabled ?? true,
        broadcastEnabled: seed.broadcastEnabled ?? true,
        messagingEnabled: seed.messagingEnabled ?? true,
        resourcesEnabled: seed.resourcesEnabled ?? true,
        eventsEnabled: seed.eventsEnabled ?? true,
        createdAt: daysAgo(seed.createdDaysAgo),
      },
    })
    communityIdByKey.set(seed.key, community.id)
  }

  // Rattachement des ressources réservées aux membres.
  for (const seed of COURSES.filter((c) => c.communityKey)) {
    const courseId = courseIdByKey.get(seed.key)
    if (!courseId) continue
    await linkCourseToCommunity(
      cid(seed.communityKey!),
      courseId,
      tpid(seed.trainerKey),
      uid(seed.trainerKey),
    )
  }

  note(`${COMMUNITIES.length} communautés, dont une privée`)
}

// ==========================================================================
// 6 — Achats et adhésions
// ==========================================================================

async function seedPurchases() {
  step('Achats')
  let succeeded = 0
  let pending = 0
  let failed = 0

  for (const seed of PURCHASES) {
    const courseId = courseIdByKey.get(seed.courseKey)
    if (!courseId) throw new Error(`Achat ${seed.ref} : ressource ${seed.courseKey} absente`)
    const course = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { id: true, trainerId: true, priceFcfa: true },
    })

    const amountFcfa = course.priceFcfa
    const trainerShareFcfa = Math.round(amountFcfa * (1 - COMMISSION))
    const outcome = seed.outcome ?? 'SUCCEEDED'

    const purchase = await db.purchase.create({
      data: {
        learnerId: uid(seed.learnerKey),
        courseId: course.id,
        trainerId: course.trainerId,
        amountFcfa,
        commissionRate: COMMISSION,
        trainerShareFcfa,
        platformShareFcfa: amountFcfa - trainerShareFcfa,
        provider: seed.provider,
        providerTransactionId: seed.ref,
        // Tout achat naît en attente, comme dans le tunnel réel ; c'est la
        // confirmation qui le fait basculer.
        providerStatus: outcome === 'FAILED' ? 'FAILED' : 'PENDING',
        acquisitionSource: 'catalogue',
        createdAt: daysAgo(seed.daysAgo),
      },
    })
    purchaseIdByRef.set(seed.ref, purchase.id)

    if (outcome === 'SUCCEEDED') {
      // Le même chemin que le webhook : c'est lui qui crédite le portefeuille
      // et ouvre l'accès. Écrire `balance` à la main produirait un solde que le
      // code de production n'aurait jamais pu calculer.
      await db.$transaction((tx) => creditWalletOnPurchase(tx, seed.ref, seed.provider))
      await issueInvoiceQuietly(purchase.id)
      succeeded++
    } else if (outcome === 'PENDING') pending++
    else failed++
  }

  note(`${succeeded} achats confirmés, ${pending} en attente, ${failed} refusés`)
}

async function seedMemberships() {
  step('Adhésions')
  let active = 0

  for (const seed of MEMBERSHIPS) {
    const communityId = cid(seed.communityKey)
    const learnerId = uid(seed.learnerKey)

    const intent = await initiateMembershipPayment(communityId, learnerId, seed.provider)
    await db.purchase.update({
      where: { id: intent.purchaseId },
      data: { createdAt: daysAgo(seed.daysAgo) },
    })
    await db.$transaction((tx) =>
      creditWalletOnPurchase(tx, intent.providerTransactionId, seed.provider),
    )
    await issueInvoiceQuietly(intent.purchaseId)
    active++

    if (seed.canceled) {
      await cancelMembership(communityId, learnerId)
    }

    if (seed.banned) {
      // Le bannissement d'un membre n'a pas de service dédié : il se pose sur
      // l'adhésion, que `resolveViewer` relit pour couper la parole dans le
      // salon tout en laissant l'accès aux ressources déjà incluses.
      await db.communitySubscription.updateMany({
        where: { communityId, learnerId },
        data: {
          status: 'BANNED',
          bannedAt: daysAgo(4),
          bannedReason: seed.banned.reason,
          bannedById: uid(COMMUNITIES.find((c) => c.key === seed.communityKey)!.trainerKey),
        },
      })
    }
  }

  note(`${active} adhésions réglées, dont 1 résiliée et 1 bannie`)
}

async function seedInvitations() {
  step('Invitations')
  let issued = 0

  for (const seed of INVITATIONS) {
    const communityId = cid(seed.communityKey)
    const community = COMMUNITIES.find((c) => c.key === seed.communityKey)!
    const issuerId = uid(community.trainerKey)

    if (seed.kind === 'SHARE_LINK') {
      await issueShareLink(communityId, issuerId)
      issued++
      continue
    }

    const email = seed.inviteeKey ? addressFor(seed.inviteeKey) : seed.inviteeEmail!
    const { invitation, token } = await issueNominativeInvitation({
      communityId,
      issuerId,
      email,
      grant: seed.grant,
      giftMonths: seed.grant === 'GIFT' ? (seed.giftMonths ?? 1) : null,
    })
    issued++

    if (seed.revoked) {
      await revokeInvitation(invitation.id, issuerId)
    } else if (seed.accepted && seed.inviteeKey) {
      await acceptGiftInvitation(token, uid(seed.inviteeKey))
    }
  }

  note(`${issued} invitations émises — nominatives, offertes, lien de parrainage, une révoquée`)
}

async function seedViewsAndFavorites() {
  step('Progression et favoris')

  for (const seed of VIEWS) {
    const courseId = courseIdByKey.get(seed.courseKey)
    if (!courseId) continue
    const seen = daysAgo(seed.daysAgo)
    await db.courseView.upsert({
      where: { courseId_learnerId: { courseId, learnerId: uid(seed.learnerKey) } },
      update: {},
      create: {
        courseId,
        learnerId: uid(seed.learnerKey),
        watchedSeconds: seed.watchedSeconds ?? 0,
        downloaded: seed.downloaded ?? false,
        downloadedAt: seed.downloaded ? seen : null,
        lastViewedAt: seen,
        createdAt: seen,
      },
    })
  }

  for (const fav of FAVORITE_COURSES) {
    const courseId = courseIdByKey.get(fav.courseKey)
    if (courseId) await toggleFavorite(uid(fav.learnerKey), { courseId })
  }
  for (const fav of FAVORITE_COMMUNITIES) {
    await toggleFavorite(uid(fav.learnerKey), { communityId: cid(fav.communityKey) })
  }

  note(`${VIEWS.length} progressions, ${FAVORITE_COURSES.length + FAVORITE_COMMUNITIES.length} favoris`)
}

// ==========================================================================
// 7 — Vie des salons
// ==========================================================================

async function seedCommunityLife() {
  step('Salons')
  let posts = 0
  let replies = 0

  for (const seed of POSTS) {
    const community = COMMUNITIES.find((c) => c.key === seed.communityKey)!
    const post = await createPost(community.slug, uid(seed.authorKey), {
      kind: seed.kind,
      body: seed.body,
    })
    posts++
    await db.communityPost.update({
      where: { id: post.id },
      data: { createdAt: at(seed.daysAgo, 9, 30) },
    })

    if (seed.pinned) await togglePinned(community.slug, post.id, uid(community.trainerKey))

    for (const reply of seed.replies ?? []) {
      const created = await replyToPost(community.slug, post.id, uid(reply.authorKey), {
        body: reply.body,
      })
      replies++
      await db.communityPostReply.update({
        where: { id: created.id },
        data: { createdAt: at(reply.daysAgo, 14, 15) },
      })
    }
    if (seed.replies?.length) {
      const last = seed.replies[seed.replies.length - 1]
      await db.communityPost.update({
        where: { id: post.id },
        data: { lastReplyAt: at(last.daysAgo, 14, 15) },
      })
    }
  }

  let messages = 0
  for (const seed of CONVERSATIONS) {
    const community = COMMUNITIES.find((c) => c.key === seed.communityKey)!
    const conversation = await openConversation(community.slug, uid(seed.learnerKey))
    for (const message of seed.messages) {
      // Le formateur écrit sous sa casquette d'animateur : c'est le profil
      // formateur qui l'autorise, pas seulement son compte.
      const fromTrainer = message.from === 'trainer'
      const sent = await sendMessage(
        conversation.id,
        fromTrainer ? uid(community.trainerKey) : uid(seed.learnerKey),
        fromTrainer ? tpid(community.trainerKey) : null,
        { body: message.body },
      )
      messages++
      await db.message.update({
        where: { id: sent.id },
        data: {
          createdAt: at(message.daysAgo, 11, 5),
          readAt: message.read ? at(message.daysAgo, 12, 0) : null,
        },
      })
    }
    const last = seed.messages[seed.messages.length - 1]
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: at(last.daysAgo, 11, 5) },
    })
  }

  note(`${posts} publications, ${replies} réponses, ${messages} messages directs`)
}

async function seedLives() {
  step('Sessions en direct')
  let scheduled = 0
  let ended = 0

  for (const seed of LIVES) {
    const community = COMMUNITIES.find((c) => c.key === seed.communityKey)!
    const trainerUserId = uid(community.trainerKey)

    const startAt = seed.startsInDays < 0
      ? at(-seed.startsInDays, seed.startHour)
      : (() => {
          const d = daysFromNow(seed.startsInDays)
          d.setHours(seed.startHour, 0, 0, 0)
          return d
        })()

    const session = await scheduleLiveSession(cid(seed.communityKey), tpid(community.trainerKey), trainerUserId, {
      title: seed.title,
      description: seed.description,
      scheduledStartAt: startAt,
      durationMinutes: seed.durationMinutes,
    })

    if (seed.outcome === 'SCHEDULED') {
      scheduled++
      continue
    }

    if (seed.outcome === 'CANCELED') {
      await cancelLiveSession(session.id, trainerUserId)
      continue
    }

    // Séance réellement jouée : ouverture, participants, salon, clôture.
    //
    // L'ouverture touche le transport temps réel — une salle LiveKit, un flux
    // d'ingestion Mux. Ces appels sortent du processus, et rien ne garantit
    // qu'ils aboutissent depuis un poste de développement : un projet expiré,
    // un pare-feu, et c'est tout le jeu de données qui échouerait sur une
    // séance en direct. On tente le vrai chemin, et on constate la séance
    // sans lui si le transport ne répond pas — c'est exactement ce que fait
    // `endLiveSession` avec un egress en échec.
    let transport = true
    try {
      await startLiveSession(session.id, trainerUserId)
    } catch (error) {
      transport = false
      note(`transport indisponible pour « ${seed.title} » : ${String(error).slice(0, 120)}`)
      await db.liveSession.update({
        where: { id: session.id },
        data: { status: 'LIVE', startedAt: new Date() },
      })
    }

    for (const key of seed.attendeeKeys ?? []) {
      await joinLiveSession(session.id, uid(key))
    }
    for (const line of seed.chat ?? []) {
      await postLiveMessage(session.id, uid(line.authorKey), line.body)
    }

    try {
      await endLiveSession(session.id, trainerUserId)
    } catch (error) {
      if (transport) throw error
      // Même clôture que le service, sans les appels sortants.
      await db.liveSession.update({
        where: { id: session.id },
        data: { status: 'ENDED', endedAt: new Date() },
      })
      await db.replay.create({
        data: {
          sessionId: session.id,
          communityId: cid(seed.communityKey),
          trainerId: tpid(community.trainerKey),
          title: seed.title,
          recordedAt: startAt,
          durationSeconds: seed.durationMinutes * 60,
          status: 'PROCESSING',
          purgeAt: new Date(startAt.getTime() + 730 * DAY),
        },
      })
    }

    // `startLiveSession` horodate au moment de l'appel : la séance a donc eu
    // lieu « maintenant » et son replay serait daté d'aujourd'hui. On replace
    // la séance et son enregistrement à leur date réelle — c'est elle qui fait
    // foi pour l'accès résiduel des anciens membres (arbitrage 34).
    const endedAt = new Date(startAt.getTime() + seed.durationMinutes * 60_000)
    await db.liveSession.update({
      where: { id: session.id },
      data: { createdAt: daysAgo(-seed.startsInDays + 7), startedAt: startAt, endedAt, peakParticipants: (seed.attendeeKeys ?? []).length },
    })
    await db.replay.updateMany({
      where: { sessionId: session.id },
      data: { recordedAt: startAt, purgeAt: new Date(startAt.getTime() + 730 * DAY) },
    })

    // Sans clés de transport, `endLiveSession` clôt le replay en `FAILED` : il
    // promet un enregistrement qu'aucun egress n'a produit. Ici l'egress a
    // tourné — on le déclare prêt par le même chemin que le webhook.
    await markReplayReady(session.id, {
      s3Key: `replays/${session.id}/enregistrement.mp4`,
      sizeBytes: 412_000_000,
      durationSeconds: seed.durationMinutes * 60,
    })
    ended++
  }

  note(`${scheduled} séances à venir, ${ended} terminées avec replay, 1 annulée`)
}

// ==========================================================================
// 8 — Litiges
// ==========================================================================

async function seedDisputes() {
  step('Litiges')
  const moderation = uid('moderation')
  const summary: string[] = []

  for (const seed of DISPUTES) {
    const purchaseId = purchaseIdByRef.get(seed.purchaseRef)
    if (!purchaseId) throw new Error(`Litige ${seed.key} : achat ${seed.purchaseRef} introuvable`)
    const purchase = await db.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      select: { learnerId: true, trainerId: true },
    })

    const dispute = await openDispute(purchase.learnerId, {
      purchaseId,
      reason: seed.reason,
      reasonDetail: seed.reasonDetail,
    })

    if (seed.trainerContest) {
      const trainerKey = TRAINERS.find((t) => tpid(t.key) === purchase.trainerId)!.key
      await contestDispute(dispute.id, uid(trainerKey), purchase.trainerId, seed.trainerContest)
    }

    if (seed.outcome === 'OPEN') {
      // Rien de plus : `openDispute` laisse le dossier en `OPEN`, personne ne
      // l'a encore pris en charge. C'est l'état d'arrivée dans la file.
    } else if (seed.outcome === 'WAITING_LEARNER') {
      await askLearner(dispute.id, {
        actorId: moderation,
        expectedUpdatedAt: await freshDisputeStamp(dispute.id),
        question: seed.supportQuestion!,
      })
    } else if (seed.outcome === 'IN_REVIEW') {
      if (seed.supportMessage) {
        await postDisputeMessage(dispute.id, {
          authorId: moderation,
          authorRole: 'SUPPORT',
          body: seed.supportMessage,
        })
      }
      if (seed.learnerReply) {
        await postDisputeMessage(dispute.id, {
          authorId: purchase.learnerId,
          authorRole: 'LEARNER',
          body: seed.learnerReply,
        })
      }
      await db.dispute.update({ where: { id: dispute.id }, data: { status: 'IN_REVIEW' } })
    } else {
      await resolveDispute(dispute.id, {
        resolution: seed.outcome === 'REFUNDED' ? 'FULL_REFUND' : 'REJECT',
        resolutionNote: seed.resolutionNote,
        expectedUpdatedAt: await freshDisputeStamp(dispute.id),
        actorId: moderation,
        actorAdminRole: 'MODERATION',
      })
    }

    const final = await db.dispute.findUniqueOrThrow({
      where: { id: dispute.id },
      select: { status: true, refundStatus: true },
    })
    summary.push(`${seed.key} → ${final.status}${final.refundStatus ? ` (${final.refundStatus})` : ''}`)
  }

  note(summary.join(', '))
}

// ==========================================================================
// 9 — Modération
// ==========================================================================

async function seedReports() {
  step('Signalements et sanctions')
  const moderation = uid('moderation')
  const superAdmin = uid('admin')

  for (const seed of REPORTS) {
    const targetId =
      seed.targetType === 'COURSE' ? courseIdByKey.get(seed.targetKey)!
        : seed.targetType === 'COMMUNITY' ? cid(seed.targetKey)
          : uid(seed.targetKey)

    const report = await createReport(uid(seed.reporterKey), {
      targetType: seed.targetType,
      targetId,
      reason: seed.reason,
      detail: seed.detail,
    })

    if (seed.outcome === 'OPEN') continue

    const fresh = await db.report.findUniqueOrThrow({
      where: { id: report.id },
      select: { updatedAt: true },
    })
    await resolveReport(report.id, {
      status: seed.outcome,
      decisionNote: seed.decisionNote!,
      hideTarget: seed.hideTarget,
      actorId: moderation,
      actorRole: 'MODERATION',
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
    })
  }

  // Les sanctions découlent des signalements retenus : le compte restreint est
  // celui que la Modération vient de juger, pas un compte tiré au hasard.
  //
  // L'exclusion, elle, est réservée au Super-admin (arbitrage 63) : elle retire
  // l'accès à des biens déjà payés. C'est `applySanction` qui pose `suspendedAt`
  // au passage — l'écrire à la main produirait un compte suspendu au niveau
  // `NONE`, que l'annuaire afficherait « Actif » pendant que le compteur des
  // suspensions le décompterait. Un état que le produit ne sait pas fabriquer.
  for (const learner of LEARNERS) {
    if (!learner.sanction) continue
    const bySuperAdmin = learner.sanction.level === 'BANNED'
    await applySanction(uid(learner.key), {
      level: learner.sanction.level,
      reason: learner.sanction.reason,
      actorId: bySuperAdmin ? superAdmin : moderation,
      actorAdminRole: bySuperAdmin ? 'SUPER_ADMIN' : 'MODERATION',
    })
  }

  note(`${REPORTS.length} signalements instruits, 1 compte restreint, 1 compte exclu`)
}

// ==========================================================================
// 10 — Portefeuilles, moyens de paiement, retraits
// ==========================================================================

async function seedPayoutMethods() {
  step('Moyens de paiement')
  const finances = uid('finances')

  for (const seed of PAYOUT_METHODS) {
    const method = await createPayoutMethod(tpid(seed.trainerKey), uid(seed.trainerKey), {
      type: seed.type,
      accountNature: seed.accountNature,
      holderName: seed.holderName ?? null,
      iban: seed.iban ?? null,
      bic: seed.bic ?? null,
      mobileOperator: seed.mobileOperator ?? null,
      mobilePhone: seed.mobilePhone ?? null,
    })

    if (seed.outcome === 'PENDING_REVIEW') continue

    if (seed.outcome === 'REJECTED') {
      const fresh = await db.payoutMethod.findUniqueOrThrow({
        where: { id: method.id },
        select: { updatedAt: true },
      })
      await rejectPayoutMethod(method.id, {
        reason: seed.rejectionReason!,
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
        actorId: finances,
        actorRole: 'FINANCES',
      })
      continue
    }

    const fresh = await db.payoutMethod.findUniqueOrThrow({
      where: { id: method.id },
      select: { updatedAt: true },
    })
    await verifyPayoutMethod(method.id, {
      method: 'MANUAL_FINANCE',
      note: seed.note ?? null,
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
      actorId: finances,
      actorRole: 'FINANCES',
    })
  }

  // La carence de 72 h n'est jamais raccourcie par une vérification anticipée
  // (décision 23) : sans elle, aucun de ces moyens ne serait retirable et
  // aucun formateur du jeu n'aurait pu être payé. On la fait échoir, puis on
  // laisse le job horaire constater l'échéance — c'est lui qui pose `VERIFIED`.
  await db.payoutMethod.updateMany({
    where: { verificationStatus: { in: ['MANUAL_VERIFIED', 'AUTO_VERIFIED'] } },
    data: { carenceUntil: daysAgo(2) },
  })
  const { verified } = await expirePayoutMethodCarence()

  note(`${PAYOUT_METHODS.length} moyens déposés, ${verified} vérifiés, 1 en revue, 1 rejeté`)
}

async function seedPayouts() {
  step('Retraits')
  const finances = uid('finances')
  const summary: string[] = []

  for (const seed of PAYOUTS) {
    const payout = await requestPayout(tpid(seed.trainerKey), uid(seed.trainerKey), seed.amountFcfa)

    if (seed.outcome === 'IN_FLIGHT') {
      summary.push(`${seed.trainerKey} ${seed.amountFcfa} → ${payout.status}`)
      continue
    }

    // Un retrait auto-approuvé ne passe pas par la revue : seul un dossier
    // `IN_REVIEW` s'approuve, et c'est exactement ce que teste cette branche.
    let current = await db.payout.findUniqueOrThrow({ where: { id: payout.id } })
    if (seed.outcome === 'REJECTED') {
      await rejectPayout(payout.id, {
        reason: seed.rejectionReason!,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        actorId: finances,
        actorRole: 'FINANCES',
      })
      summary.push(`${seed.trainerKey} ${seed.amountFcfa} → REJECTED`)
      continue
    }

    if (current.status === 'IN_REVIEW') {
      await approvePayout(payout.id, {
        expectedUpdatedAt: current.updatedAt.toISOString(),
        actorId: finances,
        actorRole: 'FINANCES',
        note: seed.note ?? null,
      })
      current = await db.payout.findUniqueOrThrow({ where: { id: payout.id } })
    }

    await markPayoutPaid(payout.id, {
      actorId: finances,
      actorRole: 'FINANCES',
      providerReference: seed.providerReference ?? null,
    })
    await db.payout.update({
      where: { id: payout.id },
      data: { submittedAt: daysAgo(21), approvedAt: daysAgo(20), paidAt: daysAgo(19) },
    })
    summary.push(`${seed.trainerKey} ${seed.amountFcfa} → PAID`)
  }

  note(summary.join(', '))
}

// ==========================================================================
// 11 — États d'abonnement formateur
// ==========================================================================

async function seedSubscriptionStates() {
  step('Abonnements formateur')
  const finances = uid('finances')

  // Tous les formateurs sauf Kofi sont à jour. `openFirstPeriod` a ouvert leur
  // période au tarif courant, donc en `DUE` : sans ce règlement, chacun verrait
  // « votre abonnement est à régler » sur son portefeuille, y compris celui qui
  // sert de vitrine. Un seul impayé, choisi, vaut mieux que six subis.
  const dueCharges = await db.subscriptionCharge.findMany({
    where: { status: 'DUE', trainerId: { not: tpid('kofi') } },
    select: { id: true },
  })
  for (const charge of dueCharges) {
    await settleSubscriptionCharge(charge.id, {
      actorId: finances,
      actorRole: 'FINANCES',
      reference: 'Prélèvement mensuel — démonstration',
    })
  }

  // Kofi Mensah : période échue et non réglée. C'est l'état qui déclenche le
  // délai de grâce puis la suspension d'écriture (décision 68) — invisible
  // partout ailleurs, et pourtant tout un pan de la console d'administration.
  const kofi = tpid('kofi')
  const pastDueSince = daysAgo(9)
  await db.subscriptionCharge.updateMany({
    where: { trainerId: kofi },
    data: {
      status: 'DUE',
      settledAt: null,
      periodStart: daysAgo(39),
      periodEnd: pastDueSince,
      amountDueFcfa: 9000,
      listPriceFcfa: 9000,
    },
  })
  await db.trainerProfile.update({
    where: { id: kofi },
    data: {
      subscriptionStatus: 'PAST_DUE',
      subscriptionPastDueAt: pastDueSince,
      subscriptionCurrentPeriodEnd: pastDueSince,
    },
  })

  // Awa a choisi la cadence annuelle et deux paliers de stockage : la fiche
  // d'abonnement a alors quelque chose à montrer au-delà du minimum.
  await db.trainerProfile.update({
    where: { id: tpid('awa') },
    data: { subscriptionCadence: 'YEARLY', storageTiers: 2 },
  })

  note(`${dueCharges.length} périodes réglées, 1 abonnement impayé, 1 cadence annuelle avec paliers de stockage`)
}

// ==========================================================================
// 12 — Cohérence finale
// ==========================================================================

async function reconcileCounters() {
  step('Compteurs')

  // `studentsCount` n'est maintenu par aucun chemin applicatif : aucun achat ne
  // l'incrémente. Il est donc recalculé ici pour ne pas mentir — mais il
  // redeviendra faux au premier achat réel, et c'est un défaut du produit, pas
  // du jeu de données.
  const trainers = await db.trainerProfile.findMany({ select: { id: true } })
  for (const trainer of trainers) {
    const buyers = await db.purchase.findMany({
      where: { trainerId: trainer.id, providerStatus: 'SUCCEEDED' },
      select: { learnerId: true },
      distinct: ['learnerId'],
    })
    await db.trainerProfile.update({
      where: { id: trainer.id },
      data: { studentsCount: buyers.length },
    })
  }

  // Idem pour l'activité des salons : le job `refreshCommunityActivity` la
  // recalcule en production, on l'aligne ici pour que les fiches publiques
  // n'affichent pas « 0 message / jour » sur un forum manifestement vivant.
  for (const seed of COMMUNITIES) {
    const communityId = cid(seed.key)
    const [members, recent] = await Promise.all([
      db.communitySubscription.count({
        where: { communityId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
      }),
      db.communityPost.count({ where: { communityId, createdAt: { gte: daysAgo(30) } } }),
    ])
    await db.community.update({
      where: { id: communityId },
      data: { membersCount: members, messagesPerDay: Math.max(1, Math.round(recent / 30 * 10)) },
    })
  }

  note('studentsCount et activité des salons recalculés')
}

// ==========================================================================
// Orchestration
// ==========================================================================

async function summarize() {
  const [users, trainers, published, drafts, archived, communities, purchases, disputes, reports, payouts, invoices, notifications] =
    await Promise.all([
      db.user.count(),
      db.trainerProfile.count(),
      db.course.count({ where: { status: 'published' } }),
      db.course.count({ where: { status: 'draft' } }),
      db.course.count({ where: { status: 'archived' } }),
      db.community.count(),
      db.purchase.count({ where: { providerStatus: 'SUCCEEDED' } }),
      db.dispute.count(),
      db.report.count(),
      db.payout.count(),
      db.invoice.count(),
      db.notification.count(),
    ])

  const wallets = await db.wallet.findMany({ select: { balance: true, reservedBalance: true } })
  const balance = wallets.reduce((sum, w) => sum + w.balance, 0)
  const reserved = wallets.reduce((sum, w) => sum + w.reservedBalance, 0)
  const fmt = (n: number) => n.toLocaleString('fr-FR')

  console.log(`
════════════════════════════════════════════════════════════════════
  Jeu de démonstration en place
════════════════════════════════════════════════════════════════════

  ${users} comptes · ${trainers} formateurs · ${communities} communautés
  ${published} ressources publiées, ${drafts} brouillons, ${archived} retirée(s)
  ${purchases} paiements confirmés · ${invoices} factures · ${notifications} notifications
  ${disputes} litiges · ${reports} signalements · ${payouts} retraits
  ${fmt(balance)} FCFA en portefeuille, dont ${fmt(reserved)} FCFA gelés par un litige

  Connexion — mot de passe commun : ${DEV_PASSWORD}
  Toutes les adresses sont des sous-adresses de ${MAILBOX}.

    Administration
      ${addressFor('admin')}        Super-admin (démo)
      ${addressFor('finances')}     Finances
      ${addressFor('moderation')}   Modération

    Super-admins réels — rétablis à chaque passage, mot de passe indépendant
    (BOOTSTRAP_ADMIN_PASSWORD, à défaut celui de scripts/bootstrap-admins.mjs)
${SUPER_ADMINS.map((a) => `      ${a.email}${' '.repeat(Math.max(1, 30 - a.email.length))}${a.fullName}`).join('\n')}

    Formateurs
      ${addressFor('awa')}          Awa Sarr — vitrine : KYC complet, retrait versé, salon vivant
      ${addressFor('kofi')}         Kofi Mensah — abonnement impayé
      ${addressFor('nadege')}       Nadège Bidias — espace formateur à l'état neuf

    Apprenants
      ${addressFor('aminata')}      Aminata Diallo — 5 achats, 2 salons, 1 litige en cours
      ${addressFor('clarisse')}     Clarisse Mvondo — 1 remboursement obtenu
      ${addressFor('blaise')}       Blaise Zongo — compte restreint
      ${addressFor('grace')}        Grâce Ilunga — compte exclu

    Candidatures à instruire
      ${addressFor('serge')}        Serge Abega — dossier soumis
      ${addressFor('lucie')}        Lucie Ngo — pièce rejetée, re-soumission attendue
`)

  if (notes.length) {
    console.log('  Points à connaître :')
    console.log('    · Le contenu vidéo déposé est un conteneur MP4 sans piste encodée :')
    console.log('      il se télécharge mais ne se lit pas. Les PDF, eux, s\'ouvrent.')
    console.log('    · Aucun service ne crée de communauté : les trois salons sont')
    console.log('      écrits directement, faute de route côté produit.\n')
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Le jeu de démonstration ne doit jamais être semé en production.')
  }

  const started = Date.now()
  console.log('\nRemise à plat des données applicatives…')
  const { tables } = await resetApplicationData()
  console.log(`   ${tables} tables vidées (schéma et migrations intacts)`)

  const passwordHash = await hashPassword(DEV_PASSWORD)

  // La purge ci-dessus a emporté les Super-admins réels avec le reste. Ils sont
  // rétablis par le même script que celui du déploiement : deux chemins qui
  // créeraient ces comptes chacun à sa façon finiraient par diverger.
  await seedAccounts(passwordHash)
  const bootstrapped = await bootstrapSuperAdmins(db, {
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  })
  for (const account of bootstrapped) note(`Super-admin ${account.email} — ${account.action}`)
  await seedPricing()
  await seedTrainers(passwordHash)
  await seedPendingApplications(passwordHash)
  await seedCourses()
  await seedCommunities()
  await seedPurchases()
  await seedMemberships()
  await seedInvitations()
  await seedViewsAndFavorites()
  await seedCommunityLife()
  await seedLives()
  await seedDisputes()
  await seedReports()
  await seedPayoutMethods()
  await seedPayouts()
  await seedSubscriptionStates()

  // Les remises nominatives visent un formateur : elles attendent son profil.
  step('Remises')
  for (const discount of DISCOUNTS) {
    await createDiscount({
      kind: discount.kind,
      label: discount.label,
      amountFcfa: discount.amountFcfa,
      code: discount.code ?? null,
      trainerId: discount.trainerKey ? tpid(discount.trainerKey) : null,
      reason: discount.reason ?? null,
      validFrom: daysAgo(discount.validFromDaysAgo),
      validUntil: discount.validUntilInDays ? daysFromNow(discount.validUntilInDays) : null,
      maxUses: discount.maxUses ?? null,
      actorId: uid('admin'),
      actorRole: 'SUPER_ADMIN',
    })
  }
  note(`${DISCOUNTS.length} remises : campagne, code promo, remise nominative`)

  await reconcileCounters()
  await summarize()
  console.log(`  Terminé en ${Math.round((Date.now() - started) / 1000)} s.\n`)
}

main()
  .catch((error) => {
    console.error('\n✗ Le seed a échoué :', error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
