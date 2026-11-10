// ==========================================================================
// Plans Marketplace du formateur : modèle économique v1.1
// ==========================================================================
// Deux plans :
//
//   · « Vous ne payez que quand vous vendez » (BASE) : 0 FCFA par mois, 10 %
//     par vente, 5 Go plus les Go gagnés avec les ventes ;
//   · Pro : 15 000 FCFA par mois, 3 % par vente, 100 Go.
//
// Le Pro est ouvert aux formateurs fondateurs dès le lancement du 30 novembre
// 2026, et à tous au 1er mars 2027 (`PRO_OPEN_TO_ALL_AT`).
//
// La mécanique d'abonnement existante (périodes, échéances, prélèvement sur le
// solde, factures) sert telle quelle : une période Pro est une
// `SubscriptionCharge` dont `plan` vaut PRO, facturée au tarif
// `PRO_SUBSCRIPTION`. Trois règles :
//
// 1. **La montée en Pro prend effet au règlement.** Demander le Pro clôt la
//    période de base (elle ne coûte rien) et ouvre une période Pro due ; le
//    taux de 3 % ne s'applique qu'une fois cette période réglée. Personne ne
//    profite du Pro sans l'avoir payé.
// 2. **Le retour au plan de base se fait sans pénalité, en fin de période**
//    (« Il peut revenir au plan de base quand il veut, sans pénalité ») : la
//    période Pro payée va à son terme.
// 3. **Un Pro impayé ne coupe rien** (principe 5 : « On ne coupe jamais
//    brutalement ») : à la fin du délai de grâce, le formateur repasse au plan
//    de base au lieu d'être suspendu. Ses ressources restent en vente.
// ==========================================================================

import type { TrainerPlan } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { PLATFORM_COMMISSION_RATE, PRO_COMMISSION_RATE } from './commission'
import type { PrismaTransaction } from './types'

/** Ouverture du Pro à tous les formateurs (modèle v1.1, calendrier). */
export const PRO_OPEN_TO_ALL_AT = new Date('2027-03-01T00:00:00+01:00')

/** Prix du Pro annoncé par le modèle, repli si aucun tarif n'est posé en base. */
export const PRO_MONTHLY_PRICE_FCFA = 15_000

/**
 * Seuil où les deux plans coûtent la même chose : 15 000 / (10 % - 3 %),
 * soit ~214 286 FCFA de ventes par mois. Au-dessus, le Pro est moins cher.
 */
export const PRO_BREAK_EVEN_FCFA = Math.round(PRO_MONTHLY_PRICE_FCFA / (PLATFORM_COMMISSION_RATE - PRO_COMMISSION_RATE))

export const PLAN_LABELS: Record<TrainerPlan, string> = {
  BASE: 'Vous ne payez que quand vous vendez',
  PRO: 'Pro',
}

export function commissionRateForPlan(plan: TrainerPlan): number {
  return plan === 'PRO' ? PRO_COMMISSION_RATE : PLATFORM_COMMISSION_RATE
}

/** Le Pro est-il ouvert à ce formateur, à cette date ? */
export function proAvailableFor(profile: { founder: boolean }, at = new Date()): boolean {
  return profile.founder || at >= PRO_OPEN_TO_ALL_AT
}

/**
 * Ce que le formateur paie par mois sur chaque plan, pour un volume de ventes
 * donné. C'est le tableau du modèle (« Ventes du formateur par mois »), et ce
 * que l'écran de comparaison affiche.
 */
export function monthlyCostByPlan(salesFcfa: number, proPriceFcfa = PRO_MONTHLY_PRICE_FCFA) {
  return {
    BASE: Math.round(salesFcfa * PLATFORM_COMMISSION_RATE),
    PRO: proPriceFcfa + Math.round(salesFcfa * PRO_COMMISSION_RATE),
  }
}

/**
 * Applique le plan d'une période qui vient d'être réglée. Appelée dans la
 * transaction de chaque règlement (paiement fournisseur, constat Finances,
 * prélèvement sur le solde) : la montée en Pro ne dépend d'aucun chemin
 * particulier.
 */
