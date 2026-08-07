// ==========================================================================
// Tarification de l'abonnement plateforme — décisions 56, 57, 59, 61, 62
// ==========================================================================
// Le tarif vit en base et il est daté (décision 59) : la gratuité de lancement
// n'est pas un cas particulier codé en dur, c'est un tarif à 0 avec une date
// de fin.
//
// Règle de cumul tranchée (décision 62) : **la réduction la plus favorable
// l'emporte, elles ne s'additionnent jamais.** L'addition est le comportement
// qu'on ne peut pas rattraper — trois remises de 40 % mènent l'abonnement à
// zéro sans que personne l'ait décidé.
// ==========================================================================

import type { DiscountKind, PlanCadence } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { fmtDate, fmtNumber } from './format'
import { absoluteUrl, deliverSideEffects, notifyWithEmail } from './notification'

export const CADENCE_LABELS: Record<PlanCadence, string> = {
  MONTHLY: 'Mensuelle',
  YEARLY: 'Annuelle',
}

/**
 * Le tarif d'**abonnement** en vigueur pour une cadence, à une date donnée.
 *
 * Le filtre sur `kind` n'est pas décoratif : depuis que les paliers de stockage
 * partagent cette table (arbitrage 69), l'omettre ferait facturer l'abonnement
 * au prix d'un palier — ou l'inverse — selon lequel a été posé en dernier.
 */
export async function getCurrentTariff(cadence: PlanCadence, at = new Date()) {
  return db.platformTariff.findFirst({
    where: {
      kind: 'SUBSCRIPTION',
      cadence,
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gt: at } }],
    },
    orderBy: { validFrom: 'desc' },
  })
}

export async function getCurrentTariffs(at = new Date()) {
  const [monthly, yearly] = await Promise.all([
    getCurrentTariff('MONTHLY', at),
    getCurrentTariff('YEARLY', at),
  ])
  return { MONTHLY: monthly, YEARLY: yearly }
}

/** Période affichée à côté d'un montant : « 9 000 FCFA /mois ». */
const CADENCE_PERIODS: Record<PlanCadence, string> = {
  MONTHLY: 'mois',
  YEARLY: 'an',
}

export interface PublicPlan {
  cadence: PlanCadence
  /** « Mensuelle » / « Annuelle ». */
  name: string
  period: string
  amountFcfa: number
  /** Vrai quand l'abonnement ne coûte rien — gratuité de lancement comprise. */
  free: boolean
  /** Intitulé de la grille en base (« Lancement — gratuit »), s'il est posé. */
  tariffLabel: string | null
  /** Économie face à douze mensualités, en %. Nul ou absent si aucune. */
  savingPercent: number | null
}

/**
 * L'offre d'abonnement formateur telle qu'elle doit être **annoncée**.
 *
 * Les écrans publics lisaient jusqu'ici des montants écrits en dur, que
 * `setTariff` ne pouvait pas atteindre : l'administration changeait la grille
 * et la page d'inscription continuait d'afficher l'ancienne. Tout ce qui
 * s'affiche vient donc d'ici.
 *
 * Une cadence sans tarif en vigueur est annoncée gratuite, parce que c'est
 * exactement ce qui sera facturé : `quotePrice` retient `0` quand la grille
 * est muette.
 */
export async function publicSubscriptionPlans(at = new Date()): Promise<PublicPlan[]> {
  const current = await getCurrentTariffs(at)
  const monthly = current.MONTHLY?.amountFcfa ?? 0
  const yearly = current.YEARLY?.amountFcfa ?? 0

  // L'économie n'est pas un argument commercial figé : elle se déduit des deux
  // montants en vigueur, et disparaît d'elle-même si la grille change.
  const fullYear = monthly * 12
  const saving =
    monthly > 0 && yearly > 0 && yearly < fullYear
      ? Math.round(((fullYear - yearly) / fullYear) * 100)
      : null

  return (['MONTHLY', 'YEARLY'] as const).map((cadence) => {
    const amountFcfa = current[cadence]?.amountFcfa ?? 0
    return {
      cadence,
      name: CADENCE_LABELS[cadence],
      period: CADENCE_PERIODS[cadence],
      amountFcfa,
      free: amountFcfa === 0,
      tariffLabel: current[cadence]?.label ?? null,
      savingPercent: cadence === 'YEARLY' ? saving : null,
    }
  })
}

