// ==========================================================================
// Suivi des formateurs par l'équipe : plan d'action 1.4, 1.5 et 1.7
// ==========================================================================
// 1.4 « Le service client contacte chaque formateur resté sans vente 30 jours
//     après son inscription » (modèle v1.1) : la liste, et la trace du contact.
// 1.5 Le signal « passez en Pro » : après 2 mois consécutifs au-dessus de
//     ~214 000 FCFA de ventes, le formateur reçoit le calcul. Une relation
//     transparente fidélise ; 2 mois évitent les faux signaux.
// 1.7 Le suivi du commercial : candidature, validation, première ressource,
//     première vente ; les fondateurs ; ceux qui approchent du seuil Pro.
// ==========================================================================

import type { TrainerNoteKind } from '@prisma/client'
import { db } from './db'
import { auditStandalone } from './audit'
import { absoluteUrl, notifyWithEmail, deliverSideEffects } from './notification'
import { fmtFcfa } from './format'
import { PRO_BREAK_EVEN_FCFA, PRO_OPEN_TO_ALL_AT, monthlyCostByPlan, proAvailableFor } from './trainer-plans'

const DAY = 86_400_000
const SOLD = { providerStatus: 'SUCCEEDED', refundedAt: null } as const

/** Un formateur validé depuis ce nombre de jours, sans vente, est à contacter. */
export const NO_SALE_CONTACT_AFTER_DAYS = 30
/** « Proche du seuil Pro » : au moins cette part du seuil le mois dernier. */
export const NEAR_PRO_RATIO = 0.7

function monthStartUtc(y: number, m: number) {
  return new Date(Date.UTC(y, m, 1))
}

// --- 1.4 Sans vente à 30 jours ----------------------------------------------