export async function applySettledChargePlan(tx: PrismaTransaction, chargeId: string): Promise<void> {
  const charge = await tx.subscriptionCharge.findUnique({
    where: { id: chargeId },
    select: { plan: true, trainerId: true, status: true },
  })
  if (!charge || charge.status !== 'SETTLED' || charge.plan !== 'PRO') return

  const profile = await tx.trainerProfile.findUnique({
    where: { id: charge.trainerId },
    select: { plan: true, pendingPlan: true },
  })
  if (!profile) return
  // Déjà en Pro (renouvellement) : rien à changer, sauf une demande de retour
  // au plan de base, qui attend la fin de la période.
  if (profile.plan === 'PRO') return

  await tx.trainerProfile.update({
    where: { id: charge.trainerId },
    data: {
      plan: 'PRO',
      pendingPlan: profile.pendingPlan === 'PRO' ? null : profile.pendingPlan,
      commissionRate: commissionRateForPlan('PRO'),
    },
  })
  await audit(tx, {
    actorId: null, actorRole: 'SYSTEM',
    action: 'TRAINER_PLAN_CHANGED', targetType: 'TrainerProfile', targetId: charge.trainerId,
    meta: { from: profile.plan, to: 'PRO', chargeId },
  })
}

/**
 * Le formateur demande le Pro. La période de base en cours se clôt (elle ne
 * coûte rien) et une période Pro mensuelle s'ouvre, due : le formateur la règle
 * comme toute échéance (mobile money, carte, ou son solde). Le Pro, et ses 3 %,
 * prennent effet au règlement.
 */
export async function requestProPlan(trainerProfileId: string, userId: string, now = new Date()) {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { plan: true, pendingPlan: true, founder: true, subscriptionStatus: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  if (profile.plan === 'PRO') {
    // Un retour au plan de base demandé se retire simplement.
    if (profile.pendingPlan === 'BASE') {
      await db.$transaction(async (tx) => {
        await tx.trainerProfile.update({ where: { id: trainerProfileId }, data: { pendingPlan: null } })
        await audit(tx, {
          actorId: userId, actorRole: 'TRAINER',
          action: 'TRAINER_PLAN_DOWNGRADE_CANCELED', targetType: 'TrainerProfile', targetId: trainerProfileId,
        })
      })
      return { status: 'ALREADY_PRO' as const }
    }
    throw new Error('ALREADY_PRO')
  }
  if (!proAvailableFor(profile, now)) throw new Error('PRO_NOT_YET_AVAILABLE')
  if (profile.subscriptionStatus === 'SUSPENDED') throw new Error('SUBSCRIPTION_SUSPENDED')

  const existingDue = await db.subscriptionCharge.findFirst({
    where: { trainerId: trainerProfileId, plan: 'PRO', status: 'DUE' },
    select: { id: true },
  })
  if (existingDue) return { status: 'PAYMENT_DUE' as const, chargeId: existingDue.id }

  const tariff = await db.platformTariff.findFirst({
    where: {
      kind: 'PRO_SUBSCRIPTION', cadence: 'MONTHLY',
      validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    orderBy: { validFrom: 'desc' },
  })
  const priceFcfa = tariff?.amountFcfa ?? PRO_MONTHLY_PRICE_FCFA
  const periodEnd = new Date(now)
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)

  const charge = await db.$transaction(async (tx) => {
    const created = await tx.subscriptionCharge.create({
      data: {
        trainerId: trainerProfileId,
        plan: 'PRO',
        cadence: 'MONTHLY',
        periodStart: now,
        periodEnd,
        listPriceFcfa: priceFcfa,
        amountDueFcfa: priceFcfa,
        status: priceFcfa === 0 ? 'SETTLED' : 'DUE',
        settledAt: priceFcfa === 0 ? now : null,
      },
    })
    await tx.trainerProfile.update({
      where: { id: trainerProfileId },
      data: {
        pendingPlan: 'PRO',
        subscriptionCadence: 'MONTHLY',
        pendingCadence: null,
        subscriptionCurrentPeriodEnd: periodEnd,
        subscriptionPriceFcfa: priceFcfa,
      },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'TRAINER_PLAN_PRO_REQUESTED', targetType: 'TrainerProfile', targetId: trainerProfileId,
      meta: { chargeId: created.id, priceFcfa, founder: profile.founder },
    })
    if (created.status === 'SETTLED') await applySettledChargePlan(tx, created.id)
    return created
  })

  return { status: charge.status === 'SETTLED' ? ('ACTIVE' as const) : ('PAYMENT_DUE' as const), chargeId: charge.id }
}

/**
 * Le formateur revient au plan de base. Sans pénalité : la période Pro payée
 * va à son terme, et le renouvellement ouvre une période de base.
 */
export async function requestBasePlan(trainerProfileId: string, userId: string) {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { plan: true, pendingPlan: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')

  // Une montée en Pro pas encore réglée s'annule : la période due disparaît.
  if (profile.plan === 'BASE') {
    if (profile.pendingPlan !== 'PRO') throw new Error('ALREADY_BASE')
    await db.$transaction(async (tx) => {
      await tx.subscriptionCharge.updateMany({
        where: { trainerId: trainerProfileId, plan: 'PRO', status: 'DUE' },
        data: { status: 'WAIVED', settledAt: new Date() },
      })
      await tx.trainerProfile.update({
        where: { id: trainerProfileId },
        data: { pendingPlan: null, subscriptionStatus: 'ACTIVE', subscriptionPastDueAt: null },
      })
      await audit(tx, {
        actorId: userId, actorRole: 'TRAINER',
        action: 'TRAINER_PLAN_PRO_CANCELED', targetType: 'TrainerProfile', targetId: trainerProfileId,
      })
    })
    return { effective: 'NOW' as const }
  }

  await db.$transaction(async (tx) => {
    await tx.trainerProfile.update({ where: { id: trainerProfileId }, data: { pendingPlan: 'BASE' } })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'TRAINER_PLAN_DOWNGRADE_REQUESTED', targetType: 'TrainerProfile', targetId: trainerProfileId,
    })
  })
  return { effective: 'END_OF_PERIOD' as const }
}

