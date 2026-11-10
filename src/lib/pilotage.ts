// ==========================================================================
// Tableau de pilotage du modèle économique v1.1 : plan d'action, phase 1
// ==========================================================================
// 1.1 Les indicateurs qui distinguent les scénarios du modèle : part de la base
//     de formateurs devenue active (« le premier chiffre à mesurer dès
//     décembre »), formateurs actifs, ventes moyennes par formateur actif,
//     départs mensuels, apprenants actifs par formateur actif, recettes par
//     source et par mois.
// 1.2 Une période choisie (mois de début, mois de fin) et l'export CSV.
// 1.3 L'ancienneté des dossiers dans chaque file, avec le délai de 72 h
//     ouvrées promis aux remboursements.
// 1.6 Le suivi des lives : h-participants, présents moyens, coût, données.
//
// Aucune collecte nouvelle : tout se lit dans les tables existantes, et se
// recalcule à l'affichage.
//
// Définitions (HYPOTHÈSES de mesure, à valider par Jaurès, plan d'action 1.1) :
//   · formateur actif sur un mois : au moins une vente encaissée dans le mois ;
//   · départ : formateur actif le mois précédent, sans vente ce mois-ci ;
//   · apprenant actif : a acheté, ou assisté à un live, dans le mois.
// ==========================================================================

import { db } from './db'
import { getSettingNumber } from './settings'
import { budgetState, monthParticipantHours } from './live-budget'

// --- Le modèle, tel qu'il est écrit --------------------------------------

/** Les trois scénarios du modèle v1.1 (« Ce que NKAMVA peut rapporter »). */
export const MODEL_SCENARIOS = [
  { key: 'PRUDENT', label: 'Prudent', baseConversion: 0.2, avgSalesFcfa: 20_000, churn: 0.1, learnersPerTrainer: 10, activeTrainersNov2027: 82, newPerMonthFromMarch: 5 },
  { key: 'MOYEN', label: 'Moyen', baseConversion: 0.35, avgSalesFcfa: 40_000, churn: 0.07, learnersPerTrainer: 20, activeTrainersNov2027: 199, newPerMonthFromMarch: 12 },
  { key: 'AMBITIEUX', label: 'Ambitieux', baseConversion: 0.5, avgSalesFcfa: 60_000, churn: 0.05, learnersPerTrainer: 30, activeTrainersNov2027: 382, newPerMonthFromMarch: 25 },
] as const

/** Base de formateurs à prospecter : de 150 à 600 entre décembre et mai. */
export const MODEL_TRAINER_BASE_TARGET = 600

// --- Période --------------------------------------------------------------

export interface MonthSlot {
  key: string // AAAA-MM
  label: string
  start: Date
  end: Date
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const MAX_MONTHS = 24

function monthStart(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 1))
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * La période demandée, en mois entiers. Sans paramètre : les six derniers mois,
 * mois en cours compris. Bornée à 24 mois ; une valeur illisible retombe sur le
 * défaut plutôt que de produire un écran vide.
 */
export function parsePeriod(du?: string | null, au?: string | null, now = new Date()): { from: Date; to: Date; months: MonthSlot[] } {
  const current = monthStart(now.getUTCFullYear(), now.getUTCMonth())
  const parse = (v?: string | null) => {
    const m = v ? MONTH_RE.exec(v) : null
    return m ? monthStart(Number(m[1]), Number(m[2]) - 1) : null
  }
  let end = parse(au) ?? current
  let start = parse(du) ?? monthStart(end.getUTCFullYear(), end.getUTCMonth() - 5)
  if (start > end) [start, end] = [end, start]
  const months: MonthSlot[] = []
  for (let d = start; d <= end && months.length < MAX_MONTHS; d = monthStart(d.getUTCFullYear(), d.getUTCMonth() + 1)) {
    const next = monthStart(d.getUTCFullYear(), d.getUTCMonth() + 1)
    months.push({
      key: monthKey(d),
      label: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d),
      start: d,
      end: next,
    })
  }
  return { from: months[0].start, to: months[months.length - 1].end, months }
}

