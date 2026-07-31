// ==========================================================================
// Lot 3 — Score KYC (décision n°1)
// ==========================================================================

import { db } from './db'

export const KYC_THRESHOLD_VERIFIED = 80
export const KYC_THRESHOLD_TO_VERIFY = 50
export const KYC_WEIGHT_PI = 40
export const KYC_WEIGHT_RIB = 30
export const KYC_WEIGHT_SENIORITY = 10
export const KYC_WEIGHT_CLEAN_SALES = 10
export const KYC_WEIGHT_NO_OPEN_DISPUTE = 10
export const SENIORITY_REQUIRED_DAYS = 30
export const CLEAN_SALES_REQUIRED = 3
export const CLEAN_SALES_WINDOW_DAYS = 90

export interface KycScore {
  score: number
  badge: 'VERIFIED' | 'TO_VERIFY' | 'UNVERIFIED'
  criteria: { piVerified: boolean; ribVerified: boolean; seniority30Days: boolean; cleanSales3: boolean; noOpenDispute: boolean }
  payoutEligible: boolean
  firstPayout: boolean
  carenceActive: boolean
}

export async function computeKycScore(trainerId: string): Promise<KycScore> {
  const profile = await db.trainerProfile.findUnique({ where: { id: trainerId } })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  const now = new Date()

  // Critère 1 : PI vérifiée (+40) — ID_CARD APPROVED + verifiedLegalName non null
  const idCard = await db.trainerDocument.findFirst({
    where: { type: 'ID_CARD', status: 'APPROVED', isCurrent: true, application: { userId: profile.userId } },
  })
  const piVerified = !!idCard && !!profile.verifiedLegalName

  // Critère 2 : RIB vérifié hors carence (+30)
  const activeMethod = await db.payoutMethod.findFirst({ where: { trainerId, isActive: true, verificationStatus: 'VERIFIED' } })
  const carenceActive = !!activeMethod?.carenceUntil && activeMethod.carenceUntil >= now
  const ribVerified = !!activeMethod && !carenceActive

  // Critère 3 : ancienneté >= 30 jours (+10)
  const thirtyDaysAgo = new Date(now.getTime() - SENIORITY_REQUIRED_DAYS * 86400000)
  const seniority30Days = !!profile.approvedAt && profile.approvedAt <= thirtyDaysAgo

  // Critère 4 : >= 3 ventes sans litige sur 90 jours (+10)
  const ninetyDaysAgo = new Date(now.getTime() - CLEAN_SALES_WINDOW_DAYS * 86400000)
  const recentSales = await db.purchase.findMany({
    where: { trainerId, providerStatus: 'SUCCEEDED', createdAt: { gte: ninetyDaysAgo } },
    include: { disputes: { where: { resolution: { in: ['FULL_REFUND', 'PARTIAL_REFUND'] } }, select: { id: true } } },
  })
  const cleanSalesCount = recentSales.filter(p => p.disputes.length === 0).length
  const cleanSales3 = cleanSalesCount >= CLEAN_SALES_REQUIRED

  // Critère 5 : aucun litige ouvert, à condition d'avoir une activité réelle (+10)
  const totalCompletedSales = await db.purchase.count({ where: { trainerId, providerStatus: 'SUCCEEDED' } })
  const openDisputesCount = await db.dispute.count({ where: { trainerId, status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } } })
  const noOpenDispute = totalCompletedSales > 0 && openDisputesCount === 0

  const score = (piVerified ? KYC_WEIGHT_PI : 0) + (ribVerified ? KYC_WEIGHT_RIB : 0) + (seniority30Days ? KYC_WEIGHT_SENIORITY : 0)
    + (cleanSales3 ? KYC_WEIGHT_CLEAN_SALES : 0) + (noOpenDispute ? KYC_WEIGHT_NO_OPEN_DISPUTE : 0)
  const badge = score >= KYC_THRESHOLD_VERIFIED ? 'VERIFIED' : score >= KYC_THRESHOLD_TO_VERIFY ? 'TO_VERIFY' : 'UNVERIFIED'

  const firstPayout = (await db.payout.count({ where: { trainerId, status: 'PAID' } })) === 0
  const payoutEligible = score >= KYC_THRESHOLD_VERIFIED && !firstPayout && !carenceActive

  return { score, badge, criteria: { piVerified, ribVerified, seniority30Days, cleanSales3, noOpenDispute }, payoutEligible, firstPayout, carenceActive }
}
