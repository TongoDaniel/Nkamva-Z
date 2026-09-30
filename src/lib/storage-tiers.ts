// ==========================================================================
// Extension de stockage — arbitrages 54 et 69
// ==========================================================================
// 40 Go sont inclus par formateur (arbitrage 54). Au-delà, le stockage s'achète
// par tranches de 50 Go, **facturées avec l'abonnement** (arbitrage 69).
//
// Le pas était tranché, le prix ne l'était pas — et c'est ce qui bloquait ce
// chantier depuis deux relevés. Il n'avait pas à l'être : la décision 59 dit
// déjà que les tarifs sont **administrés, pas déployés**. Le prix d'un palier
// rejoint donc `PlatformTariff` avec son `kind`, et le Super-admin le pose
// depuis `/admin/parametres` comme celui de l'abonnement. Rien n'est en dur.
//
// Conséquence à connaître : tant qu'aucun tarif de palier n'est posé, un palier
// vaut **zéro** et ne facture rien. L'absence de prix n'invente pas de créance —
// et un formateur qui a pris de l'espace avant que le tarif existe ne se verra
// pas réclamer rétroactivement (décision 59, interdit de rétroactivité).
// ==========================================================================

import type { PlanCadence } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { trainerStorageUsedBytes } from './courses'
import { STORAGE_TIER_BYTES, TRAINER_STORAGE_QUOTA_BYTES } from './rules'

/** Arbitrage 69 — le pas est tranché : 50 Go. Défini dans `rules.ts`. */
export { STORAGE_TIER_BYTES }

/** Quota effectif : l'inclus, plus ce qui a été acheté. */
export function quotaBytesFor(tiers: number): number {
  return TRAINER_STORAGE_QUOTA_BYTES + Math.max(0, tiers) * STORAGE_TIER_BYTES
}

/**
 * Prix d'un palier pour une cadence, à une date donnée. Nul tant que le
 * Super-admin n'en a posé aucun — et `0` est alors la bonne réponse, pas une
 * erreur.
 */
export async function getStorageTierTariff(cadence: PlanCadence, at = new Date()) {
  return db.platformTariff.findFirst({
    where: {
      kind: 'STORAGE_TIER',
      cadence,
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gt: at } }],
    },
    orderBy: { validFrom: 'desc' },
  })
}

export async function storageTierPriceFcfa(cadence: PlanCadence, at = new Date()): Promise<number> {
  return (await getStorageTierTariff(cadence, at))?.amountFcfa ?? 0
}

/**
 * Les deux prix de palier en vigueur, tels que `/admin/parametres` les affiche.
 * Pendant de `getCurrentTariffs` pour l'abonnement : un prix qu'on peut poser
 * sans jamais le relire est un prix qu'on pose deux fois.
 */
export async function getCurrentStorageTierTariffs(at = new Date()) {
  const [monthly, yearly] = await Promise.all([
    getStorageTierTariff('MONTHLY', at),
    getStorageTierTariff('YEARLY', at),
  ])
  return { MONTHLY: monthly, YEARLY: yearly }
}

export interface TrainerStorageView {
  usedBytes: number
  quotaBytes: number
  remainingBytes: number
  includedBytes: number
  tiers: number
  tierBytes: number
  /** Prix unitaire d'un palier à la cadence du formateur. */
  tierPriceFcfa: number
  /** Ce que les paliers coûtent à chaque échéance. */
  monthlyTiersFcfa: number
  /** Paliers minimaux pour couvrir ce qui est déjà stocké. */
  minimumTiers: number
}

/** État complet du stockage d'un formateur, tel que son portefeuille l'affiche. */
export async function getTrainerStorage(trainerProfileId: string): Promise<TrainerStorageView> {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { storageTiers: true, subscriptionCadence: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')

  const [usedBytes, tierPriceFcfa] = await Promise.all([
    trainerStorageUsedBytes(trainerProfileId),
    storageTierPriceFcfa(profile.subscriptionCadence),
  ])

  const quotaBytes = quotaBytesFor(profile.storageTiers)
  const overflow = Math.max(0, usedBytes - TRAINER_STORAGE_QUOTA_BYTES)

  return {
    usedBytes,
    quotaBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
    includedBytes: TRAINER_STORAGE_QUOTA_BYTES,
    tiers: profile.storageTiers,
    tierBytes: STORAGE_TIER_BYTES,
    tierPriceFcfa,
    monthlyTiersFcfa: profile.storageTiers * tierPriceFcfa,
    minimumTiers: Math.ceil(overflow / STORAGE_TIER_BYTES),
  }
}

/**
 * Fixe le nombre de paliers d'un formateur.
 *
 * Réduire en dessous de ce qui est déjà stocké est refusé : le contraire
 * mettrait le formateur en dépassement instantané, avec des contenus déjà
 * publiés et vendus qu'il faudrait bien continuer de servir. Il libère de
 * l'espace d'abord — ou attend la purge d'un replay, qui lui en rend
 * (arbitrages 51 et 54).
 *
 * La facturation n'a pas lieu ici : le changement prend effet à l'échéance,
 * comme la cadence (décision 61). Personne n'est débité par surprise.
 */
export async function setTrainerStorageTiers(
  trainerProfileId: string,
  userId: string,
  tiers: number,
): Promise<TrainerStorageView> {
  if (!Number.isInteger(tiers) || tiers < 0) throw new Error('INVALID_AMOUNT')

  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { storageTiers: true, subscriptionStatus: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  if (profile.storageTiers === tiers) return getTrainerStorage(trainerProfileId)

  // Un abonnement suspendu ne prend pas d'engagement supplémentaire : c'est la
  // même logique que le blocage de publication (décision 68).
  if (tiers > profile.storageTiers && profile.subscriptionStatus === 'SUSPENDED') {
    throw new Error('SUBSCRIPTION_SUSPENDED')
  }

  if (tiers < profile.storageTiers) {
    const usedBytes = await trainerStorageUsedBytes(trainerProfileId)
    if (usedBytes > quotaBytesFor(tiers)) throw new Error('STORAGE_IN_USE')
  }

  await db.$transaction(async (tx) => {
    await tx.trainerProfile.update({
      where: { id: trainerProfileId },
      data: { storageTiers: tiers },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'STORAGE_TIERS_CHANGED', targetType: 'TrainerProfile', targetId: trainerProfileId,
      meta: { from: profile.storageTiers, to: tiers, tierBytes: STORAGE_TIER_BYTES },
    })
  })

  return getTrainerStorage(trainerProfileId)
}

/**
 * Ce que les paliers ajoutent à une période qui s'ouvre. Rendu séparément du
 * prix de l'abonnement pour que la ligne reste lisible sur la facture : un
 * formateur doit pouvoir voir ce qu'il paie pour l'espace.
 */
export async function storageChargeFor(
  trainerProfileId: string,
  cadence: PlanCadence,
  at: Date,
): Promise<{ tiers: number; amountFcfa: number }> {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { storageTiers: true },
  })
  const tiers = profile?.storageTiers ?? 0
  if (tiers === 0) return { tiers: 0, amountFcfa: 0 }

  const unit = await storageTierPriceFcfa(cadence, at)
  return { tiers, amountFcfa: tiers * unit }
}
