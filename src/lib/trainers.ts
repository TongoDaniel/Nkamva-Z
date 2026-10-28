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
import { searchAnyOf } from './search-text'
import { idsBranch, trainerProfileIdsMatching } from './search-unaccent'
import { userAvatarSrc } from './avatars'

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

/**
 * Un formateur suspendu — impayé d'abonnement, résiliation, ou sanction —
 * n'accueille plus de nouveaux membres dans sa communauté. **Source unique** :
 * l'annuaire, la recherche, la tendance, la fiche et le paiement la lisent ici.
 *
 * Décision 68 : les ressources d'un formateur suspendu sortent de la vente. Sa
 * communauté, elle, restait à vendre : un apprenant a adhéré, payé et crédité le
 * portefeuille d'une formatrice suspendue, alors que le message de suspension
 * annonçait « Vos ressources ne sont plus en vente » (campagne du 12 octobre
 * 2026, M3). Les membres déjà là gardent leur accès, comme un acheteur garde sa
 * ressource : la lecture n'est jamais coupée.
 */
const TRAINER_CLOSED_STATUSES = ['SUSPENDED', 'CANCELED'] as const

export const TRAINER_ACCEPTS_MEMBERS_WHERE = {
  subscriptionStatus: { notIn: [...TRAINER_CLOSED_STATUSES] },
  suspendedAt: null,
} satisfies Prisma.TrainerProfileWhereInput

export function trainerAcceptsMembers(trainer: {
  subscriptionStatus: string
  suspendedAt: Date | null
}): boolean {
  return !(TRAINER_CLOSED_STATUSES as readonly string[]).includes(trainer.subscriptionStatus)
    && trainer.suspendedAt === null
}

/**
 * Le nombre **réel** d'apprenants de chaque formateur.
 * ==========================================================================
 * `TrainerProfile.studentsCount` n'était écrit que par le seed de démonstration :
 * en production il valait zéro partout, et il a quitté le schéma (arbitrage
 * 143). Ce compte-ci se lit à la source, et c'est le seul que lisent les écrans.
 *
 * Un apprenant, c'est une personne distincte qui a **acheté** un de ses
 * contenus (réglé, non remboursé — ressource ou adhésion payée) **ou** qui est
 * membre de sa communauté aujourd'hui (adhésion ouverte, offerte comprise). Le
 * `UNION` dédoublonne : qui a acheté une ressource puis adhéré compte une fois.
 *
 * En SQL plutôt qu'en deux `findMany` : un `COUNT(DISTINCT)` ne rapatrie pas
 * une ligne par apprenant, et le nombre de lignes grandit avec l'audience.
 * ==========================================================================
 */
export async function countTrainerLearners(trainerIds: string[]): Promise<Map<string, number>> {
  if (trainerIds.length === 0) return new Map()
  const rows = await db.$queryRaw<Array<{ trainerId: string; learners: number }>>`
    SELECT t."trainerId", COUNT(DISTINCT t."learnerId")::int AS learners
    FROM (
      SELECT p."trainerId", p."learnerId"
      FROM "purchases" p
      WHERE p."trainerId" = ANY(${trainerIds})
        AND p."providerStatus" = 'SUCCEEDED'
        AND p."refundedAt" IS NULL
      UNION
      SELECT c."trainerId", s."learnerId"
      FROM "community_subscriptions" s
      JOIN "communities" c ON c."id" = s."communityId"
      WHERE c."trainerId" = ANY(${trainerIds})
        AND s."status" IN ('ACTIVE', 'PAST_DUE', 'BANNED')
    ) t
    GROUP BY t."trainerId"
  `
  return new Map(rows.map((row) => [row.trainerId, Number(row.learners)]))
}

/** Plafond de l'annuaire : il n'a pas de pagination, le filtrage est client. */
const DIRECTORY_LIMIT = 60

/**
 * L'ordre des listes publiques de formateurs — arbitrage 143.
 * ==========================================================================
 * Le plus d'apprenants réels d'abord, puis l'ordre alphabétique. L'annuaire et
 * la recherche triaient sur `studentsCount`, qui valait zéro partout en
 * production : leur ordre était celui de la base, c'est-à-dire aucun.
 *
 * Le compte ne se trie pas en base sans recopier `PUBLIC_TRAINER_WHERE` en SQL,
 * ce qui ferait deux sources de la règle de visibilité. On lit donc les
 * identifiants de **tous** les formateurs visibles, on compte en une requête,
 * on trie ici, puis on coupe. Le coût suit le nombre de formateurs visibles,
 * pas l'audience ; quand il pèsera, il faudra un compteur — et, cette fois, un
 * chemin applicatif qui le tient à jour.
 *
 * L'ordre alphabétique départage : une base jeune, où personne n'a encore
 * d'apprenant, rend un annuaire qu'on parcourt, pas un ordre d'insertion. Un
 * profil sans nom passe en dernier, puisqu'il s'affiche sous un nom générique.
 * ==========================================================================
 */
