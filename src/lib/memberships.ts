// ==========================================================================
// Adhésion payante aux communautés — arbitrages 40, 44, 48, 58
// ==========================================================================
// Les modèles existaient déjà et attendaient : `CommunitySubscription` porte
// les périodes, `Purchase` porte `communityId`, `periodStart` et `periodEnd`.
// Ce qui manquait, c'était le parcours — d'où un bouton « Rejoindre » qui
// renvoyait vers le support.
//
// Trois règles gouvernent ce module :
//
// 1. **Un prix, une cadence** (arbitrage 58) : `Community.priceFcfa` par mois.
//    Aucune formule communautaire, aucun choix de cadence dans le tunnel.
// 2. **Rien n'est ouvert avant que le paiement soit confirmé.** L'adhésion naît
//    d'un `Purchase` PENDING ; c'est le webhook provider — et lui seul — qui la
//    fait exister, dans la transaction qui crédite le portefeuille.
// 3. **L'impayé retire la parole au terme du délai, jamais avant.** Comme
//    l'abonnement formateur (décision 68), la période impayée reste ouverte
//    pendant le délai de grâce : couper l'accès le jour même d'une échéance non
//    réglée priverait de ses ressources quelqu'un dont le mobile money a
//    simplement mis trois jours à confirmer.
//
// ⚠️ Ce module **n'encaisse rien** de lui-même, exactement comme
// `subscriptions.ts` : aucun abonnement récurrent provider n'est branché
// (`providerSubscriptionId` reste nul). Le renouvellement ouvre une période due
// et attend un règlement ; il ne prélève pas.
//
// Le registre des périodes payées, c'est `Purchase` : une ligne SUCCEEDED par
// période, avec son montant figé. La souscription, elle, ne porte que l'état
// courant. Aucun modèle de facturation supplémentaire n'a été nécessaire.
// ==========================================================================

import type {
  CommunitySubscriptionStatus,
  CommunityVisibility,
  PaymentProvider,
} from '@prisma/client'
import { db } from './db'
import { fmtFcfa } from './format'
import { addMonthsUtc } from './months'
import { audit, auditStandalone } from './audit'
import { notify, deliverSideEffects } from './notification'
import { consumeInvitationForPurchase } from './invitations'
import { assertCanActAsLearner } from './roles'
import {
  openProviderPayment, purchaseSubject, reconcilePurchase, freePendingAttempt,
  resumableAsIs, isCheckoutSession,
  type MobileMoneyPayer, type OpenPaymentResult,
} from './purchases'
import { isBannedFromCommunity, recountCommunityMembers } from './communities'
import { trainerAcceptsMembers } from './trainers'
import type { PrismaTransaction } from './types'

/**
 * Statuts dont la période court encore — la même liste que celle de l'index
 * unique partiel `community_subscriptions_active_unique` et que les
 * `OPEN_STATUSES` de `communities.ts`. Les trois doivent rester alignées : une
 * divergence rendrait l'index infranchissable pour du code qui se croit libre.
 */
const OPEN_STATUSES: CommunitySubscriptionStatus[] = ['ACTIVE', 'PAST_DUE', 'BANNED']

/**
 * Délai laissé au membre entre l'échéance non réglée et la fin de l'adhésion.
 * ⚠️ Valeur reprise de l'abonnement formateur (`SUBSCRIPTION_GRACE_DAYS`),
 * **non arbitrée pour les communautés** : elle est ici pour être discutée, pas
 * pour être découverte au fond d'une condition.
 */
export const MEMBERSHIP_GRACE_DAYS = 14

const DAY_MS = 86_400_000

/**
 * Marque l'échéance ouverte par `renewDueMemberships` sur `Purchase.acquisitionSource`.
 * C'est elle qui permet à `initiateMembershipPayment` de distinguer une échéance
 * jamais tentée — à ouvrir — d'une ouverture en vol, qui appartient à l'onglet
 * qui l'a créée. Les deux n'ont pas encore de transaction.
 */
export const RENEWAL_SOURCE = 'RENEWAL'

/** L'adhésion est mensuelle et ne connaît pas d'autre cadence (arbitrage 58). */
export function periodEndFor(start: Date): Date {
  // En UTC et sans débordement (m18) : voir `addMonthsUtc`.
  return addMonthsUtc(start, 1)
}

/**
 * Le montant de la période qui s'ouvre au renouvellement.
 *
 * Un changement de prix survenu **pendant** la période en cours ne s'applique
 * pas à l'échéance qui la suit : le membre en a été prévenu au moment du
 * changement, et doit avoir une période entière pour décider de rester. Il
 * paie donc encore ce qu'il a payé pour la période en cours, si c'est moins ;
 * le nouveau prix vient à l'échéance d'après. Une **baisse**, elle,
 * s'applique tout de suite — le minimum des deux.
 *
 * C'est la règle de l'abonnement formateur (`pricing.ts`). Auparavant le prix
 * courant était facturé sans avis : passer de 2 500 à 50 000 FCFA touchait tous
 * les membres au mois suivant (audit du 28 octobre 2026, A6).
 */
async function renewalAmount(sub: {
  learnerId: string
  communityId: string
  periodEnd: Date
  community: { priceFcfa: number; priceChangedAt: Date | null }
}): Promise<number> {
  const { priceFcfa, priceChangedAt } = sub.community
  if (!priceChangedAt) return priceFcfa

  // La période en cours est celle qui se termine maintenant : on la retrouve
  // par sa fin, qui est celle de l'adhésion.
  const current = await db.purchase.findFirst({
    where: {
      learnerId: sub.learnerId, communityId: sub.communityId,
      providerStatus: 'SUCCEEDED', periodEnd: sub.periodEnd,
    },
    orderBy: { createdAt: 'desc' },
    select: { amountFcfa: true, periodStart: true },
  })
  if (!current?.periodStart || priceChangedAt <= current.periodStart) return priceFcfa
  return Math.min(priceFcfa, current.amountFcfa)
}

