// ==========================================================================
// Plans Community : modèle économique v1.1 (« Grille Community à partir du
// 1er mars 2027, option B »)
// ==========================================================================
// Le formateur paie sa communauté selon sa taille :
//
//   Découverte   0-20 membres        0 FCFA/mois    20 participants   replays audio          2 Go
//   Essentiel    21-200 membres  10 000 FCFA/mois   200 participants  replays audio et vidéo 10 Go
//   Croissance   201-1 000       25 000 FCFA/mois   ~300 en vidéo, 1 000 en audio           30 Go
//   Premium      1 001-3 000     50 000 FCFA/mois   ~300 en vidéo, 3 000 en audio           50 Go
//
// Tous incluent 2 à 3 lives par semaine, de 2 h au plus. Au-delà de 3 000
// membres, une offre « Organisations » sera construite plus tard : la
// communauté n'accepte plus de membre.
//
// Avant le 1er mars 2027 (règles du lancement, sur LiveKit Cloud) : aucune
// communauté ne paie, toutes ont jusqu'à 3 lives par semaine de 2 h, et les
// replays sont en audio.
//
// Mécanique, sans nouveau circuit de paiement : les plans s'ajoutent à
// l'échéance mensuelle du formateur, comme les paliers de stockage
// (`SubscriptionCharge.communityPlansFcfa`, détail figé dans
// `communityPlans`). Trois règles :
//
// 1. **Le plan suit la taille.** Au renouvellement, chaque communauté est
//    facturée au plan qu'impose son nombre de membres. Le formateur qui veut
//    rester gratuit pose un plafond (`maxPlan`) : les adhésions s'arrêtent à la
//    taille de ce plan. Rien ne se paie par surprise : le plafond se règle sur
//    la page de la communauté.
// 2. **Les droits suivent le règlement.** Le plan payé (`Community.plan`)
//    ouvre les droits ; le règlement de l'échéance l'applique.
// 3. **Un impayé ne coupe rien** (principe 5). Au-delà du délai de grâce, la
//    communauté repasse aux droits Découverte (`planUnpaidAt`), garde tous ses
//    membres, et n'en accepte plus au-delà de 20 jusqu'au règlement.
//
// ⚠️ La grille est celle du modèle v1.1. Le plan d'action (2.2) prévoit une
// grille définitive annoncée au plus tard le 29 janvier 2027 : elle se
// remplace ici, en un seul endroit.
// ==========================================================================

import type { CommunityPlan, PlanCadence, Prisma } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import type { PrismaTransaction } from './types'

const GO = 1024 ** 3

/** Entrée en vigueur de la grille (modèle v1.1, calendrier « Appliquer »). */
export const COMMUNITY_GRID_AT = new Date('2027-03-01T00:00:00+01:00')

/** Au-delà : offre « Organisations », pas encore construite. */
export const COMMUNITY_MAX_MEMBERS = 3_000

export interface CommunityPlanTerms {
  label: string
  minMembers: number
  maxMembers: number
  priceFcfa: number
  liveParticipantsVideo: number
  liveParticipantsAudio: number
  videoReplays: boolean
  storageBytes: number
}

export const COMMUNITY_PLAN_ORDER: CommunityPlan[] = ['DECOUVERTE', 'ESSENTIEL', 'CROISSANCE', 'PREMIUM']

export const COMMUNITY_PLANS: Record<CommunityPlan, CommunityPlanTerms> = {
  DECOUVERTE: {
    label: 'Découverte', minMembers: 0, maxMembers: 20, priceFcfa: 0,
    liveParticipantsVideo: 20, liveParticipantsAudio: 20, videoReplays: false, storageBytes: 2 * GO,
  },
  ESSENTIEL: {
    label: 'Essentiel', minMembers: 21, maxMembers: 200, priceFcfa: 10_000,
    liveParticipantsVideo: 200, liveParticipantsAudio: 200, videoReplays: true, storageBytes: 10 * GO,
  },
  // HYPOTHÈSE du modèle : ~300 en vidéo, 1 000 en audio.
  CROISSANCE: {
    label: 'Croissance', minMembers: 201, maxMembers: 1_000, priceFcfa: 25_000,
    liveParticipantsVideo: 300, liveParticipantsAudio: 1_000, videoReplays: true, storageBytes: 30 * GO,
  },
  // HYPOTHÈSE du modèle : ~300 en vidéo, 3 000 en audio.
  PREMIUM: {
    label: 'Premium', minMembers: 1_001, maxMembers: 3_000, priceFcfa: 50_000,
    liveParticipantsVideo: 300, liveParticipantsAudio: 3_000, videoReplays: true, storageBytes: 50 * GO,
  },
}

export function communityPlansInForce(at = new Date()): boolean {
  return at >= COMMUNITY_GRID_AT
}

