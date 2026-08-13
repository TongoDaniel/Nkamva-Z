// ==========================================================================
// Préavis — arbitrage 103
// ==========================================================================
// Une seule politique, et elle tient en deux lignes :
//
//   · **Tout ce qui se termine prévient à J-7 puis à J-1.** Fin des mois
//     offerts, fin d'adhésion, échéance d'abonnement.
//   · **J-30 quand l'avertissement appelle un geste coûteux** — la purge d'un
//     replay annoncée au formateur, qui doit avoir le temps de télécharger
//     plusieurs gigaoctets. Sept jours ne suffisent pas sur les connexions que
//     sert la plateforme.
//
// Trois valeurs choisies au hasard dans trois fichiers finissent par se
// contredire à l'écran ; une règle unique se retient, et se teste une fois.
//
// ── Pourquoi l'audit sert de mémoire ────────────────────────────────────────
//
// `deliverSideEffects` isole les échecs, il ne dédoublonne rien : le job
// d'alerte des purges notifiait donc **chaque jour pendant trente jours**, ce
// qui est la meilleure façon de faire ignorer un préavis. Le seuil franchi est
// inscrit dans le journal — `REPLAY_PURGE_NOTICE_30`, `MEMBERSHIP_END_NOTICE_7`
// — et relu avant d'écrire. Un job rejoué deux fois dans la journée ne prévient
// donc qu'une seule fois, et on peut dire *quand* quelqu'un a été prévenu, ce
// qu'une notification lue puis supprimée ne dit plus.
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { notify, deliverSideEffects } from './notification'
import { fmtDate, fmtNumber } from './format'

const DAY_MS = 86_400_000

/** Ce qui se termine : deux rappels, le second à la veille. */
export const ACCESS_END_NOTICE_DAYS = [7, 1] as const

/** Ce qu'il faut avoir le temps de télécharger. */
export const DOWNLOAD_NOTICE_DAYS = 30

/**
 * La bascule tarifaire (arbitrage 96). Elle n'est pas une fin d'accès — rien
 * ne s'arrête —, mais un formateur qui découvre qu'il paie doit avoir eu le
 * temps de décider s'il continue.
 */
export const TARIFF_SWITCH_NOTICE_DAYS = 60

/**
 * La fenêtre d'un seuil : ce qui tombe entre J-n et J-(n-1).
 *
 * Bornée des deux côtés, sinon le seuil J-7 se déclencherait aussi le jour de
 * J-1 et enverrait deux messages le même matin.
 */
function windowFor(now: Date, days: number): { gt: Date; lte: Date } {
  return {
    gt: new Date(now.getTime() + (days - 1) * DAY_MS),
    lte: new Date(now.getTime() + days * DAY_MS),
  }
}

async function alreadySent(action: string, targetId: string): Promise<boolean> {
  const seen = await db.auditLog.findFirst({
    where: { action, targetId },
    select: { id: true },
  })
  return seen !== null
}

/**
 * Écrit le préavis une fois et une seule. Le journal est écrit **après** la
 * notification : l'inverse ferait passer pour prévenu quelqu'un qui ne l'a
 * jamais été si l'écriture de la notification échouait.
 */
export async function sendNoticeOnce(
  action: string,
  targetId: string,
  userId: string,
  params: { type: string; title: string; body: string; link: string },
  meta: Record<string, unknown>,
): Promise<boolean> {
  if (await alreadySent(action, targetId)) return false

  await deliverSideEffects(action, { type: 'Notice', id: targetId }, () => notify(userId, params))
  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM',
    action, targetType: 'Notice', targetId,
    meta,
  })
  return true
}

/**
 * Prévient les invités dont les mois offerts se terminent (arbitrages 77 et
 * 103). `provider` nul **est** la définition d'une adhésion offerte : il n'y a
 * rien avec quoi la reconduire, et elle se fermera d'elle-même au terme.
 *
 * Le message dit comment rester, sans quoi le préavis n'est qu'une mauvaise
 * nouvelle datée.
 */
