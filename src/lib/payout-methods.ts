// ==========================================================================
// Lot 3 — PayoutMethod (RIB / Mobile Money) : PM1-PM10
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notifyAdminSubRole } from './notification'
import type { AccountNature, MobileMoneyOperator, PayoutMethodType } from '@prisma/client'

export const PAYOUT_METHOD_CARENCE_HOURS = 72
export const PAYOUT_METHOD_MAX_REJECTIONS = 3

export const PAYOUT_METHOD_ERRORS: Record<string, { status: number; message: string }> = {
  USER_NOT_FOUND: { status: 404, message: 'Utilisateur introuvable' },
  TRAINER_NOT_FOUND: { status: 404, message: 'Formateur introuvable' },
  FORBIDDEN: { status: 403, message: 'Accès refusé' },
  VERIFIED_LEGAL_NAME_REQUIRED: { status: 422, message: 'Nom légal vérifié requis (validation formateur)' },
  PAYOUT_METHOD_BLOCKED: { status: 403, message: 'Ajout de RIB bloqué (3 rejets atteints)' },
  PAYOUT_IN_PROGRESS: { status: 409, message: 'Un retrait est en cours' },
  PAYOUT_METHOD_NOT_FOUND: { status: 404, message: 'Moyen de paiement introuvable' },
  INVALID_PAYOUT_METHOD_STATUS: { status: 409, message: 'Statut invalide pour cette action' },
  MICRO_DEPOSIT_REQUIRES_IBAN: { status: 400, message: 'Micro-dépôt réservé aux IBAN' },
  MICRO_DEPOSIT_MISMATCH: { status: 422, message: 'Montants incorrects' },
  JUSTIFICATION_REQUIRED: { status: 400, message: 'Justification requise' },
}

export type NameLookupResult = 'MATCH' | 'NO_MATCH' | 'UNAVAILABLE'

// §5.4 : lookup du nom associé au numéro Mobile Money auprès de l'opérateur
// (Wave/Orange/MTN/M-Pesa). Aucune intégration API n'est câblée dans ce
// projet : ce point d'extension retourne systématiquement UNAVAILABLE tant
// qu'un vrai provider n'y est pas branché. Ne comparez jamais holderName à
// verifiedLegalName en local à la place d'un lookup réel — une déclaration
// du formateur ne prouve rien (décision 22a, voir docs/decisions-nkamva.md).
async function lookupMobileMoneyName(_operator: MobileMoneyOperator, _mobilePhone: string): Promise<NameLookupResult> {
  return 'UNAVAILABLE'
}

export interface CreatePayoutMethodInput {
  type: PayoutMethodType
  accountNature: AccountNature
  holderName?: string
  businessName?: string
  iban?: string
  bic?: string
  mobileOperator?: MobileMoneyOperator
  mobilePhone?: string
}

// --- PM1 : créer un moyen de paiement (archive l'ancien, carence 72h) ---