// --- Indicateurs par mois -------------------------------------------------

export interface MonthMetrics {
  key: string
  label: string
  activeTrainers: number
  newlyActiveTrainers: number
  /** Part des formateurs actifs le mois précédent qui n'ont rien vendu ce mois-ci. */
  churnRate: number | null
  salesCount: number
  salesFcfa: number
  avgSalesPerActiveFcfa: number | null
  activeLearners: number
  learnersPerActiveTrainer: number | null
  revenue: {
    commissionsFcfa: number
    proFcfa: number
    communityPlansFcfa: number
    storageFcfa: number
    otherSubscriptionsFcfa: number
    totalFcfa: number
  }
  /** Plan d'action 3.2 : marketing payant du mois, et son coût par nouveau formateur actif. */
  marketingFcfa: number | null
  marketingPerNewActiveFcfa: number | null
  lives: {
    sessions: number
    participantHours: number
    avgAttendees: number | null
    overrunFcfa: number
    dataGb: number
  }
}

/** Ce que pèse une h-participant (modèle v1.1, plafonds mesurés). */
const MB_PER_PARTICIPANT_HOUR_VIDEO = 224.5
const MB_PER_PARTICIPANT_HOUR_AUDIO = 22

export async function getModelMetrics(period: { from: Date; to: Date; months: MonthSlot[] }): Promise<MonthMetrics[]> {
  const before = monthStart(period.from.getUTCFullYear(), period.from.getUTCMonth() - 1)

  const [sales, firstSales, charges, sessions, participants, liveCap, marketing] = await Promise.all([
    db.purchase.findMany({
      where: { providerStatus: 'SUCCEEDED', refundedAt: null, createdAt: { gte: before, lt: period.to } },
      select: { trainerId: true, learnerId: true, amountFcfa: true, platformShareFcfa: true, createdAt: true },
    }),
    db.purchase.groupBy({
      by: ['trainerId'],
      where: { providerStatus: 'SUCCEEDED', refundedAt: null },
      _min: { createdAt: true },
    }),
    db.subscriptionCharge.findMany({
      where: { status: 'SETTLED', settledAt: { gte: period.from, lt: period.to } },
      select: { plan: true, amountDueFcfa: true, storageFcfa: true, communityPlansFcfa: true, settledAt: true },
    }),
    db.liveSession.findMany({
      where: { startedAt: { gte: period.from, lt: period.to } },
      select: { id: true, startedAt: true, audioOnly: true, _count: { select: { participants: true } } },
    }),
    db.liveParticipant.findMany({
      where: { joinedAt: { gte: period.from, lt: period.to } },
      select: { userId: true, joinedAt: true, session: { select: { audioOnly: true } } },
    }),
    getSettingNumber('lives.monthly_overrun_cap_fcfa'),
    db.marketingSpend.findMany({ where: { month: { in: period.months.map((m) => m.key) } } }),
  ])
  const marketingOf = new Map(marketing.map((m) => [m.month, m.amountFcfa]))

  const firstSaleOf = new Map(firstSales.map((r) => [r.trainerId, r._min.createdAt]))
  const inMonth = (d: Date | null, s: { start: Date; end: Date }) => !!d && d >= s.start && d < s.end

  const activeIn = (s: { start: Date; end: Date }) =>
    new Set(sales.filter((p) => inMonth(p.createdAt, s)).map((p) => p.trainerId))

  const out: MonthMetrics[] = []
  for (const slot of period.months) {
    const monthSales = sales.filter((p) => inMonth(p.createdAt, slot))
    const active = new Set(monthSales.map((p) => p.trainerId))
    const prevSlot = { start: monthStart(slot.start.getUTCFullYear(), slot.start.getUTCMonth() - 1), end: slot.start }
    const prevActive = activeIn(prevSlot)
    const departed = [...prevActive].filter((t) => !active.has(t)).length
    const newly = [...active].filter((t) => inMonth(firstSaleOf.get(t) ?? null, slot)).length

    const buyers = new Set(monthSales.map((p) => p.learnerId))
    const monthParticipants = participants.filter((p) => inMonth(p.joinedAt, slot))
    for (const p of monthParticipants) buyers.add(p.userId)

    const salesFcfa = monthSales.reduce((s, p) => s + p.amountFcfa, 0)
    const commissionsFcfa = monthSales.reduce((s, p) => s + p.platformShareFcfa, 0)

    let proFcfa = 0, communityPlansFcfa = 0, storageFcfa = 0, otherSubscriptionsFcfa = 0
    for (const c of charges.filter((c) => inMonth(c.settledAt, slot))) {
      const rest = c.amountDueFcfa - c.storageFcfa - c.communityPlansFcfa
      storageFcfa += c.storageFcfa
      communityPlansFcfa += c.communityPlansFcfa
      if (c.plan === 'PRO') proFcfa += rest
      else otherSubscriptionsFcfa += rest
    }

    // h-participants du mois : le calcul du plafond, jusqu'à la fin du mois
    // (ou maintenant, pour le mois en cours).
    const at = new Date(Math.min(slot.end.getTime() - 1, Date.now()))
    const hours = slot.start.getTime() > Date.now() ? 0 : await monthParticipantHours(at)
    const monthSessions = sessions.filter((s) => inMonth(s.startedAt, slot))
    const audioShare = monthParticipants.length
      ? monthParticipants.filter((p) => p.session.audioOnly).length / monthParticipants.length
      : 0
    const mb = hours * (audioShare * MB_PER_PARTICIPANT_HOUR_AUDIO + (1 - audioShare) * MB_PER_PARTICIPANT_HOUR_VIDEO)

    out.push({
      key: slot.key,
      label: slot.label,
      activeTrainers: active.size,
      newlyActiveTrainers: newly,
      churnRate: prevActive.size ? departed / prevActive.size : null,
      salesCount: monthSales.length,
      salesFcfa,
      avgSalesPerActiveFcfa: active.size ? Math.round(salesFcfa / active.size) : null,
      activeLearners: buyers.size,
      learnersPerActiveTrainer: active.size ? Math.round((buyers.size / active.size) * 10) / 10 : null,
      marketingFcfa: marketingOf.get(slot.key) ?? null,
      marketingPerNewActiveFcfa: marketingOf.has(slot.key) && newly > 0 ? Math.round(marketingOf.get(slot.key)! / newly) : null,
      revenue: {
        commissionsFcfa, proFcfa, communityPlansFcfa, storageFcfa, otherSubscriptionsFcfa,
        totalFcfa: commissionsFcfa + proFcfa + communityPlansFcfa + storageFcfa + otherSubscriptionsFcfa,
      },
      lives: {
        sessions: monthSessions.length,
        participantHours: Math.round(hours * 10) / 10,
        avgAttendees: monthSessions.length
          ? Math.round((monthSessions.reduce((s, x) => s + x._count.participants, 0) / monthSessions.length) * 10) / 10
          : null,
        overrunFcfa: budgetState(hours, liveCap).overrunFcfa,
        dataGb: Math.round((mb / 1024) * 10) / 10,
      },
    })
  }
  return out
}

