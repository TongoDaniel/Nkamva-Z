// ==========================================================================
// Lot 3 — Moyens de paiement : vérification en couches (décision 22)
// ==========================================================================
// Machine à états PayoutMethod PM1-PM10.
//
// Principe directeur : AUCUNE vérification purement déclarative. Un RIB non
// vérifié vaut 0 point au KYC, jamais un score partiel. En particulier, on ne
// compare JAMAIS en local le nom saisi par le formateur au nom légal pour en
// déduire une auto-vérification : cela ne prouverait rien (il suffirait de
// recopier le nom). Seul un name lookup opérateur réel peut auto-vérifier.
//
// RBAC : Finances et Super-admin uniquement. Modération n'a aucun accès aux
// moyens de paiement (décision 20, symétrique de la décision 7).
// ==========================================================================

import type {
  AccountNature, MobileMoneyOperator, PayoutMethodType,
  PayoutMethodVerificationStatus, VerificationMethod,
} from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, notifyAdminSubRole, deliverSideEffects, absoluteUrl } from './notification'
import { sendEmail } from './email'
import type { PrismaTransaction } from './types'

export const PAYOUT_METHOD_CARENCE_HOURS = 72
export const PAYOUT_METHOD_MAX_REJECTIONS = 3
export const MICRO_DEPOSIT_MIN = 1
export const MICRO_DEPOSIT_MAX = 99

const VERIFIED_STATUSES: PayoutMethodVerificationStatus[] = ['AUTO_VERIFIED', 'MANUAL_VERIFIED', 'VERIFIED']

function carenceDeadline(): Date {
  return new Date(Date.now() + PAYOUT_METHOD_CARENCE_HOURS * 3_600_000)
}

// ==========================================================================
// Couche (a) — name lookup opérateur
// ==========================================================================

export type NameLookupResult = 'MATCH' | 'MISMATCH' | 'UNAVAILABLE'

/**
 * Décision 22a — comparaison automatique du nom du compte au nom légal vérifié,
 * via l'API de l'opérateur mobile money.
 *
 * ⚠️ ÉCART ASSUMÉ : aucune API opérateur n'est disponible aujourd'hui. Cette
 * fonction retourne donc toujours UNAVAILABLE, ce qui bascule le dossier en
 * revue manuelle Finances. C'est le point d'extension pour un vrai provider —
 * ne surtout pas le remplacer par une comparaison locale du nom déclaré, qui
 * serait une vérification purement déclarative.
 */
export async function lookupMobileMoneyName(
  _operator: MobileMoneyOperator,
  _phone: string,
  _verifiedLegalName: string,
): Promise<{ result: NameLookupResult; rawName: string | null }> {
  return { result: 'UNAVAILABLE', rawName: null }
}

async function recordTransition(
  tx: PrismaTransaction,
  params: {
    payoutMethodId: string
    fromStatus: PayoutMethodVerificationStatus
    toStatus: PayoutMethodVerificationStatus
    actorId: string | null
    actorRole: string
    note?: string | null
  },
) {
  await tx.payoutMethodReviewEvent.create({
    data: {
      payoutMethodId: params.payoutMethodId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      actorId: params.actorId,
      actorRole: params.actorRole,
      note: params.note ?? null,
    },
  })
}

// ==========================================================================
// PM1 / PM7 — création (archive l'ancien dans la même transaction)
// ==========================================================================

export interface CreatePayoutMethodInput {
  type: PayoutMethodType
  accountNature: AccountNature
  holderName?: string | null
  businessName?: string | null
  businessDocS3Key?: string | null
  legalRepProofS3Key?: string | null
  iban?: string | null
  bic?: string | null
  mobileOperator?: MobileMoneyOperator | null
  mobilePhone?: string | null
}

