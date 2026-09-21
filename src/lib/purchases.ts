// ==========================================================================
// Lot 4 — Achat : ouverture du paiement (Stripe / PawaPay), réconciliation
// ==========================================================================
// **Ce module n'a plus de mode « simulé implicite ».**
//
// Il en avait un, et c'était le défaut le plus grave de la plateforme :
// `initiatePurchase` créditait l'achat sans aucun paiement dès que
// `STRIPE_SECRET_KEY` ou `CINETPAY_API_KEY` manquait. La condition portait sur
// la présence d'une clé, jamais sur l'environnement — un déploiement qui
// recopiait `.env.example` (où ces variables sont vides) ouvrait donc tout le
// catalogue gratuitement, et créditait au passage les portefeuilles formateurs
// d'un argent jamais encaissé, retirable ensuite.
//
// Le raccourci de développement existe toujours, mais il exige désormais DEUX
// conditions explicites et ne peut pas être atteint en production. Voir
// `simulationAllowed()`.
// ==========================================================================

import type { PaymentProvider, PaymentStatus } from '@prisma/client'
import { db } from './db'
import { auditStandalone } from './audit'
import { assertCanActAsLearner } from './roles'
import { creditWalletOnPurchase } from './wallet'
import { onPurchaseSettled } from './purchase-settled'
import { getStripe } from './stripe'
import {
  assertWithinBounds, checkDeposit, isPawaPayConfigured,
  resolveProvider, requestDeposit, toMsisdn, PawaPayError, PLATFORM_CURRENCY,
} from './pawapay'
import { settleAmount } from './fx'

/**
 * Devise **de la carte**, chez Stripe. À zéro décimale : `amountFcfa` part tel
 * quel, sans multiplication par cent — multiplier ici facturerait cent fois le
 * prix affiché.
 *
 * Le mobile money, lui, n'a plus de devise fixe : elle suit le pays de
 * l'opérateur et la conversion passe par `lib/fx`. Stripe reste en FCFA parce
 * qu'une carte est débitée dans la devise du marchand, pas dans celle du
 * porteur.
 */
export const PAYMENT_CURRENCY = PLATFORM_CURRENCY

/**
 * Le raccourci de développement. **Deux verrous, et non un** :
 *
 *  1. `NODE_ENV !== 'production'` — infranchissable sur un déploiement réel ;
 *  2. `ALLOW_PAYMENT_SIMULATION=1` — un geste explicite, pas un oubli.
 *
 * L'ancienne version se déclenchait sur l'ABSENCE d'une variable. C'est
 * l'inverse de ce qu'il faut : une configuration incomplète doit refuser de
 * fonctionner, jamais s'autoriser davantage.
 */
function simulationAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_PAYMENT_SIMULATION === '1'
}

export interface MobileMoneyPayer {
  /** Numéro tel que saisi par l'apprenant ; normalisé en MSISDN plus bas. */
  phoneNumber: string
  /**
   * Code opérateur PawaPay — `MTN_MOMO_CMR`, `HALOTEL_TZA`. C'est l'identité qui
   * fait foi : elle porte déjà le pays, là où une marque générique (« MTN »)
   * obligeait à recroiser opérateur × pays dans une table écrite à la main.
   */
  provider: string
}

/**
 * Ce qui est payé, et comment la ligne correspondante se met à jour.
 *
 * Cette indirection existe parce que l'ouverture d'un paiement n'est plus
 * réservée aux achats : le premier abonnement d'un formateur se règle lui aussi
 * ici, et il ne s'appuie sur aucun `Purchase` — le profil qui le porterait
 * n'existe pas encore. Plutôt que d'ouvrir un second chemin vers les
 * fournisseurs, qui divergerait du premier au premier correctif, on décrit le
 * sujet du paiement et on garde une seule porte.
 */
export interface PaymentSubject {
  /** Sert au journal d'audit et aux métadonnées transmises au fournisseur. */
  kind: 'PURCHASE' | 'TRAINER_ACTIVATION' | 'SUBSCRIPTION_CHARGE'
  /** Identifiant de la ligne à régler, côté NKAMVA. */
  id: string
  /** Où Stripe ramène le payeur — succès comme abandon. */
  returnUrl: string
  /** Inscrit sur la ligne l'identifiant rendu par le fournisseur. */
  recordTransactionId: (providerTransactionId: string) => Promise<void>
  /** Raccourci de développement : règle la ligne sans passer par un fournisseur. */
  settleSimulated: (providerTransactionId: string, provider: PaymentProvider) => Promise<void>
}

/** Base publique du site, pour les URL de retour des pages hébergées. */
export function webBaseUrl(): string {
  return process.env.WEB_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
}

/** Le sujet « achat », de loin le plus fréquent. */
export function purchaseSubject(purchaseId: string): PaymentSubject {
  return {
    kind: 'PURCHASE',
    id: purchaseId,
    // L'abandon ramène là où l'apprenant attendait déjà : l'écran de
    // confirmation lit l'état réel de l'achat et n'affirme aucun succès.
    returnUrl: `${webBaseUrl()}/achat/confirmation/${purchaseId}`,
    recordTransactionId: async (providerTransactionId) => {
      await db.purchase.update({ where: { id: purchaseId }, data: { providerTransactionId } })
    },
    settleSimulated: async (providerTransactionId, provider) => {
      const credit = await db.$transaction((tx) =>
        creditWalletOnPurchase(tx, providerTransactionId, provider),
      )
      if (credit.credited && credit.purchaseId) await onPurchaseSettled(credit.purchaseId)
    },
  }
}