/** Le plus petit plan qui contient ce nombre de membres. */
export function requiredPlanFor(members: number): CommunityPlan {
  return COMMUNITY_PLAN_ORDER.find((p) => members <= COMMUNITY_PLANS[p].maxMembers) ?? 'PREMIUM'
}

function rank(plan: CommunityPlan): number {
  return COMMUNITY_PLAN_ORDER.indexOf(plan)
}

/** Le plan à facturer : celui de la taille, sans dépasser le plafond voulu. */
export function billedPlanFor(c: { membersCount: number; maxPlan: CommunityPlan | null }): CommunityPlan {
  const required = requiredPlanFor(c.membersCount)
  if (c.maxPlan && rank(required) > rank(c.maxPlan)) return c.maxPlan
  return required
}

interface PlanState {
  plan: CommunityPlan
  maxPlan: CommunityPlan | null
  planUnpaidAt: Date | null
}

/**
 * Le plan dont la communauté a les droits. Avant la grille : `null`, ce sont
 * les règles du lancement qui s'appliquent.
 */
export function effectivePlan(c: PlanState, at = new Date()): CommunityPlan | null {
  if (!communityPlansInForce(at)) return null
  return c.planUnpaidAt ? 'DECOUVERTE' : c.plan
}

/**
 * Combien de membres la communauté peut avoir. `null` : pas de limite (règles
 * du lancement).
 */
export function membershipCap(c: PlanState, at = new Date()): number | null {
  if (!communityPlansInForce(at)) return null
  if (c.planUnpaidAt) return COMMUNITY_PLANS.DECOUVERTE.maxMembers
  if (c.maxPlan) return COMMUNITY_PLANS[c.maxPlan].maxMembers
  return COMMUNITY_MAX_MEMBERS
}

/** Les replays de cette communauté s'enregistrent-ils en vidéo ? */
export function replayRecordsVideo(c: PlanState, at = new Date()): boolean {
  const plan = effectivePlan(c, at)
  // Règles du lancement (décembre-février) : replays en audio.
  if (!plan) return false
  return COMMUNITY_PLANS[plan].videoReplays
}

/** Participants simultanés d'un live. `null` : pas de limite (lancement). */
export function liveParticipantCap(c: PlanState, audioOnly: boolean, at = new Date()): number | null {
  const plan = effectivePlan(c, at)
  if (!plan) return null
  const terms = COMMUNITY_PLANS[plan]
  return audioOnly ? terms.liveParticipantsAudio : terms.liveParticipantsVideo
}

/** Stockage apporté par les communautés au quota du formateur. */
export function communityStorageBytes(communities: PlanState[], at = new Date()): number {
  if (!communityPlansInForce(at)) return 0
  return communities.reduce((sum, c) => sum + COMMUNITY_PLANS[effectivePlan(c, at) ?? 'DECOUVERTE'].storageBytes, 0)
}

/**
 * Refuse une nouvelle adhésion quand la communauté a atteint la taille de son
 * plan. À appeler à l'ouverture d'un paiement ou d'une invitation, jamais au
 * règlement : un paiement encaissé ouvre toujours l'accès.
 */
export async function assertCommunityCanGrow(communityId: string, at = new Date()): Promise<void> {
  if (!communityPlansInForce(at)) return
  const c = await db.community.findUnique({
    where: { id: communityId },
    select: { membersCount: true, plan: true, maxPlan: true, planUnpaidAt: true },
  })
  if (!c) return
  const cap = membershipCap(c, at)
  if (cap !== null && c.membersCount >= cap) throw new Error('COMMUNITY_FULL')
}

export interface CommunityPlanLine {
  communityId: string
  name: string
  plan: CommunityPlan
  members: number
  priceFcfa: number
}

/**
 * Ce que coûtent les communautés du formateur sur une période. Appelée par
 * l'ouverture et le renouvellement d'une période, comme `storageChargeFor`.
 */
export async function communityPlanChargeFor(
  trainerProfileId: string,
  cadence: PlanCadence,
  at: Date,
): Promise<{ amountFcfa: number; lines: CommunityPlanLine[] }> {
  if (!communityPlansInForce(at)) return { amountFcfa: 0, lines: [] }
  const communities = await db.community.findMany({
    where: { trainerId: trainerProfileId, status: 'active' },
    select: { id: true, name: true, membersCount: true, maxPlan: true },
    orderBy: { createdAt: 'asc' },
  })
  const months = cadence === 'YEARLY' ? 12 : 1
  const lines = communities.map((c) => {
    const plan = billedPlanFor(c)
    return { communityId: c.id, name: c.name, plan, members: c.membersCount, priceFcfa: COMMUNITY_PLANS[plan].priceFcfa * months }
  })
  return { amountFcfa: lines.reduce((s, l) => s + l.priceFcfa, 0), lines }
}

