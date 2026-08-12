// ==========================================================================
// Cycle de vie de l'abonnement formateur — décisions 52, 56, 61, 68
// ==========================================================================
// Le tarif posé par le Super-admin (décisions 59, 64) ne servait à rien tant
// que rien ne le consommait. C'est ce module qui le consomme.
//
// Trois règles gouvernent tout ce qui suit :
//
// 1. **La bascule prend effet à l'échéance de chacun** (décision 61) : aucun
//    prorata, personne n'est débité par surprise, et la transition s'étale sur
//    un cycle complet — un formateur en annuel gratuit ne paiera pas avant
//    douze mois.
// 2. **Le montant est figé à l'ouverture de la période** (décision 57) : le
//    tarif change, une période déjà ouverte ne change pas avec lui.
// 3. **L'impayé bloque l'écriture et retire du catalogue, jamais la lecture**
//    (décision 68) : les apprenants continuent d'accéder à ce qu'ils ont payé.
//
// ⚠️ Ce module **n'encaisse rien**. Aucun provider d'abonnement n'est branché :
// `subscriptionProvider` et `subscriptionProviderId` restent nuls. Une période
// due reste `DUE` jusqu'à ce qu'un règlement soit constaté — comme un retrait
// reste APPROVED jusqu'au versement.
// ==========================================================================

import type { PlanCadence } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { quotePrice, type PriceQuote } from './pricing'
import { fmtDate, fmtNumber } from './format'
import { storageChargeFor } from './storage-tiers'
import { issueInvoiceForSubscriptionCharge } from './invoices'
import { absoluteUrl, notify, notifyAdminSubRole, notifyWithEmail, deliverSideEffects } from './notification'
import type { PrismaTransaction } from './types'

/**
 * Délai laissé au formateur entre l'impayé constaté et la suspension.
 * ⚠️ Valeur retenue par défaut, **non arbitrée** : elle est ici pour être
 * discutée, pas pour être découverte au fond d'une condition.
 */
export const SUBSCRIPTION_GRACE_DAYS = 14

/** Fin de période à partir d'un début, selon la cadence. */
export function periodEndFor(start: Date, cadence: PlanCadence): Date {
  const end = new Date(start)
  if (cadence === 'YEARLY') end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + 1)
  return end
}

/**
 * Ouvre la première période d'un formateur. Appelée à l'approbation de sa
 * candidature, dans la même transaction que la création du profil : un
 * formateur sans période d'abonnement serait invisible du renouvellement.
 */
/**
 * Une première période **déjà encaissée**, avec les montants tels qu'ils ont
 * été annoncés au candidat et facturés.
 *
 * Ils ne sont pas recalculés à l'ouverture : la grille a pu changer entre le
 * moment où le paiement s'est ouvert et le retour du fournisseur. Ce qui est
 * inscrit doit être ce qui a été payé, sans quoi la comptabilité affiche une
 * période réglée pour un montant que personne n'a versé.
 */
export interface PrepaidFirstPeriod {
  listPriceFcfa: number
  discountFcfa: number
  discountLabel: string | null
  amountFcfa: number
  paidAt: Date
}