export interface OpenPaymentParams {
  subject: PaymentSubject
  provider: PaymentProvider
  amountFcfa: number
  /** Libellé porté sur le relevé du client (4 à 22 caractères chez PawaPay). */
  label: string
  /** Le payeur — apprenant pour un achat, candidat pour une activation. */
  learnerId: string
  countryCode: string | null
  /** Obligatoire pour PawaPay : le mobile money désigne un numéro, pas un compte. */
  payer?: MobileMoneyPayer
}

/** Le `targetType` du journal, selon ce qui est payé. */
function subjectTargetType(kind: PaymentSubject['kind']): string {
  if (kind === 'PURCHASE') return 'Purchase'
  if (kind === 'SUBSCRIPTION_CHARGE') return 'SubscriptionPayment'
  return 'TrainerActivationPayment'
}

/**
 * La clé sous laquelle l'identifiant part chez le fournisseur. `purchaseId`
 * est conservé tel quel pour les achats : c'est ce que lisent les tableaux de
 * bord du support, et le renommer les aveuglerait sur l'historique.
 */
function subjectMetadataKey(kind: PaymentSubject['kind']): string {
  if (kind === 'PURCHASE') return 'purchaseId'
  if (kind === 'SUBSCRIPTION_CHARGE') return 'subscriptionPaymentId'
  return 'activationPaymentId'
}

export interface OpenPaymentResult {
  providerTransactionId: string
  /**
   * Stripe : la page de paiement hébergée, vers laquelle le navigateur part.
   * C'est Stripe qui collecte la carte — l'application n'en voit jamais le
   * numéro, et le 3-D Secure se joue là-bas.
   */
  redirectUrl?: string
  /** Ce que l'écran doit demander à l'apprenant ensuite. */
  nextStep: 'CONFIRM_ON_PHONE' | 'REDIRECT_TO_PROVIDER' | 'ALREADY_SETTLED'
}

/**
 * Ouvre le paiement chez le fournisseur et rend de quoi le conclure côté
 * client. **Seul endroit** où un paiement est ouvert : `initiatePurchase` et
 * `initiateMembershipPayment` passent tous deux par ici, sans quoi le
 * correctif ci-dessus n'aurait tenu que sur la moitié des tunnels.
 *
 * Ne passe jamais l'achat en `SUCCEEDED` : c'est le callback signé du
 * fournisseur, et lui seul, qui le fait.
 */
export async function openProviderPayment(params: OpenPaymentParams): Promise<OpenPaymentResult> {
  if (params.provider === 'PAWAPAY') return openPawaPayDeposit(params)
  return openStripeCheckoutSession(params)
}

async function openPawaPayDeposit(params: OpenPaymentParams): Promise<OpenPaymentResult> {
  if (!isPawaPayConfigured()) {
    if (simulationAllowed()) return settleWithoutProvider(params, 'PAWAPAY')
    throw new Error('PAYMENT_PROVIDER_UNAVAILABLE')
  }
  if (!params.payer) throw new Error('MOBILE_MONEY_DETAILS_REQUIRED')

  // Le code opérateur porte son pays : c'est lui qui fait autorité, pas le pays
  // du profil. Un apprenant qui paie avec un numéro d'un autre pays que celui
  // qu'il a déclaré n'est pas une anomalie — le profil ne sert qu'à *proposer*
  // la bonne liste.
  const candidates = await resolveProvider(params.payer.provider, 'DEPOSIT')
  if (!candidates.length) throw new Error('PROVIDER_NOT_SUPPORTED')

  // La devise suit l'opérateur, et le montant FCFA y est converti au taux
  // administré. Sans taux pour cette devise, l'achat est refusé ici — jamais
  // envoyé au fournisseur dans une devise qu'il n'attend pas.
  const { provider, converted } = await settleAmount(candidates, params.amountFcfa)

  // Bornes et disponibilité lues sur `/v2/active-conf`, dans la devise de
  // l'opérateur : un montant hors limites ou un opérateur fermé se refuse ici,
  // avec un motif lisible, plutôt que de partir se faire rejeter et laisser un
  // achat en attente.
  assertWithinBounds(provider, converted.amount)

  // L'identifiant est le nôtre, et il fait office de clé d'idempotence chez
  // PawaPay : le rejouer est sans effet. Un UUID nu, sans préfixe — le format
  // est contraint.
  const depositId = crypto.randomUUID()
  const phoneNumber = toMsisdn(params.payer.phoneNumber, provider.prefix)

  const response = await requestDeposit({
    depositId,
    phoneNumber,
    provider: provider.provider,
    amount: converted.amount,
    currency: converted.currency,
    customerMessage: params.label,
    clientReferenceId: params.subject.id,
    metadata: { [subjectMetadataKey(params.subject.kind)]: params.subject.id, learnerId: params.learnerId },
  })

  if (response.status === 'REJECTED') {
    await auditStandalone({
      action: 'PAYMENT_REJECTED',
      targetType: subjectTargetType(params.subject.kind), targetId: params.subject.id,
      meta: {
        provider: 'PAWAPAY', depositId,
        failureCode: response.failureReason?.failureCode ?? null,
        failureMessage: response.failureReason?.failureMessage ?? null,
      },
    })
    throw new Error(response.failureReason?.failureCode || 'PAYMENT_REJECTED')
  }

  await params.subject.recordTransactionId(depositId)

  return { providerTransactionId: depositId, nextStep: 'CONFIRM_ON_PHONE' }
}

