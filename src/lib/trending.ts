// ==========================================================================
// Ce qui est « en tendance » — arbitrage 142
// ==========================================================================
// Rien ne mesurait la popularité. Le tri `popular` du catalogue retombait sur la
// date de publication, `studentsCount` n'était écrit que par le seed, et les
// notes n'étaient alimentées par rien. Afficher « Tendance » au-dessus d'une
// liste triée par date aurait été un mensonge d'étiquette.
//
// La définition retenue ne lit que des faits déjà en base :
//
//   ressources   → achats aboutis et non remboursés sur les 30 derniers jours
//   communautés  → nouvelles adhésions sur les 30 derniers jours
//   formateurs   → achats aboutis sur leurs contenus, même fenêtre — ressources
//                  et adhésions payées confondues, puisque les deux passent par
//                  `Purchase`
//
// **Tant qu'il n'y a pas de quoi classer, on ne prétend pas classer.** Sous
// `TRENDING_MIN_RANKED` éléments porteurs d'un signal, la fonction rend
// `ranked: false` avec une liste de nouveautés, et l'écran change de titre. Une
// base jeune affiche donc « Nouveautés du catalogue », jamais une tendance faite
// de trois ventes.
//
// Source unique : aucun écran ne recompose ces classements de son côté.
// ==========================================================================

import type { Prisma } from '@prisma/client'
import { db } from './db'
import { COURSE_LIST_SELECT } from './catalog'
import { AGENDA_SELECT, toAgenda, type AgendaSession } from './lives'
import { countTrainerLearners, PUBLIC_TRAINER_WHERE } from './trainers'
import {
  COMMUNITY_VISUAL_SELECT,
  toCommunityVisual,
  type CommunityVisual,
} from './community-visual'
import type { CourseListItem } from './dto'

/** La fenêtre glissante sur laquelle se compte l'activité. */
export const TRENDING_WINDOW_DAYS = 30

/** En dessous, le classement ne dit rien : on rend des nouveautés. */
export const TRENDING_MIN_RANKED = 3

/**
 * Combien de communautés alimentent l'onglet « Tendance » des événements. Assez
 * pour qu'une petite plateforme les montre toutes, assez peu pour qu'une grande
 * n'y déverse pas l'agenda de chacune.
 */
export const TRENDING_COMMUNITY_POOL = 12

const DAY_MS = 86_400_000

/** Voir `communities.ts` — les listes de statuts ouverts restent alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

function windowStart(now: Date) {
  return new Date(now.getTime() - TRENDING_WINDOW_DAYS * DAY_MS)
}

/** Un achat qui compte : réglé, et pas rendu. */
function countedSale(now: Date) {
  return {
    providerStatus: 'SUCCEEDED' as const,
    refundedAt: null,
    createdAt: { gte: windowStart(now) },
  }
}

/** Remet des lignes dans l'ordre d'une liste d'identifiants. */
function inOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.map((id) => byId.get(id)).filter((row): row is T => Boolean(row))
}

// --------------------------------------------------------------------------
// Ressources
// --------------------------------------------------------------------------

export interface TrendingCourses {
  /** Faux : pas assez de ventes pour classer, `items` sont des nouveautés. */
  ranked: boolean
  items: CourseListItem[]
}

/**
 * Les ressources du catalogue les plus achetées sur la fenêtre.
 *
 * `viewerId` retire ce que la personne a déjà — acheté, ou reçu par une
 * communauté dont elle est membre — et ce qu'elle a publié : lui proposer à
 * l'achat sa propre ressource, ou une qu'elle possède, ne sert à rien.
 *
 * Quand le classement est tenu mais court, la rangée est complétée par les
 * nouveautés, placées **après** les ressources classées.
 */