export async function openFirstPeriod(
  tx: PrismaTransaction,
  trainerProfileId: string,
  cadence: PlanCadence = 'MONTHLY',
  now = new Date(),
  prepaid: PrepaidFirstPeriod | null = null,
) {
  const quote = prepaid
    ? {
        listPriceFcfa: prepaid.listPriceFcfa,
        discountFcfa: prepaid.discountFcfa,
        discountLabel: prepaid.discountLabel,
        payableFcfa: prepaid.amountFcfa,
      }
    : await quotePrice(cadence, { trainerId: trainerProfileId, at: now })
  const periodEnd = periodEndFor(now, cadence)
  // Un formateur qui vient d'être approuvé n'a aucun palier : l'appel rend zéro.
  // Il est fait quand même, pour que l'ouverture et le renouvellement calculent
  // la même chose — une divergence entre les deux serait invisible longtemps.
  const storage = await storageChargeFor(trainerProfileId, cadence, now)

  await tx.subscriptionCharge.create({
    data: {
      trainerId: trainerProfileId,
      cadence,
      periodStart: now,
      periodEnd,
      listPriceFcfa: quote.listPriceFcfa,
      discountFcfa: quote.discountFcfa,
      discountLabel: quote.discountLabel,
      storageTiers: storage.tiers,
      storageFcfa: storage.amountFcfa,
      amountDueFcfa: quote.payableFcfa + storage.amountFcfa,
      // Trois cas, et non deux depuis que le premier abonnement se règle avant
      // l'ouverture de l'espace :
      // - déjà encaissé → SETTLED, avec la date du versement ;
      // - rien à payer → WAIVED. Une période à zéro n'est pas « due », elle est
      //   offerte : la distinguer évite qu'un job d'impayé s'acharne sur la
      //   cohorte de lancement ;
      // - sinon DUE. Le stockage entre dans ce total : un abonnement offert
      //   avec des paliers payants reste dû.
      status: prepaid ? 'SETTLED' : quote.payableFcfa + storage.amountFcfa === 0 ? 'WAIVED' : 'DUE',
      settledAt: prepaid ? prepaid.paidAt : quote.payableFcfa + storage.amountFcfa === 0 ? now : null,
    },
  })

  await tx.trainerProfile.update({
    where: { id: trainerProfileId },
    data: {
      subscriptionCadence: cadence,
      subscriptionCurrentPeriodEnd: periodEnd,
      subscriptionPriceFcfa: quote.payableFcfa,
      subscriptionDiscountFcfa: quote.discountFcfa,
    },
  })

  return { periodEnd, amountDueFcfa: quote.payableFcfa + storage.amountFcfa }
}

interface RenewalResult {
  renewed: number
  waived: number
  pastDue: number
  /** Périodes ouvertes au tarif précédent, en report d'une nouvelle grille. */
  deferred: number
  /** Profils antérieurs à la facturation, dotés d'une première période. */
  initialized: number
}

/**
 * Ouvre une première période aux formateurs qui n'en ont pas. Ce sont les
 * profils créés avant que la facturation existe : sans ce rattrapage, ils
 * resteraient **invisibles du renouvellement**, donc jamais facturés — et rien
 * ne le signalerait.
 *
 * Le rattrapage est comptabilisé à part dans le résultat du job : c'est une
 * anomalie qui se résorbe, pas un fonctionnement normal.
 */
async function initializeMissingPeriods(now: Date): Promise<number> {
  const orphans = await db.trainerProfile.findMany({
    where: {
      subscriptionCurrentPeriodEnd: null,
      subscriptionStatus: { in: ['ACTIVE', 'PAST_DUE'] },
      subscriptionCanceledAt: null,
    },
    select: { id: true, subscriptionCadence: true },
  })

  for (const profile of orphans) {
    await db.$transaction(async (tx) => {
      await openFirstPeriod(tx, profile.id, profile.subscriptionCadence, now)
      await audit(tx, {
        actorId: null, actorRole: 'SYSTEM',
        action: 'SUBSCRIPTION_PERIOD_INITIALIZED', targetType: 'TrainerProfile', targetId: profile.id,
        meta: { reason: 'profil antérieur à la facturation' },
      })
    })
  }

  return orphans.length
}

/** Devis d'une période, éventuellement ramené au tarif de la période précédente. */
interface DeferredQuote extends PriceQuote {
  /** Vrai quand le prix reconduit celui de la période précédente. */
  deferred: boolean
  /** Le prix de grille que ce report écarte — celui qui s'appliquera ensuite. */
  postponedListPriceFcfa: number | null
}

/**
 * Applique la règle de report : **une modification tarifaire ne touche un
 * formateur déjà abonné qu'à son 2e renouvellement.**
 *
 * Le 1er renouvellement qui suit la publication d'une nouvelle grille reconduit
 * le prix de la période qui s'achève, et se marque `tariffDeferred`. Au tour
 * suivant, ce marqueur dit que le report a été consommé et la grille s'applique.
 *
 * Un formateur qui n'a aucune période derrière lui — donc un nouvel inscrit —
 * ne passe jamais ici : `openFirstPeriod` prend la grille en vigueur, et le
 * nouveau tarif s'applique immédiatement.
 *
 * Seul le **prix de grille** est reporté. Une remise (campagne, remise
 * nominative, code promo) reste calculée sur la période en cours : elle a sa
 * propre fenêtre de validité, et la reconduire ferait vivre une remise expirée.
 */