/**
 * Ouvre une **session Checkout hébergée** : l'apprenant part chez Stripe, y
 * saisit sa carte, et revient sur l'écran de confirmation.
 *
 * Le choix tient en une phrase : rien de ce dépôt ne touche jamais un numéro de
 * carte. La version précédente créait un PaymentIntent et rendait son
 * `client_secret` à un composant de saisie **qui n'a jamais existé** —
 * `@stripe/stripe-js` n'est pas une dépendance du projet. L'intention était donc
 * créée puis abandonnée, et l'apprenant attendait devant un écran de
 * confirmation que personne ne viendrait débloquer.
 *
 * ⚠️ **L'identifiant enregistré change en cours de route, et il le faut.**
 *
 * Tout l'aval est indexé sur `pi_…` : `charge.dispute.created` lit
 * `object.payment_intent`, les remboursements aussi. Mais Stripe ne crée le
 * PaymentIntent **qu'à la validation du paiement** — `session.payment_intent`
 * est nul à l'ouverture (vérifié le 9 août 2026 ; c'est le piège de cette
 * migration). On enregistre donc le `cs_…` en attendant, et
 * `promoteCheckoutSession` le remplace par le `pi_…` dès que la session
 * aboutit. Une ligne ne porte un `cs_…` que le temps d'un paiement en cours.
 */
async function openStripeCheckoutSession(params: OpenPaymentParams): Promise<OpenPaymentResult> {
  const stripe = getStripe()
  if (!stripe) {
    if (simulationAllowed()) return settleWithoutProvider(params, 'STRIPE')
    throw new Error('PAYMENT_PROVIDER_UNAVAILABLE')
  }

  const confirmation = params.subject.returnUrl

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PAYMENT_CURRENCY.toLowerCase(),
            // XAF est une devise **sans décimale** : le montant part tel quel,
            // sans multiplication par cent. La multiplier facturerait cent fois
            // le prix affiché.
            unit_amount: params.amountFcfa,
            product_data: { name: params.label },
          },
        },
      ],
      // L'abandon ramène là où l'apprenant attendait déjà : l'écran de
      // confirmation lit l'état réel de l'achat et n'affirme aucun succès.
      success_url: confirmation,
      cancel_url: confirmation,
      metadata: { [subjectMetadataKey(params.subject.kind)]: params.subject.id, learnerId: params.learnerId },
      payment_intent_data: {
        description: params.label,
        metadata: { [subjectMetadataKey(params.subject.kind)]: params.subject.id, learnerId: params.learnerId },
      },
    },
    // Une reprise crée une **nouvelle** session : la clé porte donc l'identifiant
    // de session côté Stripe, pas seulement la ligne. Sans ce sel, rouvrir un
    // paiement rendrait la session périmée précédente.
    { idempotencyKey: `${params.subject.kind.toLowerCase()}_${params.subject.id}_${Date.now()}` },
  )

  // Sans page à ouvrir, l'apprenant n'a nulle part où payer : mieux vaut
  // refuser que laisser une ligne en attente que rien ne viendra conclure.
  if (!session.url) throw new Error('PAYMENT_PROVIDER_UNAVAILABLE')

  await params.subject.recordTransactionId(session.id)

  return {
    providerTransactionId: session.id,
    redirectUrl: session.url,
    nextStep: 'REDIRECT_TO_PROVIDER',
  }
}

/** Une session Checkout, par opposition à un PaymentIntent. */
export function isCheckoutSession(providerTransactionId: string): boolean {
  return providerTransactionId.startsWith('cs_')
}

/**
 * Remplace le `cs_…` d'un achat par le `pi_…` de son paiement, une fois la
 * session aboutie. C'est la charnière de tout le dispositif : après cet appel,
 * l'achat est indexé comme il l'a toujours été, et litiges, remboursements et
 * webhooks le retrouvent sans rien savoir de Checkout.
 *
 * Rend le `pi_…` quand la session est payée, `null` sinon. Idempotent : rejoué,
 * il ne trouve plus de ligne portant le `cs_…` et ne réécrit rien.
 */
export async function promoteCheckoutSession(sessionId: string): Promise<string | null> {
  const stripe = getStripe()
  if (!stripe) return null
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.payment_status !== 'paid') return null
  const intentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id
  if (!intentId) return null
  await db.purchase.updateMany({
    where: { providerTransactionId: sessionId },
    data: { providerTransactionId: intentId },
  })
  return intentId
}

