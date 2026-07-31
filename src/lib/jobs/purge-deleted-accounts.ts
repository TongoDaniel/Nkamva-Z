// ==========================================================================
// Job : effacement des comptes dont la suppression a été demandée il y a plus
// de DELETION_GRACE_DAYS jours.
// ==========================================================================
// Il s'agit d'une anonymisation, pas d'une suppression de ligne. Les clés
// étrangères financières sont en `onDelete: Restrict` : un Purchase doit
// survivre à son acheteur pour que la comptabilité reste vérifiable. On efface
// donc tout ce qui identifie la personne, et on conserve les écritures.
// ==========================================================================

import { db } from '../db'
import { audit } from '../audit'
import { DELETION_GRACE_DAYS } from '../dto'

/** Domaine réservé par la RFC 2606 : une adresse en .invalid ne peut pas router. */
const ANONYMIZED_EMAIL_DOMAIN = 'nkamva.invalid'

export interface PurgeResult {
  eligible: number
  purged: number
  failed: number
}

function anonymizedEmail(): string {
  return `supprime-${crypto.randomUUID()}@${ANONYMIZED_EMAIL_DOMAIN}`
}

/**
 * Efface un compte donné. Idempotent : le garde `deletedAt: null` fait que deux
 * exécutions concurrentes n'en traitent qu'une, et qu'un compte déjà effacé est
 * ignoré sans erreur. Retourne false si rien n'était à faire.
 */
export async function purgeAccount(userId: string, cutoff: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    // Le garde porte aussi sur `deletionRequestedAt` : une annulation arrivée
    // entre la sélection et la transaction annule bien l'effacement.
    const { count } = await tx.user.updateMany({
      where: {
        id: userId,
        deletedAt: null,
        deletionRequestedAt: { not: null, lte: cutoff },
      },
      data: {
        email: anonymizedEmail(),
        emailVerifiedAt: null,
        passwordHash: null,
        googleSub: null,
        fullName: null,
        preferredName: null,
        phone: null,
        countryCode: null,
        avatarUrl: null,
        bio: null,
        // Le motif de suspension est rédigé par un humain et peut nommer la
        // personne ; la date reste, comme trace de modération.
        suspendedReason: null,
        gdprExportS3Key: null,
        deletedAt: new Date(),
        // Coupe toute session encore ouverte au moment de l'effacement.
        sessionsValidAfter: new Date(),
      },
    })
    if (count === 0) return false

    // Données personnelles sans valeur comptable ni probatoire : supprimées.
    const [views, notifications, otps] = await Promise.all([
      tx.courseView.deleteMany({ where: { learnerId: userId } }),
      tx.notification.deleteMany({ where: { userId } }),
      tx.emailOtp.deleteMany({ where: { userId } }),
    ])

    // Un profil formateur porte des informations publiques nominatives.
    const trainer = await tx.trainerProfile.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (trainer) {
      await tx.trainerProfile.update({
        where: { id: trainer.id },
        data: { slogan: null, description: null, websiteUrl: null, domains: [], verifiedLegalName: null },
      })
    }

    await audit(tx, {
      actorId: null,
      actorRole: 'SYSTEM',
      action: 'ACCOUNT_PURGED',
      targetType: 'User',
      targetId: userId,
      meta: {
        graceDays: DELETION_GRACE_DAYS,
        courseViewsDeleted: views.count,
        notificationsDeleted: notifications.count,
        emailOtpsDeleted: otps.count,
        trainerProfileAnonymized: Boolean(trainer),
      },
    })

    return true
  })
}

/**
 * Parcourt les comptes échus et les efface un par un. Une transaction par
 * compte : un échec isolé n'empêche pas les autres d'aboutir.
 */
export async function purgeDeletedAccounts(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000)

  const candidates = await db.user.findMany({
    where: { deletedAt: null, deletionRequestedAt: { not: null, lte: cutoff } },
    select: { id: true },
    orderBy: { deletionRequestedAt: 'asc' },
    take: 500,
  })

  let purged = 0
  let failed = 0
  for (const { id } of candidates) {
    try {
      if (await purgeAccount(id, cutoff)) purged++
    } catch (err) {
      failed++
      console.error('[JOB:purge-deleted-accounts] échec', { userId: id, error: String(err) })
    }
  }

  return { eligible: candidates.length, purged, failed }
}