export async function createPayoutMethod(trainerId: string, userId: string, data: CreatePayoutMethodInput) {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.payoutMethodRejectionCount >= PAYOUT_METHOD_MAX_REJECTIONS) throw new Error('PAYOUT_METHOD_BLOCKED')

  const profile = await db.trainerProfile.findUnique({ where: { id: trainerId } })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  if (!profile.verifiedLegalName) throw new Error('VERIFIED_LEGAL_NAME_REQUIRED')

  const activePayout = await db.payout.findFirst({ where: { trainerId, status: { in: ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED'] } } })
  if (activePayout) throw new Error('PAYOUT_IN_PROGRESS')

  const carenceUntil = new Date(Date.now() + PAYOUT_METHOD_CARENCE_HOURS * 3600000)

  let verificationStatus: 'PENDING_REVIEW' | 'AUTO_VERIFIED' = 'PENDING_REVIEW'
  let verificationMethod: 'NAME_LOOKUP' | null = null
  let nameLookupResult: NameLookupResult | null = null

  // §5.4 : name lookup Mobile Money (Wave/Orange/MTN/M-Pesa). Airtel : toujours
  // revue manuelle, indépendamment de la disponibilité d'une API. AUTO_VERIFIED
  // n'est atteignable que sur un MATCH renvoyé par un vrai lookup opérateur.
  if (data.type === 'MOBILE_MONEY' && data.mobileOperator && data.mobileOperator !== 'AIRTEL_MONEY' && data.mobilePhone) {
    nameLookupResult = await lookupMobileMoneyName(data.mobileOperator, data.mobilePhone)
    verificationMethod = 'NAME_LOOKUP'
    verificationStatus = nameLookupResult === 'MATCH' ? 'AUTO_VERIFIED' : 'PENDING_REVIEW'
  }

  const method = await db.$transaction(async (tx) => {
    // PM7 : archive la méthode active précédente (transaction atomique avec la création)
    await tx.payoutMethod.updateMany({ where: { trainerId, isActive: true }, data: { isActive: false, archivedAt: new Date(), verificationStatus: 'ARCHIVED' } })
    return tx.payoutMethod.create({
      data: {
        trainerId, type: data.type, accountNature: data.accountNature,
        verifiedLegalNameAtCreation: profile.verifiedLegalName!,
        trainerEmailSnapshot: user.email, trainerPhoneSnapshot: user.phone,
        holderName: data.holderName, businessName: data.businessName,
        iban: data.iban, bic: data.bic, mobileOperator: data.mobileOperator, mobilePhone: data.mobilePhone,
        verificationStatus, verificationMethod, nameLookupResult, nameLookupRawName: data.holderName,
        carenceUntil, isActive: true,
      },
    })
  })

  await auditStandalone({ actorId: userId, actorRole: 'TRAINER', action: 'PAYOUT_METHOD_CREATED', targetType: 'PayoutMethod', targetId: method.id, meta: { type: data.type, verificationStatus } })
  if (verificationStatus === 'PENDING_REVIEW') await notifyAdminSubRole('FINANCES', { type: 'PAYOUT_METHOD_PENDING_REVIEW', title: 'Nouveau RIB à vérifier', body: `Formateur ${trainerId}`, link: `/admin/payout-methods` })
  return method
}

// --- Formateur : ses propres moyens de paiement ---

export async function listOwnPayoutMethods(trainerId: string) {
  return db.payoutMethod.findMany({ where: { trainerId }, orderBy: { createdAt: 'desc' } })
}

// --- Admin Finances : liste / détail / escalades ---

export async function listPayoutMethods(status?: 'PENDING_REVIEW' | 'MANUAL_VERIFIED' | 'AUTO_VERIFIED' | 'VERIFIED', page = 1, pageSize = 20) {
  const where = status ? { verificationStatus: status, isActive: true } : { isActive: true }
  const [items, total] = await Promise.all([
    db.payoutMethod.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.payoutMethod.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function listEscalations(page = 1, pageSize = 20) {
  const where = { verificationStatus: 'BLOCKED' as const }
  const [items, total] = await Promise.all([
    db.payoutMethod.findMany({ where, orderBy: { reviewedAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.payoutMethod.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getPayoutMethodDetail(id: string) {
  const method = await db.payoutMethod.findUnique({ where: { id }, include: { reviewEvents: { orderBy: { createdAt: 'asc' } } } })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  const profile = await db.trainerProfile.findUnique({ where: { id: method.trainerId }, select: { verifiedLegalName: true } })
  return { ...method, verifiedLegalNameLive: profile?.verifiedLegalName ?? null }
}

// --- PM2/PM3 : vérifier (Finances) ---

export async function verifyPayoutMethod(methodId: string, financeId: string, verificationMethod: 'MANUAL_FINANCE' | 'MICRO_DEPOSIT'): Promise<void> {
  const method = await db.payoutMethod.findUnique({ where: { id: methodId } })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  if (method.verificationStatus !== 'PENDING_REVIEW') throw new Error('INVALID_PAYOUT_METHOD_STATUS')

  if (verificationMethod === 'MANUAL_FINANCE') {
    // PM2 : comparaison holderName vs verifiedLegalName (valeur vive), carenceUntil inchangé
    await db.payoutMethod.update({ where: { id: methodId }, data: { verificationStatus: 'MANUAL_VERIFIED', verificationMethod: 'MANUAL_FINANCE', reviewedById: financeId, reviewedAt: new Date() } })
    await db.payoutMethodReviewEvent.create({ data: { payoutMethodId: methodId, fromStatus: 'PENDING_REVIEW', toStatus: 'MANUAL_VERIFIED', actorId: financeId, actorRole: 'FINANCES' } })
  } else {
    // PM3 : IBAN uniquement — 2 micro-virements distincts (1-99 centimes, stockés en clair)
    if (method.type !== 'BANK_IBAN') throw new Error('MICRO_DEPOSIT_REQUIRES_IBAN')
    const amount1 = 1 + Math.floor(Math.random() * 98)
    let amount2 = 1 + Math.floor(Math.random() * 98)
    if (amount2 === amount1) amount2 = amount2 === 99 ? 1 : amount2 + 1
    await db.payoutMethod.update({
      where: { id: methodId },
      data: { verificationMethod: 'MICRO_DEPOSIT', microDepositAmount1: amount1, microDepositAmount2: amount2, microDepositReference: `MD-${crypto.randomUUID().slice(0, 8)}`, reviewedById: financeId, reviewedAt: new Date() },
    })
    await db.payoutMethodReviewEvent.create({ data: { payoutMethodId: methodId, fromStatus: 'PENDING_REVIEW', toStatus: 'PENDING_REVIEW', actorId: financeId, actorRole: 'FINANCES', note: 'Micro-dépôts envoyés' } })
  }
  await auditStandalone({ actorId: financeId, actorRole: 'FINANCES', action: 'PAYOUT_METHOD_VERIFY_INITIATED', targetType: 'PayoutMethod', targetId: methodId, meta: { verificationMethod } })
}

// --- PM4 : confirmer les micro-dépôts (Formateur) ---

export async function confirmMicroDeposit(methodId: string, userId: string, amount1: number, amount2: number): Promise<void> {
  const method = await db.payoutMethod.findUnique({ where: { id: methodId }, include: { trainerProfile: true } })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  if (method.trainerProfile.userId !== userId) throw new Error('FORBIDDEN')
  if (method.verificationStatus !== 'PENDING_REVIEW' || method.microDepositAmount1 == null) throw new Error('INVALID_PAYOUT_METHOD_STATUS')

  const correct = amount1 === method.microDepositAmount1 && amount2 === method.microDepositAmount2
  if (correct) {
    await db.payoutMethod.update({ where: { id: methodId }, data: { verificationStatus: 'MANUAL_VERIFIED', microDepositVerifiedAt: new Date() } })
    await db.payoutMethodReviewEvent.create({ data: { payoutMethodId: methodId, fromStatus: 'PENDING_REVIEW', toStatus: 'MANUAL_VERIFIED', actorId: userId, actorRole: 'TRAINER', note: 'Micro-dépôts confirmés' } })
    return
  }
  await db.user.update({ where: { id: userId }, data: { payoutMethodRejectionCount: { increment: 1 } } })
  await auditStandalone({ actorId: userId, actorRole: 'TRAINER', action: 'MICRO_DEPOSIT_CONFIRM_FAILED', targetType: 'PayoutMethod', targetId: methodId, meta: {} })
  throw new Error('MICRO_DEPOSIT_MISMATCH')
}

// --- PM5 : expiration de la carence (job horaire) ---

export async function expirePayoutMethodCarence(): Promise<number> {
  const due = await db.payoutMethod.findMany({ where: { verificationStatus: { in: ['AUTO_VERIFIED', 'MANUAL_VERIFIED'] }, carenceUntil: { lt: new Date() } } })
  for (const m of due) {
    await db.payoutMethod.update({ where: { id: m.id }, data: { verificationStatus: 'VERIFIED' } })
    await db.payoutMethodReviewEvent.create({ data: { payoutMethodId: m.id, fromStatus: m.verificationStatus, toStatus: 'VERIFIED', actorRole: 'SYSTEM' } })
  }
  return due.length
}

// --- PM6 : rejeter (Finances) — 3 rejets → BLOCKED + escalade ---

export async function rejectPayoutMethod(methodId: string, financeId: string, reason: string): Promise<void> {
  const method = await db.payoutMethod.findUnique({ where: { id: methodId }, include: { trainerProfile: true } })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  if (method.verificationStatus !== 'PENDING_REVIEW') throw new Error('INVALID_PAYOUT_METHOD_STATUS')

  const user = await db.user.findUnique({ where: { id: method.trainerProfile.userId } })
  if (!user) throw new Error('USER_NOT_FOUND')
  const newCount = user.payoutMethodRejectionCount + 1
  const blocked = newCount >= PAYOUT_METHOD_MAX_REJECTIONS

  await db.$transaction(async (tx) => {
    await tx.payoutMethod.update({ where: { id: methodId }, data: { verificationStatus: blocked ? 'BLOCKED' : 'REJECTED', rejectionReason: reason, reviewedById: financeId, reviewedAt: new Date() } })
    await tx.user.update({ where: { id: user.id }, data: { payoutMethodRejectionCount: newCount } })
    await tx.payoutMethodReviewEvent.create({ data: { payoutMethodId: methodId, fromStatus: 'PENDING_REVIEW', toStatus: blocked ? 'BLOCKED' : 'REJECTED', actorId: financeId, actorRole: 'FINANCES', note: reason } })
    await audit(tx, { actorId: financeId, actorRole: 'FINANCES', action: 'PAYOUT_METHOD_REJECTED', targetType: 'PayoutMethod', targetId: methodId, meta: { reason, blocked, rejectionCount: newCount } })
  })

  if (blocked) await notifyAdminSubRole('SUPER_ADMIN', { type: 'PAYOUT_METHOD_ESCALATION', title: 'RIB bloqué — escalade requise', body: `3 rejets atteints pour le formateur ${method.trainerId}`, link: `/admin/payout-methods/escalations` })
}

// --- PM8/PM9/PM10 : résolution d'escalade (Super-admin) ---

export async function resolvePayoutMethodEscalation(methodId: string, superAdminId: string, action: 'FORCE_VERIFY' | 'BLOCK' | 'RESTORE', justification: string): Promise<void> {
  if (!justification) throw new Error('JUSTIFICATION_REQUIRED')
  const method = await db.payoutMethod.findUnique({ where: { id: methodId } })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')

  if (action === 'FORCE_VERIFY') {
    if (method.verificationStatus !== 'BLOCKED') throw new Error('INVALID_PAYOUT_METHOD_STATUS')
    await db.payoutMethod.update({ where: { id: methodId }, data: { verificationStatus: 'MANUAL_VERIFIED', carenceUntil: new Date(Date.now() + PAYOUT_METHOD_CARENCE_HOURS * 3600000) } })
    await db.payoutMethodReviewEvent.create({ data: { payoutMethodId: methodId, fromStatus: 'BLOCKED', toStatus: 'MANUAL_VERIFIED', actorId: superAdminId, actorRole: 'SUPER_ADMIN', note: justification } })
  } else if (action === 'BLOCK') {
    if (method.verificationStatus !== 'BLOCKED') throw new Error('INVALID_PAYOUT_METHOD_STATUS')
    await db.payoutMethodReviewEvent.create({ data: { payoutMethodId: methodId, fromStatus: 'BLOCKED', toStatus: 'BLOCKED', actorId: superAdminId, actorRole: 'SUPER_ADMIN', note: justification } })
  } else {
    if (method.verificationStatus !== 'ARCHIVED') throw new Error('INVALID_PAYOUT_METHOD_STATUS')
    await db.$transaction(async (tx) => {
      await tx.payoutMethod.updateMany({ where: { trainerId: method.trainerId, isActive: true }, data: { isActive: false, archivedAt: new Date(), verificationStatus: 'ARCHIVED' } })
      await tx.payoutMethod.update({ where: { id: methodId }, data: { isActive: true, archivedAt: null, verificationStatus: 'MANUAL_VERIFIED', carenceUntil: new Date(Date.now() + PAYOUT_METHOD_CARENCE_HOURS * 3600000) } })
      await tx.payoutMethodReviewEvent.create({ data: { payoutMethodId: methodId, fromStatus: 'ARCHIVED', toStatus: 'MANUAL_VERIFIED', actorId: superAdminId, actorRole: 'SUPER_ADMIN', note: justification } })
    })
  }
  await auditStandalone({ actorId: superAdminId, actorRole: 'SUPER_ADMIN', action: `PAYOUT_METHOD_ESCALATION_${action}`, targetType: 'PayoutMethod', targetId: methodId, meta: { justification } })
}