/**
 * Raccourci de développement, atteignable uniquement sous les deux verrous de
 * `simulationAllowed()`. Il crédite directement, sans passer par un faux
 * webhook : les callbacks exigent désormais une signature du fournisseur qu'on
 * ne saurait pas contrefaire — et c'est très bien ainsi.
 */
async function settleWithoutProvider(
  params: OpenPaymentParams,
  provider: PaymentProvider,
): Promise<OpenPaymentResult> {
  const providerTransactionId = crypto.randomUUID()
  await params.subject.recordTransactionId(providerTransactionId)
  await auditStandalone({
    action: 'PAYMENT_SIMULATED',
    targetType: subjectTargetType(params.subject.kind), targetId: params.subject.id,
    meta: { provider, providerTransactionId, reason: 'ALLOW_PAYMENT_SIMULATION' },
  })
  await params.subject.settleSimulated(providerTransactionId, provider)
  return { providerTransactionId, nextStep: 'ALREADY_SETTLED' }
}

export interface InitiatePurchaseResult {
  purchaseId: string
  providerTransactionId: string
  /** Stripe : page hébergée vers laquelle le navigateur doit partir. */
  redirectUrl?: string
  provider: PaymentProvider
  /** Ce que l'écran doit demander ensuite : le téléphone, la carte, ou rien. */
  nextStep: OpenPaymentResult['nextStep']
}

// --- Initier un achat ---