/**
 * La phrase qui annonce l'abonnement formateur au public.
 *
 * Elle vit ici, et pas dans chaque écran : `/tarifs` et `/aide` la rédigeaient
 * chacun de son côté, et l'aide affirmait encore « ni abonnement pour publier »
 * alors que la grille facturait déjà. Une seule formulation, dérivée des mêmes
 * montants.
 */
export function subscriptionAnnouncement(plans: PublicPlan[]): string {
  const monthly = plans.find((p) => p.cadence === 'MONTHLY')
  const yearly = plans.find((p) => p.cadence === 'YEARLY')
  if (!monthly || !yearly || (monthly.free && yearly.free)) {
    return "Aucun abonnement à régler pour publier."
  }
  return (
    `Abonnement formateur : ${fmtNumber(monthly.amountFcfa)} FCFA/mois ou ` +
    `${fmtNumber(yearly.amountFcfa)} FCFA/an, réglé après validation de votre candidature.`
  )
}

export async function listTariffs(cadence?: PlanCadence) {
  return db.platformTariff.findMany({
    where: { kind: 'SUBSCRIPTION', ...(cadence ? { cadence } : {}) },
    orderBy: [{ cadence: 'asc' }, { validFrom: 'desc' }],
    take: 50,
  })
}

/**
 * Pose un nouveau tarif. Le précédent est **borné**, jamais réécrit : on doit
 * pouvoir dire quel prix était en vigueur le 12 mars (décision 59, interdit de
 * rétroactivité).
 */
export async function setTariff(input: {
  cadence: PlanCadence
  amountFcfa: number
  validFrom: Date
  /** Ce que ce tarif facture — l'abonnement par défaut (arbitrage 69). */
  kind?: 'SUBSCRIPTION' | 'STORAGE_TIER'
  label?: string | null
  actorId: string
}) {
  if (!Number.isInteger(input.amountFcfa) || input.amountFcfa < 0) throw new Error('INVALID_AMOUNT')
  // Décision 59 — une bascule porte une date d'effet, elle ne s'applique jamais
  // à l'instant du clic ni au passé.
  if (input.validFrom.getTime() < Date.now() - 60_000) throw new Error('TARIFF_DATE_IN_PAST')

  // Le bornage ne doit toucher que les tarifs de même nature : poser un prix de
  // palier ne clôt pas le tarif d'abonnement en vigueur.
  const kind = input.kind ?? 'SUBSCRIPTION'

  const { created, previousAmountFcfa } = await db.$transaction(async (tx) => {
    const current = await tx.platformTariff.findFirst({
      where: {
        kind,
        cadence: input.cadence,
        validFrom: { lte: input.validFrom },
        OR: [{ validUntil: null }, { validUntil: { gt: input.validFrom } }],
      },
      orderBy: { validFrom: 'desc' },
    })
    if (current) {
      await tx.platformTariff.update({
        where: { id: current.id },
        data: { validUntil: input.validFrom },
      })
    }

    const created = await tx.platformTariff.create({
      data: {
        kind,
        cadence: input.cadence,
        amountFcfa: input.amountFcfa,
        validFrom: input.validFrom,
        label: input.label ?? null,
        createdById: input.actorId,
      },
    })

    await audit(tx, {
      actorId: input.actorId, actorRole: 'SUPER_ADMIN',
      action: 'PLATFORM_TARIFF_SET', targetType: 'PlatformTariff', targetId: created.id,
      meta: {
        kind, cadence: input.cadence, amountFcfa: input.amountFcfa,
        validFrom: input.validFrom.toISOString(), previousId: current?.id ?? null,
      },
    })

    return { created, previousAmountFcfa: current?.amountFcfa ?? null }
  })

  // L'annonce. Elle part après le commit, comme toute notification : une panne
  // d'écriture de notification ne doit pas annuler une grille déjà posée.
  await deliverSideEffects('PLATFORM_TARIFF_ANNOUNCE', { type: 'PlatformTariff', id: created.id }, () =>
    announceTariffChange({
      kind,
      cadence: input.cadence,
      amountFcfa: input.amountFcfa,
      previousAmountFcfa,
      validFrom: input.validFrom,
    }),
  )

  return created
}