export async function rankPublicTrainers(options: {
  /** Filtre ajouté à la visibilité, jamais substitué à elle. */
  filter?: Prisma.TrainerProfileWhereInput
  limit: number
}): Promise<{ ids: string[]; learners: Map<string, number> }> {
  const candidates = await db.trainerProfile.findMany({
    where: { AND: [PUBLIC_TRAINER_WHERE, ...(options.filter ? [options.filter] : [])] },
    select: { id: true, user: { select: { fullName: true } } },
  })
  const learners = await countTrainerLearners(candidates.map((c) => c.id))

  const ids = candidates
    .sort((a, b) => {
      const nameA = a.user.fullName
      const nameB = b.user.fullName
      return (
        (learners.get(b.id) ?? 0) - (learners.get(a.id) ?? 0) ||
        Number(!nameA) - Number(!nameB) ||
        (nameA ?? '').localeCompare(nameB ?? '', 'fr') ||
        a.id.localeCompare(b.id)
      )
    })
    .slice(0, options.limit)
    .map((c) => c.id)

  return { ids, learners }
}

export interface PublicTrainer {
  id: string
  fullName: string | null
  /** Sa photo de profil, quand il en a déposé une — sinon ses initiales. */
  avatarUrl: string | null
  slogan: string | null
  description: string | null
  domains: string[]
  experienceYears: number | null
  ratingAverage: number
  ratingCount: number
  /** Apprenants réels — voir `countTrainerLearners`. */
  learners: number
  publishedCount: number
  /**
   * Communautés publiques ouvertes. Non décoratif : c'est ce qui permet à une
   * carte sans ressource d'annoncer ce qu'elle a — sans quoi elle n'afficherait
   * qu'un « 0 ressource » qui donne envie de passer son chemin.
   */
  communityCount: number
}

export async function listPublicTrainers(search?: string): Promise<PublicTrainer[]> {
  const { ids, learners } = await rankPublicTrainers({
    filter: search
      ? {
          OR: [
            // Jokers échappés, la forme sans accents cherchée aussi, et le texte
            // stocké comparé sans ses accents : « robe » trouve « rôbe » (m6).
            ...searchAnyOf(search, (contains) => [{ user: { fullName: contains } }, { slogan: contains }]),
            ...idsBranch(await trainerProfileIdsMatching(search)),
            { domains: { has: search } },
          ],
        }
      : undefined,
    limit: DIRECTORY_LIMIT,
  })
  if (ids.length === 0) return []

  const trainers = await db.trainerProfile.findMany({
    // La visibilité est rejouée : entre le classement et cette lecture, un
    // profil a pu être suspendu.
    where: { AND: [{ id: { in: ids } }, PUBLIC_TRAINER_WHERE] },
    select: {
      id: true,
      slogan: true,
      description: true,
      domains: true,
      experienceYears: true,
      ratingAverage: true,
      ratingCount: true,
      user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
      _count: {
        select: {
          courses: { where: { status: 'published' } },
          communities: { where: { status: 'active', visibility: 'PUBLIC' } },
        },
      },
    },
  })

  const byId = new Map(trainers.map((t) => [t.id, t]))
  return ids.flatMap((id) => {
    const t = byId.get(id)
    if (!t) return []
    return [{
      id: t.id,
      fullName: t.user.fullName,
      avatarUrl: userAvatarSrc(t.user),
      slogan: t.slogan,
      description: t.description,
      domains: t.domains,
      experienceYears: t.experienceYears,
      ratingAverage: t.ratingAverage,
      ratingCount: t.ratingCount,
      learners: learners.get(t.id) ?? 0,
      publishedCount: t._count.courses,
      communityCount: t._count.communities,
    }]
  })
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
  // Le compte part avec la fiche plutôt qu'après elle : pour un identifiant
  // inconnu, il rend une table vide et ne coûte rien.
  const [trainer, learners] = await Promise.all([
    db.trainerProfile.findFirst({
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
        approvedAt: true,
        userId: true,
        user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
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
    }),
    countTrainerLearners([trainerId]),
  ])

  if (!trainer) return null

  return {
    id: trainer.id,
    userId: trainer.userId,
    fullName: trainer.user.fullName,
    avatarUrl: userAvatarSrc(trainer.user),
    slogan: trainer.slogan,
    description: trainer.description,
    websiteUrl: trainer.websiteUrl,
    domains: trainer.domains,
    experienceYears: trainer.experienceYears,
    ratingAverage: trainer.ratingAverage,
    ratingCount: trainer.ratingCount,
    learners: learners.get(trainer.id) ?? 0,
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