export async function initiatePurchase(
  courseId: string,
  learnerId: string,
  provider: PaymentProvider,
  payer?: MobileMoneyPayer,
): Promise<InitiatePurchaseResult> {
  // Avant toute chose, et avant tout appel au fournisseur de paiement : un
  // compte d'administration n'achète pas. Le journal d'audit de cette fonction
  // écrit `actorRole: 'LEARNER'` en dur — il le SUPPOSAIT sans le vérifier.
  await assertCanActAsLearner(learnerId)

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      trainerProfile: {
        // `userId` n'était pas lu ici : cette fonction ne mentionnait
        // `trainerId` qu'à l'écriture de l'achat, et n'a jamais comparé
        // l'acheteur à l'auteur. Voir la garde ci-dessous.
        select: { id: true, commissionRate: true, userId: true },
      },
    },
  })

  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.status !== 'published') throw new Error('COURSE_NOT_AVAILABLE')
  // Arbitrage 47 — circuits exclusifs. Elle s'obtient par l'abonnement à la
  // communauté, pas à l'unité.
  if (course.circuit === 'COMMUNITY') throw new Error('COURSE_NOT_FOR_SALE')

  // Le formateur vend sa ressource, il ne l'achète pas — pendant exact de
  // `CANNOT_JOIN_OWN_COMMUNITY` (memberships.ts), qui existait déjà quand
  // celui-ci manquait. Payer chez soi ferait prélever la commission de la
  // plateforme sur son propre argent, et ferait entrer un `Purchase`
  // auto-référencé dans les agrégats de `trainer-stats.ts` : ventes et revenus
  // nets s'en trouveraient gonflés par une vente qui n'en est pas une. Un tel
  // achat ouvrirait ensuite un litige contre soi-même.
  //
  // Le refus tombe AVANT toute écriture et avant tout appel au fournisseur : ni
  // ligne `Purchase`, ni transaction facturée ne doit rester derrière lui. Il
  // vit ici, dans le service, et non dans le seul écran : le tunnel n'est pas
  // la seule porte d'entrée de `initiatePurchase`.
  //
  // Un formateur reste libre d'acheter la ressource D'UN AUTRE : il garde tous
  // les privilèges de l'apprenant (cf. roles.ts).
  if (course.trainerProfile.userId === learnerId) throw new Error('CANNOT_BUY_OWN_COURSE')

  const learner = await db.user.findUnique({
    where: { id: learnerId },
    select: { countryCode: true },
  })

  // Vérifier si l'apprenant a déjà acheté
  const existing = await db.purchase.findFirst({
    where: {
      learnerId,
      courseId,
      providerStatus: { in: ['SUCCEEDED', 'PENDING'] },
    },
  })
  if (existing?.providerStatus === 'SUCCEEDED') throw new Error('ALREADY_PURCHASED')
  if (existing?.providerStatus === 'PENDING') {
    // Un achat en attente qui porte déjà son identifiant fournisseur se reprend
    // tel quel. S'il n'en a pas, c'est que l'ouverture du paiement a échoué
    // après la création de la ligne : on la rouvre plutôt que de laisser
    // l'apprenant bloqué sur un achat qu'aucun callback ne viendra conclure.
    if (existing.providerTransactionId) {
      // Même moyen, et ce moyen se reprend : on rend la transaction en cours.
      // L'apprenant est revenu finir ce qu'il avait commencé.
      if (existing.provider === provider && resumableAsIs(provider)) {
        return {
          purchaseId: existing.id,
          providerTransactionId: existing.providerTransactionId,
          provider: existing.provider,
          nextStep: 'CONFIRM_ON_PHONE',
        }
      }
      // Sinon : changement d'avis, ou carte — dont la page de paiement ne se
      // reprend pas. Dans les deux cas on libère l'ancienne transaction.
      const { freed, outcome } = await freePendingAttempt(
        { id: existing.id, provider: existing.provider, providerTransactionId: existing.providerTransactionId },
        provider,
      )
      if (!freed) {
        if (outcome === 'SETTLED') {
          await reconcilePurchase(existing.providerTransactionId)
          throw new Error('ALREADY_PURCHASED')
        }
        throw new Error('PAYMENT_IN_PROGRESS')
      }
    }
    const reopened = await openProviderPayment({
      subject: purchaseSubject(existing.id),
      provider,
      amountFcfa: existing.amountFcfa,
      label: course.title,
      learnerId,
      countryCode: learner?.countryCode ?? null,
      payer,
    })
    // La colonne suit le fournisseur réellement ouvert. La laisser sur l'ancien
    // ferait interroger Stripe avec un identifiant PawaPay à la réconciliation
    // — ou l'inverse — et l'achat resterait en attente sans raison lisible.
    if (existing.provider !== provider) {
      await db.purchase.update({ where: { id: existing.id }, data: { provider } })
    }
    return {
      purchaseId: existing.id,
      providerTransactionId: reopened.providerTransactionId,
      redirectUrl: reopened.redirectUrl,
      provider,
      nextStep: reopened.nextStep,
    }
  }

  const amountFcfa = course.priceFcfa
  const commissionRate = course.trainerProfile.commissionRate
  const trainerShareFcfa = Math.round(amountFcfa * (1 - commissionRate))
  const platformShareFcfa = amountFcfa - trainerShareFcfa

  // Le contrôle d'achat existant ci-dessus lit avant d'écrire : deux requêtes
  // simultanées voyaient toutes deux « aucun achat » et inséraient chacune la
  // leur. L'apprenant était débité deux fois et le formateur crédité deux fois —
  // chaque achat portant son propre `providerTransactionId`, l'idempotence de
  // `creditWalletOnPurchase` ne rattrapait rien. Reproduit 2 fois sur 6.
  // C'est désormais l'index unique partiel `purchases_active_course_unique` qui
  // tranche, en base : le perdant de la course retombe sur l'achat du gagnant.
  // L'achat naît **sans** identifiant fournisseur : c'est l'ouverture du
  // paiement qui le pose, parce que Stripe seul décide de l'identifiant de son
  // PaymentIntent. L'ancienne version en fabriquait un (`pi_<uuid>`) que Stripe
  // n'a jamais connu — aucun webhook réel n'aurait pu être rapproché.
  let purchase
  try {
    purchase = await db.purchase.create({
      data: {
        learnerId,
        trainerId: course.trainerProfile.id,
        courseId,
        amountFcfa,
        commissionRate,
        trainerShareFcfa,
        platformShareFcfa,
        provider,
        providerStatus: 'PENDING',
      },
    })
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err

    const winner = await db.purchase.findFirst({
      where: { learnerId, courseId, providerStatus: { in: ['SUCCEEDED', 'PENDING'] } },
    })
    if (!winner) throw err
    if (winner.providerStatus === 'SUCCEEDED') throw new Error('ALREADY_PURCHASED')
    if (!winner.providerTransactionId) throw new Error('PAYMENT_IN_PROGRESS')
    // Le perdant n'a aucune page de paiement à rendre : l'URL de la session
    // appartient à l'onglet gagnant, peut-être déjà chez Stripe. Lui en ouvrir
    // une autre l'expirerait sous ses pieds. On refuse, et la nouvelle
    // tentative repassera par la reprise ci-dessus, qui en ouvrira une propre.
    // Hors session Checkout, l'identifiant ne peut venir que du raccourci de
    // simulation : il n'y a rien à rouvrir, l'achat est déjà réglé.
    if (isCheckoutSession(winner.providerTransactionId)) {
      throw new Error('PAYMENT_IN_PROGRESS')
    }
    return {
      purchaseId: winner.id,
      providerTransactionId: winner.providerTransactionId,
      provider: winner.provider,
      nextStep: winner.provider === 'PAWAPAY' ? 'CONFIRM_ON_PHONE' : 'ALREADY_SETTLED',
    }
  }

  await auditStandalone({
    actorId: learnerId, actorRole: 'LEARNER',
    action: 'PURCHASE_INITIATED', targetType: 'Purchase', targetId: purchase.id,
    meta: { courseId, amountFcfa, provider },
  })

  // L'échec d'ouverture annule l'achat : le laisser en attente le rendrait
  // irréparable — l'index unique partiel interdirait toute nouvelle tentative
  // sur la même ressource tant qu'il vit.
  let opened: OpenPaymentResult
  try {
    opened = await openProviderPayment({
      subject: purchaseSubject(purchase.id),
      provider,
      amountFcfa,
      label: course.title,
      learnerId,
      countryCode: learner?.countryCode ?? null,
      payer,
    })
  } catch (err) {
    await db.purchase.updateMany({
      where: { id: purchase.id, providerStatus: 'PENDING' },
      data: { providerStatus: 'CANCELED' },
    })
    await auditStandalone({
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'PURCHASE_OPEN_FAILED', targetType: 'Purchase', targetId: purchase.id,
      meta: { provider, error: err instanceof Error ? err.message : String(err) },
    })
    throw err
  }

  return {
    purchaseId: purchase.id,
    providerTransactionId: opened.providerTransactionId,
    redirectUrl: opened.redirectUrl,
    provider,
    nextStep: opened.nextStep,
  }
}

