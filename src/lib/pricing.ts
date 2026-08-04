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

  return db.$transaction(async (tx) => {
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

    return created
  })
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