/**
 * Prévient les formateurs concernés qu'une nouvelle grille est posée.
 *
 * Le message annonce **quand** le tarif les atteindra, pas seulement qu'il
 * change : la règle de report (voir `deferTariffChange`) fait qu'un abonné en
 * cours n'est touché qu'à sa 2e échéance suivant `validFrom`. Un nouvel
 * inscrit, lui, souscrit directement au nouveau prix.
 *
 * Ne concerne que l'abonnement : un palier de stockage se facture avec lui et
 * ne mérite pas sa propre alerte. Un tarif reposé à l'identique ne dit rien à
 * personne — on ne notifie que sur un écart réel.
 */
async function announceTariffChange(input: {
  kind: 'SUBSCRIPTION' | 'STORAGE_TIER'
  cadence: PlanCadence
  amountFcfa: number
  previousAmountFcfa: number | null
  validFrom: Date
}): Promise<void> {
  if (input.kind !== 'SUBSCRIPTION') return
  if (input.previousAmountFcfa === input.amountFcfa) return

  const trainers = await db.trainerProfile.findMany({
    where: {
      subscriptionCadence: input.cadence,
      subscriptionStatus: { in: ['ACTIVE', 'PAST_DUE'] },
      subscriptionCanceledAt: null,
    },
    select: { userId: true },
  })
  if (trainers.length === 0) return

  const period = input.cadence === 'YEARLY' ? 'an' : 'mois'
  const direction = input.previousAmountFcfa !== null && input.amountFcfa > input.previousAmountFcfa
    ? 'augmente'
    : 'change'
  const title = `Le tarif de l'abonnement ${input.amountFcfa === 0 ? 'passe à la gratuité' : direction}`
  const grid =
    `À partir du ${fmtDate(input.validFrom)}, l'abonnement formateur ` +
    `${CADENCE_LABELS[input.cadence].toLowerCase()} est fixé à ${fmtNumber(input.amountFcfa)} FCFA par ${period}.`
  const deferral =
    `Votre prochaine échéance reste au tarif actuel : le nouveau prix s'appliquera à celle d'après, ` +
    `et vous recevrez un rappel avec la date exacte.`

  // Un envoi par formateur, isolé : une adresse invalide ou un rate limit du
  // fournisseur ne doit pas priver les suivants de l'annonce. `notifyWithEmail`
  // écrit la notification avant de tenter l'email — l'information reste donc
  // dans le compte même quand l'envoi échoue.
  for (const { userId } of trainers) {
    await deliverSideEffects('PLATFORM_TARIFF_ANNOUNCE_ONE', { type: 'User', id: userId }, () =>
      notifyWithEmail(
        userId,
        {
          type: 'SUBSCRIPTION_TARIFF_CHANGE_ANNOUNCED',
          title,
          body: `${grid} ${deferral}`,
          link: '/formateur/portefeuille',
        },
        {
          subject: `NkamVa — ${title}`,
          title,
          paragraphs: [grid, deferral],
          cta: { label: 'Voir mon abonnement', url: absoluteUrl('/formateur/portefeuille') },
        },
        'subscriptionNoticeEmails',
      ),
    )
  }
}