export async function createPayoutMethod(
  trainerProfileId: string,
  userId: string,
  input: CreatePayoutMethodInput,
) {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: {
      id: true, verifiedLegalName: true,
      user: { select: { id: true, email: true, phone: true, payoutMethodRejectionCount: true } },
    },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')

  // Décision 21 — sans nom légal relevé sur la pièce d'identité, Finances n'a
  // rien à quoi comparer : la vérification est impossible.
  if (!profile.verifiedLegalName) throw new Error('IDENTITY_NAME_MISSING')
  const verifiedLegalName = profile.verifiedLegalName

  // Décision 23 — le compteur de rejets vit sur le formateur, pas sur le moyen
  // de paiement : l'archivage ne le remet pas à zéro.
  if (profile.user.payoutMethodRejectionCount >= PAYOUT_METHOD_MAX_REJECTIONS) {
    throw new Error('PAYOUT_METHOD_BLOCKED')
  }

  // Un retrait en vol référence le moyen de paiement : on ne l'archive pas
  // sous ses pieds.
  const inFlight = await db.payout.count({
    where: { trainerId: trainerProfileId, status: { in: ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED'] } },
  })
  if (inFlight > 0) throw new Error('PAYOUT_IN_PROGRESS')

  validateMethodInput(input)

  // Couche (a) : tentative de name lookup pour le mobile money.
  let lookup: { result: NameLookupResult; rawName: string | null } = { result: 'UNAVAILABLE', rawName: null }
  if (input.type === 'MOBILE_MONEY' && input.mobileOperator && input.mobilePhone) {
    lookup = await lookupMobileMoneyName(input.mobileOperator, input.mobilePhone, verifiedLegalName)
  }

  // AUTO_VERIFIED n'est atteignable que sur un MATCH renvoyé par une vraie API.
  const autoVerified = lookup.result === 'MATCH'
  const verificationStatus: PayoutMethodVerificationStatus = autoVerified ? 'AUTO_VERIFIED' : 'PENDING_REVIEW'
  const verificationMethod: VerificationMethod | null = autoVerified ? 'NAME_LOOKUP' : null

  const previous = await db.payoutMethod.findFirst({
    where: { trainerId: trainerProfileId, isActive: true },
    select: { id: true, verificationStatus: true, trainerEmailSnapshot: true },
  })

  const created = await db.$transaction(async (tx) => {
    // PM7 — décision 26 : un seul moyen actif, l'ancien est archivé pour l'audit.
    if (previous) {
      await tx.payoutMethod.update({
        where: { id: previous.id },
        data: { isActive: false, archivedAt: new Date(), verificationStatus: 'ARCHIVED' },
      })
      await recordTransition(tx, {
        payoutMethodId: previous.id, fromStatus: previous.verificationStatus, toStatus: 'ARCHIVED',
        actorId: userId, actorRole: 'TRAINER', note: 'Remplacé par un nouveau moyen de paiement',
      })
    }

    const method = await tx.payoutMethod.create({
      data: {
        trainerId: trainerProfileId,
        type: input.type,
        accountNature: input.accountNature,
        // Le nom légal est figé à la création : une modification ultérieure du
        // profil ne doit pas rendre rétroactivement valide une vérification.
        verifiedLegalNameAtCreation: verifiedLegalName,
        trainerEmailSnapshot: profile.user.email,
        trainerPhoneSnapshot: profile.user.phone,
        holderName: input.holderName ?? null,
        businessName: input.businessName ?? null,
        businessDocS3Key: input.businessDocS3Key ?? null,
        legalRepProofS3Key: input.legalRepProofS3Key ?? null,
        iban: input.iban ?? null,
        bic: input.bic ?? null,
        mobileOperator: input.mobileOperator ?? null,
        mobilePhone: input.mobilePhone ?? null,
        verificationStatus,
        verificationMethod,
        nameLookupResult: lookup.result,
        nameLookupRawName: lookup.rawName,
        // Décision 23/24 — carence obligatoire de 72 h, même si la vérification
        // aboutit plus tôt, et elle redémarre à chaque modification.
        carenceUntil: carenceDeadline(),
        isActive: true,
      },
    })

    await recordTransition(tx, {
      payoutMethodId: method.id, fromStatus: 'PENDING_REVIEW', toStatus: verificationStatus,
      actorId: userId, actorRole: 'TRAINER', note: `name lookup: ${lookup.result}`,
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'PAYOUT_METHOD_CREATED', targetType: 'PayoutMethod', targetId: method.id,
      meta: {
        type: input.type, accountNature: input.accountNature, verificationStatus,
        nameLookupResult: lookup.result, replacedId: previous?.id ?? null,
        carenceUntil: method.carenceUntil?.toISOString(),
      },
    })

    return method
  })

  // Décision 24 — l'ancienne adresse est prévenue, avec un lien de signalement :
  // c'est le garde-fou contre un détournement de compte.
  if (previous) {
    await deliverSideEffects('PAYOUT_METHOD_CHANGED', { type: 'PayoutMethod', id: created.id }, async () => {
      await notify(userId, {
        type: 'PAYOUT_METHOD_CHANGED',
        title: 'Votre moyen de paiement a été modifié',
        body: 'Si vous n\'êtes pas à l\'origine de ce changement, signalez-le immédiatement.',
        link: '/formateur/paiements',
      })
      await sendEmail({
        to: previous.trainerEmailSnapshot,
        subject: 'NkamVa — Votre moyen de paiement a été modifié',
        html: `<p>Le moyen de paiement de votre compte formateur vient d'être remplacé.</p>
<p>Un délai de sécurité de ${PAYOUT_METHOD_CARENCE_HOURS} h s'applique avant tout retrait.</p>
<p><strong>Si vous n'êtes pas à l'origine de ce changement</strong>, signalez-le immédiatement :</p>
<p><a href="${absoluteUrl('/support/signaler?motif=payout-method')}">Signaler un changement suspect</a></p>`,
        tags: ['payout-method-changed'],
      })
    })
  }

  // ⚠️ Décision 24 — la notification à l'ancien NUMÉRO n'est pas envoyée :
  // aucun provider SMS n'est configuré (point non arbitré du projet).

  return created
}

// Décision 28 — deux branches exclusives, pas de troisième voie.
function validateMethodInput(input: CreatePayoutMethodInput) {
  if (input.type === 'BANK_IBAN') {
    if (!input.iban) throw new Error('IBAN_REQUIRED')
  } else {
    if (!input.mobileOperator || !input.mobilePhone) throw new Error('MOBILE_ACCOUNT_REQUIRED')
  }

  if (input.accountNature === 'INDIVIDUAL') {
    // Le titulaire doit correspondre au nom légal : aucun compte de tiers,
    // quel que soit le lien de parenté invoqué. La comparaison elle-même est
    // faite par Finances, mais le nom du titulaire est obligatoire.
    if (!input.holderName) throw new Error('HOLDER_NAME_REQUIRED')
  } else {
    // BUSINESS : dénomination sociale + immatriculation + preuve que le
    // formateur en est le représentant légal.
    if (!input.businessName) throw new Error('BUSINESS_NAME_REQUIRED')
    if (!input.businessDocS3Key) throw new Error('BUSINESS_DOC_REQUIRED')
    if (!input.legalRepProofS3Key) throw new Error('LEGAL_REP_PROOF_REQUIRED')
  }
}

// ==========================================================================
// PM2 / PM3 — décision de Finances
// ==========================================================================

export interface VerifyPayoutMethodInput {
  method: 'MANUAL_FINANCE' | 'MICRO_DEPOSIT'
  note?: string | null
  expectedUpdatedAt: string
  actorId: string
  actorRole: string
}

export async function verifyPayoutMethod(payoutMethodId: string, input: VerifyPayoutMethodInput) {
  const method = await db.payoutMethod.findUnique({
    where: { id: payoutMethodId },
    include: { trainerProfile: { select: { id: true, userId: true, verifiedLegalName: true } } },
  })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  if (method.verificationStatus !== 'PENDING_REVIEW') throw new Error('PAYOUT_METHOD_NOT_PENDING')
  // Décision 21 — Finances compare au nom légal VIVANT, pas au snapshot.
  if (!method.trainerProfile.verifiedLegalName) throw new Error('IDENTITY_NAME_MISSING')

  // PM3 — l'IBAN passe par le micro-virement à référence (décision 22c) : la
  // vérification n'aboutit pas encore, le dossier reste PENDING_REVIEW.
  if (input.method === 'MICRO_DEPOSIT') {
    if (method.type !== 'BANK_IBAN') throw new Error('MICRO_DEPOSIT_IBAN_ONLY')
    return issueMicroDeposits(method.id, input)
  }

  // PM2 — revue manuelle Finances aboutie.
  return db.$transaction(async (tx) => {
    const guard = await tx.payoutMethod.updateMany({
      where: { id: payoutMethodId, updatedAt: new Date(input.expectedUpdatedAt), verificationStatus: 'PENDING_REVIEW' },
      data: {
        verificationStatus: 'MANUAL_VERIFIED',
        verificationMethod: 'MANUAL_FINANCE',
        reviewedById: input.actorId,
        reviewedAt: new Date(),
        // La carence n'est PAS raccourcie par une vérification anticipée.
        rejectionReason: null,
      },
    })
    if (guard.count === 0) throw new Error('STALE_PAYOUT_METHOD')

    await recordTransition(tx, {
      payoutMethodId, fromStatus: 'PENDING_REVIEW', toStatus: 'MANUAL_VERIFIED',
      actorId: input.actorId, actorRole: input.actorRole, note: input.note ?? null,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PAYOUT_METHOD_VERIFIED', targetType: 'PayoutMethod', targetId: payoutMethodId,
      meta: { method: 'MANUAL_FINANCE', carenceUntil: method.carenceUntil?.toISOString() },
    })

    return tx.payoutMethod.findUniqueOrThrow({ where: { id: payoutMethodId } })
  })
}

// PM3 — 2 micro-virements distincts de 1 à 99 centimes.
async function issueMicroDeposits(payoutMethodId: string, input: VerifyPayoutMethodInput) {
  const amount1 = MICRO_DEPOSIT_MIN + Math.floor(Math.random() * (MICRO_DEPOSIT_MAX - MICRO_DEPOSIT_MIN + 1))
  let amount2 = amount1
  while (amount2 === amount1) {
    amount2 = MICRO_DEPOSIT_MIN + Math.floor(Math.random() * (MICRO_DEPOSIT_MAX - MICRO_DEPOSIT_MIN + 1))
  }
  const reference = `NKV${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  return db.$transaction(async (tx) => {
    const guard = await tx.payoutMethod.updateMany({
      where: { id: payoutMethodId, updatedAt: new Date(input.expectedUpdatedAt), verificationStatus: 'PENDING_REVIEW' },
      data: {
        verificationMethod: 'MICRO_DEPOSIT',
        // Montants stockés en clair côté NkamVa : aucun virement bancaire réel
        // n'est déclenché (provider bancaire non arbitré, cf. décision 22c).
        microDepositAmount1: amount1,
        microDepositAmount2: amount2,
        microDepositReference: reference,
        reviewedById: input.actorId,
        reviewedAt: new Date(),
      },
    })
    if (guard.count === 0) throw new Error('STALE_PAYOUT_METHOD')

    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PAYOUT_METHOD_MICRO_DEPOSIT_ISSUED', targetType: 'PayoutMethod', targetId: payoutMethodId,
      meta: { reference },
    })

    return tx.payoutMethod.findUniqueOrThrow({ where: { id: payoutMethodId } })
  })
}

// ==========================================================================
// PM4 — le formateur confirme les deux montants
// ==========================================================================

export async function confirmMicroDeposit(
  payoutMethodId: string,
  trainerProfileId: string,
  userId: string,
  amounts: { amount1: number; amount2: number },
) {
  const method = await db.payoutMethod.findUnique({
    where: { id: payoutMethodId },
    select: {
      id: true, trainerId: true, verificationStatus: true, verificationMethod: true,
      microDepositAmount1: true, microDepositAmount2: true,
    },
  })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  if (method.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (method.verificationMethod !== 'MICRO_DEPOSIT') throw new Error('MICRO_DEPOSIT_NOT_ISSUED')
  if (method.verificationStatus !== 'PENDING_REVIEW') throw new Error('PAYOUT_METHOD_NOT_PENDING')

  // L'ordre des deux montants ne doit pas piéger le formateur.
  const expected = [method.microDepositAmount1, method.microDepositAmount2].sort((a, b) => (a ?? 0) - (b ?? 0))
  const provided = [amounts.amount1, amounts.amount2].sort((a, b) => a - b)
  const matches = expected[0] === provided[0] && expected[1] === provided[1]

  if (!matches) {
    // Un échec compte comme un rejet : le compteur du formateur avance.
    const blocked = await registerRejection(payoutMethodId, userId, 'MICRO_DEPOSIT_MISMATCH', null, 'TRAINER')
    throw new Error(blocked ? 'PAYOUT_METHOD_BLOCKED' : 'MICRO_DEPOSIT_MISMATCH')
  }

  return db.$transaction(async (tx) => {
    await tx.payoutMethod.update({
      where: { id: payoutMethodId },
      data: {
        verificationStatus: 'MANUAL_VERIFIED',
        microDepositVerifiedAt: new Date(),
      },
    })
    await recordTransition(tx, {
      payoutMethodId, fromStatus: 'PENDING_REVIEW', toStatus: 'MANUAL_VERIFIED',
      actorId: userId, actorRole: 'TRAINER', note: 'Micro-virements confirmés',
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'PAYOUT_METHOD_MICRO_DEPOSIT_CONFIRMED', targetType: 'PayoutMethod', targetId: payoutMethodId,
    })
    return tx.payoutMethod.findUniqueOrThrow({ where: { id: payoutMethodId } })
  })
}

// ==========================================================================
// PM6 — rejet Finances, puis blocage au 3e
// ==========================================================================

/** Incrémente le compteur du formateur et bascule en BLOCKED au seuil. */
async function registerRejection(
  payoutMethodId: string,
  actorId: string,
  reason: string,
  expectedUpdatedAt: string | null,
  actorRole: string,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const method = await tx.payoutMethod.findUnique({
      where: { id: payoutMethodId },
      include: { trainerProfile: { select: { userId: true } } },
    })
    if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')

    if (expectedUpdatedAt) {
      const guard = await tx.payoutMethod.updateMany({
        where: { id: payoutMethodId, updatedAt: new Date(expectedUpdatedAt), verificationStatus: 'PENDING_REVIEW' },
        data: { rejectionReason: reason, reviewedById: actorId, reviewedAt: new Date() },
      })
      if (guard.count === 0) throw new Error('STALE_PAYOUT_METHOD')
    } else {
      await tx.payoutMethod.update({
        where: { id: payoutMethodId },
        data: { rejectionReason: reason, reviewedAt: new Date() },
      })
    }

    const user = await tx.user.update({
      where: { id: method.trainerProfile.userId },
      data: { payoutMethodRejectionCount: { increment: 1 } },
      select: { id: true, payoutMethodRejectionCount: true },
    })

    const blocked = user.payoutMethodRejectionCount >= PAYOUT_METHOD_MAX_REJECTIONS
    const toStatus: PayoutMethodVerificationStatus = blocked ? 'BLOCKED' : 'REJECTED'

    await tx.payoutMethod.update({ where: { id: payoutMethodId }, data: { verificationStatus: toStatus } })
    await recordTransition(tx, {
      payoutMethodId, fromStatus: method.verificationStatus, toStatus,
      actorId, actorRole, note: reason,
    })
    await audit(tx, {
      actorId, actorRole,
      action: blocked ? 'PAYOUT_METHOD_BLOCKED' : 'PAYOUT_METHOD_REJECTED',
      targetType: 'PayoutMethod', targetId: payoutMethodId,
      meta: { reason, rejectionCount: user.payoutMethodRejectionCount },
    })

    return blocked
  })
}

export async function rejectPayoutMethod(
  payoutMethodId: string,
  input: { reason: string; expectedUpdatedAt: string; actorId: string; actorRole: string },
) {
  const method = await db.payoutMethod.findUnique({
    where: { id: payoutMethodId },
    select: { id: true, verificationStatus: true, trainerProfile: { select: { userId: true } } },
  })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  if (method.verificationStatus !== 'PENDING_REVIEW') throw new Error('PAYOUT_METHOD_NOT_PENDING')

  const blocked = await registerRejection(
    payoutMethodId, input.actorId, input.reason, input.expectedUpdatedAt, input.actorRole,
  )

  await deliverSideEffects('PAYOUT_METHOD_REJECTED', { type: 'PayoutMethod', id: payoutMethodId }, async () => {
    await notify(method.trainerProfile.userId, {
      type: blocked ? 'PAYOUT_METHOD_BLOCKED' : 'PAYOUT_METHOD_REJECTED',
      // Décision 30 — jamais un rejet opaque : on dit ce qui ne va pas et on
      // rappelle les deux options légitimes, sans révéler le nom légal complet.
      title: blocked ? 'Vos coordonnées bancaires sont bloquées' : 'Vos coordonnées bancaires ont été refusées',
      body: blocked
        ? 'Après trois tentatives, la vérification est suspendue. Notre support prend le relais pour débloquer votre dossier.'
        : `${input.reason} — le compte doit être à votre nom (compte personnel) ou au nom de votre société dont vous êtes le représentant légal. Le support peut vous accompagner.`,
      link: '/formateur/paiements',
    })
    // Décision 27 — Finances ne tranche pas seule un écart de nom : au blocage,
    // le Super-admin est saisi.
    if (blocked) {
      await notifyAdminSubRole('SUPER_ADMIN', {
        type: 'PAYOUT_METHOD_ESCALATION',
        title: 'Moyen de paiement bloqué après 3 rejets',
        body: 'Une escalade est ouverte : seul le Super-admin peut trancher.',
        link: '/admin/payout-methods/escalations',
      })
    }
  })

  return db.payoutMethod.findUniqueOrThrow({ where: { id: payoutMethodId } })
}

// ==========================================================================
// PM5 — expiration de la carence (job horaire)
// ==========================================================================

export async function expirePayoutMethodCarence(): Promise<{ verified: number }> {
  const ready = await db.payoutMethod.findMany({
    where: {
      isActive: true,
      verificationStatus: { in: ['AUTO_VERIFIED', 'MANUAL_VERIFIED'] },
      carenceUntil: { lt: new Date() },
    },
    select: { id: true, verificationStatus: true, trainerProfile: { select: { userId: true } } },
  })

  for (const method of ready) {
    await db.$transaction(async (tx) => {
      await tx.payoutMethod.update({ where: { id: method.id }, data: { verificationStatus: 'VERIFIED' } })
      await recordTransition(tx, {
        payoutMethodId: method.id, fromStatus: method.verificationStatus, toStatus: 'VERIFIED',
        actorId: null, actorRole: 'SYSTEM', note: 'Carence 72 h écoulée',
      })
      await audit(tx, {
        action: 'PAYOUT_METHOD_CARENCE_EXPIRED', targetType: 'PayoutMethod', targetId: method.id,
      })
    })
    await deliverSideEffects('PAYOUT_METHOD_VERIFIED', { type: 'PayoutMethod', id: method.id }, () =>
      notify(method.trainerProfile.userId, {
        type: 'PAYOUT_METHOD_VERIFIED',
        title: 'Vos coordonnées bancaires sont vérifiées',
        body: 'Le délai de sécurité est écoulé : vous pouvez demander un retrait.',
        link: '/formateur/paiements',
      }),
    )
  }

  return { verified: ready.length }
}

// ==========================================================================
// PM8 / PM9 / PM10 — escalades Super-admin (décision 27)
// ==========================================================================

export type EscalationAction = 'FORCE_VERIFY' | 'BLOCK' | 'RESTORE'

export async function resolvePayoutMethodEscalation(
  payoutMethodId: string,
  input: { action: EscalationAction; justification: string; actorId: string },
) {
  if (!input.justification || input.justification.trim().length < 10) throw new Error('JUSTIFICATION_REQUIRED')

  const method = await db.payoutMethod.findUnique({
    where: { id: payoutMethodId },
    include: { trainerProfile: { select: { id: true, userId: true } } },
  })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')

  if (input.action === 'RESTORE') {
    if (method.verificationStatus !== 'ARCHIVED') throw new Error('PAYOUT_METHOD_NOT_ARCHIVED')
  } else if (method.verificationStatus !== 'BLOCKED') {
    throw new Error('PAYOUT_METHOD_NOT_BLOCKED')
  }

  const toStatus: PayoutMethodVerificationStatus =
    input.action === 'BLOCK' ? 'BLOCKED' : 'MANUAL_VERIFIED'

  await db.$transaction(async (tx) => {
    // PM10 — restaurer un moyen archivé implique d'archiver l'actif courant.
    if (input.action === 'RESTORE') {
      const current = await tx.payoutMethod.findFirst({
        where: { trainerId: method.trainerId, isActive: true },
        select: { id: true, verificationStatus: true },
      })
      if (current && current.id !== payoutMethodId) {
        await tx.payoutMethod.update({
          where: { id: current.id },
          data: { isActive: false, archivedAt: new Date(), verificationStatus: 'ARCHIVED' },
        })
        await recordTransition(tx, {
          payoutMethodId: current.id, fromStatus: current.verificationStatus, toStatus: 'ARCHIVED',
          actorId: input.actorId, actorRole: 'SUPER_ADMIN', note: 'Remplacé par une restauration',
        })
      }
    }

    await tx.payoutMethod.update({
      where: { id: payoutMethodId },
      data: {
        verificationStatus: toStatus,
        // Décision 27 — la décision vient d'une escalade, pas d'une revue standard.
        verificationMethod: 'ESCALATION',
        reviewedById: input.actorId,
        reviewedAt: new Date(),
        ...(input.action === 'BLOCK'
          ? { rejectionReason: input.justification }
          // PM8/PM10 — toute remise en service relance la carence de 72 h.
          : { isActive: true, archivedAt: null, carenceUntil: carenceDeadline(), rejectionReason: null }),
      },
    })

    // Débloquer, c'est aussi rendre au formateur sa capacité à soumettre.
    if (input.action !== 'BLOCK') {
      await tx.user.update({
        where: { id: method.trainerProfile.userId },
        data: { payoutMethodRejectionCount: 0 },
      })
    }

    await recordTransition(tx, {
      payoutMethodId, fromStatus: method.verificationStatus, toStatus,
      actorId: input.actorId, actorRole: 'SUPER_ADMIN', note: input.justification,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: 'SUPER_ADMIN',
      action: 'PAYOUT_METHOD_ESCALATION_RESOLVED', targetType: 'PayoutMethod', targetId: payoutMethodId,
      meta: { action: input.action, justification: input.justification, toStatus },
    })
  })

  await deliverSideEffects('PAYOUT_METHOD_ESCALATION', { type: 'PayoutMethod', id: payoutMethodId }, () =>
    notify(method.trainerProfile.userId, {
      type: 'PAYOUT_METHOD_ESCALATION_RESOLVED',
      title: input.action === 'BLOCK'
        ? 'Vos coordonnées bancaires restent bloquées'
        : 'Vos coordonnées bancaires ont été débloquées',
      body: input.action === 'BLOCK'
        ? 'Contactez le support pour connaître les suites.'
        : `Un délai de sécurité de ${PAYOUT_METHOD_CARENCE_HOURS} h s'applique avant votre prochain retrait.`,
      link: '/formateur/paiements',
    }),
  )

  return db.payoutMethod.findUniqueOrThrow({ where: { id: payoutMethodId } })
}

