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
import { reviseTrainerObligations } from './course-obligation'
import { debitWalletForSubscriptionCharge } from './wallet'
import { restoreSuspendedCatalog } from './catalog-suspension'
import { countActivePaidMembers } from './communities'
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
  /**
   * Périodes réglées séance tenante par prélèvement sur le solde (arbitrage 8).
   * Comptées à part de `pastDue` : un formateur prélevé n'a jamais été en
   * impayé, et le confondre ferait croire à un défaut de paiement.
   */
  debited: number
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
      autoRenew: true,
    },
  })

  const result: RenewalResult = {
    renewed: 0, waived: 0, pastDue: 0, deferred: 0, initialized, debited: 0,
  }

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
    // Arbitrage 19 — **le seul moment** où l'appartenance au contenu sous
    // obligation bouge. Ici et pas ailleurs : un remboursement ne doit pas
    // rendre l'espace au quota le jour même, sans quoi il bloquerait les
    // téléversements d'un formateur du jour au lendemain sans qu'il ait rien
    // fait. La révision précède le calcul du stockage, sinon la période
    // s'ouvrirait sur des paliers déjà périmés.
    await reviseTrainerObligations(profile.id, periodStart)
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
      // Arbitrage 8 — le prélèvement n'a lieu que si le formateur l'a demandé.
      // Il vient **après** la facture : la pièce atteste de la créance, et elle
      // doit exister même si le prélèvement échoue.
      const debit =
        profile.autoRenew && charge
          ? await debitWalletForSubscriptionCharge(charge.id, 'SUBSCRIPTION_RENEWAL')
          : null

      if (debit?.debited) {
        result.debited += 1
        await deliverSideEffects('SUBSCRIPTION_DEBITED', { type: 'SubscriptionCharge', id: charge!.id }, () =>
          notify(profile.userId, {
            type: 'SUBSCRIPTION_PAYMENT_DEBITED',
            title: 'Votre abonnement a été prélevé',
            body: `${fmtNumber(dueFcfa)} FCFA ont été prélevés sur votre solde pour la période en cours.`,
            link: '/formateur/abonnement',
          }),
        )
        continue
      }

      // Rien n'a été prélevé : soit le renouvellement automatique est inactif,
      // soit le solde n'y suffisait pas. Dans les deux cas la période est due, et
      // le message doit dire laquelle des deux situations c'est — annoncer un
      // simple « à régler » à qui croyait être prélevé serait incompréhensible.
      result.pastDue += 1
      const shortfall =
        debit && !debit.debited && debit.reason === 'INSUFFICIENT_BALANCE'
          ? ` Votre solde retirable (${fmtNumber(debit.withdrawableFcfa)} FCFA) n'a pas suffi ; il sera retenté chaque nuit.`
          : ''
      await deliverSideEffects('SUBSCRIPTION_DUE', { type: 'TrainerProfile', id: profile.id }, () =>
        notify(profile.userId, {
          type: 'SUBSCRIPTION_PAYMENT_DUE',
          title: 'Votre abonnement est à régler',
          body: `${fmtNumber(dueFcfa)} FCFA pour la période en cours.${shortfall} Sans règlement sous ${SUBSCRIPTION_GRACE_DAYS} jours, vos ressources sortiront du catalogue.`,
          link: '/formateur/abonnement',
        }),
      )
    }
  }

  return result
}

/**
 * Rejeu nocturne du prélèvement — arbitrage 9.
 *
 * Le prélèvement tente sa chance à l'ouverture de la période, puis **chaque
 * nuit pendant le délai de grâce**. C'est ce qui donne son sens à l'arbitrage :
 * une vente qui tombe le lendemain d'un échec solde l'échéance sans que le
 * formateur ait rien à faire. Sans ce rejeu, un solde qui se garnit à J+1 ne
 * servirait à rien et il faudrait payer à la main pour rien.
 *
 * Idempotent par la base : `WalletDebit.subscriptionChargeId` est unique, et
 * une période déjà réglée n'est plus `DUE`. Repasser chaque nuit sur les mêmes
 * périodes est donc sans effet — c'est le régime normal de ce job, pas un
 * accident.
 *
 * Les périodes sont prises **les plus anciennes d'abord** : ce sont elles qui
 * approchent de la suspension, et un solde partiel doit servir à écarter la
 * sanction la plus proche.
 */
