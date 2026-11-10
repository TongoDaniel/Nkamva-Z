// ==========================================================================
// Tendances pour la Communication : plan d'action 1.7
// ==========================================================================
// Ce que la Communication doit voir pour écrire (rôle « Communication » du
// plan) : ressources les plus vues et les plus vendues, nouveaux formateurs,
// filières, croissance de l'audience.
//
// Ce qu'elle ne doit pas voir : les données personnelles d'un client et les
// montants individuels. On ne rend donc que des comptes, des titres publics et
// des noms publics de formateurs ; aucun montant, aucun apprenant.
// ==========================================================================

import { db } from './db'
import type { MonthSlot } from './pilotage'

const SOLD = { providerStatus: 'SUCCEEDED', refundedAt: null } as const

export async function getTrends(period: { from: Date; to: Date; months: MonthSlot[] }) {
  const range = { gte: period.from, lt: period.to }

  const [views, salesByCourse, newUsers, newTrainers, published] = await Promise.all([
    db.courseView.groupBy({ by: ['courseId'], where: { lastViewedAt: range }, _count: { _all: true } }),
    db.purchase.groupBy({ by: ['courseId'], where: { ...SOLD, courseId: { not: null }, createdAt: range }, _count: { _all: true } }),
    db.user.findMany({ where: { deletedAt: null, role: { not: 'ADMIN' }, createdAt: range }, select: { createdAt: true, role: true } }),
    db.trainerProfile.findMany({
      where: { approvedAt: range },
      select: { approvedAt: true, slogan: true, domains: true, user: { select: { fullName: true } } },
      orderBy: { approvedAt: 'desc' },
    }),
    db.course.findMany({ where: { status: 'published' }, select: { id: true, category: true } }),
  ])

  const courseIds = [...new Set([...views.map((v) => v.courseId), ...salesByCourse.map((s) => s.courseId!)])]
  const courses = courseIds.length
    ? await db.course.findMany({
        where: { id: { in: courseIds }, status: 'published' },
        select: { id: true, title: true, slug: true, category: true, trainerProfile: { select: { user: { select: { fullName: true } } } } },
      })
    : []
  const courseOf = new Map(courses.map((c) => [c.id, c]))
  const describe = (id: string, count: number) => {
    const c = courseOf.get(id)
    return c ? { title: c.title, slug: c.slug, category: c.category, trainer: c.trainerProfile.user.fullName ?? 'Formateur NKAMVA', count } : null
  }

  const mostViewed = views
    .sort((a, b) => b._count._all - a._count._all)
    .map((v) => describe(v.courseId, v._count._all))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 10)
  const mostSold = salesByCourse
    .sort((a, b) => b._count._all - a._count._all)
    .map((s) => describe(s.courseId!, s._count._all))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 10)

  // Filières : ressources publiées, et ventes de la période, par catégorie.
  const categoryOfCourse = new Map(published.map((c) => [c.id, c.category]))
  const categories = new Map<string, { published: number; sales: number }>()
  for (const c of published) {
    const row = categories.get(c.category) ?? { published: 0, sales: 0 }
    row.published++
    categories.set(c.category, row)
  }
  for (const s of salesByCourse) {
    const cat = categoryOfCourse.get(s.courseId!)
    if (!cat) continue
    categories.get(cat)!.sales += s._count._all
  }

  const audience = period.months.map((m) => {
    const inMonth = newUsers.filter((u) => u.createdAt >= m.start && u.createdAt < m.end)
    return {
      key: m.key,
      label: m.label,
      newAccounts: inMonth.length,
      newLearners: inMonth.filter((u) => u.role === 'LEARNER').length,
      newTrainers: newTrainers.filter((t) => t.approvedAt! >= m.start && t.approvedAt! < m.end).length,
    }
  })

  return {
    mostViewed,
    mostSold,
    categories: [...categories.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.sales - a.sales || b.published - a.published),
    newTrainers: newTrainers.slice(0, 20).map((t) => ({
      name: t.user.fullName ?? 'Formateur NKAMVA',
      slogan: t.slogan,
      domains: t.domains,
      approvedAt: t.approvedAt!,
    })),
    audience,
  }
}