// --- Lecture ---

/**
 * ⚠️ `periodStart` date le **début de l'adhésion**, pas celui du mois courant,
 * et ne bouge plus ensuite. C'est ce que suppose la formule d'accès de
 * l'arbitrage 48 : elle croise la période d'adhésion avec la période de
 * liaison, et une période d'adhésion réduite au dernier mois ferait perdre à un
 * ancien membre tout ce qui avait été lié avant. Seul `periodEnd` avance, à
 * chaque mois **réglé**.
 */
export interface MembershipView {
  id: string
  communityId: string
  status: CommunitySubscriptionStatus
  periodStart: Date
  periodEnd: Date
  canceledAt: Date | null
  bannedAt: Date | null
  /** Échéance ouverte et non réglée, s'il y en a une. */
  dueAmountFcfa: number | null
  duePurchaseId: string | null
  /** Date à laquelle un impayé mettra fin à l'adhésion. */
  gracePeriodEndsAt: Date | null
}

/** L'adhésion en cours d'un apprenant à une communauté, close ou non. */
export async function getMembership(
  communityId: string,
  learnerId: string,
): Promise<MembershipView | null> {
  const sub = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: 'desc' },
  })
  if (!sub) return null

  // L'échéance due est le `Purchase` PENDING de la communauté : le
  // renouvellement en ouvre un par période, et l'index unique partiel garantit
  // qu'il n'y en a jamais deux.
  const due = sub.status === 'PAST_DUE'
    ? await db.purchase.findFirst({
        where: { learnerId, communityId, providerStatus: 'PENDING' },
        select: { id: true, amountFcfa: true },
      })
    : null

  return {
    id: sub.id,
    communityId: sub.communityId,
    status: sub.status,
    periodStart: sub.periodStart,
    periodEnd: sub.periodEnd,
    canceledAt: sub.canceledAt,
    bannedAt: sub.bannedAt,
    dueAmountFcfa: due?.amountFcfa ?? null,
    duePurchaseId: due?.id ?? null,
    // Le sursis court depuis la fin du dernier mois réglé — c'est-à-dire le
    // début du mois impayé.
    gracePeriodEndsAt: sub.status === 'PAST_DUE'
      ? new Date(sub.periodEnd.getTime() + MEMBERSHIP_GRACE_DAYS * DAY_MS)
      : null,
  }
}

export interface MyCommunity {
  subscriptionId: string
  status: CommunitySubscriptionStatus
  periodEnd: Date
  canceledAt: Date | null
  community: {
    id: string
    slug: string
    name: string
    coverS3Key: string | null
    /** La photo de groupe — second choix de la vignette de l'accueil. */
    avatarS3Key: string | null
    priceFcfa: number
    membersCount: number
    /** Une adhésion peut très bien porter sur une communauté privée. */
    visibility: CommunityVisibility
    trainerName: string | null
    /** Le compte du formateur, pour la photo que la carte pose en tÃªte. */
    trainerUserId: string
    trainerAvatarS3Key: string | null
    /** L'adresse externe de sa photo, quand il n'en a pas déposé. */
    trainerAvatarUrl: string | null
  }
}

/**
 * Les communautés dont l'apprenant est membre à cet instant. Les adhésions
 * closes n'y figurent pas : elles laissent un accès résiduel aux ressources
 * (arbitrage 48), pas une place dans la communauté.
 */