// --- Réconciliation par polling (cas webhook tardif) ---

export async function reconcilePurchase(
  providerTransactionId: string,
): Promise<{ status: string; credited: boolean; failureCode: string | null }> {
  const purchase = await db.purchase.findUnique({
    where: { providerTransactionId },
    select: { id: true, providerStatus: true, provider: true, failureCode: true },
  })

  if (!purchase) return { status: 'NOT_FOUND', credited: false, failureCode: null }
  if (purchase.providerStatus === 'SUCCEEDED') return { status: 'SUCCEEDED', credited: false, failureCode: null }

  // Cette fonction était une coquille vide : elle décrivait en commentaire ce
  // qu'il aurait fallu faire et rendait toujours « rien à signaler ». La route
  // qui l'appelle après un paiement laissait donc l'apprenant devant un écran
  // d'attente qu'aucun événement ne débloquait si le callback se perdait.
  //
  // Le fournisseur reste seul juge : on lui redemande le statut, on ne le
  // déduit jamais du fait que le client soit revenu sur la page.
  const settled = await providerSaysSettled(purchase.provider, providerTransactionId)

  if (settled.outcome === 'FAILED') {
    // Le motif est écrit sur l'achat, pas seulement journalisé : c'est lui que
    // l'écran de confirmation traduira pour l'apprenant.
    await db.purchase.updateMany({
      where: { id: purchase.id, providerStatus: 'PENDING' },
      data: { providerStatus: 'FAILED', failureCode: settled.failureCode },
    })
    return { status: 'FAILED', credited: false, failureCode: settled.failureCode }
  }

  if (settled.outcome !== 'COMPLETED') {
    return { status: purchase.providerStatus, credited: false, failureCode: purchase.failureCode }
  }

  // Une session payée cède la place à son PaymentIntent avant tout crédit :
  // c'est sous ce numéro que l'achat devra être retrouvé en cas de litige.
  const settledId = isCheckoutSession(providerTransactionId)
    ? await promoteCheckoutSession(providerTransactionId)
    : providerTransactionId
  if (!settledId) return { status: purchase.providerStatus, credited: false, failureCode: null }

  // Même écriture idempotente que le callback : si celui-ci arrive entre-temps,
  // l'un des deux voit `count === 0` et n'écrit rien.
  const credit = await db.$transaction((tx) =>
    creditWalletOnPurchase(tx, settledId, purchase.provider),
  )
  if (credit.credited && credit.purchaseId) {
    await onPurchaseSettled(credit.purchaseId)
    await auditStandalone({
      action: 'PURCHASE_RECONCILED', targetType: 'Purchase', targetId: purchase.id,
      // Les deux numéros : celui par lequel on est arrivé, et celui sous lequel
      // l'achat vit désormais. Sans le second, une recherche par PaymentIntent
      // ne retrouverait pas l'événement.
      meta: {
        provider: purchase.provider,
        providerTransactionId,
        ...(settledId !== providerTransactionId ? { settledTransactionId: settledId } : {}),
      },
    })
  }
  return { status: 'SUCCEEDED', credited: credit.credited, failureCode: null }
}

/**
 * Sort de la tentative précédente quand l'apprenant **change de moyen de
 * paiement**. Rendre l'ancienne transaction telle quelle — ce que faisaient les
 * deux tunnels — ignorait le moyen qu'il venait de choisir : une carte
 * abandonnée faute de saisie condamnait aussi le mobile money sur la même
 * ressource, et les deux paraissaient en panne.
 *
 * Mais on ne l'abandonne pas à l'aveugle non plus. Une transaction encore
 * vivante chez l'ancien fournisseur, doublée d'une neuve chez le nouveau,
 * **débite deux fois**. D'où trois issues, et une seule autorise la bascule.
 */