export async function listDiscounts(activeOnly = false) {
  const now = new Date()
  return db.platformDiscount.findMany({
    where: activeOnly
      ? { validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }
      : {},
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function createDiscount(input: {
  kind: DiscountKind
  label: string
  amountFcfa: number
  code?: string | null
  trainerId?: string | null
  reason?: string | null
  validFrom: Date
  validUntil?: Date | null
  maxUses?: number | null
  actorId: string
  actorRole: string
}) {
  if (!Number.isInteger(input.amountFcfa) || input.amountFcfa <= 0) throw new Error('INVALID_AMOUNT')
  if (input.kind === 'PROMO_CODE' && !input.code) throw new Error('CODE_REQUIRED')
  // Une remise nominative est toujours motivée : elle contourne la grille, et
  // c'est ce qui rend l'audit indispensable (décision 62).
  if (input.kind === 'TRAINER' && (!input.trainerId || !input.reason)) {
    throw new Error('TRAINER_DISCOUNT_NEEDS_REASON')
  }

  return db.$transaction(async (tx) => {
    const created = await tx.platformDiscount.create({
      data: {
        kind: input.kind,
        label: input.label,
        amountFcfa: input.amountFcfa,
        code: input.code ?? null,
        trainerId: input.trainerId ?? null,
        reason: input.reason ?? null,
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        maxUses: input.maxUses ?? null,
        createdById: input.actorId,
      },
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PLATFORM_DISCOUNT_CREATED', targetType: 'PlatformDiscount', targetId: created.id,
      meta: { kind: input.kind, amountFcfa: input.amountFcfa, trainerId: input.trainerId ?? null },
    })
    return created
  })
}

/** Clôt une remise sans la supprimer : l'historique de facturation en dépend. */
export async function endDiscount(discountId: string, actorId: string, actorRole: string) {
  const existing = await db.platformDiscount.findUnique({ where: { id: discountId } })
  if (!existing) throw new Error('DISCOUNT_NOT_FOUND')
  if (existing.validUntil && existing.validUntil <= new Date()) throw new Error('DISCOUNT_ALREADY_ENDED')

  return db.$transaction(async (tx) => {
    const updated = await tx.platformDiscount.update({
      where: { id: discountId },
      data: { validUntil: new Date() },
    })
    await audit(tx, {
      actorId, actorRole,
      action: 'PLATFORM_DISCOUNT_ENDED', targetType: 'PlatformDiscount', targetId: discountId,
      meta: { kind: updated.kind },
    })
    return updated
  })
}

export interface PriceQuote {
  cadence: PlanCadence
  listPriceFcfa: number
  /** Réduction retenue — la plus favorable, jamais la somme (décision 62). */
  discountFcfa: number
  discountLabel: string | null
  payableFcfa: number
  /** Les réductions écartées, pour expliquer le choix. */
  consideredCount: number
}

/**
 * Calcule ce qu'un formateur paiera. Décision 62 — **la plus favorable
 * l'emporte** : campagne, remise nominative et code promo ne s'additionnent
 * pas. Décision 57 — le résultat est un montant, jamais un pourcentage : deux
 * réductions se comparent alors sans ambiguïté d'arrondi.
 */
export async function quotePrice(
  cadence: PlanCadence,
  options: { trainerId?: string | null; promoCode?: string | null; at?: Date } = {},
): Promise<PriceQuote> {
  const at = options.at ?? new Date()
  const tariff = await getCurrentTariff(cadence, at)
  const listPrice = tariff?.amountFcfa ?? 0

  const validWindow = {
    validFrom: { lte: at },
    OR: [{ validUntil: null }, { validUntil: { gt: at } }],
  }

  const candidates = await db.platformDiscount.findMany({
    where: {
      ...validWindow,
      OR: [
        { kind: 'CAMPAIGN' },
        ...(options.trainerId ? [{ kind: 'TRAINER' as const, trainerId: options.trainerId }] : []),
        ...(options.promoCode ? [{ kind: 'PROMO_CODE' as const, code: options.promoCode }] : []),
      ],
    },
  })

  // Un code promo épuisé ne s'applique plus, même s'il est encore dans sa
  // fenêtre de validité.
  const usable = candidates.filter(d => d.maxUses === null || d.usedCount < d.maxUses)

  const best = usable.reduce<(typeof usable)[number] | null>(
    (winner, d) => (winner === null || d.amountFcfa > winner.amountFcfa ? d : winner),
    null,
  )

  // Un plancher à zéro, jamais en dessous : une remise ne crée pas de créance.
  const discount = Math.min(best?.amountFcfa ?? 0, listPrice)

  return {
    cadence,
    listPriceFcfa: listPrice,
    discountFcfa: discount,
    discountLabel: best?.label ?? null,
    payableFcfa: listPrice - discount,
    consideredCount: usable.length,
  }
}