async function deferTariffChange(trainerProfileId: string, quote: PriceQuote): Promise<DeferredQuote> {
  const previous = await db.subscriptionCharge.findFirst({
    where: { trainerId: trainerProfileId },
    orderBy: { periodStart: 'desc' },
    select: { listPriceFcfa: true, tariffDeferred: true },
  })

  const unchanged = { ...quote, deferred: false, postponedListPriceFcfa: null }

  // Première période, ou grille inchangée : rien à reporter.
  if (!previous || previous.listPriceFcfa === quote.listPriceFcfa) return unchanged
  // Le report a déjà eu lieu au tour précédent : c'est ce renouvellement-ci qui
  // applique la grille. C'est le 2e, celui qu'on avait annoncé.
  if (previous.tariffDeferred) return unchanged

  // Un plancher à zéro, comme dans `quotePrice` : une remise supérieure au prix
  // reconduit ne crée pas de créance.
  const discountFcfa = Math.min(quote.discountFcfa, previous.listPriceFcfa)

  return {
    ...quote,
    listPriceFcfa: previous.listPriceFcfa,
    discountFcfa,
    payableFcfa: previous.listPriceFcfa - discountFcfa,
    deferred: true,
    postponedListPriceFcfa: quote.listPriceFcfa,
  }
}

/**
 * Renouvelle les abonnements arrivés à échéance. Idempotent par construction :
 * la contrainte d'unicité `(trainerId, periodStart)` interdit de facturer deux
 * fois la même période, même si le job est rejoué.
 */