export async function listMyMemberships(learnerId: string): Promise<MyCommunity[]> {
  const subs = await db.communitySubscription.findMany({
    where: { learnerId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, status: true, periodEnd: true, canceledAt: true,
      community: {
        select: {
          id: true, slug: true, name: true, coverS3Key: true, avatarS3Key: true, priceFcfa: true,
          membersCount: true, visibility: true,
          trainerProfile: {
            select: {
              userId: true,
              user: { select: { fullName: true, avatarS3Key: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  })

  return subs.map((s) => ({
    subscriptionId: s.id,
    status: s.status,
    periodEnd: s.periodEnd,
    canceledAt: s.canceledAt,
    community: {
      id: s.community.id,
      slug: s.community.slug,
      name: s.community.name,
      coverS3Key: s.community.coverS3Key,
      avatarS3Key: s.community.avatarS3Key,
      priceFcfa: s.community.priceFcfa,
      membersCount: s.community.membersCount,
      visibility: s.community.visibility,
      trainerName: s.community.trainerProfile.user.fullName,
      trainerUserId: s.community.trainerProfile.userId,
      trainerAvatarS3Key: s.community.trainerProfile.user.avatarS3Key,
      trainerAvatarUrl: s.community.trainerProfile.user.avatarUrl,
    },
  }))
}

/** Membre à part entière — la lecture est ouverte, la parole se décide ailleurs. */
export async function isMember(communityId: string, learnerId: string): Promise<boolean> {
  const count = await db.communitySubscription.count({
    where: { communityId, learnerId, status: { in: OPEN_STATUSES } },
  })
  return count > 0
}

// --- Adhérer, ou régler une échéance ---

export interface MembershipPaymentIntent {
  purchaseId: string
  providerTransactionId: string
  provider: PaymentProvider
  /** Stripe : à remettre au composant de paiement côté navigateur. */
  redirectUrl?: string
  /** Ce que l'écran doit demander ensuite : le téléphone, la carte, ou rien. */
  nextStep: OpenPaymentResult['nextStep']
  amountFcfa: number
  periodStart: Date
  periodEnd: Date
  /** `DUE` règle une période déjà ouverte, `JOIN` en ouvre une première. */
  kind: 'JOIN' | 'DUE'
}

/**
 * Ouvre le paiement d'une adhésion — première ou renouvellement. Ne crée aucune
 * souscription : elle naîtra du webhook, quand le paiement sera confirmé.
 *
 * Réentrant à dessein : rappelée avec un paiement déjà en attente, elle rend le
 * même, sans en créer un second. C'est le comportement de `initiatePurchase`,
 * et la raison d'être de l'index `purchases_pending_community_unique`.
 */
export async function initiateMembershipPayment(
  communityId: string,
  learnerId: string,
  provider: PaymentProvider,
  /**
   * Invitation payante déjà validée par `resolveInvitationForTunnel`. Elle est
   * seulement **portée** par l'achat : rien n'est consommé ici (arbitrage 78),
   * un tunnel abandonné laisse l'invitation utilisable.
   */
  invitationId?: string | null,
  /** Obligatoire pour PawaPay : le mobile money désigne un numéro, pas un compte. */
  payer?: MobileMoneyPayer,
): Promise<MembershipPaymentIntent> {
  const community = await db.community.findFirst({
    where: { id: communityId, status: 'active' },
    select: {
      id: true, priceFcfa: true, commissionRate: true, trainerId: true,
      trainerProfile: { select: { userId: true, subscriptionStatus: true, suspendedAt: true } },
    },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  // Un compte d'administration n'adhère à aucune communauté : celui qui
  // tranche les litiges et libère les retraits n'a rien à faire dans le salon
  // d'un formateur qu'il aura peut-être à juger.
  await assertCanActAsLearner(learnerId)

  // Le formateur anime sa communauté, il n'y adhère pas : s'y abonner lui
  // ferait payer une commission sur son propre argent. Il reste en revanche
  // libre d'adhérer à CELLES DES AUTRES — un formateur garde tous les
  // privilèges de l'apprenant.
  if (community.trainerProfile.userId === learnerId) throw new Error('CANNOT_JOIN_OWN_COMMUNITY')

  // Un paiement déjà ouvert prime sur tout le reste — mais seulement s'il a été
  // ouvert avec le moyen que l'apprenant vient de choisir. Rendre l'ancien quel
  // qu'il soit, ce que faisait cette branche, transformait une carte abandonnée
  // en impasse définitive : le mobile money renvoyait cette même carte morte, et
  // les deux moyens paraissaient en panne. Constaté le 9 août 2026 sur une
  // adhésion restée en attente dix-huit heures.
  // Borne du contrôle qui suit l'insertion : seul un règlement postérieur à nos
  // lectures peut nous avoir échappé.
  const readAt = new Date()
  const pending = await db.purchase.findFirst({
    where: { learnerId, communityId, providerStatus: 'PENDING' },
    select: {
      id: true, providerTransactionId: true, provider: true, amountFcfa: true,
      periodStart: true, periodEnd: true, acquisitionSource: true, updatedAt: true,
    },
  })

  // L'échéance ouverte par le renouvellement, que personne n'a encore tenté de
  // régler : elle porte le montant figé (décision 57) mais aucune transaction.
  // On l'ouvre chez le fournisseur choisi, sur cette même ligne.
  //
  // Deux onglets peuvent cliquer ensemble : la ligne se réclame d'abord, par une
  // écriture conditionnée à l'état lu. Le perdant attend la transaction du
  // gagnant, comme au double clic de l'adhésion. Il ne doit surtout pas
  // retomber sur la création plus bas : si le gagnant est déjà réglé, l'index
  // unique — partiel, sur `PENDING` — ne l'arrête plus, et le même mois se
  // paierait deux fois.
  // Une ligne sans transaction qui n'est pas une échéance est, elle, une
  // ouverture en vol : elle appartient à l'onglet qui l'a créée.
  if (
    pending && !pending.providerTransactionId && pending.acquisitionSource === RENEWAL_SOURCE
    && pending.periodStart && pending.periodEnd
  ) {
    const claimed = await db.purchase.updateMany({
      where: {
        id: pending.id, providerStatus: 'PENDING', providerTransactionId: null,
        updatedAt: pending.updatedAt,
      },
      data: { provider, updatedAt: new Date() },
    })
    if (claimed.count === 1) {
      const payerCountry = await db.user.findUnique({
        where: { id: learnerId },
        select: { countryCode: true },
      })
      // Un échec d'ouverture (opérateur refusé, numéro manquant) laisse
      // l'échéance intacte et sans transaction : le clic suivant la réclame à
      // nouveau. L'annuler, comme le fait l'ouverture nominale, effacerait le
      // montant dû que l'espace membre affiche.
      const opened = await openProviderPayment({
        subject: purchaseSubject(pending.id),
        provider,
        amountFcfa: pending.amountFcfa,
        label: 'Adhesion NKAMVA',
        learnerId,
        countryCode: payerCountry?.countryCode ?? null,
        payer,
      })
      return {
        purchaseId: pending.id,
        providerTransactionId: opened.providerTransactionId,
        redirectUrl: opened.redirectUrl,
        provider,
        nextStep: opened.nextStep,
        amountFcfa: pending.amountFcfa,
        periodStart: pending.periodStart,
        periodEnd: pending.periodEnd,
        kind: 'DUE',
      }
    }
    return followWinningAttempt(learnerId, communityId, 'DUE')
  }
  if (pending?.providerTransactionId && pending.periodStart && pending.periodEnd) {
    if (pending.provider === provider && resumableAsIs(provider)) {
      return {
        purchaseId: pending.id,
        providerTransactionId: pending.providerTransactionId,
        provider: pending.provider,
        nextStep: 'CONFIRM_ON_PHONE',
        amountFcfa: pending.amountFcfa,
        periodStart: pending.periodStart,
        periodEnd: pending.periodEnd,
        kind: 'DUE',
      }
    }
    // Changement de moyen : `switchPendingProvider` refuse tant que l'ancienne
    // transaction peut encore aboutir — deux paiements ouverts sur la même
    // échéance débiteraient deux fois.
    const { freed, outcome } = await freePendingAttempt(
      { id: pending.id, provider: pending.provider, providerTransactionId: pending.providerTransactionId },
      provider,
    )
    if (!freed) {
      if (outcome === 'SETTLED') {
        await reconcilePurchase(pending.providerTransactionId)
        throw new Error('ALREADY_MEMBER')
      }
      throw new Error('PAYMENT_IN_PROGRESS')
    }

    // La ligne d'échéance existe déjà : on rouvre le paiement dessus. Laisser
    // filer vers le `purchase.create` plus bas buterait sur l'index unique de
    // l'échéance en cours, et l'apprenant verrait une panne là où il vient
    // simplement de changer d'avis.
    const payerCountry = await db.user.findUnique({
      where: { id: learnerId },
      select: { countryCode: true },
    })
    const reopened = await openProviderPayment({
      subject: purchaseSubject(pending.id),
      provider,
      amountFcfa: pending.amountFcfa,
      // Même libellé que l'ouverture nominale plus bas : c'est ce que
      // l'apprenant lit sur son téléphone, il ne doit pas changer selon le
      // chemin emprunté.
      label: 'Adhesion NKAMVA',
      learnerId,
      countryCode: payerCountry?.countryCode ?? null,
      payer,
    })
    return {
      purchaseId: pending.id,
      providerTransactionId: reopened.providerTransactionId,
      redirectUrl: reopened.redirectUrl,
      provider,
      nextStep: reopened.nextStep,
      amountFcfa: pending.amountFcfa,
      periodStart: pending.periodStart,
      periodEnd: pending.periodEnd,
      kind: 'DUE',
    }
  }

  const learner = await db.user.findUnique({
    where: { id: learnerId },
    select: { countryCode: true },
  })

  const open = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: { in: OPEN_STATUSES } },
    select: { id: true, status: true, periodStart: true, periodEnd: true },
  })
  if (open && open.status !== 'PAST_DUE') throw new Error('ALREADY_MEMBER')

  // Le bannissement survit à la fin de la période (M4) : sans ce contrôle, la
  // personne bannie, fermée en `EXPIRED` par le renouvellement, réadhérait et
  // payait dans la minute. Seul le formateur lève la sanction.
  if (!open && (await isBannedFromCommunity(communityId, learnerId))) {
    throw new Error('MEMBERSHIP_BANNED')
  }

  // Un formateur suspendu n'accueille plus personne (M3, `trainerAcceptsMembers`).
  // Seule l'entrée est fermée : le membre en impayé règle toujours son mois, il
  // ne fait que garder ce qu'il a déjà.
  if (!open && !trainerAcceptsMembers(community.trainerProfile)) {
    throw new Error('COMMUNITY_CLOSED_TO_NEW_MEMBERS')
  }

  const now = new Date()
  // Une adhésion en impayé règle **le mois déjà entamé**, celui qui court
  // depuis la fin du dernier mois réglé. Le payer en retard ne le décale pas :
  // sans quoi traîner offrirait un mois glissant.
  const periodStart = open ? open.periodEnd : now
  const periodEnd = periodEndFor(periodStart)

  const amountFcfa = community.priceFcfa
  const trainerShareFcfa = Math.round(amountFcfa * (1 - community.commissionRate))

  let purchase
  try {
    purchase = await db.purchase.create({
      data: {
        learnerId,
        trainerId: community.trainerId,
        communityId,
        amountFcfa,
        commissionRate: community.commissionRate,
        trainerShareFcfa,
        platformShareFcfa: amountFcfa - trainerShareFcfa,
        provider,
        providerStatus: 'PENDING',
        periodStart,
        periodEnd,
        invitationId: invitationId ?? null,
        // Le champ existait depuis le Lot 0 et n'était alimenté par personne.
        acquisitionSource: invitationId ? 'INVITATION' : null,
      },
    })
  } catch (err: unknown) {
    // Deux onglets, deux clics : l'index tranche, le perdant retombe sur le
    // paiement du gagnant plutôt que d'en ouvrir un second.
    if ((err as { code?: string })?.code !== 'P2002') throw err

    return followWinningAttempt(learnerId, communityId, open ? 'DUE' : 'JOIN')
  }

  // L'index ne tranche qu'entre deux lignes `PENDING`. Si l'autre clic a été
  // réglé entre nos lectures et notre insertion — règlement immédiat, en
  // simulation comme en mobile money instantané —, son achat n'est déjà plus
  // `PENDING` et le nôtre passe : le même mois se paierait deux fois. Vérifié
  // après l'insertion, l'écart se referme : un gagnant encore `PENDING` nous
  // aurait bloqués à l'index, un gagnant réglé est visible ici.
  //
  // Seul compte un règlement **survenu depuis nos lectures** (`updatedAt`). Un
  // achat réglé plus tôt sur une période qui court encore n'est pas un double
  // clic : c'est l'ancien membre que la levée d'un bannissement après
  // résiliation a fermé en `EXPIRED`, et qui a le droit de revenir.
  const settledMeanwhile = await db.purchase.findFirst({
    where: {
      id: { not: purchase.id }, learnerId, communityId, providerStatus: 'SUCCEEDED',
      periodStart: { lt: periodEnd }, periodEnd: { gt: periodStart },
      updatedAt: { gte: readAt },
    },
    select: { id: true },
  })
  if (settledMeanwhile) {
    // Supprimée, pas annulée : jamais ouverte chez un fournisseur ni auditée,
    // elle n'a rien à raconter. Annulée, elle s'afficherait dans l'historique
    // de l'apprenant comme un paiement qu'il n'a jamais tenté.
    await db.purchase.deleteMany({ where: { id: purchase.id, providerStatus: 'PENDING' } })
    return followWinningAttempt(learnerId, communityId, open ? 'DUE' : 'JOIN')
  }

  await auditStandalone({
    actorId: learnerId, actorRole: 'LEARNER',
    action: 'MEMBERSHIP_PAYMENT_INITIATED', targetType: 'Community', targetId: communityId,
    meta: {
      purchaseId: purchase.id, amountFcfa, provider,
      periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(),
      kind: open ? 'DUE' : 'JOIN',
    },
  })

  // Même porte que l'achat à l'unité : l'adhésion n'a pas son propre chemin
  // vers le fournisseur, sinon le jour où l'un est corrigé l'autre reste faux.
  let opened
  try {
    opened = await openProviderPayment({
      subject: purchaseSubject(purchase.id),
      provider,
      amountFcfa,
      label: 'Adhesion NKAMVA',
      learnerId,
      countryCode: learner?.countryCode ?? null,
      payer,
    })
  } catch (err) {
    await db.purchase.updateMany({
      where: { id: purchase.id, providerStatus: 'PENDING' },
      data: { providerStatus: 'CANCELED' },
    })
    throw err
  }

  return {
    purchaseId: purchase.id,
    providerTransactionId: opened.providerTransactionId,
    redirectUrl: opened.redirectUrl,
    nextStep: opened.nextStep,
    provider,
    amountFcfa,
    periodStart,
    periodEnd,
    kind: open ? 'DUE' : 'JOIN',
  }
}

/**
 * Le perdant d'une course entre deux clics rejoint le paiement du gagnant
 * plutôt que d'en ouvrir un second. Deux chemins y mènent : l'index unique qui
 * refuse une seconde ligne en attente, et l'échéance de renouvellement déjà
 * réclamée par l'autre onglet.
 */
async function followWinningAttempt(
  learnerId: string,
  communityId: string,
  kind: 'JOIN' | 'DUE',
): Promise<MembershipPaymentIntent> {
  // Sans filtre de statut, à dessein. L'index unique est **partiel** : il ne
  // couvre que `PENDING`, donc il tranche au moment du conflit — mais le
  // gagnant peut avoir été réglé dans l'intervalle, et il l'est
  // systématiquement quand le règlement est immédiat (simulation, mobile
  // money instantané). Chercher `providerStatus: 'PENDING'` ne rendait alors
  // rien, et le perdant recevait une erreur là où l'accès venait justement de
  // s'ouvrir pour lui. `initiatePurchase` prenait déjà les deux statuts sur le
  // chemin des ressources ; c'est ici que la règle manquait.
  // Le gagnant peut exister **sans encore porter son identifiant de
  // transaction** : il est écrit après l'aller-retour chez le fournisseur, et
  // la fenêtre entre les deux est exactement celle où le perdant arrive ici.
  // Une lecture unique y trouvait une ligne inexploitable et relançait
  // l'erreur Prisma brute — un 500 pour un double clic.
  //
  // On laisse donc au gagnant le temps d'écrire, brièvement et un nombre borné
  // de fois. Attendre indéfiniment transformerait un double clic en requête
  // suspendue ; ne pas attendre du tout rend le rattrapage inutile la moitié
  // du temps.
  let winner = null as Awaited<ReturnType<typeof db.purchase.findFirst>>
  for (let essai = 0; essai < 10; essai++) {
    winner = await db.purchase.findFirst({
      where: { learnerId, communityId, providerStatus: { in: ['PENDING', 'SUCCEEDED'] } },
      orderBy: { createdAt: 'desc' },
    })
    if (winner?.providerTransactionId) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  // Toujours rien après une seconde : le gagnant a probablement échoué chez le
  // fournisseur. Le dire plutôt que de laisser filer une erreur de base.
  if (!winner?.providerTransactionId) throw new Error('PAYMENT_IN_PROGRESS')

  // Déjà payé pendant que ce second onglet cliquait : il n'y a rien à
  // reprendre, l'adhésion existe. On le dit plutôt que de rouvrir un tunnel.
  if (winner.providerStatus === 'SUCCEEDED') {
    return {
      purchaseId: winner.id,
      providerTransactionId: winner.providerTransactionId,
      provider: winner.provider,
      nextStep: 'ALREADY_SETTLED',
      amountFcfa: winner.amountFcfa,
      periodStart: winner.periodStart!,
      periodEnd: winner.periodEnd!,
      kind,
    }
  }
  // L'URL de la session appartient à l'onglet gagnant, peut-être déjà parti
  // chez Stripe. Même règle que dans `initiatePurchase`.
  if (isCheckoutSession(winner.providerTransactionId)) {
    throw new Error('PAYMENT_IN_PROGRESS')
  }
  return {
    purchaseId: winner.id,
    providerTransactionId: winner.providerTransactionId,
    provider: winner.provider,
    nextStep: winner.provider === 'PAWAPAY' ? 'CONFIRM_ON_PHONE' : 'ALREADY_SETTLED',
    amountFcfa: winner.amountFcfa,
    periodStart: winner.periodStart!,
    periodEnd: winner.periodEnd!,
    kind,
  }
}

// --- Activation, depuis le webhook uniquement ---

export interface MembershipActivation {
  activated: boolean
  subscriptionId: string | null
  isNew: boolean
}

/**
 * Fait exister — ou prolonge — l'adhésion que le paiement vient de confirmer.
 *
 * Appelée depuis `creditWalletOnPurchase`, donc dans la transaction du webhook :
 * le crédit du formateur et l'ouverture de l'accès tombent ensemble ou pas du
 * tout. Un achat de ressource passe ici sans rien faire.
 */
export async function activateMembershipForPurchase(
  tx: PrismaTransaction,
  purchaseId: string,
): Promise<MembershipActivation> {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true, learnerId: true, communityId: true, provider: true,
      periodStart: true, periodEnd: true, invitationId: true,
    },
  })
  const idle = { activated: false, subscriptionId: null, isNew: false }
  if (!purchase?.communityId || !purchase.periodStart || !purchase.periodEnd) return idle

  const existing = await tx.communitySubscription.findFirst({
    where: {
      communityId: purchase.communityId,
      learnerId: purchase.learnerId,
      status: { in: OPEN_STATUSES },
    },
    select: { id: true, status: true },
  })

  if (existing) {
    await tx.communitySubscription.update({
      where: { id: existing.id },
      data: {
        // Régler son dû ne lève pas un bannissement : ce sont deux décisions
        // distinctes, l'une comptable, l'autre de modération (arbitrage 40).
        status: existing.status === 'BANNED' ? 'BANNED' : 'ACTIVE',
        // `periodStart` n'est pas touché : il date l'entrée dans la communauté
        // et fonde l'accès résiduel de l'arbitrage 48. Seul le terme avance.
        periodEnd: purchase.periodEnd,
      },
    })
    await audit(tx, {
      actorId: purchase.learnerId, actorRole: 'LEARNER',
      action: 'MEMBERSHIP_RENEWED', targetType: 'CommunitySubscription', targetId: existing.id,
      meta: {
        communityId: purchase.communityId, purchaseId: purchase.id,
        periodEnd: purchase.periodEnd.toISOString(),
      },
    })
    return { activated: true, subscriptionId: existing.id, isNew: false }
  }

  // L'invitation payante se consomme **ici**, et nulle part ailleurs : dans la
  // transaction du webhook, au moment où l'adhésion existe pour de bon
  // (arbitrage 78). Un renouvellement ne passe pas par cette branche, il n'y a
  // donc aucun risque de décompter deux fois la même invitation.
  if (purchase.invitationId) {
    await consumeInvitationForPurchase(tx, purchase.invitationId, purchase.learnerId)
  }

  const sub = await tx.communitySubscription.create({
    data: {
      communityId: purchase.communityId,
      learnerId: purchase.learnerId,
      status: 'ACTIVE',
      periodStart: purchase.periodStart,
      periodEnd: purchase.periodEnd,
      provider: purchase.provider,
      purchaseId: purchase.id,
      invitationId: purchase.invitationId,
    },
  })

  // Le compteur suit les adhésions ouvertes. Recompté, et non incrémenté :
  // voir `recountCommunityMembers`. Un `+1` survit mal à un webhook rejoué, et
  // il ne répare jamais une ligne qu'un autre chemin a laissée fausse.
  await recountCommunityMembers(tx, purchase.communityId)

  await audit(tx, {
    actorId: purchase.learnerId, actorRole: 'LEARNER',
    action: 'MEMBERSHIP_STARTED', targetType: 'CommunitySubscription', targetId: sub.id,
    meta: {
      communityId: purchase.communityId, purchaseId: purchase.id,
      periodEnd: purchase.periodEnd.toISOString(),
      invitationId: purchase.invitationId,
    },
  })

  return { activated: true, subscriptionId: sub.id, isNew: true }
}

// --- Résilier, revenir sur sa résiliation ---

/**
 * Résilie sans rien couper : l'adhésion court jusqu'au terme déjà payé, puis ne
 * se renouvelle pas. « Résiliable à tout moment » ne veut pas dire « remboursé
 * au prorata » — le mois entamé reste dû, et reste servi.
 */
export async function cancelMembership(communityId: string, learnerId: string) {
  const sub = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: { in: OPEN_STATUSES } },
    select: { id: true, status: true, canceledAt: true, periodEnd: true },
  })
  if (!sub) throw new Error('MEMBERSHIP_NOT_FOUND')
  if (sub.canceledAt) throw new Error('MEMBERSHIP_ALREADY_CANCELED')

  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.communitySubscription.update({
      where: { id: sub.id },
      data: { canceledAt: now },
      select: { id: true, canceledAt: true, periodEnd: true, status: true },
    })
    await audit(tx, {
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'MEMBERSHIP_CANCELED', targetType: 'CommunitySubscription', targetId: sub.id,
      meta: { communityId, effectiveAt: sub.periodEnd.toISOString() },
    })
    return result
  })

  return updated
}