// ==========================================================================
// Lectures
// ==========================================================================

// Le formateur ne doit jamais recevoir les montants attendus des micro-virements :
// c'est précisément le secret qu'il doit retrouver sur son relevé.
const TRAINER_METHOD_SELECT = {
  id: true, type: true, accountNature: true, holderName: true, businessName: true,
  iban: true, bic: true, mobileOperator: true, mobilePhone: true,
  verificationStatus: true, verificationMethod: true, nameLookupResult: true,
  microDepositReference: true, microDepositVerifiedAt: true,
  carenceUntil: true, isActive: true, rejectionReason: true,
  createdAt: true, updatedAt: true,
}

export async function listMyPayoutMethods(trainerProfileId: string) {
  return db.payoutMethod.findMany({
    where: { trainerId: trainerProfileId },
    select: TRAINER_METHOD_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}

export async function listPayoutMethods(filters: {
  status?: PayoutMethodVerificationStatus
  page?: number
  pageSize?: number
}) {
  const page = filters.page ?? 1
  const pageSize = Math.min(filters.pageSize ?? 20, 50)
  const where = filters.status ? { verificationStatus: filters.status } : {}

  const [items, total] = await Promise.all([
    db.payoutMethod.findMany({
      where,
      include: {
        trainerProfile: {
          select: { id: true, verifiedLegalName: true, user: { select: { id: true, email: true, fullName: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payoutMethod.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getPayoutMethodDetail(payoutMethodId: string) {
  const method = await db.payoutMethod.findUnique({
    where: { id: payoutMethodId },
    include: {
      // Finances compare au nom légal vivant, sans jamais voir l'image de la PI.
      trainerProfile: {
        select: { id: true, verifiedLegalName: true, user: { select: { id: true, email: true, fullName: true } } },
      },
      reviewEvents: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  return method
}

export async function listEscalations(page = 1, pageSize = 20) {
  const where = { verificationStatus: 'BLOCKED' as PayoutMethodVerificationStatus }
  const [items, total] = await Promise.all([
    db.payoutMethod.findMany({
      where,
      include: {
        trainerProfile: {
          select: { id: true, verifiedLegalName: true, user: { select: { id: true, email: true, payoutMethodRejectionCount: true } } },
        },
        reviewEvents: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { updatedAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payoutMethod.count({ where }),
  ])
  return { items, total, page, pageSize }
}

/** Le moyen actif utilisable pour un retrait : VERIFIED et hors carence. */
export async function getWithdrawableMethod(trainerProfileId: string) {
  const method = await db.payoutMethod.findFirst({
    where: { trainerId: trainerProfileId, isActive: true },
    select: { id: true, verificationStatus: true, carenceUntil: true },
  })
  if (!method) return { method: null, reason: 'PAYOUT_METHOD_MISSING' as const }
  if (!VERIFIED_STATUSES.includes(method.verificationStatus)) {
    return { method: null, reason: 'PAYOUT_METHOD_NOT_VERIFIED' as const }
  }
  if (method.verificationStatus !== 'VERIFIED') return { method: null, reason: 'PAYOUT_METHOD_CARENCE' as const }
  if (method.carenceUntil && method.carenceUntil > new Date()) {
    return { method: null, reason: 'PAYOUT_METHOD_CARENCE' as const }
  }
  return { method, reason: null }
}

// ==========================================================================
// Alerte SLA de revue manuelle (job horaire, décision 23)
// ==========================================================================

export const PAYOUT_REVIEW_SLA_HOURS = 48

export async function alertPayoutMethodSlaBreaches(): Promise<{ breached: number }> {
  // ⚠️ Écart mineur assumé : l'arbitrage parle de 48 h « ouvrées », le code
  // applique 48 h calendaires (pas de calendrier ouvré modélisé).
  const threshold = new Date(Date.now() - PAYOUT_REVIEW_SLA_HOURS * 3_600_000)

  const breached = await db.payoutMethod.findMany({
    where: { verificationStatus: 'PENDING_REVIEW', createdAt: { lt: threshold } },
    select: { id: true, createdAt: true, trainerId: true },
  })

  for (const method of breached) {
    await auditStandalone({
      action: 'PAYOUT_METHOD_SLA_BREACH', targetType: 'PayoutMethod', targetId: method.id,
      meta: {
        trainerId: method.trainerId,
        waitingHours: Math.floor((Date.now() - method.createdAt.getTime()) / 3_600_000),
        slaHours: PAYOUT_REVIEW_SLA_HOURS,
      },
    })
  }

  if (breached.length > 0) {
    await notifyAdminSubRole('FINANCES', {
      type: 'PAYOUT_METHOD_SLA_BREACH',
      title: `${breached.length} moyen(s) de paiement en attente depuis plus de 48 h`,
      body: 'Le SLA de revue manuelle est dépassé.',
      link: '/admin/payout-methods?status=PENDING_REVIEW',
    })
  }

  return { breached: breached.length }
}