export async function renewDueSubscriptions(now = new Date()): Promise<RenewalResult> {
  const initialized = await initializeMissingPeriods(now)

  const due = await db.trainerProfile.findMany({
    where: {
      subscriptionCurrentPeriodEnd: { lte: now },
      // Un abonnement résilié ou déjà suspendu ne se renouvelle pas.
      subscriptionStatus: { in: ['ACTIVE', 'PAST_DUE'] },
      subscriptionCanceledAt: null,
    },
    select: {
      id: true, userId: true, subscriptionCadence: true, pendingCadence: true,
      subscriptionCurrentPeriodEnd: true, subscriptionStatus: true, subscriptionPastDueAt: true,
    },
  })

  const result: RenewalResult = { renewed: 0, waived: 0, pastDue: 0, deferred: 0, initialized }

  for (const profile of due) {
    // Décision 52 — la cadence souhaitée ne prend effet qu'ici, au
    // renouvellement. Jamais en cours de période, jamais au prorata.
    const cadence = profile.pendingCadence ?? profile.subscriptionCadence
    const periodStart = profile.subscriptionCurrentPeriodEnd ?? now
    const periodEnd = periodEndFor(periodStart, cadence)
    const quoted = await quotePrice(cadence, { trainerId: profile.id, at: periodStart })
    // Un formateur déjà abonné encaisse une modification tarifaire à son 2e
    // renouvellement : la période qui s'ouvre ici reconduit le prix précédent.
    const quote = await deferTariffChange(profile.id, quoted)
    // Arbitrage 69 — les paliers sont facturés **avec** l'abonnement, à sa
    // cadence. Ils n'ont donc pas leur propre échéance, et le formateur n'a
    // qu'une ligne à régler.
    const storage = await storageChargeFor(profile.id, cadence, periodStart)
    const dueFcfa = quote.payableFcfa + storage.amountFcfa
    const waived = dueFcfa === 0

    try {
      await db.$transaction(async (tx) => {
        await tx.subscriptionCharge.create({
          data: {
            trainerId: profile.id,
            cadence,
            periodStart,
            periodEnd,
            listPriceFcfa: quote.listPriceFcfa,
            discountFcfa: quote.discountFcfa,
            discountLabel: quote.discountLabel,
            tariffDeferred: quote.deferred,
            storageTiers: storage.tiers,
            storageFcfa: storage.amountFcfa,
            amountDueFcfa: dueFcfa,
            status: waived ? 'WAIVED' : 'DUE',
            settledAt: waived ? periodStart : null,
          },
        })

        await tx.trainerProfile.update({
          where: { id: profile.id },
          data: {
            subscriptionCadence: cadence,
            pendingCadence: null,
            subscriptionCurrentPeriodEnd: periodEnd,
            subscriptionPriceFcfa: quote.payableFcfa,
            subscriptionDiscountFcfa: quote.discountFcfa,
            // Une période offerte ne met jamais en impayé : la cohorte de
            // lancement reste ACTIVE tant que le tarif vaut zéro.
            subscriptionStatus: waived ? 'ACTIVE' : 'PAST_DUE',
            subscriptionPastDueAt: waived ? null : (profile.subscriptionPastDueAt ?? periodStart),
          },
        })

        await audit(tx, {
          actorId: null, actorRole: 'SYSTEM',
          action: waived ? 'SUBSCRIPTION_PERIOD_WAIVED' : 'SUBSCRIPTION_PERIOD_DUE',
          targetType: 'TrainerProfile', targetId: profile.id,
          meta: {
            cadence, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(),
            amountDueFcfa: dueFcfa, storageTiers: storage.tiers,
            storageFcfa: storage.amountFcfa, discountLabel: quote.discountLabel,
          },
        })
      })
    } catch (err) {
      // Période déjà facturée : le job a été rejoué. Ce n'est pas une erreur,
      // c'est exactement ce que l'unicité doit produire.
      if (String(err).includes('Unique constraint')) continue
      throw err
    }

    result.renewed += 1

    // La période ouverte a sa pièce, réglée ou non : une facture atteste d'une
    // créance, elle n'atteste pas d'un paiement.
    const charge = await db.subscriptionCharge.findFirst({
      where: { trainerId: profile.id, periodStart },
      select: { id: true },
    })
    if (charge) {
      await deliverSideEffects('SUBSCRIPTION_INVOICE', { type: 'SubscriptionCharge', id: charge.id }, async () => {
        await issueInvoiceForSubscriptionCharge(charge.id)
      })
    }

    // Le rappel. L'annonce est partie à la publication du tarif ; ici la
    // période reportée s'ouvre, et le formateur apprend la date exacte et le
    // montant exact de l'échéance qui appliquera la nouvelle grille.
    if (quote.deferred && quote.postponedListPriceFcfa !== null) {
      result.deferred += 1
      const period = cadence === 'YEARLY' ? 'an' : 'mois'
      const title = 'Votre tarif change à la prochaine échéance'
      const current = `Cette période reste à ${fmtNumber(quote.listPriceFcfa)} FCFA.`
      const next =
        `À partir du ${fmtDate(periodEnd)}, votre abonnement passera à ` +
        `${fmtNumber(quote.postponedListPriceFcfa)} FCFA par ${period}.`

      await deliverSideEffects('SUBSCRIPTION_TARIFF_REMINDER', { type: 'TrainerProfile', id: profile.id }, () =>
        notifyWithEmail(
          profile.userId,
          {
            type: 'SUBSCRIPTION_TARIFF_CHANGE_REMINDER',
            title,
            body: `${current} ${next}`,
            link: '/formateur/portefeuille',
          },
          {
            subject: `NkamVa — ${title}`,
            title,
            paragraphs: [current, next],
            cta: { label: 'Voir mon abonnement', url: absoluteUrl('/formateur/portefeuille') },
          },
          'subscriptionNoticeEmails',
        ),
      )
    }

    if (waived) result.waived += 1
    else {
      result.pastDue += 1
      await deliverSideEffects('SUBSCRIPTION_DUE', { type: 'TrainerProfile', id: profile.id }, () =>
        notify(profile.userId, {
          type: 'SUBSCRIPTION_PAYMENT_DUE',
          title: 'Votre abonnement est à régler',
          body: `${dueFcfa} FCFA pour la période en cours. Sans règlement sous ${SUBSCRIPTION_GRACE_DAYS} jours, vos ressources sortiront du catalogue.`,
          link: '/formateur/portefeuille',
        }),
      )
    }
  }

  return result
}

/**
 * Décision 68 — au terme du délai de grâce, l'écriture est bloquée **et les
 * ressources sortent du catalogue**. Les acheteurs gardent leur accès : un
 * défaut de paiement du formateur ne doit pas se transformer en litiges de
 * masse, et chaque litige ouvert réserve des fonds (décision 8).
 */
