// ==========================================================================
// Annuaire public des formateurs
// ==========================================================================
// Seuls les formateurs validés et publiant réellement apparaissent : un profil
// approuvé mais sans ressource au catalogue n'a rien à montrer à un visiteur.
// ==========================================================================

import { db } from './db'

export interface PublicTrainer {
  id: string
  fullName: string | null
  slogan: string | null
  description: string | null
  domains: string[]
  experienceYears: number | null
  ratingAverage: number
  ratingCount: number
  studentsCount: number
  publishedCount: number
}

export async function listPublicTrainers(search?: string): Promise<PublicTrainer[]> {
  const trainers = await db.trainerProfile.findMany({
    where: {
      approvedAt: { not: null },
      suspendedAt: null,
      // Au moins une ressource publiée : sans cela, la fiche serait vide.
      courses: { some: { status: 'published' } },
      ...(search
        ? {
            OR: [
              { user: { fullName: { contains: search, mode: 'insensitive' as const } } },
              { slogan: { contains: search, mode: 'insensitive' as const } },
              { domains: { has: search } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      slogan: true,
      description: true,
      domains: true,
      experienceYears: true,
      ratingAverage: true,
      ratingCount: true,
      studentsCount: true,
      user: { select: { fullName: true } },
      _count: { select: { courses: { where: { status: 'published' } } } },
    },
    orderBy: [{ studentsCount: 'desc' }, { ratingAverage: 'desc' }],
    take: 60,
  })

  return trainers.map((t) => ({
    id: t.id,
    fullName: t.user.fullName,
    slogan: t.slogan,
    description: t.description,
    domains: t.domains,
    experienceYears: t.experienceYears,
    ratingAverage: t.ratingAverage,
    ratingCount: t.ratingCount,
    studentsCount: t.studentsCount,
    publishedCount: t._count.courses,
  }))
}
