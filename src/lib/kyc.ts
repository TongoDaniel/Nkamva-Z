// ==========================================================================
// Lot 3 — Score KYC (décision 1)
// ==========================================================================
// 5 critères pondérés, 0 à 100 :
//   PI vérifiée 40 · RIB vérifié hors carence 30 · ancienneté ≥ 30 j 10
//   · ≥ 3 ventes propres sur 90 j 10 · aucun litige ouvert 10
//
// Conséquence structurelle (assumée) : sans RIB vérifié le plafond est 70,
// donc aucun premier retrait n'est jamais auto-approuvable — cohérent avec la
// décision 25 qui force de toute façon la revue manuelle au premier retrait.
// ==========================================================================

import { db } from './db'
import { ACTIVE_DISPUTE_STATUSES } from './disputes'

export const KYC_THRESHOLD_VERIFIED = 80
export const KYC_THRESHOLD_TO_VERIFY = 50

export const KYC_WEIGHT_PI = 40
export const KYC_WEIGHT_RIB = 30
export const KYC_WEIGHT_SENIORITY = 10
export const KYC_WEIGHT_CLEAN_SALES = 10
export const KYC_WEIGHT_NO_OPEN_DISPUTE = 10

export const SENIORITY_MIN_DAYS = 30
export const CLEAN_SALES_WINDOW_DAYS = 90
export const CLEAN_SALES_MIN_COUNT = 3

export type KycBadge = 'VERIFIED' | 'TO_VERIFY' | 'UNVERIFIED'

export interface KycCriteria {
  piVerified: boolean
  ribVerified: boolean
  seniority30Days: boolean
  cleanSales3: boolean
  noOpenDispute: boolean
}

export interface KycScore {
  score: number
  badge: KycBadge
  criteria: KycCriteria
  /** Aucun retrait PAID à ce jour : la revue manuelle est obligatoire (décision 25). */
  firstPayout: boolean
  /** Carence 72 h en cours sur le moyen de paiement actif (décision 23). */
  carenceActive: boolean
  payoutEligible: boolean
  details: {
    cleanSalesCount: number
    totalCompletedSales: number
    openDisputesCount: number
    carenceUntil: Date | null
  }
}

export async function computeKycScore(trainerProfileId: string): Promise<KycScore> {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { id: true, userId: true, verifiedLegalName: true, approvedAt: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')

  const now = new Date()
  const seniorityThreshold = new Date(now.getTime() - SENIORITY_MIN_DAYS * 86_400_000)
  const cleanSalesThreshold = new Date(now.getTime() - CLEAN_SALES_WINDOW_DAYS * 86_400_000)

  const [idCard, activeMethod, cleanSalesCount, totalCompletedSales, openDisputesCount, paidPayouts] =
    await Promise.all([
      // Critère 1 — la pièce d'identité approuvée ET le nom légal relevé dessus.
      db.trainerDocument.findFirst({
        where: { type: 'ID_CARD', status: 'APPROVED', isCurrent: true, application: { userId: profile.userId } },
        select: { id: true },
      }),
      // Critère 2 — un seul moyen de paiement actif par formateur (décision 26).
      db.payoutMethod.findFirst({
        where: { trainerId: trainerProfileId, isActive: true },
        select: { id: true, verificationStatus: true, carenceUntil: true },
      }),
      // Critère 4 — ventes réglées sur 90 j, sans remboursement de litige.
      db.purchase.count({
        where: {
          trainerId: trainerProfileId,
          providerStatus: 'SUCCEEDED',
          createdAt: { gte: cleanSalesThreshold },
          refundedAt: null,
          disputes: { none: { resolution: { in: ['FULL_REFUND', 'PARTIAL_REFUND'] } } },
        },
      }),
      db.purchase.count({ where: { trainerId: trainerProfileId, providerStatus: 'SUCCEEDED' } }),
      db.dispute.count({ where: { trainerId: trainerProfileId, status: { in: ACTIVE_DISPUTE_STATUSES } } }),
      db.payout.count({ where: { trainerId: trainerProfileId, status: 'PAID' } }),
    ])

  const carenceUntil = activeMethod?.carenceUntil ?? null
  const carenceActive = Boolean(carenceUntil && carenceUntil > now)

  const piVerified = Boolean(idCard) && Boolean(profile.verifiedLegalName)
  // Un RIB non vérifié vaut 0, jamais un score partiel (décision 22).
  // Pendant la carence il vaut 0 également (décision 23).
  const ribVerified = activeMethod?.verificationStatus === 'VERIFIED' && !carenceActive
  const seniority30Days = Boolean(profile.approvedAt && profile.approvedAt <= seniorityThreshold)
  const cleanSales3 = cleanSalesCount >= CLEAN_SALES_MIN_COUNT
  // Ne récompense l'absence de litige que sur une activité réelle : sans vente,
  // le critère vaut 0 plutôt que d'offrir 10 points à un compte inactif.
  const noOpenDispute = totalCompletedSales > 0 && openDisputesCount === 0

  const criteria: KycCriteria = { piVerified, ribVerified, seniority30Days, cleanSales3, noOpenDispute }

  const score =
    (piVerified ? KYC_WEIGHT_PI : 0) +
    (ribVerified ? KYC_WEIGHT_RIB : 0) +
    (seniority30Days ? KYC_WEIGHT_SENIORITY : 0) +
    (cleanSales3 ? KYC_WEIGHT_CLEAN_SALES : 0) +
    (noOpenDispute ? KYC_WEIGHT_NO_OPEN_DISPUTE : 0)

  const badge: KycBadge =
    score >= KYC_THRESHOLD_VERIFIED ? 'VERIFIED'
      : score >= KYC_THRESHOLD_TO_VERIFY ? 'TO_VERIFY'
        : 'UNVERIFIED'

  const firstPayout = paidPayouts === 0

  return {
    score,
    badge,
    criteria,
    firstPayout,
    carenceActive,
    payoutEligible: score >= KYC_THRESHOLD_VERIFIED && !firstPayout && !carenceActive,
    details: { cleanSalesCount, totalCompletedSales, openDisputesCount, carenceUntil },
  }
}