export async function suspendOverdueSubscriptions(now = new Date()): Promise<{
  suspended: number
  coursesArchived: number
}> {
  const deadline = new Date(now.getTime() - SUBSCRIPTION_GRACE_DAYS * 86_400_000)

  const overdue = await db.trainerProfile.findMany({
    where: {
      subscriptionStatus: 'PAST_DUE',
      subscriptionPastDueAt: { lte: deadline },
    },
    select: { id: true, userId: true },
  })

  let coursesArchived = 0

  for (const profile of overdue) {
    const archived = await db.$transaction(async (tx) => {
      const { count } = await tx.course.updateMany({
        where: { trainerId: profile.id, status: 'published' },
        data: { status: 'archived' },
      })

      await tx.trainerProfile.update({
        where: { id: profile.id },
        data: { subscriptionStatus: 'SUSPENDED', suspendedReason: 'Abonnement impayé' },
      })

      await audit(tx, {
        actorId: null, actorRole: 'SYSTEM',
        action: 'SUBSCRIPTION_SUSPENDED', targetType: 'TrainerProfile', targetId: profile.id,
        meta: { coursesArchived: count, graceDays: SUBSCRIPTION_GRACE_DAYS },
      })

      return count
    })

    coursesArchived += archived

    await deliverSideEffects('SUBSCRIPTION_SUSPENDED', { type: 'TrainerProfile', id: profile.id }, async () => {
      await notify(profile.userId, {
        type: 'SUBSCRIPTION_SUSPENDED',
        title: 'Vos ressources sont retirées du catalogue',
        body: `Votre abonnement reste impayé après ${SUBSCRIPTION_GRACE_DAYS} jours. Vos ressources ne sont plus en vente ; les personnes qui les ont achetées y accèdent toujours.`,
        link: '/formateur/portefeuille',
      })
      await notifyAdminSubRole('FINANCES', {
        type: 'SUBSCRIPTION_SUSPENDED',
        title: 'Formateur suspendu pour impayé',
        body: `${archived} ressource(s) retirée(s) du catalogue.`,
        link: '/admin/utilisateurs',
      })
    })
  }

  return { suspended: overdue.length, coursesArchived }
}

/**
 * Constate le règlement d'une période. Remet le formateur en `ACTIVE` et, s'il
 * était suspendu, **ne republie rien** : ses ressources sont sorties du
 * catalogue sur décision, elles y reviennent sur décision.
 */
export async function settleSubscriptionCharge(
  chargeId: string,
  input: { actorId: string; actorRole: string; reference?: string | null },
) {
  const charge = await db.subscriptionCharge.findUnique({ where: { id: chargeId } })
  if (!charge) throw new Error('SUBSCRIPTION_CHARGE_NOT_FOUND')
  if (charge.status !== 'DUE') throw new Error('SUBSCRIPTION_CHARGE_NOT_DUE')

  return db.$transaction(async (tx) => {
    await tx.subscriptionCharge.update({
      where: { id: chargeId },
      data: { status: 'SETTLED', settledAt: new Date() },
    })

    // Reste-t-il une période impayée ? Régler la dernière ne solde pas un
    // arriéré plus ancien.
    const stillDue = await tx.subscriptionCharge.count({
      where: { trainerId: charge.trainerId, status: 'DUE' },
    })

    await tx.trainerProfile.update({
      where: { id: charge.trainerId },
      data: stillDue === 0
        ? { subscriptionStatus: 'ACTIVE', subscriptionPastDueAt: null, suspendedReason: null }
        : {},
    })

    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'SUBSCRIPTION_CHARGE_SETTLED', targetType: 'SubscriptionCharge', targetId: chargeId,
      meta: { trainerId: charge.trainerId, amountFcfa: charge.amountDueFcfa, reference: input.reference ?? null, stillDue },
    })

    return tx.subscriptionCharge.findUniqueOrThrow({ where: { id: chargeId } })
  })
}

// ==========================================================================
// Lecture Finances — registre des périodes d'abonnement
// ==========================================================================

