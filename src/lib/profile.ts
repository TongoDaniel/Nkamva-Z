// ==========================================================================
// Profil et droits RGPD : consultation, mise à jour, mot de passe,
// export des données, demande et annulation de suppression de compte.
// ==========================================================================

import { db } from './db'
import { hashPassword, verifyPassword } from './password'
import { auditStandalone } from './audit'
import { DELETION_GRACE_DAYS } from './dto'

export { DELETION_GRACE_DAYS }

export interface ProfileView {
  id: string
  email: string
  emailVerifiedAt: string | null
  fullName: string | null
  preferredName: string | null
  phone: string | null
  countryCode: string | null
  bio: string | null
  role: string
  isTrainer: boolean
  createdAt: string
  gdprExportRequestedAt: string | null
  deletionRequestedAt: string | null
  /** Date d'effacement prévue, dérivée de la demande. */
  deletionScheduledAt: string | null
}

export async function getProfile(userId: string): Promise<ProfileView | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, emailVerifiedAt: true, fullName: true, preferredName: true,
      phone: true, countryCode: true, bio: true, role: true, createdAt: true,
      gdprExportRequestedAt: true, deletionRequestedAt: true,
      trainerProfile: { select: { id: true } },
    },
  })
  if (!user) return null

  const scheduled = user.deletionRequestedAt
    ? new Date(user.deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000)
    : null

  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    fullName: user.fullName,
    preferredName: user.preferredName,
    phone: user.phone,
    countryCode: user.countryCode,
    bio: user.bio,
    role: user.role,
    isTrainer: Boolean(user.trainerProfile),
    createdAt: user.createdAt.toISOString(),
    gdprExportRequestedAt: user.gdprExportRequestedAt?.toISOString() ?? null,
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    deletionScheduledAt: scheduled?.toISOString() ?? null,
  }
}

export interface ProfileUpdate {
  fullName?: string
  preferredName?: string | null
  phone?: string | null
  countryCode?: string | null
  bio?: string | null
}

