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
import { presignUpload, presignDownload, headObject, isS3Configured } from './s3'
import { compareNames, normalizedLabel, type NameComparison } from './name-match'
import { lookupAccountName, providerForOperator } from './pawapay'
import { audit, auditStandalone } from './audit'
import { notify, notifyAdminSubRole, deliverSideEffects, absoluteUrl } from './notification'
import { sendEmail, renderSimpleEmail } from './email'
import { getSettingNumber } from './settings'
import type { PrismaTransaction } from './types'

export const PAYOUT_METHOD_CARENCE_HOURS = 72
export const PAYOUT_METHOD_MAX_REJECTIONS = 3
export const MICRO_DEPOSIT_MIN = 1
export const MICRO_DEPOSIT_MAX = 99

// --- Documents d'entreprise (décision 28) -------------------------------
// Un RCCM est un document administratif scanné : la limite est plus haute que
// celle d'une pièce jointe de litige, mais la liste MIME reste la même — pas
// de format exécutable, pas d'archive.
export const BUSINESS_DOC_MAX_SIZE_BYTES = 10_485_760
export const BUSINESS_DOC_ALLOWED_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const BUSINESS_DOC_TTL_HOURS = 24
/** Scope `PendingAttachment` — distinct de `DISPUTE`, jamais interchangeable. */
const BUSINESS_DOC_SCOPE = 'PAYOUT_METHOD'

const BUSINESS_DOC_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export type BusinessDocumentKind = 'BUSINESS_DOC' | 'LEGAL_REP_PROOF'

const VERIFIED_STATUSES: PayoutMethodVerificationStatus[] = ['AUTO_VERIFIED', 'MANUAL_VERIFIED', 'VERIFIED']

function carenceDeadline(): Date {
  return new Date(Date.now() + PAYOUT_METHOD_CARENCE_HOURS * 3_600_000)
}

// ==========================================================================
// Couche (a) — name lookup opérateur
// ==========================================================================

export type NameLookupResult = 'MATCH' | 'MISMATCH' | 'UNAVAILABLE'

/**
 * Interroge l'opérateur pour connaître le nom réellement enregistré sur le
 * compte. **Seul point d'entrée d'une information externe** dans la couche (a).
 *
 * ⚠️ ÉCART TOUJOURS OUVERT, et la migration vers PawaPay ne l'a pas refermé.
 *
 * `/v2/active-conf` annonce bien un type d'opération `NAME_LOOKUP`, mais aucun
 * endpoint public de vérification du nom n'est documenté dans l'API v2 au
 * 6 août 2026. On ne devine pas d'URL : c'est précisément ce qu'avait fait
 * l'ancien remboursement CinetPay, dont l'adresse inventée échouait à chaque
 * appel en envoyant le dossier en traitement manuel sans que personne le sache.
 *
 * Conséquence inchangée : aucun RIB mobile money ne s'auto-vérifie, tout part
 * en revue Finances. `lookupAccountName` journalise l'écart si la configuration
 * du compte annonce la capacité — c'est le signal qu'il devient branchable.
 */
async function fetchOperatorAccountName(
  operator: MobileMoneyOperator,
  phone: string,
  countryCode = 'CM',
): Promise<string | null> {
  const provider = await providerForOperator(operator, countryCode, 'PAYOUT').catch(() => null)
  if (!provider) return null
  return lookupAccountName(phone, provider.provider).catch(() => null)
}

/**
 * Décision 22a — comparaison automatique du nom du compte au nom attendu, après
 * normalisation (casse, accents, ordre des mots).
 *
 * `expectedName` dépend de la nature du compte (décision 28) : le nom légal du
 * formateur pour un compte personnel, la **dénomination sociale** pour un
 * compte d'entreprise. Comparer une dénomination sociale au nom d'une personne
 * produirait un MISMATCH systématique le jour où l'API existera.
 *
 * L'un des deux noms vient toujours de l'opérateur : c'est ce qui distingue
 * cette comparaison d'une vérification déclarative. Sans réponse de
 * l'opérateur, le résultat est UNAVAILABLE et le dossier part en revue
 * manuelle — jamais MATCH.
 */