export async function listTrainersWithoutSale(now = new Date()) {
  const trainers = await db.trainerProfile.findMany({
    where: {
      approvedAt: { not: null, lte: new Date(now.getTime() - NO_SALE_CONTACT_AFTER_DAYS * DAY) },
      user: { deletedAt: null },
      purchasesAsTrainer: { none: SOLD },
    },
    orderBy: { approvedAt: 'asc' },
    select: {
      id: true, approvedAt: true, founder: true,
      user: { select: { id: true, fullName: true, email: true, phone: true } },
      _count: { select: { courses: { where: { status: 'published' } } } },
      notes: {
        where: { kind: 'SUPPORT_CONTACT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, createdAt: true, authorId: true },
      },
    },
  })
  return trainers.map((t) => ({
    trainerId: t.id,
    userId: t.user.id,
    name: t.user.fullName ?? t.user.email,
    email: t.user.email,
    phone: t.user.phone,
    approvedAt: t.approvedAt!,
    daysSinceApproval: Math.floor((now.getTime() - t.approvedAt!.getTime()) / DAY),
    publishedCourses: t._count.courses,
    founder: t.founder,
    lastContact: t.notes[0] ?? null,
  }))
}

export async function addTrainerNote(input: {
  trainerId: string
  authorId: string
  authorRole: string
  kind: TrainerNoteKind
  body: string
}) {
  const body = input.body.trim()
  if (body.length < 2 || body.length > 2000) throw new Error('INVALID_NOTE')
  const trainer = await db.trainerProfile.findUnique({ where: { id: input.trainerId }, select: { id: true } })
  if (!trainer) throw new Error('TRAINER_NOT_FOUND')
  const note = await db.trainerNote.create({
    data: { trainerId: input.trainerId, authorId: input.authorId, kind: input.kind, body },
    select: { id: true, createdAt: true },
  })
  await auditStandalone({
    actorId: input.authorId, actorRole: input.authorRole,
    action: input.kind === 'SUPPORT_CONTACT' ? 'TRAINER_SUPPORT_CONTACT' : 'TRAINER_SALES_NOTE',
    targetType: 'TrainerProfile', targetId: input.trainerId,
  })
  return note
}

export async function listTrainerNotes(trainerId: string) {
  return db.trainerNote.findMany({
    where: { trainerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, kind: true, body: true, createdAt: true, authorId: true },
  })
}

// --- 1.5 Signal « passez en Pro » ---------------------------------------------

/**
 * Pur : faut-il envoyer le signal ? Deux mois complets consécutifs au-dessus
 * du seuil, un formateur sur le plan de base, et pas de signal dans les deux
 * derniers mois.
 */
export function shouldSignalPro(input: {
  plan: 'BASE' | 'PRO'
  pendingPlan: 'BASE' | 'PRO' | null
  lastTwoMonthsSalesFcfa: [number, number]
  proSignalAt: Date | null
  now: Date
}): boolean {
  if (input.plan !== 'BASE' || input.pendingPlan === 'PRO') return false
  if (!input.lastTwoMonthsSalesFcfa.every((s) => s > PRO_BREAK_EVEN_FCFA)) return false
  if (input.proSignalAt && input.now.getTime() - input.proSignalAt.getTime() < 60 * DAY) return false
  return true
}

/** Job mensuel, le 1er : les deux mois complets qui précèdent. */
export async function signalProCandidates(now = new Date()): Promise<{ signaled: number }> {
  const m1 = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth() - 1)
  const m2 = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth() - 2)
  const end = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth())

  const sales = await db.purchase.findMany({
    where: { ...SOLD, createdAt: { gte: m2, lt: end } },
    select: { trainerId: true, amountFcfa: true, createdAt: true },
  })
  const byTrainer = new Map<string, [number, number]>()
  for (const s of sales) {
    const row = byTrainer.get(s.trainerId) ?? [0, 0]
    row[s.createdAt >= m1 ? 1 : 0] += s.amountFcfa
    byTrainer.set(s.trainerId, row)
  }
  const ids = [...byTrainer.entries()].filter(([, r]) => r.every((v) => v > PRO_BREAK_EVEN_FCFA)).map(([id]) => id)
  if (ids.length === 0) return { signaled: 0 }

  const profiles = await db.trainerProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true, plan: true, pendingPlan: true, proSignalAt: true, founder: true },
  })

  let signaled = 0
  for (const p of profiles) {
    const two = byTrainer.get(p.id)!
    if (!shouldSignalPro({ plan: p.plan, pendingPlan: p.pendingPlan, lastTwoMonthsSalesFcfa: two, proSignalAt: p.proSignalAt, now })) continue
    const last = two[1]
    const cost = monthlyCostByPlan(last)
    const saving = cost.BASE - cost.PRO
    const opens = proAvailableFor(p, now)
      ? 'Vous pouvez passer en Pro depuis votre espace, et revenir au plan de base quand vous voulez, sans pénalité.'
      : `Le Pro vous sera ouvert le ${PRO_OPEN_TO_ALL_AT.toLocaleDateString('fr-FR')}.`
    await db.trainerProfile.update({ where: { id: p.id }, data: { proSignalAt: now } })
    const title = 'Le plan Pro vous coûterait moins cher'
    const p1 = `Vous avez vendu plus de ${fmtFcfa(PRO_BREAK_EVEN_FCFA)} deux mois de suite. Le mois dernier (${fmtFcfa(last)} de ventes), vous avez payé ${fmtFcfa(cost.BASE)} de commission ; en Pro, vous auriez payé ${fmtFcfa(cost.PRO)}, soit ${fmtFcfa(saving)} de moins.`
    await deliverSideEffects('PRO_SIGNAL', { type: 'TrainerProfile', id: p.id }, () =>
      notifyWithEmail(
        p.userId,
        { type: 'PRO_SIGNAL', title, body: `${p1} ${opens}`, link: '/formateur/abonnement' },
        {
          subject: `NKAMVA · ${title}`,
          title,
          paragraphs: [p1, opens],
          cta: { label: 'Comparer les plans', url: absoluteUrl('/formateur/abonnement') },
        },
        'subscriptionNoticeEmails',
      ),
    )
    await auditStandalone({
      actorId: null, actorRole: 'SYSTEM',
      action: 'PRO_SIGNAL_SENT', targetType: 'TrainerProfile', targetId: p.id,
      meta: { months: two, savingFcfa: saving },
    })
    signaled++
  }
  return { signaled }
}