export async function trendingCourses(options: {
  viewerId?: string | null
  limit: number
  now?: Date
}): Promise<TrendingCourses> {
  const now = options.now ?? new Date()
  const viewerId = options.viewerId ?? null

  const visible: Prisma.CourseWhereInput = {
    status: 'published',
    // Arbitrage 47 — une ressource incluse dans une communauté n'est pas vendue
    // à l'unité.
    circuit: 'MARKETPLACE',
    ...(viewerId
      ? {
          trainerProfile: { userId: { not: viewerId } },
          purchases: { none: { learnerId: viewerId, providerStatus: 'SUCCEEDED', refundedAt: null } },
          communityLinks: {
            none: {
              unlinkedAt: null,
              community: {
                subscriptions: { some: { learnerId: viewerId, status: { in: [...OPEN_STATUSES] } } },
              },
            },
          },
        }
      : {}),
  }

  const [counts, newest] = await Promise.all([
    db.purchase.groupBy({
      by: ['courseId'],
      where: { courseId: { not: null }, ...countedSale(now), course: { is: visible } },
      _count: { _all: true },
      orderBy: [{ _count: { courseId: 'desc' } }, { courseId: 'asc' }],
      take: options.limit,
    }),
    db.course.findMany({
      where: visible,
      select: COURSE_LIST_SELECT,
      orderBy: { publishedAt: 'desc' },
      // De quoi compléter la rangée même si toutes les classées y figurent.
      take: options.limit * 2,
    }),
  ])

  const rankedIds = counts.map((c) => c.courseId).filter((id): id is string => Boolean(id))
  const ranked = rankedIds.length >= TRENDING_MIN_RANKED

  const toItem = (row: (typeof newest)[number]) =>
    ({ ...row, publishedAt: row.publishedAt?.toISOString() ?? null }) as unknown as CourseListItem

  if (!ranked) {
    return { ranked: false, items: newest.slice(0, options.limit).map(toItem) }
  }

  const rankedRows = await db.course.findMany({
    where: { id: { in: rankedIds } },
    select: COURSE_LIST_SELECT,
  })
  const head = inOrder(rankedIds, rankedRows)
  const fill = newest.filter((row) => !rankedIds.includes(row.id))
  return { ranked: true, items: [...head, ...fill].slice(0, options.limit).map(toItem) }
}

// --------------------------------------------------------------------------
// Séances des communautés en tendance
// --------------------------------------------------------------------------

export interface TrendingSession {
  session: AgendaSession
  visual: CommunityVisual
  /** Le prix de l'adhésion : c'est ce qui sépare le non-membre de la salle. */
  priceFcfa: number
}

/**
 * Les séances à venir des communautés les plus rejointes que la personne n'a
 * pas rejointes.
 *
 * **Communautés publiques seulement** (arbitrage 81) : une privée ne paraît sur
 * aucune surface qu'on n'a pas franchie. Seuls le titre et l'horaire d'une
 * séance sont exposés — l'arbitrage 142 accepte cette nouvelle exposition pour
 * les communautés ouvertes, qui sont déjà des vitrines.
 *
 * Le classement prend les communautés, pas les séances : on montre ce que
 * programment les communautés actives, dans l'ordre du temps. Faute
 * d'adhésions récentes, ce sont les plus grandes qui complètent la réserve.
 */