export async function lookupMobileMoneyName(
  operator: MobileMoneyOperator,
  phone: string,
  expectedName: string,
): Promise<{ result: NameLookupResult; rawName: string | null }> {
  const rawName = await fetchOperatorAccountName(operator, phone)
  if (!rawName) return { result: 'UNAVAILABLE', rawName: null }

  return { result: compareNames(rawName, expectedName), rawName }
}

/**
 * Décision 28 — ce à quoi le nom du compte doit correspondre. Pour une
 * entreprise, c'est la dénomination sociale ; la présence du `verifiedLegalName`
 * comme représentant légal se vérifie sur les documents, pas sur le compte.
 */
export function expectedAccountName(
  accountNature: AccountNature,
  names: { verifiedLegalName: string; businessName?: string | null },
): string {
  return accountNature === 'BUSINESS' && names.businessName
    ? names.businessName
    : names.verifiedLegalName
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

// ==========================================================================
// PM0 — présignature des documents d'entreprise (décision 28)
// ==========================================================================
// Même patron que les pièces jointes de litige : l'URL est délivrée, la clé
// est enregistrée en `PendingAttachment`, et elle n'est rattachée qu'à la
// création du moyen de paiement. Une clé jamais consommée est purgée par le
// job `cleanupExpiredPendingAttachments`, qui ignore le scope.
//
// Pourquoi ne pas écrire directement sur le `PayoutMethod` : il n'existe pas
// encore au moment de l'upload, et une clé S3 fournie par le client ne prouve
// rien — sans registre, n'importe quel formateur pourrait déclarer la clé d'un
// autre.

export interface PresignBusinessDocumentInput {
  kind: BusinessDocumentKind
  mimeType: string
  sizeBytes: number
  sha256: string
}

export async function presignPayoutMethodDocument(userId: string, input: PresignBusinessDocumentInput) {
  if (!BUSINESS_DOC_ALLOWED_MIMES.includes(input.mimeType)) throw new Error('MIME_NOT_ALLOWED')
  if (input.sizeBytes <= 0 || input.sizeBytes > BUSINESS_DOC_MAX_SIZE_BYTES) throw new Error('SIZE_EXCEEDS_LIMIT')

  const ext = BUSINESS_DOC_EXTENSIONS[input.mimeType] ?? 'bin'
  const s3Key = `payout-method-documents/${userId}/${input.kind}-${crypto.randomUUID()}.${ext}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, input.mimeType, input.sizeBytes)

  await db.pendingAttachment.create({
    data: {
      s3Key,
      issuerId: userId,
      // `kind` vit dans le scope : deux documents de nature différente ne
      // doivent pas pouvoir être intervertis à la consommation.
      scope: `${BUSINESS_DOC_SCOPE}:${input.kind}`,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      expiresAt: new Date(Date.now() + BUSINESS_DOC_TTL_HOURS * 3_600_000),
    },
  })

  return { uploadUrl, s3Key, expiresAt }
}

/**
 * Rattache les deux documents au moyen de paiement créé. Appelée **dans** la
 * transaction de création : si celle-ci échoue, les clés restent disponibles
 * plutôt que d'être brûlées sans porteur.
 *
 * Vérifie que chaque clé appartient bien à l'émetteur, qu'elle correspond au
 * bon type de document, qu'elle n'a jamais été consommée et qu'elle n'est pas
 * expirée.
 */
async function consumeBusinessDocuments(
  tx: PrismaTransaction,
  issuerId: string,
  payoutMethodId: string,
  keys: { businessDocS3Key: string; legalRepProofS3Key: string },
) {
  const expected: Array<{ s3Key: string; kind: BusinessDocumentKind }> = [
    { s3Key: keys.businessDocS3Key, kind: 'BUSINESS_DOC' },
    { s3Key: keys.legalRepProofS3Key, kind: 'LEGAL_REP_PROOF' },
  ]

  const pending = await tx.pendingAttachment.findMany({
    where: {
      s3Key: { in: expected.map(e => e.s3Key) },
      issuerId,
      status: 'PENDING',
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, s3Key: true, scope: true },
  })

  // Chaque clé doit exister, et sous le bon scope : fournir deux fois le RCCM
  // ne doit pas passer pour un dossier complet.
  const usable = expected.filter(e =>
    pending.some(p => p.s3Key === e.s3Key && p.scope === `${BUSINESS_DOC_SCOPE}:${e.kind}`),
  )
  if (usable.length !== expected.length) throw new Error('ATTACHMENT_INVALID')

  await tx.pendingAttachment.updateMany({
    where: { id: { in: pending.map(p => p.id) } },
    data: { status: 'CONSUMED', consumedAt: new Date(), consumedIn: payoutMethodId },
  })
}

// ==========================================================================
// PM1 — création d'un moyen de paiement
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

  // Couche (a) : tentative de name lookup pour le mobile money, contre le nom
  // attendu pour cette nature de compte (décision 28).
  let lookup: { result: NameLookupResult; rawName: string | null } = { result: 'UNAVAILABLE', rawName: null }
  if (input.type === 'MOBILE_MONEY' && input.mobileOperator && input.mobilePhone) {
    lookup = await lookupMobileMoneyName(
      input.mobileOperator,
      input.mobilePhone,
      expectedAccountName(input.accountNature, { verifiedLegalName, businessName: input.businessName }),
    )
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

    // Décision 28 — les deux documents ne sont rattachés qu'ici, une fois le
    // moyen créé, et dans la même transaction : un échec en aval les laisse
    // réutilisables.
    if (input.accountNature === 'BUSINESS') {
      await consumeBusinessDocuments(tx, userId, method.id, {
        businessDocS3Key: input.businessDocS3Key!,
        legalRepProofS3Key: input.legalRepProofS3Key!,
      })
    }

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

  // Décision 24 — l'ancienne adresse est prévenue, avec un lien de signalement.
  //
  // Le canal SMS que cet arbitrage prévoyait a été retiré : il n'existait que
  // parce qu'une boîte mail compromise recevait l'alerte à la place de sa
  // victime. Ce scénario est désormais fermé en amont — changer un moyen de
  // paiement exige un second facteur (voir `assertSecondFactorForPayout`), donc
  // celui qui n'a que la boîte mail n'arrive jamais jusqu'ici.
  if (previous) {
    await deliverSideEffects('PAYOUT_METHOD_CHANGED', { type: 'PayoutMethod', id: created.id }, async () => {
      await notify(userId, {
        type: 'PAYOUT_METHOD_CHANGED',
        title: 'Votre moyen de paiement a été modifié',
        body: 'Si vous n\'êtes pas à l\'origine de ce changement, signalez-le immédiatement.',
        link: '/formateur/portefeuille/moyen-de-paiement',
      })
      await sendEmail({
        to: previous.trainerEmailSnapshot,
        subject: 'NkamVa — Votre moyen de paiement a été modifié',
        // Le lien mène au formulaire de contact : c'est le seul canal de
        // signalement qui existe. Les deux URL précédentes — `/formateur/paiements`
        // et `/support/signaler` — n'ont jamais correspondu à une page, dans un
        // e-mail dont tout l'intérêt est justement de pouvoir réagir vite.
        ...renderSimpleEmail({
          title: 'Votre moyen de paiement a été modifié',
          paragraphs: [
            'Le moyen de paiement de votre compte formateur vient d\'être remplacé.',
            `Un délai de sécurité de ${PAYOUT_METHOD_CARENCE_HOURS} h s'applique avant tout retrait.`,
            'Si vous n\'êtes pas à l\'origine de ce changement, signalez-le immédiatement.',
          ],
          cta: { label: 'Signaler un changement suspect', url: absoluteUrl('/contact') },
        }),
        tags: ['payout-method-changed'],
      })


    })
  }

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
    // Un second tirage remplacerait des montants que Finances a déjà virés :
    // le formateur saisirait les bons et serait compté en échec, à trois
    // reprises jusqu'au blocage. Le garde sur `updatedAt` ne suffit pas — après
    // le premier tirage l'écran se rafraîchit et repart avec une valeur à jour.
    if (method.verificationMethod === 'MICRO_DEPOSIT' && method.microDepositAmount1 !== null) {
      throw new Error('MICRO_DEPOSIT_ALREADY_ISSUED')
    }
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
        select: {
          id: true, verifiedLegalName: true,
          user: {
            select: {
              id: true, email: true, fullName: true,
              // Le compteur vit sur le formateur (décision 23) : l'instructeur
              // doit savoir qu'il s'apprête à poser le refus qui bloque.
              payoutMethodRejectionCount: true,
            },
          },
        },
      },
      reviewEvents: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')
  return { ...method, nameComparison: buildNameComparison(method) }
}