/** Revient sur une résiliation, tant que la période court encore. */
export async function resumeMembership(communityId: string, learnerId: string) {
  const sub = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: { in: OPEN_STATUSES } },
    select: { id: true, canceledAt: true },
  })
  if (!sub) throw new Error('MEMBERSHIP_NOT_FOUND')
  if (!sub.canceledAt) throw new Error('MEMBERSHIP_NOT_CANCELED')

  return db.$transaction(async (tx) => {
    const result = await tx.communitySubscription.update({
      where: { id: sub.id },
      data: { canceledAt: null },
      select: { id: true, canceledAt: true, periodEnd: true, status: true },
    })
    await audit(tx, {
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'MEMBERSHIP_RESUMED', targetType: 'CommunitySubscription', targetId: sub.id,
      meta: { communityId },
    })
    return result
  })
}

// --- Cycle de vie (jobs planifiés) ---

export interface MembershipRenewalResult {
  /** Périodes ouvertes en attente de règlement. */
  due: number
  /** Adhésions arrivées au terme après résiliation. */
  ended: number
  /** Adhésions closes faute de communauté encore ouverte, ou après bannissement. */
  closed: number
}

/**
 * Ouvre la période suivante des adhésions arrivées à échéance.
 *
 * Idempotent par avancement : la souscription traitée voit son `periodEnd`
 * repoussé et son statut passer à `PAST_DUE`, elle sort donc du filtre. Rejouer
 * le tour ne facture pas deux fois — et l'index unique partiel sur les achats
 * en attente le garantit même si le filtre était pris en défaut.
 */