// --- 1.7 Suivi du commercial --------------------------------------------------

export type FunnelStage = 'APPLICATION' | 'APPROVED' | 'FIRST_RESOURCE' | 'FIRST_SALE'

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  APPLICATION: 'Candidature',
  APPROVED: 'Validé',
  FIRST_RESOURCE: 'Première ressource',
  FIRST_SALE: 'Première vente',
}

export async function getSalesFollowUp(now = new Date()) {
  const lastMonth = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth() - 1)
  const thisMonth = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth())

  const [applications, trainers, firstSales, lastMonthSales] = await Promise.all([
    db.trainerApplication.findMany({
      where: { status: { in: ['SUBMITTED', 'RESUBMISSION_PENDING'] } },
      select: { id: true, submittedAt: true, user: { select: { fullName: true, email: true } } },
      orderBy: { submittedAt: 'asc' },
    }),
    db.trainerProfile.findMany({
      where: { approvedAt: { not: null }, user: { deletedAt: null } },
      select: {
        id: true, approvedAt: true, founder: true, plan: true,
        user: { select: { fullName: true, email: true } },
        courses: { where: { status: { not: 'draft' } }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
        notes: { where: { kind: 'SALES_NOTE' }, orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, createdAt: true } },
      },
      orderBy: { approvedAt: 'desc' },
    }),
    db.purchase.groupBy({ by: ['trainerId'], where: SOLD, _min: { createdAt: true } }),
    db.purchase.groupBy({ by: ['trainerId'], where: { ...SOLD, createdAt: { gte: lastMonth, lt: thisMonth } }, _sum: { amountFcfa: true } }),
  ])

  const firstSaleOf = new Map(firstSales.map((r) => [r.trainerId, r._min.createdAt]))
  const lastMonthOf = new Map(lastMonthSales.map((r) => [r.trainerId, r._sum.amountFcfa ?? 0]))

  const rows = trainers.map((t) => {
    const firstResourceAt = t.courses[0]?.createdAt ?? null
    const firstSaleAt = firstSaleOf.get(t.id) ?? null
    const stage: FunnelStage = firstSaleAt ? 'FIRST_SALE' : firstResourceAt ? 'FIRST_RESOURCE' : 'APPROVED'
    return {
      trainerId: t.id,
      name: t.user.fullName ?? t.user.email,
      founder: t.founder,
      plan: t.plan,
      approvedAt: t.approvedAt!,
      firstResourceAt,
      firstSaleAt,
      stage,
      lastMonthSalesFcfa: lastMonthOf.get(t.id) ?? 0,
      lastNote: t.notes[0] ?? null,
    }
  })

  return {
    funnel: {
      APPLICATION: applications.length,
      APPROVED: rows.length,
      FIRST_RESOURCE: rows.filter((r) => r.stage !== 'APPROVED').length,
      FIRST_SALE: rows.filter((r) => r.stage === 'FIRST_SALE').length,
    } satisfies Record<FunnelStage, number>,
    pendingApplications: applications.map((a) => ({ id: a.id, name: a.user.fullName ?? a.user.email, submittedAt: a.submittedAt })),
    trainers: rows,
    founders: rows.filter((r) => r.founder),
    nearPro: rows
      .filter((r) => r.plan === 'BASE' && r.lastMonthSalesFcfa >= PRO_BREAK_EVEN_FCFA * NEAR_PRO_RATIO)
      .sort((a, b) => b.lastMonthSalesFcfa - a.lastMonthSalesFcfa),
    breakEvenFcfa: PRO_BREAK_EVEN_FCFA,
  }
}