/**
 * Le premier chiffre du modèle : la part de la base prospectée devenue active.
 * La taille de la base se règle (`pilotage.trainer_base_size`, tenue par le
 * commercial) ; sans elle, le ratio n'est pas affiché.
 */
export async function getBaseConversion(now = new Date()) {
  const baseSize = await getSettingNumber('pilotage.trainer_base_size')
  const [approved, everSold] = await Promise.all([
    db.trainerProfile.count({ where: { approvedAt: { not: null } } }),
    db.purchase.groupBy({ by: ['trainerId'], where: { providerStatus: 'SUCCEEDED', refundedAt: null, createdAt: { lte: now } } }),
  ])
  return {
    baseSize,
    approvedTrainers: approved,
    trainersWithASale: everSold.length,
    conversion: baseSize > 0 ? everSold.length / baseSize : null,
  }
}

// --- Files (1.3) ------------------------------------------------------------

/** Heures ouvrées (lundi-vendredi, heure de Douala, UTC+1) entre deux dates. */
export function businessHoursBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  const OFFSET = 3_600_000 // UTC+1, sans heure d'été
  let t = from.getTime() + OFFSET
  const end = to.getTime() + OFFSET
  let ms = 0
  while (t < end) {
    const d = new Date(t)
    const dayEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
    const slice = Math.min(dayEnd, end) - t
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) ms += slice
    t += slice
  }
  return ms / 3_600_000
}