export async function noticeEndingGiftMemberships(now = new Date()): Promise<{ notified: number }> {
  let notified = 0

  for (const days of ACCESS_END_NOTICE_DAYS) {
    const ending = await db.communitySubscription.findMany({
      where: {
        status: 'ACTIVE',
        provider: null,
        periodEnd: windowFor(now, days),
        learner: { deletedAt: null },
      },
      select: {
        id: true, learnerId: true, periodEnd: true,
        community: { select: { name: true, slug: true, priceFcfa: true } },
      },
    })

    for (const sub of ending) {
      const sent = await sendNoticeOnce(
        `MEMBERSHIP_END_NOTICE_${days}`,
        sub.id,
        sub.learnerId,
        {
          type: 'GIFT_MEMBERSHIP_ENDING',
          title:
            days === 1
              ? `Vos mois offerts dans ${sub.community.name} se terminent demain`
              : `Vos mois offerts dans ${sub.community.name} se terminent le ${fmtDate(sub.periodEnd)}`,
          body:
            `Vous garderez l'accès à tout ce que vous avez reçu pendant cette période. ` +
            `Pour continuer à suivre la communauté, l'adhésion est à ${fmtNumber(sub.community.priceFcfa)} FCFA par mois.`,
          link: `/communautes/${sub.community.slug}`,
        },
        { days, periodEnd: sub.periodEnd.toISOString() },
      )
      if (sent) notified += 1
    }
  }

  return { notified }
}

/**
 * Prévient les formateurs que l'abonnement devient payant (arbitrage 96).
 *
 * Le préavis n'existe que s'il y a réellement une bascule : un tarif payant
 * **posé** dont la date d'effet approche, alors que le tarif en vigueur est
 * gratuit. Sans ce second membre, tout changement de grille aurait déclenché
 * une alerte de fin de gratuité chez des formateurs qui payaient déjà.
 */
export async function noticeTariffSwitch(now = new Date()): Promise<{ notified: number }> {
  const horizon = windowFor(now, TARIFF_SWITCH_NOTICE_DAYS)

  const upcoming = await db.platformTariff.findMany({
    where: { kind: 'SUBSCRIPTION', amountFcfa: { gt: 0 }, validFrom: horizon },
    select: { id: true, cadence: true, amountFcfa: true, validFrom: true },
  })
  if (upcoming.length === 0) return { notified: 0 }

  let notified = 0

  for (const tariff of upcoming) {
    // Le tarif en vigueur pour cette cadence, à aujourd'hui. Gratuit ⇒ c'est
    // bien une fin de gratuité qu'on annonce.
    const current = await db.platformTariff.findFirst({
      where: {
        kind: 'SUBSCRIPTION',
        cadence: tariff.cadence,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      orderBy: { validFrom: 'desc' },
      select: { amountFcfa: true },
    })
    if (current && current.amountFcfa > 0) continue

    const trainers = await db.trainerProfile.findMany({
      where: {
        subscriptionCadence: tariff.cadence,
        subscriptionStatus: { in: ['ACTIVE', 'PAST_DUE'] },
        subscriptionCanceledAt: null,
      },
      select: { id: true, userId: true },
    })

    for (const trainer of trainers) {
      const sent = await sendNoticeOnce(
        `TARIFF_SWITCH_NOTICE_${TARIFF_SWITCH_NOTICE_DAYS}`,
        `${tariff.id}:${trainer.id}`,
        trainer.userId,
        {
          type: 'SUBSCRIPTION_TARIFF_SWITCH',
          title: `L'abonnement formateur devient payant le ${fmtDate(tariff.validFrom)}`,
          body:
            `À partir de cette date, l'abonnement ${tariff.cadence === 'YEARLY' ? 'annuel' : 'mensuel'} ` +
            `est fixé à ${fmtNumber(tariff.amountFcfa)} FCFA. Il vous sera facturé à votre propre échéance, ` +
            `pas le jour de la bascule : vous ne serez jamais débité par surprise.`,
          link: '/formateur/abonnement',
        },
        { tariffId: tariff.id, validFrom: tariff.validFrom.toISOString() },
      )
      if (sent) notified += 1
    }
  }

  return { notified }
}