export async function renewDueMemberships(now = new Date()): Promise<MembershipRenewalResult> {
  const result: MembershipRenewalResult = { due: 0, ended: 0, closed: 0 }

  const expiring = await db.communitySubscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'BANNED'] },
      periodEnd: { lte: now },
      // Un compte effacé n'est plus prélevé. `deletedAt` et non
      // `deletionRequestedAt` : pendant le délai de grâce la personne est
      // encore cliente, elle a payé sa période et peut encore annuler son
      // départ. C'est l'anonymisation qui met fin à la relation — sans ce
      // filtre, le job rouvrait chaque mois une échéance au nom de quelqu'un
      // qui n'existe plus, et tentait de la prélever.
      learner: { deletedAt: null },
    },
    select: {
      id: true, learnerId: true, communityId: true, status: true,
      canceledAt: true, periodEnd: true, provider: true,
      community: {
        select: {
          id: true, name: true, slug: true, status: true,
          priceFcfa: true, priceChangedAt: true, commissionRate: true, trainerId: true,
          trainerProfile: { select: { subscriptionStatus: true, suspendedAt: true } },
        },
      },
    },
  })

  for (const sub of expiring) {
    // L'adhésion offerte est traitée à part, et **avant** tout le reste
    // (arbitrage 77). `provider` nul en est la définition : personne n'y a
    // jamais attaché de moyen de paiement, il n'y a donc rien avec quoi la
    // reconduire. Sortir ce cas d'abord donne aussi à TypeScript le
    // rétrécissement dont il a besoin — la suite recopie `sub.provider` sur
    // l'achat du renouvellement, où un `null` serait une facture adressée à
    // quelqu'un qui n'a jamais rien acheté.
    const provider = sub.provider
    if (provider === null) {
      await closeMembership(sub.id, sub.communityId, 'EXPIRED', {
        learnerId: sub.learnerId, reason: 'GIFT_ENDED', communityName: sub.community.name,
      })
      result.closed += 1
      continue
    }

    // Trois raisons de ne pas renouveler, et une seule de renouveler.
    //
    // Le membre banni n'est pas reconduit : lui prélever un mois de plus dans
    // une communauté dont on l'a écarté de la parole serait indéfendable.
    // ⚠️ Choix par défaut, non arbitré — l'arbitrage 40 dit ce qu'est le
    // bannissement, pas ce qu'il advient de la facturation.
    //
    // Le formateur suspendu ou parti n'anime plus rien : il ne publie plus, ne
    // programme plus de direct, et la correction M3 lui interdit déjà
    // d'accueillir quiconque. Facturer ses membres chaque mois pour un salon à
    // l'arrêt était le cas inverse, resté ouvert (audit du 28 octobre 2026,
    // A4). L'adhésion se clôt au terme de la période payée, sans rien prélever.
    const reason =
      sub.canceledAt ? 'CANCELED'
      : sub.community.status !== 'active' ? 'COMMUNITY_CLOSED'
      : sub.status === 'BANNED' ? 'BANNED'
      : !trainerAcceptsMembers(sub.community.trainerProfile) ? 'TRAINER_INACTIVE'
      : null

    if (reason) {
      await closeMembership(sub.id, sub.communityId, reason === 'CANCELED' ? 'CANCELED' : 'EXPIRED', {
        learnerId: sub.learnerId, reason, communityName: sub.community.name,
      })
      if (reason === 'CANCELED') result.ended += 1
      else result.closed += 1
      continue
    }

    const periodStart = sub.periodEnd
    const periodEnd = periodEndFor(periodStart)
    const amountFcfa = await renewalAmount(sub)
    const trainerShareFcfa = Math.round(amountFcfa * (1 - sub.community.commissionRate))

    try {
      await db.$transaction(async (tx) => {
        // Le montant est figé à l'ouverture de la période (décision 57) : un
        // changement de prix de la communauté ne réécrit pas une échéance déjà
        // ouverte.
        await tx.purchase.create({
          data: {
            learnerId: sub.learnerId,
            trainerId: sub.community.trainerId,
            communityId: sub.communityId,
            amountFcfa,
            commissionRate: sub.community.commissionRate,
            trainerShareFcfa,
            platformShareFcfa: amountFcfa - trainerShareFcfa,
            // Le moyen de la période précédente, à titre indicatif : l'apprenant
            // choisit le sien au règlement, et `initiateMembershipPayment` le
            // réécrit.
            provider,
            // Aucun identifiant de transaction : rien n'a été envoyé au
            // fournisseur, et rien ne doit le prétendre. Un `cp_<uuid>` inventé
            // ici passait pour un paiement en attente « reprenable tel quel » —
            // l'apprenant cliquait « Régler », rien n'arrivait sur son
            // téléphone, et l'adhésion expirait impayée (campagne du
            // 12 octobre 2026, B1). La transaction naît au clic, sur cette ligne.
            providerStatus: 'PENDING',
            acquisitionSource: RENEWAL_SOURCE,
            periodStart,
            periodEnd,
          },
        })

        // Seul le statut bascule. Les bornes de la souscription continuent de
        // décrire ce qui a été **payé** : les avancer sur un mois non réglé
        // ferait croire à un accès acquis, et le sursis n'aurait plus d'origine
        // datée.
        await tx.communitySubscription.update({
          where: { id: sub.id },
          data: { status: 'PAST_DUE' },
        })

        await audit(tx, {
          actorId: null, actorRole: 'SYSTEM',
          action: 'MEMBERSHIP_PERIOD_DUE', targetType: 'CommunitySubscription', targetId: sub.id,
          meta: {
            communityId: sub.communityId, amountFcfa,
            periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(),
          },
        })
      })
    } catch (err) {
      // Une échéance déjà ouverte : le job a été rejoué. C'est exactement ce que
      // l'unicité doit produire, pas une erreur.
      if (String(err).includes('Unique constraint')) continue
      throw err
    }

    result.due += 1

    await deliverSideEffects('MEMBERSHIP_DUE', { type: 'CommunitySubscription', id: sub.id }, () =>
      notify(sub.learnerId, {
        type: 'MEMBERSHIP_PAYMENT_DUE',
        title: `Votre adhésion à ${sub.community.name} est à régler`,
        body: `${fmtFcfa(amountFcfa)} pour le mois en cours. Sans règlement sous ${MEMBERSHIP_GRACE_DAYS} jours, votre adhésion prendra fin.`,
        link: `/communautes/${sub.community.slug}`,
      }),
    )
  }

  return result
}