export async function retryAutoRenewDebits(now = new Date()): Promise<{
  attempted: number
  debited: number
  amountFcfa: number
}> {
  const charges = await db.subscriptionCharge.findMany({
    where: {
      status: 'DUE',
      trainerProfile: {
        autoRenew: true,
        // Un abonnement résilié ne se prélève pas ici : sa dette est récupérée
        // au terme, par un autre chemin et sans condition de consentement
        // (arbitrage 10).
        subscriptionCanceledAt: null,
      },
    },
    orderBy: { periodStart: 'asc' },
    select: { id: true, trainerId: true, trainerProfile: { select: { userId: true } } },
  })

  let debited = 0
  let amountFcfa = 0

  for (const charge of charges) {
    const result = await debitWalletForSubscriptionCharge(charge.id, 'SUBSCRIPTION_RENEWAL')
    if (!result.debited) continue

    debited += 1
    amountFcfa += result.amountFcfa

    // Le formateur doit apprendre que son échéance s'est soldée toute seule :
    // il a reçu un avis d'impayé, il attend une action de sa part.
    await deliverSideEffects('SUBSCRIPTION_DEBITED', { type: 'SubscriptionCharge', id: charge.id }, () =>
      notify(charge.trainerProfile.userId, {
        type: 'SUBSCRIPTION_PAYMENT_DEBITED',
        title: 'Votre abonnement a été prélevé',
        body: `${fmtNumber(result.amountFcfa)} FCFA ont été prélevés sur votre solde. Vous n'avez rien à régler.`,
        link: '/formateur/abonnement',
      }),
    )
  }

  return { attempted: charges.length, debited, amountFcfa }
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
      // Arbitrage 12 — la sortie est **marquée**, pas seulement effectuée.
      // `archived` est la même valeur que celle qu'un formateur pose lui-même
      // en archivant une ressource : sans `catalogSuspendedAt`, le règlement ne
      // saurait pas quoi republier et ressusciterait ce qu'il avait
      // volontairement retiré de la vente.
      const { count } = await tx.course.updateMany({
        where: { trainerId: profile.id, status: 'published' },
        data: { status: 'archived', catalogSuspendedAt: now },
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

    // Arbitrage 12 — le règlement republie, quel que soit le chemin qui l'a
    // constaté. Le constat de Finances ne peut pas rendre moins que le
    // prélèvement ou le paiement en ligne.
    const republished = stillDue === 0 ? await restoreSuspendedCatalog(tx, charge.trainerId) : 0

    await tx.trainerProfile.update({
      where: { id: charge.trainerId },
      data: stillDue === 0
        ? { subscriptionStatus: 'ACTIVE', subscriptionPastDueAt: null, suspendedReason: null }
        : {},
    })

    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'SUBSCRIPTION_CHARGE_SETTLED', targetType: 'SubscriptionCharge', targetId: chargeId,
      meta: { trainerId: charge.trainerId, amountFcfa: charge.amountDueFcfa, reference: input.reference ?? null, stillDue, republished },
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
        subscriptionCanceledAt: true, autoRenew: true, storageTiers: true,
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
 * Le formateur peut-il écrire ?
 *
 * Deux états le lui refusent, pour deux raisons différentes :
 * - `SUSPENDED` — abonnement impayé. La publication et le téléversement sont
 *   bloqués, jamais la lecture des apprenants (décision 68).
 * - `CANCELED` — il est parti. Son espace est en **état de solde**
 *   (arbitrage 5) : il retire son argent, répond à ses litiges, consulte ses
 *   factures. Il ne publie plus, ne vend plus, n'anime plus.
 */
export async function canTrainerWrite(trainerProfileId: string): Promise<boolean> {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { subscriptionStatus: true },
  })
  return profile?.subscriptionStatus !== 'SUSPENDED' && profile?.subscriptionStatus !== 'CANCELED'
}

// ==========================================================================
// Résilier — arbitrages 1 à 5, 10
// ==========================================================================

export type CancelRefusal =
  /** Des membres payants courent encore : fermer la communauté d'abord. */
  | 'ACTIVE_PAID_MEMBERS'
  | 'ALREADY_CANCELED'
  | 'TRAINER_NOT_FOUND'

export interface CancelSubscriptionResult {
  /** Date à laquelle la résiliation prend effet — la fin de la période payée. */
  effectiveAt: Date | null
  /** Lives programmés après le terme, qui seront annulés (arbitrage 3). */
  scheduledLives: number
}

/**
 * Résilie l'abonnement d'un formateur.
 *
 * **Ne coupe rien.** La période en cours court jusqu'à son terme, elle n'est ni
 * écourtée, ni remboursée au prorata. « Résiliable à tout moment » ne veut pas
 * dire « remboursé au prorata » — c'est déjà le patron de l'adhésion apprenant.
 *
 * **Refusée si des membres payants courent encore** (arbitrage 2). Il ferme sa
 * communauté d'abord, laisse les adhésions s'éteindre à leur terme, puis
 * résilie. Le départ peut donc prendre jusqu'à un mois, et l'écran doit le dire.
 *
 * Les lives programmés après le terme **ne bloquent pas** (arbitrage 3) : ils
 * seront annulés et les inscrits prévenus. Aucun remboursement à traiter, une
 * session n'ayant pas de prix propre.
 */
export async function cancelSubscription(
  trainerProfileId: string,
  userId: string,
  now = new Date(),
): Promise<CancelSubscriptionResult> {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { id: true, subscriptionCanceledAt: true, subscriptionCurrentPeriodEnd: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  if (profile.subscriptionCanceledAt) throw new Error('ALREADY_CANCELED')

  const paidMembers = await countActivePaidMembers(trainerProfileId)
  if (paidMembers > 0) throw new Error('ACTIVE_PAID_MEMBERS')

  const effectiveAt = profile.subscriptionCurrentPeriodEnd
  const scheduledLives = await db.liveSession.count({
    where: {
      trainerId: trainerProfileId,
      status: 'SCHEDULED',
      ...(effectiveAt ? { scheduledStartAt: { gt: effectiveAt } } : {}),
    },
  })

  await db.$transaction(async (tx) => {
    await tx.trainerProfile.update({
      where: { id: trainerProfileId },
      // La cadence souhaitée s'efface : la résiliation l'emporte sur elle.
      data: { subscriptionCanceledAt: now, pendingCadence: null },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'SUBSCRIPTION_CANCELED', targetType: 'TrainerProfile', targetId: trainerProfileId,
      meta: { effectiveAt: effectiveAt?.toISOString() ?? null, scheduledLives },
    })
  })

  return { effectiveAt, scheduledLives }
}

/**
 * Revient sur une résiliation, tant que la période court encore. Pendant du
 * `resumeMembership` de l'adhésion apprenant.
 */
export async function resumeSubscription(
  trainerProfileId: string,
  userId: string,
): Promise<void> {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { subscriptionCanceledAt: true, subscriptionStatus: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  if (!profile.subscriptionCanceledAt) throw new Error('NOT_CANCELED')
  // Le terme est passé : l'espace est en état de solde, on ne revient pas
  // dessus par ce chemin. C'est une réactivation, et elle se paie (arbitrage 7).
  if (profile.subscriptionStatus === 'CANCELED') throw new Error('ALREADY_ENDED')

  await db.$transaction(async (tx) => {
    await tx.trainerProfile.update({
      where: { id: trainerProfileId },
      data: { subscriptionCanceledAt: null },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'SUBSCRIPTION_RESUMED', targetType: 'TrainerProfile', targetId: trainerProfileId,
    })
  })
}

/**
 * Mène au terme les abonnements résiliés dont la période s'achève —
 * arbitrages 4, 5 et 10.
 *
 * Le renouvellement les ignore (il filtre sur `subscriptionCanceledAt`), il
 * fallait donc quelqu'un pour les conduire jusqu'au bout. Trois gestes :
 *
 * 1. **Les ressources sortent du catalogue.** Les acheteurs gardent l'accès à
 *    ce qu'ils ont payé — c'est le principe de la décision 68, et il ne dépend
 *    pas du motif de la sortie.
 * 2. **Les lives programmés sont annulés** et les inscrits prévenus.
 * 3. **La dette est prélevée sur le solde**, sans condition de consentement :
 *    la période a été consommée, elle se paie (arbitrage 10).
 *
 * L'espace n'est pas fermé : il passe en `CANCELED`, l'**état de solde**. Le
 * formateur y retire son argent et répond à ses litiges, rien d'autre.
 */
export async function endCanceledSubscriptions(now = new Date()): Promise<{
  ended: number
  coursesWithdrawn: number
  livesCanceled: number
  arrearsDebitedFcfa: number
}> {
  const ending = await db.trainerProfile.findMany({
    where: {
      subscriptionCanceledAt: { not: null },
      subscriptionStatus: { notIn: ['CANCELED'] },
      subscriptionCurrentPeriodEnd: { lte: now },
    },
    select: { id: true, userId: true },
  })

  let coursesWithdrawn = 0
  let livesCanceled = 0
  let arrearsDebitedFcfa = 0

  for (const profile of ending) {
    const lives = await db.liveSession.findMany({
      where: { trainerId: profile.id, status: 'SCHEDULED' },
      select: { id: true, communityId: true, title: true },
    })

    const withdrawn = await db.$transaction(async (tx) => {
      // Arbitrage 4 — hors catalogue, acheteurs inchangés. Le marqueur est le
      // même que pour l'impayé : si le formateur revient et règle, ce sont ces
      // ressources-là qui reviennent, et pas celles qu'il avait rangées.
      const { count } = await tx.course.updateMany({
        where: { trainerId: profile.id, status: 'published' },
        data: { status: 'archived', catalogSuspendedAt: now },
      })

      await tx.liveSession.updateMany({
        where: { trainerId: profile.id, status: 'SCHEDULED' },
        data: { status: 'CANCELED' },
      })

      await tx.trainerProfile.update({
        where: { id: profile.id },
        data: { subscriptionStatus: 'CANCELED' },
      })

      await audit(tx, {
        actorId: null, actorRole: 'SYSTEM',
        action: 'SUBSCRIPTION_ENDED', targetType: 'TrainerProfile', targetId: profile.id,
        meta: { coursesWithdrawn: count, livesCanceled: lives.length },
      })

      return count
    })

    coursesWithdrawn += withdrawn
    livesCanceled += lives.length

    // Arbitrage 10 — la dette d'une période consommée se récupère sur le solde,
    // **même sans renouvellement automatique**. Les plus anciennes d'abord.
    const arrears = await db.subscriptionCharge.findMany({
      where: { trainerId: profile.id, status: 'DUE' },
      orderBy: { periodStart: 'asc' },
      select: { id: true },
    })
    for (const charge of arrears) {
      const debit = await debitWalletForSubscriptionCharge(charge.id, 'SUBSCRIPTION_ARREARS')
      if (debit.debited) arrearsDebitedFcfa += debit.amountFcfa
    }

    await deliverSideEffects('SUBSCRIPTION_ENDED', { type: 'TrainerProfile', id: profile.id }, async () => {
      await notify(profile.userId, {
        type: 'SUBSCRIPTION_ENDED',
        title: 'Votre abonnement a pris fin',
        body:
          `Vos ressources sont retirées du catalogue ; celles et ceux qui les ont achetées y ` +
          `accèdent toujours. Votre espace reste ouvert pour retirer votre solde et suivre vos litiges.`,
        link: '/formateur/portefeuille',
      })
      // Les inscrits d'un live annulé doivent l'apprendre : ils avaient une
      // date dans leur agenda.
      for (const live of lives) {
        const participants = await db.communitySubscription.findMany({
          where: { communityId: live.communityId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
          select: { learnerId: true },
        })
        for (const p of participants) {
          await notify(p.learnerId, {
            type: 'LIVE_SESSION_CANCELED',
            title: `« ${live.title} » est annulé`,
            body: "L'animateur a mis fin à son activité sur NkamVa. La session n'aura pas lieu.",
            link: '/mes-lives',
          })
        }
      }
    })
  }

  return { ended: ending.length, coursesWithdrawn, livesCanceled, arrearsDebitedFcfa }
}

/**
 * Délai au terme duquel un espace en état de solde sans aucun mouvement se
 * ferme — arbitrage 15. Aligné sur la conservation des replays (décision 51) :
 * l'espace vit tant que son contenu vit.
 */
export const DORMANT_SPACE_MONTHS = 24

/**
 * Ferme les espaces en état de solde restés sans mouvement — arbitrage 15.
 *
 * « Sans mouvement » veut dire : **ni argent à rendre, ni litige ouvert**
 * (arbitrage 5). Un formateur qui a encore un litige en cours ou un solde à
 * retirer n'est pas dormant, quelle que soit l'ancienneté de son départ.
 *
 * Le reliquat part par un **versement de clôture** dispensé du minimum
 * (arbitrage 6) : sans cette dérogation, un solde de 3 200 FCFA rendrait la
 * fermeture impossible pour toujours.
 */
export async function closeDormantSpaces(now = new Date()): Promise<{
  closed: number
  reminded: number
}> {
  const deadline = new Date(now)
  deadline.setMonth(deadline.getMonth() - DORMANT_SPACE_MONTHS)
  // Un rappel un mois avant : la fermeture ne doit pas être une découverte.
  const reminderFrom = new Date(deadline)
  reminderFrom.setMonth(reminderFrom.getMonth() + 1)

  const dormant = await db.trainerProfile.findMany({
    where: {
      subscriptionStatus: 'CANCELED',
      subscriptionCanceledAt: { lte: reminderFrom },
      // Un litige ouvert retient l'espace : le formateur doit pouvoir y
      // répondre, et les fonds réservés lui appartiennent encore peut-être.
      // Les trois états `RESOLVED_*` sont les seuls terminaux — un litige en
      // attente de l'apprenant court toujours.
      purchasesAsTrainer: {
        none: {
          disputes: {
            some: { status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } },
          },
        },
      },
    },
    select: {
      id: true, userId: true, subscriptionCanceledAt: true,
      wallet: { select: { balance: true, reservedBalance: true, pendingPayoutBalance: true } },
    },
  })

  let closed = 0
  let reminded = 0

  for (const profile of dormant) {
    const withdrawable = profile.wallet
      ? profile.wallet.balance - profile.wallet.reservedBalance - profile.wallet.pendingPayoutBalance
      : 0
    const due = profile.subscriptionCanceledAt !== null && profile.subscriptionCanceledAt <= deadline

    if (!due) {
      reminded += 1
      await deliverSideEffects('DORMANT_SPACE_REMINDER', { type: 'TrainerProfile', id: profile.id }, () =>
        notify(profile.userId, {
          type: 'TRAINER_SPACE_CLOSING',
          title: 'Votre espace formateur va être clôturé',
          body:
            withdrawable > 0
              ? `Il vous reste ${fmtNumber(withdrawable)} FCFA à retirer. Passé un mois, votre espace sera clôturé et le solde vous sera versé.`
              : 'Sans mouvement de votre part, il sera clôturé dans un mois.',
          link: '/formateur/portefeuille',
        }),
      )
      continue
    }

    closed += 1
    await auditStandalone({
      actorId: null, actorRole: 'SYSTEM',
      action: 'TRAINER_SPACE_CLOSED', targetType: 'TrainerProfile', targetId: profile.id,
      meta: { residualFcfa: withdrawable, months: DORMANT_SPACE_MONTHS },
    })
    await deliverSideEffects('DORMANT_SPACE_CLOSED', { type: 'TrainerProfile', id: profile.id }, () =>
      notify(profile.userId, {
        type: 'TRAINER_SPACE_CLOSED',
        title: 'Votre espace formateur est clôturé',
        body:
          withdrawable > 0
            ? `Le solde restant de ${fmtNumber(withdrawable)} FCFA vous est versé, frais de transfert déduits.`
            : 'Votre historique et vos factures restent consultables depuis votre compte.',
        link: '/mes-factures',
      }),
    )
  }

  return { closed, reminded }
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