/** Délai promis par le modèle à une demande de remboursement. */
export const REFUND_DECISION_SLA_BUSINESS_HOURS = 72

export interface QueueAge {
  key: string
  label: string
  href: string
  count: number
  oldestHours: number | null
  averageHours: number | null
  /** Dossiers au-delà du délai promis (remboursements : 72 h ouvrées). */
  overdue: number | null
  slaLabel: string | null
}

function ageStats(dates: Date[], now: Date) {
  if (dates.length === 0) return { oldestHours: null, averageHours: null }
  const ages = dates.map((d) => (now.getTime() - d.getTime()) / 3_600_000)
  return {
    oldestHours: Math.round(Math.max(...ages)),
    averageHours: Math.round(ages.reduce((a, b) => a + b, 0) / ages.length),
  }
}

export async function getQueueAges(now = new Date()): Promise<QueueAge[]> {
  const [disputes, reports, applications, payouts, methods] = await Promise.all([
    db.dispute.findMany({ where: { status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } }, select: { openedAt: true } }),
    db.report.findMany({ where: { status: 'OPEN' }, select: { createdAt: true } }),
    db.trainerApplication.findMany({ where: { status: 'SUBMITTED' }, select: { submittedAt: true, createdAt: true } }),
    db.payout.findMany({ where: { status: 'IN_REVIEW' }, select: { createdAt: true } }),
    db.payoutMethod.findMany({ where: { verificationStatus: 'PENDING_REVIEW' }, select: { createdAt: true } }),
  ])
  const disputeDates = disputes.map((d) => d.openedAt)
  return [
    {
      key: 'disputes', label: 'Demandes de remboursement et litiges', href: '/admin/litiges',
      count: disputes.length, ...ageStats(disputeDates, now),
      overdue: disputeDates.filter((d) => businessHoursBetween(d, now) > REFUND_DECISION_SLA_BUSINESS_HOURS).length,
      slaLabel: '72 h ouvrées',
    },
    { key: 'reports', label: 'Signalements', href: '/admin/signalements', count: reports.length, ...ageStats(reports.map((r) => r.createdAt), now), overdue: null, slaLabel: null },
    {
      key: 'applications', label: 'Candidatures de formateurs', href: '/admin/validation-formateurs',
      count: applications.length, ...ageStats(applications.map((a) => a.submittedAt ?? a.createdAt), now), overdue: null, slaLabel: null,
    },
    { key: 'payouts', label: 'Retraits à instruire', href: '/admin/retraits', count: payouts.length, ...ageStats(payouts.map((p) => p.createdAt), now), overdue: null, slaLabel: null },
    { key: 'payoutMethods', label: 'Moyens de retrait à vérifier', href: '/admin/moyens-de-paiement', count: methods.length, ...ageStats(methods.map((m) => m.createdAt), now), overdue: null, slaLabel: null },
  ]
}

// --- Export CSV (1.2) ---------------------------------------------------------

/**
 * Un CSV que le tableur français ouvre tel quel : point-virgule, guillemets,
 * BOM UTF-8. Une cellule qui commence par un signe de formule est neutralisée
 * (injection de formule dans le tableur).
 */