/**
 * Met fin aux adhésions dont l'échéance reste impayée au terme du délai de
 * grâce. Le décompte court depuis la fin du dernier mois réglé — donc depuis
 * l'ouverture du mois impayé —, pas depuis le passage du job : celui-ci peut
 * prendre du retard sans allonger le sursis de personne.
 */
export async function expireOverdueMemberships(now = new Date()): Promise<{ expired: number }> {
  const deadline = new Date(now.getTime() - MEMBERSHIP_GRACE_DAYS * DAY_MS)

  const overdue = await db.communitySubscription.findMany({
    where: { status: 'PAST_DUE', periodEnd: { lte: deadline } },
    select: {
      id: true, learnerId: true, communityId: true,
      community: { select: { name: true } },
    },
  })

  for (const sub of overdue) {
    await closeMembership(sub.id, sub.communityId, 'EXPIRED', {
      learnerId: sub.learnerId, reason: 'UNPAID', communityName: sub.community.name,
    })
  }

  return { expired: overdue.length }
}

/**
 * Ferme une adhésion : statut terminal, compteur de membres décrémenté, et
 * l'échéance restée en attente marquée annulée — un paiement mobile money
 * arrivé après coup ne doit pas ressusciter une adhésion close en silence.
 *
 * L'accès résiduel aux ressources n'est **pas** retiré : il se calcule sur le
 * chevauchement des périodes (arbitrage 48), et cette ligne close en fait
 * toujours partie.
 */