export async function listSubscriptionCharges(filters: {
  status?: 'DUE' | 'SETTLED' | 'WAIVED'
  page?: number
  pageSize?: number
} = {}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(filters.pageSize ?? 20, 50)
  const where = filters.status ? { status: filters.status } : {}

  const [items, total] = await Promise.all([
    db.subscriptionCharge.findMany({
      where,
      include: {
        trainerProfile: {
          select: {
            id: true, subscriptionStatus: true, subscriptionPastDueAt: true,
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
      // Les impayés les plus anciens d'abord : ce sont eux qui approchent de
      // la suspension.
      orderBy: { periodStart: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.subscriptionCharge.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getSubscriptionStats(now = new Date()) {
  const suspensionDeadline = new Date(now.getTime() - SUBSCRIPTION_GRACE_DAYS * 86_400_000)

  const [byStatus, dueSum, settledSum, nearSuspension, suspended] = await Promise.all([
    db.subscriptionCharge.groupBy({ by: ['status'], _count: { _all: true } }),
    db.subscriptionCharge.aggregate({ where: { status: 'DUE' }, _sum: { amountDueFcfa: true } }),
    db.subscriptionCharge.aggregate({ where: { status: 'SETTLED' }, _sum: { amountDueFcfa: true } }),
    db.trainerProfile.count({
      where: {
        subscriptionStatus: 'PAST_DUE',
        subscriptionPastDueAt: { lte: new Date(suspensionDeadline.getTime() + 3 * 86_400_000) },
      },
    }),
    db.trainerProfile.count({ where: { subscriptionStatus: 'SUSPENDED' } }),
  ])

  const counts = Object.fromEntries(byStatus.map(r => [r.status, r._count._all]))
  return {
    due: counts.DUE ?? 0,
    settled: counts.SETTLED ?? 0,
    waived: counts.WAIVED ?? 0,
    dueTotalFcfa: dueSum._sum.amountDueFcfa ?? 0,
    settledTotalFcfa: settledSum._sum.amountDueFcfa ?? 0,
    nearSuspension,
    suspended,
  }
}

/** État d'abonnement du formateur, pour son propre portefeuille. */
export async function getMySubscription(trainerProfileId: string) {
  const [profile, dueCharges] = await Promise.all([
    db.trainerProfile.findUnique({
      where: { id: trainerProfileId },
      select: {
        subscriptionStatus: true, subscriptionCadence: true,
        subscriptionCurrentPeriodEnd: true, subscriptionPriceFcfa: true,
        subscriptionDiscountFcfa: true, subscriptionPastDueAt: true, pendingCadence: true,
      },
    }),
    db.subscriptionCharge.findMany({
      where: { trainerId: trainerProfileId, status: 'DUE' },
      orderBy: { periodStart: 'asc' },
      select: { id: true, amountDueFcfa: true, periodStart: true, periodEnd: true },
    }),
  ])
  if (!profile) return null

  const suspensionAt = profile.subscriptionPastDueAt
    ? new Date(profile.subscriptionPastDueAt.getTime() + SUBSCRIPTION_GRACE_DAYS * 86_400_000)
    : null

  return {
    ...profile,
    dueCharges,
    dueTotalFcfa: dueCharges.reduce((sum, c) => sum + c.amountDueFcfa, 0),
    suspensionAt,
  }
}

/**
 * Le formateur peut-il écrire ? Un abonnement suspendu bloque la publication
 * et le téléversement, jamais la lecture (décision 68).
 */
export async function canTrainerWrite(trainerProfileId: string): Promise<boolean> {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { subscriptionStatus: true },
  })
  return profile?.subscriptionStatus !== 'SUSPENDED'
}

/** Alerte Finances sur les impayés qui approchent de la suspension. */
export async function alertUpcomingSuspensions(now = new Date()): Promise<{ alerted: number }> {
  const soon = new Date(now.getTime() - (SUBSCRIPTION_GRACE_DAYS - 3) * 86_400_000)
  const count = await db.trainerProfile.count({
    where: { subscriptionStatus: 'PAST_DUE', subscriptionPastDueAt: { lte: soon } },
  })
  if (count === 0) return { alerted: 0 }

  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM',
    action: 'SUBSCRIPTION_SUSPENSION_UPCOMING', targetType: 'TrainerProfile', targetId: null,
    meta: { count },
  })
  await notifyAdminSubRole('FINANCES', {
    type: 'SUBSCRIPTION_SUSPENSION_UPCOMING',
    title: 'Impayés proches de la suspension',
    body: `${count} formateur(s) seront suspendus sous 3 jours.`,
    link: '/admin/utilisateurs',
  })
  return { alerted: count }
}
