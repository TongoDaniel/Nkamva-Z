// ==========================================================================
// Annuaire public des formateurs
// ==========================================================================
// Seuls les formateurs validés et ayant réellement quelque chose à montrer
// apparaissent. « Quelque chose à montrer », c'est une ressource au catalogue
// **ou** une communauté publique ouverte : les deux sont des surfaces où un
// visiteur rencontre le formateur, et la fiche de l'un mène à celle de l'autre.
//
// La condition n'admettait que les ressources publiées. Une communauté
// publique, elle, ne demande rien de son animateur : elle s'affichait donc en
// vitrine, nom du formateur en tête, tandis que les deux liens vers sa fiche
// répondaient 404 — juste au-dessus du bouton d'adhésion payant.
// ==========================================================================

import type { Prisma } from '@prisma/client'
import { db } from './db'

/**
 * Ce qui rend un formateur visible des visiteurs. **Source unique** : la
 * recherche (`lib/search.ts`), l'annuaire et la fiche appliquaient chacun leur
 * copie de la règle, et rien ne les tenait d'accord.
 *
 * Le `OR` est enfermé dans un `AND` : l'annuaire filtré ajoute son propre `OR`
 * de recherche, et deux `OR` au même niveau s'écrasent — le filtre l'aurait
 * emporté sur la condition de visibilité.
 */
export const PUBLIC_TRAINER_WHERE = {
  approvedAt: { not: null },
  suspendedAt: null,
  OR: [
    { courses: { some: { status: 'published' } } },
    { communities: { some: { status: 'active', visibility: 'PUBLIC' as const } } },
  ],
} satisfies Prisma.TrainerProfileWhereInput

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
  /**
   * Communautés publiques ouvertes. Non décoratif : c'est ce qui permet à une
   * carte sans ressource d'annoncer ce qu'elle a — sans quoi elle n'afficherait
   * qu'un « 0 ressource » qui donne envie de passer son chemin.
   */
  communityCount: number
}

export async function listPublicTrainers(search?: string): Promise<PublicTrainer[]> {
  const trainers = await db.trainerProfile.findMany({
    where: {
      AND: [
        PUBLIC_TRAINER_WHERE,
        ...(search
          ? [
              {
                OR: [
                  { user: { fullName: { contains: search, mode: 'insensitive' as const } } },
                  { slogan: { contains: search, mode: 'insensitive' as const } },
                  { domains: { has: search } },
                ],
              },
            ]
          : []),
      ],
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
      _count: {
        select: {
          courses: { where: { status: 'published' } },
          communities: { where: { status: 'active', visibility: 'PUBLIC' } },
        },
      },
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
    communityCount: t._count.communities,
  }))
}

export interface PublicTrainerDetail extends PublicTrainer {
  websiteUrl: string | null
  approvedAt: Date | null
  /**
   * Le compte derrière le profil. `id` est celui du `TrainerProfile` — un
   * signalement vise le compte, et confondre les deux ferait chercher la
   * Modération dans la mauvaise table.
   */
  userId: string
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
 * celles de l'annuaire — `PUBLIC_TRAINER_WHERE` —, sans quoi une fiche
 * resterait atteignable par son URL après avoir disparu de la liste.
 *
 * `null` plutôt qu'une erreur : la page répond 404, et un profil suspendu ne se
 * distingue pas d'un identifiant inexistant.
 */
export async function getPublicTrainer(trainerId: string): Promise<PublicTrainerDetail | null> {
  const trainer = await db.trainerProfile.findFirst({
    where: { AND: [{ id: trainerId }, PUBLIC_TRAINER_WHERE] },
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
      userId: true,
      user: { select: { fullName: true } },
      _count: {
        select: {
          courses: { where: { status: 'published' } },
          communities: { where: { status: 'active', visibility: 'PUBLIC' } },
        },
      },
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
        // Arbitrage 81. Le panneau « Communauté » de la fiche formateur est une
        // surface publique : une privée n'y figure pas, sans quoi son existence
        // et son tarif seraient annoncés à tout visiteur.
        where: { status: 'active', visibility: 'PUBLIC' },
        select: { slug: true, name: true, description: true, priceFcfa: true, membersCount: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })

  if (!trainer) return null

  return {
    id: trainer.id,
    userId: trainer.userId,
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
    communityCount: trainer._count.communities,
    // Dates sérialisées ici : la page est un composant serveur, mais les cartes
    // qu'elle rend sont les mêmes que celles du catalogue, qui reçoit du JSON.
    courses: trainer.courses.map((c) => ({
      ...c,
      publishedAt: c.publishedAt?.toISOString() ?? null,
    })),
    community: trainer.communities[0] ?? null,
  }
}

// ==========================================================================
// Ce que le formateur voit de sa propre visibilité
// ==========================================================================
// Le pendant de `PUBLIC_TRAINER_WHERE`, côté espace formateur. La règle
// existait, elle ne se disait nulle part : un formateur pouvait animer une
// communauté en vitrine, chercher son nom dans l'annuaire, ne pas s'y trouver,
// et n'avoir aucun moyen d'apprendre pourquoi.
//
// Les deux fonctions lisent les mêmes colonnes, et un test les compare : une
// condition ajoutée à l'une sans l'autre rendrait le préavis faux, ce qui est
// pire que pas de préavis du tout.
// ==========================================================================

export interface TrainerVisibility {
  /** La candidature a été acceptée. Sans cela, rien d'autre ne compte. */
  approved: boolean
  suspended: boolean
  publishedCount: number
  /** Communautés `active` **et** `PUBLIC` — celles qui rendent visible. */
  publicCommunityCount: number
  /**
   * Communautés qui existent sans compter : privées, ou fermées. Distinguées
   * de l'absence pure, parce que le geste à faire n'est pas le même — ouvrir
   * ce qu'on a, ou créer ce qu'on n'a pas.
   */
  hiddenCommunityCount: number
  /** Le résultat de `PUBLIC_TRAINER_WHERE`, recalculé ici. */
  visible: boolean
}

export async function getTrainerVisibility(trainerId: string): Promise<TrainerVisibility | null> {
  const trainer = await db.trainerProfile.findUnique({
    where: { id: trainerId },
    select: {
      approvedAt: true,
      suspendedAt: true,
      _count: {
        select: {
          courses: { where: { status: 'published' } },
          communities: { where: { status: 'active', visibility: 'PUBLIC' } },
        },
      },
      communities: {
        where: { NOT: { status: 'active', visibility: 'PUBLIC' } },
        select: { id: true },
      },
    },
  })
  if (!trainer) return null

  const approved = trainer.approvedAt !== null
  const suspended = trainer.suspendedAt !== null
  const publishedCount = trainer._count.courses
  const publicCommunityCount = trainer._count.communities

  return {
    approved,
    suspended,
    publishedCount,
    publicCommunityCount,
    hiddenCommunityCount: trainer.communities.length,
    visible: approved && !suspended && (publishedCount > 0 || publicCommunityCount > 0),
  }
}