async function closeMembership(
  subscriptionId: string,
  communityId: string,
  status: 'CANCELED' | 'EXPIRED',
  context: { learnerId: string; reason: string; communityName: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.communitySubscription.update({
      where: { id: subscriptionId },
      data: { status },
    })

    await tx.purchase.updateMany({
      where: { learnerId: context.learnerId, communityId, providerStatus: 'PENDING' },
      data: { providerStatus: 'CANCELED' },
    })

    // Recompté, et non décrémenté. Le `-1` avait besoin d'un plancher à zéro
    // pour ne pas afficher un nombre de membres négatif sur la fiche publique :
    // ce plancher était l'aveu que le compteur pouvait déjà être faux. Un
    // recompte n'a pas besoin de plancher, et répare la ligne au passage.
    await recountCommunityMembers(tx, communityId)

    await audit(tx, {
      actorId: null, actorRole: 'SYSTEM',
      action: 'MEMBERSHIP_ENDED', targetType: 'CommunitySubscription', targetId: subscriptionId,
      meta: { communityId, status, reason: context.reason },
    })
  })

  await deliverSideEffects(
    'MEMBERSHIP_ENDED',
    { type: 'CommunitySubscription', id: subscriptionId },
    () =>
      notify(context.learnerId, {
        type: 'MEMBERSHIP_ENDED',
        title:
          context.reason === 'GIFT_ENDED'
            ? `Vos mois offerts dans ${context.communityName} sont terminés`
            : `Votre adhésion à ${context.communityName} a pris fin`,
        body:
          context.reason === 'TRAINER_INACTIVE'
            ? "Le formateur n'anime plus cette communauté pour le moment : rien ne vous a été prélevé et rien ne le sera. Vous gardez l'accès aux ressources reçues pendant votre adhésion, et pourrez la rejoindre de nouveau quand elle reprendra."
            : context.reason === 'UNPAID'
            ? 'L\'échéance est restée impayée. Vous gardez l\'accès aux ressources reçues pendant votre adhésion, et pouvez revenir quand vous le souhaitez.'
            // L'invité n'a jamais donné de moyen de paiement : rien ne lui a été
            // prélevé et rien ne le sera (arbitrage 77). Le dire noir sur blanc
            // vaut mieux que de le laisser le déduire.
            : context.reason === 'GIFT_ENDED'
            ? 'Rien ne vous a été prélevé et rien ne le sera : une adhésion offerte ne se reconduit pas. Vous gardez l\'accès aux ressources reçues pendant ces mois, et pouvez rejoindre la communauté quand vous le souhaitez.'
            : 'Vous gardez l\'accès aux ressources reçues pendant votre adhésion, et pouvez revenir quand vous le souhaitez.',
        link: '/mes-communautes',
      }),
  )
}