export async function updateProfile(userId: string, data: ProfileUpdate): Promise<ProfileView> {
  await db.user.update({
    where: { id: userId },
    data: {
      ...(data.fullName !== undefined && { fullName: data.fullName }),
      ...(data.preferredName !== undefined && { preferredName: data.preferredName || null }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.countryCode !== undefined && { countryCode: data.countryCode || null }),
      ...(data.bio !== undefined && { bio: data.bio || null }),
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'PROFILE_UPDATED', targetType: 'User', targetId: userId,
    meta: { fields: Object.keys(data) },
  })

  return (await getProfile(userId))!
}

// --- Mot de passe ---

export type PasswordChangeFailure = 'NO_PASSWORD_SET' | 'CURRENT_PASSWORD_INVALID' | 'SAME_PASSWORD'

/**
 * Change le mot de passe après vérification de l'actuel, puis invalide toutes
 * les sessions — y compris celle en cours : un JWT déjà émis ne peut pas être
 * conservé sélectivement, `sessionsValidAfter` s'applique à tous les jetons.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: PasswordChangeFailure }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
  if (!user?.passwordHash) return { ok: false, reason: 'NO_PASSWORD_SET' }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, reason: 'CURRENT_PASSWORD_INVALID' }
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    return { ok: false, reason: 'SAME_PASSWORD' }
  }

  const passwordHash = await hashPassword(newPassword)
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, sessionsValidAfter: new Date() },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'PASSWORD_CHANGED', targetType: 'User', targetId: userId,
    meta: { sessionsInvalidated: true },
  })

  return { ok: true }
}

// --- Export RGPD ---

/**
 * Construit la copie des données personnelles.
 * Le schéma prévoit `gdprExportS3Key` (fichier déposé sur R2 par un job), mais
 * aucun ordonnanceur n'existe et R2 n'est pas configuré. L'export est donc
 * produit à la demande et servi directement : l'utilisateur l'obtient tout de
 * suite, et aucune copie de ses données ne dort dans un bucket.
 */
export async function buildGdprExport(userId: string) {
  const [user, purchases, views, notifications, subscriptions, activity] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, emailVerifiedAt: true, fullName: true, preferredName: true,
        phone: true, countryCode: true, avatarUrl: true, bio: true, role: true, adminRole: true,
        createdAt: true, updatedAt: true, suspendedAt: true, suspendedReason: true,
        gdprExportRequestedAt: true, deletionRequestedAt: true,
        trainerProfile: {
          select: {
            id: true, slogan: true, description: true, websiteUrl: true, domains: true,
            experienceYears: true, plan: true, subscriptionStatus: true, commissionRate: true,
            ratingAverage: true, ratingCount: true, studentsCount: true, createdAt: true,
          },
        },
      },
    }),
    db.purchase.findMany({
      where: { learnerId: userId },
      select: {
        id: true, amountFcfa: true, provider: true, providerStatus: true,
        providerTransactionId: true, refundedAt: true, refundAmountFcfa: true,
        accessSuspended: true, createdAt: true,
        course: { select: { title: true, slug: true, format: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.courseView.findMany({
      where: { learnerId: userId },
      select: {
        watchedSeconds: true, downloaded: true, downloadedAt: true, lastViewedAt: true,
        createdAt: true, course: { select: { title: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.notification.findMany({
      where: { userId },
      select: { type: true, title: true, body: true, readAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.communitySubscription.findMany({
      where: { learnerId: userId },
      select: {
        status: true, periodStart: true, periodEnd: true, provider: true,
        canceledAt: true, createdAt: true,
        community: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    // Journal des actions dont l'utilisateur est l'auteur. Les entrées où il
    // n'est que la cible relèvent d'une décision d'un tiers : hors export.
    db.auditLog.findMany({
      where: { actorId: userId },
      select: { action: true, targetType: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    }),
  ])

  if (!user) return null

  await db.user.update({
    where: { id: userId },
    data: { gdprExportRequestedAt: new Date() },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'GDPR_EXPORT_GENERATED', targetType: 'User', targetId: userId,
    meta: { purchases: purchases.length, courseViews: views.length },
  })

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      format: 'application/json',
      scope: "Données personnelles détenues par NkamVa pour ce compte.",
    },
    compte: user,
    achats: purchases,
    consultations: views,
    abonnementsCommunaute: subscriptions,
    notifications,
    journalActivite: activity,
  }
}

// --- Suppression de compte ---

export type DeletionRefusal = 'WALLET_NOT_EMPTY' | 'PUBLISHED_COURSES'

/**
 * Enregistre une demande de suppression. Le compte reste utilisable pendant le
 * délai de grâce : c'est la seule façon d'offrir une annulation en autonomie
 * (la maquette prévoyait une désactivation immédiate annulable « par e-mail »,
 * canal qui n'existe pas). L'effacement effectif à J+30 relève d'un job
 * planifié, qui n'est pas encore en place.
 */
export async function requestDeletion(
  userId: string,
  trainerId: string | null,
): Promise<{ ok: true; scheduledAt: string } | { ok: false; reason: DeletionRefusal }> {
  if (trainerId) {
    // Les clés étrangères financières sont en onDelete: Restrict : promettre un
    // effacement qui échouerait serait pire que le refuser tout de suite.
    const [wallet, published] = await Promise.all([
      db.wallet.findUnique({ where: { trainerId }, select: { balance: true } }),
      db.course.count({ where: { trainerId, status: 'published' } }),
    ])
    if ((wallet?.balance ?? 0) !== 0) return { ok: false, reason: 'WALLET_NOT_EMPTY' }
    if (published > 0) return { ok: false, reason: 'PUBLISHED_COURSES' }
  }

  const requestedAt = new Date()
  await db.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: requestedAt },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'ACCOUNT_DELETION_REQUESTED', targetType: 'User', targetId: userId,
    meta: { graceDays: DELETION_GRACE_DAYS },
  })

  return {
    ok: true,
    scheduledAt: new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000).toISOString(),
  }
}

export async function cancelDeletion(userId: string): Promise<boolean> {
  // Gardé sur `deletionRequestedAt: { not: null }` : annuler deux fois ne
  // produit qu'une seule entrée d'audit.
  const { count } = await db.user.updateMany({
    where: { id: userId, deletionRequestedAt: { not: null } },
    data: { deletionRequestedAt: null },
  })
  if (count === 0) return false

  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'ACCOUNT_DELETION_CANCELED', targetType: 'User', targetId: userId,
  })
  return true
}