export interface NameComparisonReport {
  /** Ce à quoi le nom du compte doit correspondre (décision 28). */
  expectedName: string | null
  expectedNormalized: string | null
  /** Nom renvoyé par l'opérateur, seule source externe (décision 22a). */
  operatorName: string | null
  operatorNormalized: string | null
  /** Comparaison automatique, `null` tant qu'aucune source externe n'a répondu. */
  operatorMatch: NameComparison | null
  /**
   * La dénomination sociale se réduit au nom légal du formateur : entreprise
   * individuelle. Légitime, mais Finances doit le voir — le compte « de la
   * société » est en pratique celui de la personne.
   */
  businessIsSoleTrader: boolean
}

/**
 * Aide à la décision pour Finances, **jamais une vérification**. Le calcul est
 * dérivé à la lecture plutôt que stocké : le nom légal vérifié peut changer, et
 * un instantané figé donnerait une comparaison périmée sans que rien ne le
 * signale. Aucun de ces champs ne modifie `verificationStatus` — seul un MATCH
 * renvoyé par une vraie API le peut (décision 22).
 */
function buildNameComparison(method: {
  accountNature: AccountNature
  businessName: string | null
  nameLookupRawName: string | null
  trainerProfile: { verifiedLegalName: string | null }
}): NameComparisonReport {
  const verifiedLegalName = method.trainerProfile.verifiedLegalName
  const expectedName =
    method.accountNature === 'BUSINESS'
      ? method.businessName
      : verifiedLegalName

  return {
    expectedName,
    expectedNormalized: expectedName ? normalizedLabel(expectedName) : null,
    operatorName: method.nameLookupRawName,
    operatorNormalized: method.nameLookupRawName ? normalizedLabel(method.nameLookupRawName) : null,
    operatorMatch: method.nameLookupRawName
      ? compareNames(method.nameLookupRawName, expectedName)
      : null,
    businessIsSoleTrader:
      method.accountNature === 'BUSINESS' &&
      compareNames(method.businessName, verifiedLegalName) === 'MATCH',
  }
}