/**
 * Le plan qu'ouvre le renouvellement d'une période. Appelée par
 * `renewDueSubscriptions` avant de facturer : un retour au plan de base
 * demandé prend effet ici, et le taux de commission suit.
 */
export async function resolveRenewalPlan(tx: PrismaTransaction, trainerProfileId: string): Promise<TrainerPlan> {
  const profile = await tx.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { plan: true, pendingPlan: true },
  })
  if (!profile) return 'BASE'
  // Une montée en Pro jamais réglée ne survit pas au renouvellement : la
  // période qui s'ouvre est une période de base, et la demande est close.
  if (profile.plan === 'BASE' && profile.pendingPlan === 'PRO') {
    await tx.subscriptionCharge.updateMany({
      where: { trainerId: trainerProfileId, plan: 'PRO', status: 'DUE' },
      data: { status: 'WAIVED', settledAt: new Date() },
    })
    await tx.trainerProfile.update({ where: { id: trainerProfileId }, data: { pendingPlan: null } })
    return 'BASE'
  }
  if (profile.plan === 'PRO' && profile.pendingPlan === 'BASE') {
    await downgradeToBase(tx, trainerProfileId, 'REQUESTED')
    return 'BASE'
  }
  return profile.plan
}

/**
 * Retour au plan de base : demande du formateur, ou Pro impayé au-delà du
 * délai de grâce (principe 5 : on ne suspend pas, on redescend).
 */
export async function downgradeToBase(
  tx: PrismaTransaction,
  trainerProfileId: string,
  reason: 'REQUESTED' | 'UNPAID',
): Promise<void> {
  await tx.trainerProfile.update({
    where: { id: trainerProfileId },
    data: {
      plan: 'BASE',
      pendingPlan: null,
      commissionRate: commissionRateForPlan('BASE'),
      ...(reason === 'UNPAID' ? { subscriptionStatus: 'ACTIVE', subscriptionPastDueAt: null } : {}),
    },
  })
  if (reason === 'UNPAID') {
    // La période Pro impayée n'est pas une dette : elle n'a jamais donné le Pro
    // (montée) ou le formateur repasse à 10 % dès maintenant (renouvellement).
    await tx.subscriptionCharge.updateMany({
      where: { trainerId: trainerProfileId, plan: 'PRO', status: 'DUE' },
      data: { status: 'WAIVED', settledAt: new Date() },
    })
  }
  await audit(tx, {
    actorId: null, actorRole: 'SYSTEM',
    action: 'TRAINER_PLAN_CHANGED', targetType: 'TrainerProfile', targetId: trainerProfileId,
    meta: { to: 'BASE', reason },
  })
}

/** Ce que l'espace formateur affiche de son plan. */
export async function getMyPlan(trainerProfileId: string, now = new Date()) {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: {
      plan: true, pendingPlan: true, founder: true, commissionRate: true,
      subscriptionCurrentPeriodEnd: true,
    },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  const due = await db.subscriptionCharge.findFirst({
    where: { trainerId: trainerProfileId, plan: 'PRO', status: 'DUE' },
    select: { id: true, amountDueFcfa: true },
  })
  return {
    plan: profile.plan,
    planLabel: PLAN_LABELS[profile.plan],
    pendingPlan: profile.pendingPlan,
    founder: profile.founder,
    commissionRate: profile.commissionRate,
    periodEnd: profile.subscriptionCurrentPeriodEnd,
    proAvailable: proAvailableFor(profile, now),
    proOpensAt: PRO_OPEN_TO_ALL_AT,
    proDue: due,
    breakEvenFcfa: PRO_BREAK_EVEN_FCFA,
  }
}