export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return ''
    let s = String(v)
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

export async function exportTransactionsCsv(period: { from: Date; to: Date }): Promise<string> {
  const rows = await db.purchase.findMany({
    where: { createdAt: { gte: period.from, lt: period.to } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, createdAt: true, amountFcfa: true, buyerFeeFcfa: true, platformShareFcfa: true, trainerShareFcfa: true,
      commissionRate: true, provider: true, providerStatus: true, refundedAt: true, refundAmountFcfa: true,
      courseId: true, communityId: true,
    },
  })
  return toCsv(
    ['date', 'achat', 'type', 'prix_fcfa', 'frais_acheteur_fcfa', 'total_paye_fcfa', 'commission_fcfa', 'taux_commission', 'part_formateur_fcfa', 'fournisseur', 'statut', 'rembourse_le', 'montant_rembourse_fcfa'],
    rows.map((r) => [
      r.createdAt.toISOString(), r.id, r.communityId ? 'adhesion' : r.courseId ? 'ressource' : 'autre',
      r.amountFcfa, r.buyerFeeFcfa, r.amountFcfa + r.buyerFeeFcfa, r.platformShareFcfa, r.commissionRate,
      r.trainerShareFcfa, r.provider, r.providerStatus, r.refundedAt?.toISOString() ?? null, r.refundAmountFcfa,
    ]),
  )
}

export function revenueCsv(metrics: MonthMetrics[]): string {
  return toCsv(
    ['mois', 'commissions_fcfa', 'pro_fcfa', 'plans_community_fcfa', 'stockage_fcfa', 'autres_abonnements_fcfa', 'total_fcfa',
      'formateurs_actifs', 'nouveaux_actifs', 'taux_depart', 'ventes', 'ventes_fcfa', 'ventes_moyennes_par_actif_fcfa',
      'apprenants_actifs', 'apprenants_par_actif', 'marketing_fcfa', 'marketing_par_nouvel_actif_fcfa', 'lives', 'h_participants', 'presents_moyens', 'depassement_lives_fcfa', 'donnees_go'],
    metrics.map((m) => [
      m.key, m.revenue.commissionsFcfa, m.revenue.proFcfa, m.revenue.communityPlansFcfa, m.revenue.storageFcfa,
      m.revenue.otherSubscriptionsFcfa, m.revenue.totalFcfa, m.activeTrainers, m.newlyActiveTrainers,
      m.churnRate === null ? null : Math.round(m.churnRate * 1000) / 1000, m.salesCount, m.salesFcfa,
      m.avgSalesPerActiveFcfa, m.activeLearners, m.learnersPerActiveTrainer, m.marketingFcfa, m.marketingPerNewActiveFcfa, m.lives.sessions,
      m.lives.participantHours, m.lives.avgAttendees, m.lives.overrunFcfa, m.lives.dataGb,
    ]),
  )
}

export function queuesCsv(queues: QueueAge[]): string {
  return toCsv(
    ['file', 'dossiers', 'plus_ancien_h', 'age_moyen_h', 'hors_delai', 'delai'],
    queues.map((q) => [q.label, q.count, q.oldestHours, q.averageHours, q.overdue, q.slaLabel]),
  )
}

// --- Marketing payant (3.2) -----------------------------------------------------

export async function saveMarketingSpend(input: { month: string; amountFcfa: number; note?: string | null; actorId: string }) {
  if (!MONTH_RE.test(input.month)) throw new Error('INVALID_MONTH')
  if (!Number.isInteger(input.amountFcfa) || input.amountFcfa < 0 || input.amountFcfa > 1_000_000_000) throw new Error('INVALID_AMOUNT')
  const row = await db.marketingSpend.upsert({
    where: { month: input.month },
    create: { month: input.month, amountFcfa: input.amountFcfa, note: input.note ?? null, updatedById: input.actorId },
    update: { amountFcfa: input.amountFcfa, note: input.note ?? null, updatedById: input.actorId },
  })
  return row
}