/**
 * Consultation d'un document d'entreprise par Finances / Super-admin —
 * URL signée et **journalisée**, sur le modèle de `getDocumentViewUrl` du
 * Lot 1. Sans cette route, les deux documents exigés par la décision 28
 * seraient téléversés puis invisibles : la branche BUSINESS resterait
 * invérifiable.
 *
 * Décision 21 — ce n'est pas une entorse au cloisonnement : ces documents-ci
 * sont commerciaux (RCCM, preuve de représentation), pas des pièces
 * d'identité. Finances n'accède toujours à aucune image de PI.
 */
export async function getBusinessDocumentUrl(
  payoutMethodId: string,
  kind: BusinessDocumentKind,
  actor: { id: string; adminRole: string },
) {
  const method = await db.payoutMethod.findUnique({
    where: { id: payoutMethodId },
    select: { id: true, trainerId: true, accountNature: true, businessDocS3Key: true, legalRepProofS3Key: true },
  })
  if (!method) throw new Error('PAYOUT_METHOD_NOT_FOUND')

  const s3Key = kind === 'BUSINESS_DOC' ? method.businessDocS3Key : method.legalRepProofS3Key
  if (!s3Key) throw new Error('DOCUMENT_NOT_FOUND')

  // Une clé peut être rattachée sans que l'objet ait réellement atterri : la
  // présignature délivre l'URL, le dépôt se fait ensuite en direct et peut
  // échouer. Mieux vaut le dire à Finances que lui signer une URL vide.
  if (isS3Configured() && !(await headObject(s3Key))) throw new Error('UPLOAD_NOT_FOUND')

  const url = await presignDownload(s3Key)

  await auditStandalone({
    actorId: actor.id, actorRole: actor.adminRole,
    action: 'PAYOUT_METHOD_DOCUMENT_VIEW', targetType: 'PayoutMethod', targetId: payoutMethodId,
    meta: { kind, trainerId: method.trainerId },
  })

  return { url }
}

