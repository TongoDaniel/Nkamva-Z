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

export interface PublicTrainerDetail extends PublicTrainer {
  websiteUrl: string | null
  approvedAt: Date | null
  courses: PublicTrainerCourse[]
  /** Communauté active du formateur, s'il en anime une. */
  community: { slug: string; name: string; description: string | null; priceFcfa: number; membersCount: number } | null
}

export interface PublicTrainerCourse {
  id: string
  slug: string
  title: string
  blurb: string
  category: string
  format: string
  priceFcfa: number
  level: string | null
  durationSeconds: number | null
  coverS3Key: string | null
  publishedAt: string | null
}

/**
 * Fiche publique d'un formateur. Les conditions de visibilité sont exactement
 * celles de l'annuaire — approuvé, non suspendu, au moins une ressource
 * publiée — sans quoi une fiche resterait atteignable par son URL après avoir
 * disparu de la liste.
 *
 * `null` plutôt qu'une erreur : la page répond 404, et un profil suspendu ne se
 * distingue pas d'un identifiant inexistant.
 */
export async function getPublicTrainer(trainerId: string): Promise<PublicTrainerDetail | null> {
  const trainer = await db.trainerProfile.findFirst({
    where: {
      id: trainerId,
      approvedAt: { not: null },
      suspendedAt: null,
      courses: { some: { status: 'published' } },
    },
    select: {
      id: true,
      slogan: true,
      description: true,
      websiteUrl: true,
      domains: true,
      experienceYears: true,
      ratingAverage: true,
      ratingCount: true,
      studentsCount: true,
      approvedAt: true,
      user: { select: { fullName: true } },
      _count: { select: { courses: { where: { status: 'published' } } } },
      courses: {
        where: { status: 'published' },
        select: {
          id: true, slug: true, title: true, blurb: true, category: true, format: true,
          priceFcfa: true, level: true, durationSeconds: true, coverS3Key: true,
          publishedAt: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 24,
      },
      communities: {
        where: { status: 'active' },
        select: { slug: true, name: true, description: true, priceFcfa: true, membersCount: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })

  if (!trainer) return null

  return {
    id: trainer.id,
    fullName: trainer.user.fullName,
    slogan: trainer.slogan,
    description: trainer.description,
    websiteUrl: trainer.websiteUrl,
    domains: trainer.domains,
    experienceYears: trainer.experienceYears,
    ratingAverage: trainer.ratingAverage,
    ratingCount: trainer.ratingCount,
    studentsCount: trainer.studentsCount,
    approvedAt: trainer.approvedAt,
    publishedCount: trainer._count.courses,
    // Dates sérialisées ici : la page est un composant serveur, mais les cartes
    // qu'elle rend sont les mêmes que celles du catalogue, qui reçoit du JSON.
    courses: trainer.courses.map((c) => ({
      ...c,
      publishedAt: c.publishedAt?.toISOString() ?? null,
    })),
    community: trainer.communities[0] ?? null,
  }
}