function linesOf(json: Prisma.JsonValue | null): CommunityPlanLine[] {
  return Array.isArray(json) ? (json as unknown as CommunityPlanLine[]) : []
}

/**
 * Applique les plans d'une période. Appelée à la création de la période pour
 * les plans gratuits (une communauté qui redescend à Découverte n'a rien à
 * payer), et au règlement pour les autres.
 */
export async function applyCommunityPlans(
  tx: PrismaTransaction,
  chargeId: string,
  only: 'FREE' | 'ALL',
): Promise<void> {
  const charge = await tx.subscriptionCharge.findUnique({
    where: { id: chargeId },
    select: { communityPlans: true, trainerId: true },
  })
  if (!charge) return
  for (const line of linesOf(charge.communityPlans)) {
    if (only === 'FREE' && line.priceFcfa > 0) continue
    const current = await tx.community.findUnique({ where: { id: line.communityId }, select: { plan: true, planUnpaidAt: true } })
    if (!current || (current.plan === line.plan && !current.planUnpaidAt)) continue
    await tx.community.update({ where: { id: line.communityId }, data: { plan: line.plan, planUnpaidAt: null } })
    await audit(tx, {
      actorId: null, actorRole: 'SYSTEM',
      action: 'COMMUNITY_PLAN_CHANGED', targetType: 'Community', targetId: line.communityId,
      meta: { from: current.plan, to: line.plan, chargeId },
    })
  }
}

/**
 * Plans restés impayés au-delà du délai de grâce : chaque communauté facturée
 * repasse aux droits Découverte, sans perdre un membre.
 */
export async function markCommunityPlansUnpaid(tx: PrismaTransaction, chargeIds: string[], now = new Date()): Promise<number> {
  const charges = await tx.subscriptionCharge.findMany({ where: { id: { in: chargeIds } }, select: { communityPlans: true } })
  const ids = [...new Set(charges.flatMap((c) => linesOf(c.communityPlans).filter((l) => l.priceFcfa > 0).map((l) => l.communityId)))]
  if (ids.length === 0) return 0
  const { count } = await tx.community.updateMany({
    where: { id: { in: ids }, planUnpaidAt: null },
    data: { planUnpaidAt: now, plan: 'DECOUVERTE' },
  })
  for (const id of ids) {
    await audit(tx, {
      actorId: null, actorRole: 'SYSTEM',
      action: 'COMMUNITY_PLAN_UNPAID', targetType: 'Community', targetId: id,
    })
  }
  return count
}

/**
 * Une échéance ne contient-elle que des plans (Pro, Community) ? C'est elle
 * qu'un impayé fait redescendre au lieu de suspendre (principe 5). Le stockage
 * acheté, lui, garde sa règle : il a été consommé.
 */
export function chargeIsPlansOnly(c: {
  plan: 'BASE' | 'PRO'
  amountDueFcfa: number
  storageFcfa: number
  communityPlansFcfa: number
}): boolean {
  if (c.storageFcfa > 0) return false
  return c.plan === 'PRO' || c.amountDueFcfa === c.communityPlansFcfa
}

/** Le formateur pose ou retire le plafond de sa communauté. */
export async function setCommunityMaxPlan(communityId: string, trainerUserId: string, maxPlan: CommunityPlan | null) {
  const community = await db.community.findFirst({
    where: { id: communityId, trainerProfile: { userId: trainerUserId } },
    select: { id: true, maxPlan: true, membersCount: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  await db.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { maxPlan } })
    await audit(tx, {
      actorId: trainerUserId, actorRole: 'TRAINER',
      action: 'COMMUNITY_MAX_PLAN_SET', targetType: 'Community', targetId: communityId,
      meta: { from: community.maxPlan, to: maxPlan, members: community.membersCount },
    })
  })
  // Un plafond sous la taille actuelle ne retire personne : il arrête les
  // adhésions, et le plan facturé ne dépasse plus le plafond.
  return { maxPlan, overCap: maxPlan !== null && community.membersCount > COMMUNITY_PLANS[maxPlan].maxMembers }
}

/** Ce que la page de la communauté affiche de son plan. */
export function describeCommunityPlan(c: PlanState & { membersCount: number }, at = new Date()) {
  const inForce = communityPlansInForce(at)
  const billed = billedPlanFor(c)
  return {
    inForce,
    gridAt: COMMUNITY_GRID_AT,
    plan: c.plan,
    effective: effectivePlan(c, at),
    billedNext: billed,
    billedNextFcfa: COMMUNITY_PLANS[billed].priceFcfa,
    maxPlan: c.maxPlan,
    unpaid: Boolean(c.planUnpaidAt),
    cap: membershipCap(c, at),
    members: c.membersCount,
  }
}