/**
 * Compteurs de la file d'instruction. `slaBreaches` compte les dossiers en
 * attente depuis plus que le SLA de la décision 23, que le job
 * `alertPayoutMethodSlaBreaches` surveille déjà côté alerte.
 *
 * `slaHours` accompagne le compteur : l'écran affiche « hors délai (> N h) »
 * et doit dire le N qui a servi à compter, pas relire le réglage de son côté.
 */
export async function getPayoutMethodStats() {
  const slaHours = await getPayoutReviewSlaHours()
  const [byStatus, slaBreaches] = await Promise.all([
    db.payoutMethod.groupBy({ by: ['verificationStatus'], _count: { _all: true } }),
    db.payoutMethod.count({
      where: {
        verificationStatus: 'PENDING_REVIEW',
        createdAt: { lt: new Date(Date.now() - slaHours * 3_600_000) },
      },
    }),
  ])

  const counts = Object.fromEntries(byStatus.map(r => [r.verificationStatus, r._count._all]))
  return {
    byStatus: counts,
    pendingReview: counts.PENDING_REVIEW ?? 0,
    blocked: counts.BLOCKED ?? 0,
    verified: (counts.VERIFIED ?? 0) + (counts.AUTO_VERIFIED ?? 0) + (counts.MANUAL_VERIFIED ?? 0),
    slaBreaches,
    slaHours,
  }
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
    // `type`, `mobileOperator` et `mobilePhone` s'ajoutent au strict nécessaire
    // d'avant : `dispatchPayout` en a besoin pour savoir si le versement part
    // chez PawaPay ou reste un virement manuel Finances.
    select: {
      id: true, verificationStatus: true, carenceUntil: true,
      type: true, mobileOperator: true, mobilePhone: true,
    },
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

/**
 * Lecture unique du SLA de revue manuelle. C'était une constante ; c'est
 * maintenant le réglage `payouts.review_sla_hours`, dont la valeur par défaut
 * reste 48 h (décision 23). Le passage en base a une raison : ce délai est le
 * seul des trois arbitrages de la décision 23 que Finances doit pouvoir
 * resserrer sans livraison, parce qu'il ne fait que déplacer le seuil d'une
 * alerte et d'un compteur — il n'engage personne, contrairement à la carence
 * ou au retrait minimum, qui restent dans le code.
 *
 * Un seul point de lecture pour tout le monde : `/admin/retraits`,
 * `/admin/moyens-de-paiement`, le portefeuille formateur et les deux jobs.
 * Le jour où le délai change, aucun écran n'affiche l'ancien.
 * `payouts.ts` la ré-exporte pour ses consommateurs (il importe déjà ce
 * module, l'inverse serait circulaire).
 */
export function getPayoutReviewSlaHours(): Promise<number> {
  return getSettingNumber('payouts.review_sla_hours')
}

export async function alertPayoutMethodSlaBreaches(): Promise<{ breached: number }> {
  // ⚠️ Écart mineur assumé : l'arbitrage parle d'heures « ouvrées », le code
  // applique des heures calendaires (pas de calendrier ouvré modélisé).
  const slaHours = await getPayoutReviewSlaHours()
  const threshold = new Date(Date.now() - slaHours * 3_600_000)

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
        slaHours,
      },
    })
  }

  if (breached.length > 0) {
    await notifyAdminSubRole('FINANCES', {
      type: 'PAYOUT_METHOD_SLA_BREACH',
      title: `${breached.length} moyen(s) de paiement en attente depuis plus de ${slaHours} h`,
      body: 'Le SLA de revue manuelle est dépassé.',
      link: '/admin/payout-methods?status=PENDING_REVIEW',
    })
  }

  return { breached: breached.length }
}