async function releasePreviousAttempt(
  provider: PaymentProvider,
  providerTransactionId: string,
): Promise<'SETTLED' | 'RELEASED' | 'IN_FLIGHT'> {
  const settled = await providerSaysSettled(provider, providerTransactionId)
  if (settled.outcome === 'COMPLETED') return 'SETTLED'
  if (settled.outcome === 'FAILED') return 'RELEASED'

  // Fournisseur non configuré sous le raccourci de simulation : la transaction
  // n'existe que dans notre base, il n'y a aucun débit à protéger. Répondre
  // « en vol » ici bloquait toute reprise en développement et en test — c'est ce
  // que la suite `memberships` a rattrapé.
  const configured = provider === 'STRIPE' ? Boolean(getStripe()) : isPawaPayConfigured()
  if (!configured) return simulationAllowed() ? 'RELEASED' : 'IN_FLIGHT'

  if (provider === 'STRIPE') {
    const stripe = getStripe()
    if (!stripe) return 'IN_FLIGHT'
    try {
      // Une session ouverte se ferme : l'apprenant qui l'aurait encore sous les
      // yeux ne pourra plus y payer, ce qui est exactement le but — une seule
      // page de paiement vivante à la fois.
      if (isCheckoutSession(providerTransactionId)) {
        const expired = await stripe.checkout.sessions.expire(providerTransactionId)
        return expired.status === 'expired' ? 'RELEASED' : 'IN_FLIGHT'
      }
      // Un PaymentIntent que personne n'a confirmé s'annule sans conséquence :
      // rien n'a été présenté à la banque.
      const canceled = await stripe.paymentIntents.cancel(providerTransactionId)
      return canceled.status === 'canceled' ? 'RELEASED' : 'IN_FLIGHT'
    } catch {
      // `processing`, `requires_action`, session déjà complétée : la main est
      // ailleurs, on ne coupe pas.
      return 'IN_FLIGHT'
    }
  }

  // PawaPay n'annule pas un dépôt — l'API n'expose rien de tel, et la demande
  // vit sur le téléphone jusqu'à expiration. L'apprenant peut encore taper son
  // code : ouvrir une carte par-dessus l'exposerait à payer deux fois.
  return 'IN_FLIGHT'
}

/**
 * Prépare un achat en attente à changer de fournisseur. Rend `false` quand la
 * bascule est refusée — l'appelant doit alors s'arrêter.
 *
 * L'identifiant de l'ancienne transaction est effacé en même temps que le
 * fournisseur est réécrit : si l'ouverture du nouveau paiement échoue ensuite,
 * la ligne retombe dans le cas « en attente sans identifiant », que les deux
 * tunnels savent déjà rouvrir. Sans cet effacement, une ouverture ratée
 * laisserait un achat qui prétend reprendre une transaction morte.
 */
export async function freePendingAttempt(
  purchase: { id: string; provider: PaymentProvider; providerTransactionId: string },
  wanted: PaymentProvider,
): Promise<{ freed: boolean; outcome: 'SETTLED' | 'RELEASED' | 'IN_FLIGHT' }> {
  const outcome = await releasePreviousAttempt(purchase.provider, purchase.providerTransactionId)
  if (outcome !== 'RELEASED') return { freed: false, outcome }
  await db.purchase.update({
    where: { id: purchase.id },
    data: { provider: wanted, providerTransactionId: null },
  })
  return { freed: true, outcome }
}

/**
 * Une transaction en attente peut-elle être rendue telle quelle à l'apprenant
 * qui revient ?
 *
 * **PawaPay : oui.** La demande vit sur son téléphone, il peut encore taper son
 * code — en rouvrir une seconde lui en enverrait deux.
 *
 * **Stripe : non.** Depuis le passage à Checkout, la page de paiement est
 * portée par une session dont l'URL n'est ni conservée ni reconstructible, et
 * qui expire de son côté. Il faut donc en ouvrir une nouvelle, après avoir
 * annulé l'intention précédente — ce que `freePendingAttempt` fait, en refusant
 * si cette intention peut encore aboutir.
 */
export function resumableAsIs(provider: PaymentProvider): boolean {
  return provider === 'PAWAPAY'
}

interface ProviderVerdict {
  outcome: 'COMPLETED' | 'FAILED' | null
  /**
   * Le motif tel que le fournisseur le nomme. Il ne se traduit pas ici : la
   * phrase est affaire d'écran, et le code brut doit rester lisible pour le
   * support même quand personne ne l'a encore traduit.
   */
  failureCode: string | null
}

/** Interroge le fournisseur. `null` quand le paiement n'est pas encore tranché. */
/**
 * Le verdict du fournisseur sur une transaction. Exporté parce que la
 * réconciliation ne concerne plus seulement les achats : l'ouverture d'un
 * espace formateur se règle par les mêmes tunnels et se perd de la même façon
 * quand un callback n'arrive pas.
 */
