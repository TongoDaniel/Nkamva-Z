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
import { deleteObject } from '../s3'
import { recountCommunityMembers } from '../communities'
import { abandonableResidueFcfa } from '../payouts'

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
  // La photo est lue **avant** la transaction et retirée du seau **après** :
  // un objet R2 ne se défait pas d'un `ROLLBACK`. Dans cet ordre, le pire cas
  // est un fichier orphelin dans le seau, jamais un compte effacé dont le
  // portrait resterait servi.
  const avant = await db.user.findUnique({
    where: { id: userId },
    select: { avatarS3Key: true },
  })

  const purge = await db.$transaction(async (tx) => {
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
        avatarS3Key: null,
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
    // Les favoris en font partie — ils disent ce que la personne regardait.
    const [views, notifications, otps] = await Promise.all([
      tx.courseView.deleteMany({ where: { learnerId: userId } }),
      tx.notification.deleteMany({ where: { userId } }),
      tx.emailOtp.deleteMany({ where: { userId } }),
      tx.favorite.deleteMany({ where: { userId } }),
    ])

    // Le reliquat abandonné à la demande (A3) sort du portefeuille ici, et non
    // à la demande : annuler la suppression pendant le délai de grâce laissait
    // donc l'argent à son titulaire. Il est débité avec sa trace, comme tout
    // mouvement qui n'est ni une vente ni un retrait.
    const wallet = await tx.wallet.findFirst({
      where: { trainerProfile: { userId } },
      select: { id: true, trainerId: true, balance: true, reservedBalance: true, pendingPayoutBalance: true },
    })
    const residue = wallet ? abandonableResidueFcfa(wallet) : null
    if (wallet && residue !== null) {
      await tx.walletDebit.create({
        data: { walletId: wallet.id, trainerId: wallet.trainerId, amountFcfa: residue, reason: 'CLOSING_RESIDUE' },
      })
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: residue } } })
    }

    // Les adhésions encore ouvertes se ferment avec le compte. Le renouvellement
    // ignore les comptes effacés, et rien d'autre ne les fermait : une adhésion
    // payée la veille d'une suppression restait `ACTIVE` pour toujours — « 1
    // membres » sur la fiche publique, un membre sans nom chez la formatrice, et
    // un obstacle si elle voulait un jour fermer son propre compte (campagne du
    // 12 octobre 2026, M5). Une sanction éventuelle reste inscrite.
    const memberships = await tx.communitySubscription.findMany({
      where: { learnerId: userId, status: { in: ['ACTIVE', 'PAST_DUE', 'BANNED'] } },
      select: { id: true, communityId: true },
    })
    if (memberships.length > 0) {
      const closedAt = new Date()
      await tx.communitySubscription.updateMany({
        where: { id: { in: memberships.map((m) => m.id) }, canceledAt: null },
        data: { canceledAt: closedAt },
      })
      await tx.communitySubscription.updateMany({
        where: { id: { in: memberships.map((m) => m.id) } },
        data: { status: 'CANCELED' },
      })
      // Une échéance encore ouverte ne doit plus pouvoir être réglée : elle
      // rouvrirait une adhésion au nom de personne.
      await tx.purchase.updateMany({
        where: { learnerId: userId, communityId: { not: null }, providerStatus: 'PENDING' },
        data: { providerStatus: 'CANCELED' },
      })
      for (const communityId of new Set(memberships.map((m) => m.communityId))) {
        await recountCommunityMembers(tx, communityId)
      }
    }

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
        membershipsClosed: memberships.length,
        ...(residue !== null ? { residueAbandonedFcfa: residue } : {}),
      },
    })

    return true
  })

  if (purge && avant?.avatarS3Key) {
    await deleteObject(avant.avatarS3Key).catch(() => {})
  }
  return purge
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