export async function trendingSessions(options: {
  viewerId: string
  limit?: number
  now?: Date
}): Promise<TrendingSession[]> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 20

  const discoverable: Prisma.CommunityWhereInput = {
    status: 'active',
    visibility: 'PUBLIC',
    eventsEnabled: true,
    trainerProfile: { userId: { not: options.viewerId } },
    subscriptions: {
      none: { learnerId: options.viewerId, status: { in: [...OPEN_STATUSES] } },
    },
  }

  const [counts, largest] = await Promise.all([
    db.communitySubscription.groupBy({
      by: ['communityId'],
      where: { createdAt: { gte: windowStart(now) }, community: { is: discoverable } },
      _count: { _all: true },
      orderBy: [{ _count: { communityId: 'desc' } }, { communityId: 'asc' }],
      take: TRENDING_COMMUNITY_POOL,
    }),
    db.community.findMany({
      where: discoverable,
      select: { id: true },
      orderBy: [{ membersCount: 'desc' }, { createdAt: 'asc' }],
      take: TRENDING_COMMUNITY_POOL,
    }),
  ])

  const pool = [...new Set([...counts.map((c) => c.communityId), ...largest.map((c) => c.id)])].slice(
    0,
    TRENDING_COMMUNITY_POOL,
  )
  if (pool.length === 0) return []

  const rows = await db.liveSession.findMany({
    where: {
      communityId: { in: pool },
      OR: [
        { status: 'LIVE' },
        // Une séance jamais lancée reste `SCHEDULED` après son heure. Au-delà
        // d'une journée, elle n'est plus « à venir » pour personne.
        { status: 'SCHEDULED', scheduledStartAt: { gte: new Date(now.getTime() - DAY_MS) } },
      ],
    },
    orderBy: { scheduledStartAt: 'asc' },
    take: limit,
    select: {
      ...AGENDA_SELECT,
      community: {
        select: {
          ...AGENDA_SELECT.community.select,
          ...COMMUNITY_VISUAL_SELECT,
          priceFcfa: true,
          trainerProfile: {
            select: {
              ...AGENDA_SELECT.community.select.trainerProfile.select,
              ...COMMUNITY_VISUAL_SELECT.trainerProfile.select,
              // Les colonnes de photo viennent d'`AGENDA_SELECT` ; `id` est ce
              // dont `userAvatarSrc` a besoin pour composer l'adresse.
              user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  })

  return rows.map((row) => ({
    session: toAgenda(row, false),
    visual: toCommunityVisual(row.community),
    priceFcfa: row.community.priceFcfa,
  }))
}

// --------------------------------------------------------------------------
// Formateurs
// --------------------------------------------------------------------------

export interface TrendingTrainer {
  id: string
  userId: string
  fullName: string | null
  slogan: string | null
  avatarS3Key: string | null
  /** L'adresse externe de la photo, quand aucune n'a été déposée. */
  avatarUrl: string | null
  /** Apprenants réels — voir `countTrainerLearners`. */
  learners: number
  publishedCount: number
}

export interface TrendingTrainers {
  /** Faux : pas assez d'activité pour classer, `items` sont les plus récents. */
  ranked: boolean
  items: TrendingTrainer[]
}

const TRAINER_SELECT = {
  id: true,
  userId: true,
  slogan: true,
  user: { select: { fullName: true, avatarS3Key: true, avatarUrl: true } },
  _count: { select: { courses: { where: { status: 'published' } } } },
} as const

/**
 * Les formateurs dont les contenus se sont le plus vendus sur la fenêtre.
 *
 * La visibilité suit `PUBLIC_TRAINER_WHERE`, source unique : un formateur que
 * l'annuaire cache ne réapparaît pas en tendance, sans quoi sa ligne mènerait à
 * une fiche 404. `viewerTrainerId` retire le formateur qui regarde : se voir
 * soi-même « en tendance » sur son propre accueil n'apprend rien.
 */
export async function trendingTrainers(options: {
  viewerTrainerId?: string | null
  limit: number
  now?: Date
}): Promise<TrendingTrainers> {
  const now = options.now ?? new Date()
  const visible: Prisma.TrainerProfileWhereInput = {
    AND: [
      PUBLIC_TRAINER_WHERE,
      ...(options.viewerTrainerId ? [{ id: { not: options.viewerTrainerId } }] : []),
    ],
  }

  const [counts, newest] = await Promise.all([
    db.purchase.groupBy({
      by: ['trainerId'],
      where: { ...countedSale(now), trainerProfile: { is: visible } },
      _count: { _all: true },
      orderBy: [{ _count: { trainerId: 'desc' } }, { trainerId: 'asc' }],
      take: options.limit,
    }),
    db.trainerProfile.findMany({
      where: visible,
      select: TRAINER_SELECT,
      orderBy: [{ approvedAt: 'desc' }, { id: 'asc' }],
      take: options.limit * 2,
    }),
  ])

  const rankedIds = counts.map((c) => c.trainerId)
  const ranked = rankedIds.length >= TRENDING_MIN_RANKED

  const rows = ranked
    ? [
        ...inOrder(
          rankedIds,
          await db.trainerProfile.findMany({ where: { id: { in: rankedIds } }, select: TRAINER_SELECT }),
        ),
        ...newest.filter((row) => !rankedIds.includes(row.id)),
      ].slice(0, options.limit)
    : newest.slice(0, options.limit)

  const learners = await countTrainerLearners(rows.map((row) => row.id))

  return {
    ranked,
    items: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      fullName: row.user.fullName,
      slogan: row.slogan,
      avatarS3Key: row.user.avatarS3Key,
      avatarUrl: row.user.avatarUrl,
      learners: learners.get(row.id) ?? 0,
      publishedCount: row._count.courses,
    })),
  }
}