export async function providerSaysSettled(
  provider: PaymentProvider,
  providerTransactionId: string,
): Promise<ProviderVerdict> {
  try {
    if (provider === 'PAWAPAY') {
      if (!isPawaPayConfigured()) return { outcome: null, failureCode: null }
      const snapshot = await checkDeposit(providerTransactionId)
      if (!snapshot) return { outcome: null, failureCode: null }
      if (snapshot.status === 'COMPLETED') return { outcome: 'COMPLETED', failureCode: null }
      if (snapshot.status !== 'FAILED') return { outcome: null, failureCode: null }
      return {
        outcome: 'FAILED',
        failureCode: snapshot.failureReason?.failureCode ?? 'UNSPECIFIED_FAILURE',
      }
    }

    const stripe = getStripe()
    if (!stripe) return { outcome: null, failureCode: null }

    // Un achat dont la session Checkout n'a pas encore abouti porte son `cs_…` :
    // interroger `paymentIntents` avec lui rendrait une erreur, pas un statut.
    if (isCheckoutSession(providerTransactionId)) {
      const session = await stripe.checkout.sessions.retrieve(providerTransactionId)
      if (session.payment_status === 'paid') return { outcome: 'COMPLETED', failureCode: null }
      // `expired` est le terme de Checkout : la page n'est plus ouvrable, il
      // faudra en rouvrir une. C'est un échec, pas une attente.
      if (session.status !== 'expired') return { outcome: null, failureCode: null }
      // Stripe ne nomme pas ce cas : la session a simplement vécu son temps.
      return { outcome: 'FAILED', failureCode: 'SESSION_EXPIRED' }
    }

    const intent = await stripe.paymentIntents.retrieve(providerTransactionId)
    if (intent.status === 'succeeded') return { outcome: 'COMPLETED', failureCode: null }
    if (intent.status !== 'canceled') return { outcome: null, failureCode: null }
    // `decline_code` est plus précis que `code` quand la banque s'explique
    // (`insufficient_funds` plutôt que `card_declined`) : on prend le plus fin.
    return {
      outcome: 'FAILED',
      failureCode:
        intent.last_payment_error?.decline_code ??
        intent.last_payment_error?.code ??
        intent.cancellation_reason ??
        null,
    }
  } catch (err) {
    // Une panne de réconciliation n'est pas une panne de paiement : on laisse
    // l'achat en attente, le callback reste la voie normale.
    console.error('[PAYMENT:RECONCILE_FAILED]', {
      provider, providerTransactionId,
      error: err instanceof PawaPayError ? err.message : String(err),
    })
    return { outcome: null, failureCode: null }
  }
}

// --- Lister les achats d'un apprenant ---

export async function listMyPurchases(learnerId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    db.purchase.findMany({
      where: { learnerId },
      include: {
        course: {
          select: { id: true, title: true, slug: true, format: true, coverS3Key: true, durationSeconds: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.count({ where: { learnerId } }),
  ])

  return { items, total, page, pageSize }
}

// --- Chiffres de tête de la page « Mes achats » ---

// ==========================================================================
// Lecture Finances — registre des transactions
// ==========================================================================
// `Purchase` est la source de vérité : les parts y sont snapshotées à la vente
// (décision 11), donc un changement de taux de commission ne réécrit jamais le
// passé. Ce registre ne recalcule rien, il lit ce qui a été figé.

export async function listAllPurchases(filters: {
  providerStatus?: PaymentStatus
  refunded?: boolean
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(filters.pageSize ?? 20, 50)

  const where = {
    ...(filters.providerStatus ? { providerStatus: filters.providerStatus } : {}),
    ...(filters.refunded === true ? { refundedAt: { not: null } } : {}),
    ...(filters.refunded === false ? { refundedAt: null } : {}),
  }

  const [items, total] = await Promise.all([
    db.purchase.findMany({
      where,
      include: {
        learner: { select: { id: true, email: true, fullName: true } },
        course: { select: { id: true, title: true, slug: true } },
        community: { select: { id: true, name: true } },
        trainerProfile: { select: { id: true, user: { select: { email: true, fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getPurchaseStats() {
  const SETTLED = { providerStatus: 'SUCCEEDED', refundedAt: null } as const

  const [byStatus, settled, refunded] = await Promise.all([
    db.purchase.groupBy({ by: ['providerStatus'], _count: { _all: true } }),
    db.purchase.aggregate({
      where: SETTLED,
      _count: { _all: true },
      _sum: { amountFcfa: true, platformShareFcfa: true, trainerShareFcfa: true },
    }),
    db.purchase.aggregate({
      where: { refundedAt: { not: null } },
      _count: { _all: true },
      _sum: { amountFcfa: true },
    }),
  ])

  const counts = Object.fromEntries(byStatus.map(r => [r.providerStatus, r._count._all]))
  return {
    byStatus: counts,
    pending: counts.PENDING ?? 0,
    failed: counts.FAILED ?? 0,
    settledCount: settled._count._all,
    grossFcfa: settled._sum.amountFcfa ?? 0,
    platformShareFcfa: settled._sum.platformShareFcfa ?? 0,
    trainerShareFcfa: settled._sum.trainerShareFcfa ?? 0,
    refundedCount: refunded._count._all,
    refundedFcfa: refunded._sum.amountFcfa ?? 0,
  }
}

export interface PurchaseSummary {
  totalPaidFcfa: number
  coursesCount: number
  activeSubscriptions: number
}

/**
 * Les trois compteurs portent sur l'ensemble des achats, pas sur la page
 * affichée. Un achat remboursé sort du total payé et du décompte : l'apprenant
 * ne l'a plus à sa charge et n'y a plus accès.
 */
export async function getPurchaseSummary(learnerId: string): Promise<PurchaseSummary> {
  const settled = { learnerId, providerStatus: 'SUCCEEDED' as const, refundedAt: null }

  const [paid, courses, subscriptions] = await Promise.all([
    db.purchase.aggregate({ where: settled, _sum: { amountFcfa: true } }),
    db.purchase.findMany({
      where: { ...settled, courseId: { not: null } },
      select: { courseId: true },
      distinct: ['courseId'],
    }),
    db.communitySubscription.count({ where: { learnerId, status: 'ACTIVE' } }),
  ])

  return {
    totalPaidFcfa: paid._sum.amountFcfa ?? 0,
    coursesCount: courses.length,
    activeSubscriptions: subscriptions,
  }
}
