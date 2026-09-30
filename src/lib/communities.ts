// ==========================================================================
// Communautés — lecture publique et ressources incluses
// ==========================================================================
// Arbitrages 45, 47 et 48.
//
// L'accès d'un membre à une ressource incluse ne se résume pas à « abonné
// actif ». La déliaison (48) impose de croiser deux périodes :
//
//   accès  ⟺  une période d'adhésion chevauche une période de liaison
//
// Un abonné actif à une ressource encore liée est le cas courant, où les deux
// périodes sont ouvertes. Mais un ancien membre garde ce qu'il a eu, et un
// membre actuel ne récupère pas ce qui a été délié avant son arrivée.
// Supprimer une ligne de liaison effacerait un droit acquis : elle est bornée,
// jamais détruite.
//
// Le parcours d'adhésion payant n'existe pas encore : ce module lit et lie,
// il ne vend pas.
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { userAvatarSrc } from './avatars'
import { notify, deliverSideEffects } from './notification'
import { canTrainerWrite } from './subscriptions'
import { trainerStorage } from './courses'
import { presignUpload, headObject, validateMagicNumber, deleteObject } from './s3'
import { COVER_IMAGE_MAX_BYTES } from './rules'
import type { CommunityVisibility } from '@prisma/client'
import type { CourseListItem } from './dto'
import type { PrismaTransaction } from './types'
import { COMMUNITIES_PAGE_SIZE } from './search-limits'

/**
 * Statuts dont la période court encore. `BANNED` en fait partie : un membre
 * banni d'une communauté est écarté de la parole, pas de l'accès (arbitrage 40)
 * — même patron que la restriction de compte.
 */
export const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

/**
 * Recompte les membres d'une communauté, et écrit le compteur.
 * ==========================================================================
 * `Community.membersCount` est dénormalisé : il évite une jointure sur chaque
 * carte, chaque fiche, chaque résultat de recherche. Il était tenu par des
 * `increment: 1` et un `decrement` à trois endroits, et il a dérivé — une base
 * de développement affichait **3 membres d'un côté, 0 de l'autre** pour la même
 * communauté.
 *
 * Un compteur incrémental dérive de trois façons, et aucune ne se voit :
 *
 *   · **un chemin qui oublie.** Un script d'essai, un seed, une correction en
 *     base qui crée une adhésion sans passer par le service : le compteur ne
 *     bouge pas, et personne ne l'apprend. C'est l'origine de la dérive
 *     constatée.
 *   · **un chemin qui compte deux fois.** Un webhook rejoué, une reprise après
 *     erreur : `+1` s'applique à nouveau.
 *   · **une définition qui glisse.** « Membre » se lisait ici comme *adhésion
 *     ouverte* (`OPEN_STATUSES`, banni compris — arbitrage 40 : écarté de la
 *     parole, pas de l'accès) et ailleurs comme *actif ou en retard de
 *     paiement*, ce qui donnait deux nombres pour la même idée.
 *
 * Un **recompte** ne dérive pas. Il est idempotent — l'appeler deux fois donne
 * le même résultat —, il répare la ligne au passage si elle était fausse, et il
 * ne coûte qu'un `COUNT` sur un événement rare : on adhère, on part, on est
 * banni quelques fois par mois, pas plusieurs fois par seconde.
 *
 * À appeler dans la **même transaction** que le changement d'adhésion : hors
 * d'elle, un recompte peut lire un état que la transaction voisine n'a pas
 * encore validé.
 * ==========================================================================
 */
export async function recountCommunityMembers(
  tx: PrismaTransaction,
  communityId: string,
): Promise<number> {
  const membersCount = await tx.communitySubscription.count({
    where: { communityId, status: { in: [...OPEN_STATUSES] } },
  })
  await tx.community.update({ where: { id: communityId }, data: { membersCount } })
  return membersCount
}

export interface PublicCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  priceFcfa: number
  membersCount: number
  /** Toujours `PUBLIC` ici — arbitrage 81 — mais lue, pas supposée. */
  visibility: CommunityVisibility
  coverS3Key: string | null
  forumEnabled: boolean
  eventsEnabled: boolean
  resourcesEnabled: boolean
  /**
   * `id` est celui du **profil** formateur — c'est lui que les routes
   * attendent. `userId` et `avatarS3Key` viennent du compte, et servent la
   * photo que les cartes posent en tête : elle passe par une route à adresse
   * stable, pas par une URL signée.
   */
  trainer: {
    id: string
    userId: string
    fullName: string | null
    slogan: string | null
    avatarS3Key: string | null
    /**
     * L'adresse externe de la photo — comptes d'essai, photo venue d'un
     * fournisseur d'identité. `userAvatarSrc` la prend quand aucune photo n'a été
     * déposée : sans elle, ces comptes n'avaient jamais de portrait sur une carte.
     */
    avatarUrl: string | null
  }
  includedCount: number
}

/**
 * Les communautés qu'une personne n'a pas à retrouver dans une recherche : la
 * sienne, et celles où elle est déjà. Elles sont déjà devant elle, en tête de
 * `/mes-communautes` — les répéter dans les résultats afficherait deux fois la
 * même carte sur le même écran.
 *
 * Dérivée du serveur, jamais reçue du navigateur : une liste d'identifiants
 * envoyée par le client se trafique, et l'exclusion cesserait de dire la vérité.
 *
 * Rendue au `where` de la requête plutôt qu'appliquée après coup : filtrer
 * ensuite laisserait les places du `take` se faire manger par des lignes qu'on
 * jette juste après.
 */
export async function hiddenCommunityIdsFor(
  userId: string,
  trainerId: string | null,
): Promise<string[]> {
  const [mine, memberships] = await Promise.all([
    trainerId
      ? db.community.findMany({
          where: { trainerId, status: 'active' },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    db.communitySubscription.findMany({
      where: { learnerId: userId, status: { in: [...OPEN_STATUSES] } },
      select: { communityId: true },
    }),
  ])
  return [...new Set([...mine.map((c) => c.id), ...memberships.map((m) => m.communityId)])]
}

/** Une page de communautés, et de quoi savoir qu'il y en a d'autres. */
export interface PublicCommunityPage {
  items: PublicCommunity[]
  total: number
  page: number
  pageSize: number
}

/**
 * Les communautés qu'on peut découvrir, par page.
 *
 * Elle rendait les soixante premières, sans total ni page : de quoi remplir un
 * annuaire qu'on fait défiler, pas de quoi en parcourir plusieurs. Le total est
 * compté dans la même transaction que la tranche — lus séparément, ils peuvent
 * décrire deux états de la base, et la dernière page annoncée serait vide.
 */
export async function listPublicCommunities(
  options: {
    search?: string
    excludeIds?: readonly string[]
    page?: number
    pageSize?: number
  } = {},
): Promise<PublicCommunityPage> {
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? COMMUNITIES_PAGE_SIZE))
  const search = options.search?.trim() || undefined
  const where = {
    status: 'active',
    // Arbitrage 81 : une communauté privée sort de toutes les surfaces
    // publiques. `status` dit qu'elle vit, `visibility` dit qu'on peut la
    // trouver — les deux sont nécessaires.
    visibility: 'PUBLIC' as const,
    ...(options.excludeIds && options.excludeIds.length > 0
      ? { id: { notIn: [...options.excludeIds] } }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const total = await db.community.count({ where })
  // Une page demandée au-delà du dernier rang ne rend pas une page vide : elle
  // rend la dernière. Un filtre qui se resserre pendant qu'on est en page 4 ne
  // doit pas donner un écran blanc.
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, options.page ?? 1), lastPage)

  const rows = await db.community.findMany({
    where,
    select: SELECT_PUBLIC,
    orderBy: [{ membersCount: 'desc' }, { createdAt: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  })
  return { items: rows.map(toPublic), total, page, pageSize }
}

/**
 * La fiche publique d'une communauté.
 *
 * Une communauté **privée** répond `null` — donc 404 côté page — sauf au membre
 * qui y est déjà (arbitrage 81). Un 403 dirait qu'elle existe, ce qui suffirait
 * à cartographier les communautés fermées en essayant des slugs.
 *
 * L'invité porteur d'un jeton valide, lui, ne passe pas par ici : il voit la
 * communauté depuis `/invitation/[token]`, où le jeton fait autorité.
 */
export async function getPublicCommunity(
  slug: string,
  viewerId?: string | null,
  /**
   * Identifiant de la communauté dont une invitation valide vient d'être
   * reconnue. C'est ce qui laisse un invité **pas encore membre** lire une
   * communauté privée pendant le tunnel d'adhésion payant : sans cette porte,
   * l'arbitrage 73 (le nominatif peut être payant) n'aurait aucun chemin
   * praticable. L'appelant a la charge d'avoir validé l'invitation.
   */
  allowPrivateCommunityId?: string | null,
) {
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: {
      ...SELECT_PUBLIC, rules: true, messagesPerDay: true,
      visibility: true,
      // Surcharge volontaire de `SELECT_PUBLIC` : `userId` sert au contrôle
      // ci-dessous, et n'a rien à faire dans la fiche publique.
      trainerProfile: {
        select: {
          id: true, slogan: true, userId: true,
          user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
        },
      },
    },
  })
  if (!community) return null

  if (community.visibility === 'PRIVATE' && community.id !== allowPrivateCommunityId) {
    if (!viewerId) return null
    // Le formateur voit sa propre communauté fermée : il l'anime, il n'y adhère
    // pas, il n'apparaîtrait donc dans aucune souscription.
    if (community.trainerProfile.userId !== viewerId) {
      const member = await db.communitySubscription.count({
        where: { communityId: community.id, learnerId: viewerId, status: { in: [...OPEN_STATUSES] } },
      })
      if (member === 0) return null
    }
  }

  // Seules les ressources encore liées sont annoncées publiquement : c'est ce
  // qu'un futur membre recevra. Ce qui a été délié n'appartient plus à l'offre.
  //
  // Et pas les brouillons. Rien ne les excluait : un formateur qui liait une
  // ressource en préparation l'annonçait aussitôt sur sa fiche publique, titre
  // et prix compris, sans fichier derrière. Le cas était rare tant que lier
  // demandait d'aller le faire ; depuis qu'on choisit la destination **à la
  // création**, c'est devenu le cas courant — une ressource incluse naît
  // brouillon. `not: 'draft'` plutôt que `= 'published'` : une ressource
  // archivée a été publiée, et ce qu'un membre a reçu lui reste.
  const links = await db.communityCourse.findMany({
    where: {
      communityId: community.id,
      unlinkedAt: null,
      course: { status: { not: 'draft' } },
    },
    select: { linkedAt: true, course: { select: COURSE_CARD } },
    orderBy: { linkedAt: 'desc' },
  })

  return {
    ...toPublic(community),
    rules: community.rules,
    messagesPerDay: community.messagesPerDay,
    courses: links.map((l) => toCard(l.course)),
  }
}

// ==========================================================================
// Ouvrir et tenir sa communauté (formateur)
// ==========================================================================
// Ces fonctions manquaient entièrement. Le modèle, les adhésions, les salons,
// la messagerie, les lives et les invitations existaient tous — au-dessus d'un
// objet que rien ne savait créer. Les trois communautés du jeu de démonstration
// étaient écrites directement en base, faute de chemin.
//
// Un seul salon par formateur, à dessein : `Community.trainerId` n'est pas
// unique au schéma, mais tout le produit parle de « votre communauté » au
// singulier — la fiche formateur en affiche une, `listMyMemberships` en attend
// une par formateur. Autoriser la seconde demanderait de revoir ces écrans, pas
// d'ajouter une ligne.

/** Longueurs retenues pour rester lisibles sur une carte comme sur mobile. */
export const COMMUNITY_NAME_MAX = 80
export const COMMUNITY_DESCRIPTION_MAX = 2000
export const COMMUNITY_RULES_MAX = 2000

/**
 * Plancher du prix d'adhésion, aligné sur celui d'une ressource
 * (`createCourse`). En dessous, la commission de 15 % n'a plus de sens : elle
 * arrondirait à zéro.
 */
export const COMMUNITY_MIN_PRICE_FCFA = 500

export interface CommunityInput {
  name: string
  description?: string | null
  rules?: string | null
  priceFcfa: number
  forumEnabled?: boolean
  messagingEnabled?: boolean
  resourcesEnabled?: boolean
  eventsEnabled?: boolean
}

/** Slug unique, dérivé du nom — même fabrique que celle des ressources. */
async function generateCommunitySlug(name: string, excludeId?: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'communaute'

  let slug = base
  let counter = 1
  while (true) {
    const existing = await db.community.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!existing) break
    slug = `${base}-${counter++}`
  }
  return slug
}

function assertCommunityInput(input: CommunityInput): void {
  if (!input.name.trim()) throw new Error('NAME_REQUIRED')
  if (input.name.length > COMMUNITY_NAME_MAX) throw new Error('NAME_TOO_LONG')
  if (!Number.isInteger(input.priceFcfa) || input.priceFcfa < COMMUNITY_MIN_PRICE_FCFA) {
    throw new Error('PRICE_TOO_LOW')
  }
  if ((input.description?.length ?? 0) > COMMUNITY_DESCRIPTION_MAX) throw new Error('DESCRIPTION_TOO_LONG')
  if ((input.rules?.length ?? 0) > COMMUNITY_RULES_MAX) throw new Error('RULES_TOO_LONG')
}

export async function createCommunity(
  trainerProfileId: string,
  userId: string,
  input: CommunityInput,
) {
  assertCommunityInput(input)

  // Décision 68 — un abonnement suspendu ferme les chemins d'écriture. Ouvrir
  // un salon payant en fait partie : il encaisserait des adhésions.
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  const existing = await db.community.findFirst({
    where: { trainerId: trainerProfileId, status: 'active' },
    select: { id: true },
  })
  if (existing) throw new Error('COMMUNITY_ALREADY_EXISTS')

  const slug = await generateCommunitySlug(input.name)

  const community = await db.community.create({
    data: {
      trainerId: trainerProfileId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      rules: input.rules?.trim() || null,
      priceFcfa: input.priceFcfa,
      forumEnabled: input.forumEnabled ?? true,
      messagingEnabled: input.messagingEnabled ?? true,
      resourcesEnabled: input.resourcesEnabled ?? true,
      eventsEnabled: input.eventsEnabled ?? true,
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_CREATED', targetType: 'Community', targetId: community.id,
    meta: { name: community.name, slug, priceFcfa: community.priceFcfa },
  })

  return community
}

/**
 * Modifie le salon. Le **prix ne s'applique qu'aux adhésions à venir** : les
 * périodes déjà réglées portent leur montant, et `initiateMembershipPayment`
 * relit le prix courant à chaque échéance. Personne n'est débité de la
 * différence en cours de mois.
 *
 * Le slug suit le nom, comme pour une ressource. Une communauté renommée change
 * donc d'URL — c'est le comportement de `updateCourse`, et les liens partagés
 * y survivent mal. Le nom est le seul champ dans ce cas ; le signaler à
 * l'écran vaut mieux que de figer le slug et de laisser une adresse mentir.
 */
export async function updateCommunity(
  communityId: string,
  trainerProfileId: string,
  userId: string,
  input: Partial<CommunityInput>,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, name: true, priceFcfa: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  assertCommunityInput({
    name: input.name ?? community.name,
    priceFcfa: input.priceFcfa ?? community.priceFcfa,
    description: input.description,
    rules: input.rules,
  })

  const renamed = input.name !== undefined && input.name.trim() !== community.name

  const updated = await db.community.update({
    where: { id: communityId },
    data: {
      ...(input.name !== undefined && {
        name: input.name.trim(),
        ...(renamed ? { slug: await generateCommunitySlug(input.name, communityId) } : {}),
      }),
      ...(input.description !== undefined && { description: input.description?.trim() || null }),
      ...(input.rules !== undefined && { rules: input.rules?.trim() || null }),
      ...(input.priceFcfa !== undefined && { priceFcfa: input.priceFcfa }),
      ...(input.forumEnabled !== undefined && { forumEnabled: input.forumEnabled }),
      ...(input.messagingEnabled !== undefined && { messagingEnabled: input.messagingEnabled }),
      ...(input.resourcesEnabled !== undefined && { resourcesEnabled: input.resourcesEnabled }),
      ...(input.eventsEnabled !== undefined && { eventsEnabled: input.eventsEnabled }),
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_UPDATED', targetType: 'Community', targetId: communityId,
    meta: {
      renamed,
      ...(renamed ? { slug: updated.slug } : {}),
      ...(input.priceFcfa !== undefined && input.priceFcfa !== community.priceFcfa
        ? { priceFrom: community.priceFcfa, priceTo: input.priceFcfa }
        : {}),
    },
  })

  return updated
}

// ==========================================================================
// Fermer une communauté — arbitrage 2
// ==========================================================================
// `Community.status` était testé partout en lecture — `updateCommunity`,
// `presignCommunityCover`, l'adhésion — et le renouvellement savait déjà clore
// les adhésions d'une communauté qui n'est plus `active` (`COMMUNITY_CLOSED`).
// Mais **rien n'écrivait jamais autre chose que `active`** : la porte existait,
// personne ne pouvait la pousser.
//
// C'est ce qui bloquait la résiliation d'abonnement : l'arbitrage 2 refuse le
// départ d'un formateur qui a des membres payants actifs, et lui demande de
// fermer sa communauté d'abord. Sans ce geste, la règle était un cul-de-sac.

/**
 * Ferme une communauté : plus aucune adhésion nouvelle, et celles en cours
 * s'éteignent **à leur terme**.
 *
 * Rien n'est coupé sur-le-champ : un membre qui vient de payer son mois le
 * consomme entièrement. C'est `renewDueMemberships` qui referme chaque adhésion
 * à son échéance, avec le motif `COMMUNITY_CLOSED` — il sait déjà le faire.
 *
 * Conséquence à assumer, et que l'écran doit annoncer : le départ complet d'un
 * formateur peut donc prendre jusqu'à un mois.
 *
 * **Les ressources incluses sont libérées** (arbitrage 137). Délier n'en remet
 * aucune en vente — c'est la lettre de l'arbitrage 53 —, mais fermer, si :
 * sans communauté pour les porter, elles deviendraient inobtenables par
 * quiconque, et le formateur qui arrête perdrait son catalogue avec elle.
 * Personne n'y perd : les membres qui y avaient accès le gardent (arbitrage
 * 48), et il n'y a plus de futur membre à qui l'inclusion aurait été promise.
 *
 * La réouverture ne les rattache pas. C'est la même règle que pour les
 * adhésions éteintes : on ne ressuscite pas une liaison à laquelle le formateur
 * n'a pas consenti une seconde fois — il relie ce qu'il veut.
 */
export async function closeCommunity(
  communityId: string,
  trainerProfileId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_ALREADY_CLOSED')

  // Combien de membres payants courent encore : c'est ce délai que le formateur
  // doit attendre avant de pouvoir résilier son abonnement.
  const remaining = await db.communitySubscription.count({
    where: {
      communityId,
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      provider: { not: null },
    },
  })

  const liees = await db.communityCourse.findMany({
    where: { communityId, unlinkedAt: null },
    select: { courseId: true },
  })
  const courseIds = liees.map((l) => l.courseId)

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.community.update({
      where: { id: communityId },
      data: { status: 'closed' },
    })

    if (courseIds.length > 0) {
      // Les liaisons se bornent à maintenant. Borner n'enlève rien à personne :
      // l'accès se juge sur le **chevauchement** d'une adhésion et d'une
      // liaison passées, et ce chevauchement a déjà eu lieu.
      await tx.communityCourse.updateMany({
        where: { communityId, unlinkedAt: null },
        data: { unlinkedAt: new Date() },
      })
      await tx.course.updateMany({
        where: { id: { in: courseIds } },
        data: { circuit: 'MARKETPLACE' },
      })
    }

    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_CLOSED', targetType: 'Community', targetId: communityId,
      meta: { remainingPaidMembers: remaining, releasedCourseIds: courseIds },
    })
    return result
  })

  return { community: updated, remainingPaidMembers: remaining, releasedCourses: courseIds.length }
}

/**
 * Rouvre une communauté fermée. Les adhésions déjà éteintes ne reviennent pas —
 * on ne ressuscite pas une relation payante à laquelle personne n'a consenti —
 * mais les nouvelles redeviennent possibles.
 */
export async function reopenCommunity(
  communityId: string,
  trainerProfileId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status === 'active') throw new Error('COMMUNITY_NOT_CLOSED')
  // Un abonnement suspendu ne rouvre rien : c'est la même logique que le
  // blocage de publication (décision 68).
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  return db.$transaction(async (tx) => {
    const result = await tx.community.update({
      where: { id: communityId },
      data: { status: 'active' },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_REOPENED', targetType: 'Community', targetId: communityId,
    })
    return result
  })
}

/**
 * Les adhésions payantes qui courent encore chez un formateur, toutes
 * communautés confondues. C'est ce que l'arbitrage 2 oppose à une demande de
 * résiliation.
 *
 * **Une adhésion offerte ne compte pas** (`provider` nul) : personne n'y a
 * jamais attaché de moyen de paiement, elle ne représente aucun argent en
 * cours. **Un membre banni non plus** : il n'est déjà plus reconduit.
 */
export async function countActivePaidMembers(trainerProfileId: string): Promise<number> {
  return db.communitySubscription.count({
    where: {
      community: { trainerId: trainerProfileId },
      // `PAST_DUE` compte : l'adhésion court encore, en sursis de règlement.
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      provider: { not: null },
    },
  })
}

// ==========================================================================
// La bannière d'une communauté
// ==========================================================================
// Même chaîne que la couverture d'un cours (`presignCourseUpload` /
// `confirmCourseUpload`) : une URL présignée, puis une confirmation qui est le
// seul endroit où la clé entre en base. Sans cette seconde étape, l'objet
// vivrait sur R2 sans que rien ne le référence.
//
// La taille est relue sur l'objet déposé, jamais reprise du client : c'est elle
// qui alimente le quota de stockage du formateur (arbitrage 54).

/** Miroir de `COURSE_UPLOAD_LIMITS.image` : une bannière est une image. */
export const COMMUNITY_COVER_LIMITS = {
  mimes: ['image/png', 'image/jpeg', 'image/webp'],
  maxSize: COVER_IMAGE_MAX_BYTES,
} as const

/** Préfixe des clés R2 d'une bannière, vérifié à la confirmation. */
const coverPrefix = (communityId: string) => `community-assets/${communityId}/`

export async function presignCommunityCover(
  communityId: string,
  trainerProfileId: string,
  params: { mimeType: string; sizeBytes: number },
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')
  // Décision 68 — le téléversement est un chemin d'écriture, il est bloqué.
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  if (!(COMMUNITY_COVER_LIMITS.mimes as readonly string[]).includes(params.mimeType)) {
    throw new Error('MIME_NOT_ALLOWED')
  }
  if (params.sizeBytes > COMMUNITY_COVER_LIMITS.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')

  // La taille annoncée suffit ici : la vérité est reprise à la confirmation,
  // sur l'objet réellement déposé.
  const { remainingBytes } = await trainerStorage(trainerProfileId)
  if (params.sizeBytes > remainingBytes) throw new Error('STORAGE_QUOTA_EXCEEDED')

  const ext = params.mimeType.split('/')[1]
  const s3Key = `${coverPrefix(communityId)}cover-${crypto.randomUUID()}.${ext}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)

  return { uploadUrl, s3Key, expiresAt }
}

export async function confirmCommunityCover(
  communityId: string,
  trainerProfileId: string,
  userId: string,
  params: { s3Key: string; mimeType: string },
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true, coverS3Key: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  // La clé doit être celle que nous avons émise pour CETTE communauté : sinon
  // un formateur pourrait rattacher l'objet d'un autre.
  if (!params.s3Key.startsWith(coverPrefix(communityId))) throw new Error('UPLOAD_NOT_FOUND')

  if (!(COMMUNITY_COVER_LIMITS.mimes as readonly string[]).includes(params.mimeType)) {
    throw new Error('MIME_NOT_ALLOWED')
  }

  // Une image renommée est refusée. Sans identifiants R2, `headObject` renvoie
  // null et la validation est sautée — le mode dev ne dépose rien de réel.
  const head = await headObject(params.s3Key)
  if (head) {
    await validateMagicNumber(params.s3Key, params.mimeType)
    if (head.contentLength > COMMUNITY_COVER_LIMITS.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')
  }
  const sizeBytes = head?.contentLength ?? 0

  const previousKey = community.coverS3Key
  const updated = await db.community.update({
    where: { id: communityId },
    data: { coverS3Key: params.s3Key, coverSizeBytes: BigInt(sizeBytes) },
    select: { id: true, coverS3Key: true },
  })

  // La bannière remplacée ne sert plus personne et occuperait le quota pour
  // rien : elle est retirée du seau après que la nouvelle clé est en base —
  // dans cet ordre, un échec de suppression ne laisse jamais la communauté
  // pointer sur un objet effacé.
  if (previousKey && previousKey !== params.s3Key) {
    await deleteObject(previousKey).catch(() => {})
  }

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_COVER_UPLOADED', targetType: 'Community', targetId: communityId,
    meta: { s3Key: params.s3Key, sizeBytes, mimeType: params.mimeType, replaced: Boolean(previousKey) },
  })

  return updated
}

/** La communauté du formateur, avec de quoi remplir son écran de gestion. */
export async function getMyCommunity(trainerProfileId: string) {
  return db.community.findFirst({
    where: { trainerId: trainerProfileId, status: 'active' },
    select: {
      id: true, slug: true, name: true, description: true, rules: true,
      coverS3Key: true, avatarS3Key: true,
      priceFcfa: true, visibility: true, membersCount: true, messagesPerDay: true,
      // Le compte derrière le profil : la carte pose sa photo en tête, comme
      // pour n'importe quelle autre communauté.
      trainerProfile: {
        select: {
          userId: true,
          user: { select: { fullName: true, avatarS3Key: true, avatarUrl: true } },
        },
      },
      forumEnabled: true, messagingEnabled: true,
      resourcesEnabled: true, eventsEnabled: true, createdAt: true,
      _count: {
        select: {
          // `OPEN_STATUSES`, et non `ACTIVE`/`PAST_DUE` : c'était la troisième
          // définition de « membre » du produit, et celle qui donnait un nombre
          // différent de `membersCount` sur deux écrans voisins. Un banni reste
          // un membre (arbitrage 40) ; ce compte dit donc la même chose que la
          // colonne, qui est désormais recomptée à chaque changement.
          subscriptions: { where: { status: { in: [...OPEN_STATUSES] } } },
          courseLinks: { where: { unlinkedAt: null, course: { status: { not: 'draft' } } } },
        },
      },
    },
  })
}

// ==========================================================================
// Les membres, vus par l'animateur
// ==========================================================================
// `bannedAt`, `bannedReason` et `bannedById` étaient **lus** par tout le
// produit — `resolveViewer` en tire le silence dans le salon, `blockerFor` le
// refus d'une invitation — et rien ne les écrivait. Le formateur n'avait aucun
// moyen d'écarter quelqu'un de son propre fil.

export interface CommunityMember {
  learnerId: string
  fullName: string | null
  /** Sa photo, quand elle existe — le panneau « Membres » n'affichait que des initiales. */
  avatarUrl: string | null
  status: string
  periodStart: Date
  periodEnd: Date
  bannedAt: Date | null
  bannedReason: string | null
  canceledAt: Date | null
  /** Entré par une invitation, et laquelle (arbitrage 76). */
  viaInvitation: boolean
  joinedAt: Date
}

export async function listCommunityMembers(
  communityId: string,
  trainerProfileId: string,
): Promise<CommunityMember[]> {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')

  const rows = await db.communitySubscription.findMany({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      learnerId: true, status: true, periodStart: true, periodEnd: true,
      bannedAt: true, bannedReason: true, canceledAt: true, invitationId: true,
      createdAt: true,
      learner: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
    },
  })

  return rows.map((row) => ({
    learnerId: row.learnerId,
    fullName: row.learner.fullName,
    avatarUrl: userAvatarSrc(row.learner),
    status: row.status,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    bannedAt: row.bannedAt,
    bannedReason: row.bannedReason,
    canceledAt: row.canceledAt,
    viaInvitation: row.invitationId != null,
    joinedAt: row.createdAt,
  }))
}

/**
 * Bannir, c'est **retirer la parole, pas l'accès** (arbitrage 40).
 *
 * `BANNED` fait partie des statuts « ouverts » : le membre continue de lire le
 * salon et de consulter les ressources incluses jusqu'au terme de la période
 * qu'il a payée. C'est délibéré — lui couper l'accès à ce qu'il a réglé serait
 * une sanction financière déguisée, et c'est exactement ce que le remboursement
 * existe pour traiter. Le même patron que la restriction de compte.
 *
 * Le motif est obligatoire : il est affiché au membre et sert de trace le jour
 * où la décision est contestée.
 */
export async function banCommunityMember(
  communityId: string,
  learnerId: string,
  trainerProfileId: string,
  userId: string,
  reason: string,
) {
  const motive = reason.trim()
  if (motive.length < 10) throw new Error('REASON_REQUIRED')

  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, name: true, slug: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')

  const subscription = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: { in: [...OPEN_STATUSES] } },
    select: { id: true, status: true },
  })
  if (!subscription) throw new Error('MEMBER_NOT_FOUND')
  if (subscription.status === 'BANNED') throw new Error('ALREADY_BANNED')

  await db.$transaction(async (tx) => {
    await tx.communitySubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'BANNED',
        bannedAt: new Date(),
        bannedReason: motive,
        bannedById: userId,
      },
    })
    // Un banni reste un membre — écarté de la parole, pas de l'accès
    // (arbitrage 40) —, donc ce recompte rend le même nombre. Il est là pour
    // que l'invariant tienne de lui-même si cette définition changeait, et
    // parce qu'un chemin qui touche aux adhésions sans recompter est
    // exactement ce qui a fait dériver ce compteur.
    await recountCommunityMembers(tx, communityId)
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_MEMBER_BANNED', targetType: 'CommunitySubscription', targetId: subscription.id,
      meta: { communityId, learnerId, fromStatus: subscription.status, reason: motive },
    })
  })

  // Le membre l'apprend, avec le motif : une exclusion silencieuse se découvre
  // en essayant d'écrire, et se lit comme une panne.
  await deliverSideEffects('COMMUNITY_MEMBER_BANNED', { type: 'CommunitySubscription', id: subscription.id }, () =>
    notify(learnerId, {
      type: 'COMMUNITY_MEMBER_BANNED',
      title: `Vous ne pouvez plus écrire dans ${community.name}`,
      body: `${motive}\n\nVous gardez l'accès en lecture et aux ressources incluses jusqu'au terme de la période déjà réglée.`,
      link: `/mes-communautes/${community.slug}`,
    }),
  )

  return { banned: true }
}

/** Rend la parole. La période, elle, n'a jamais été interrompue. */
export async function unbanCommunityMember(
  communityId: string,
  learnerId: string,
  trainerProfileId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, name: true, slug: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')

  const subscription = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: 'BANNED' },
    select: { id: true, periodEnd: true, canceledAt: true },
  })
  if (!subscription) throw new Error('MEMBER_NOT_BANNED')

  // On ne rend pas `ACTIVE` à quelqu'un dont la période est close ou résiliée :
  // le statut doit refléter la réalité de son adhésion, pas la levée de la
  // sanction. `EXPIRED` est ce que le job de renouvellement aurait posé.
  const expired = subscription.periodEnd < new Date()
  const status = subscription.canceledAt || expired ? 'EXPIRED' : 'ACTIVE'

  await db.$transaction(async (tx) => {
    await tx.communitySubscription.update({
      where: { id: subscription.id },
      data: { status, bannedAt: null, bannedReason: null, bannedById: null },
    })
    // Ici le recompte **change** le nombre, et c'était un défaut : lever la
    // sanction de quelqu'un dont la période est close ou résiliée pose
    // `EXPIRED`, qui sort des adhésions ouvertes. Personne ne touchait au
    // compteur sur ce chemin — la communauté gardait un membre qu'elle n'avait
    // plus, jusqu'à la prochaine adhésion ou au prochain départ.
    await recountCommunityMembers(tx, communityId)
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_MEMBER_UNBANNED', targetType: 'CommunitySubscription', targetId: subscription.id,
      meta: { communityId, learnerId, toStatus: status },
    })
  })

  await deliverSideEffects('COMMUNITY_MEMBER_UNBANNED', { type: 'CommunitySubscription', id: subscription.id }, () =>
    notify(learnerId, {
      type: 'COMMUNITY_MEMBER_UNBANNED',
      title: `Vous pouvez de nouveau écrire dans ${community.name}`,
      body: 'La restriction posée sur votre participation a été levée.',
      link: `/mes-communautes/${community.slug}`,
    }),
  )

  return { status }
}

// --- Ressources incluses : liaison et déliaison (formateur) ---

/**
 * Lie une ressource à la communauté du formateur. Bascule son circuit :
 * arbitrage 47, une ressource incluse n'est plus vendue à l'unité.
 */
export async function linkCourseToCommunity(
  communityId: string,
  courseId: string,
  trainerId: string,
  userId: string,
) {
  const [community, course] = await Promise.all([
    db.community.findUnique({
      where: { id: communityId },
      select: { id: true, trainerId: true, status: true, resourcesEnabled: true },
    }),
    db.course.findUnique({
      where: { id: courseId },
      select: { id: true, trainerId: true, circuit: true, _count: { select: { purchases: true } } },
    }),
  ])
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (community.trainerId !== trainerId || course.trainerId !== trainerId) throw new Error('NOT_OWNER')

  // On n'associe qu'à une communauté **ouverte** (F3.10). *Ouverte* et
  // *visible* sont deux choses : une communauté privée reste ouverte, c'est
  // `status` qui dit qu'elle vit. Aucun contrôle n'existait — on pouvait garnir
  // une communauté que plus personne ne peut rejoindre.
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')

  // Et à un rayon allumé (arbitrage 136). L'interrupteur masquait l'onglet
  // « Incluses » et la ligne de la fiche publique sans rien interdire : le
  // formateur pouvait remplir une étagère qu'il avait lui-même cachée, et se
  // demander ensuite pourquoi ses membres ne voyaient rien.
  if (!community.resourcesEnabled) throw new Error('COMMUNITY_RESOURCES_DISABLED')

  // Une ressource déjà vendue ne peut pas basculer : ceux qui l'ont payée
  // l'auraient eue gratuitement en s'abonnant, ce que l'arbitrage 47 exclut.
  if (course._count.purchases > 0) throw new Error('COURSE_ALREADY_SOLD')

  const existing = await db.communityCourse.findFirst({
    where: { communityId, courseId, unlinkedAt: null },
    select: { id: true },
  })
  if (existing) throw new Error('COURSE_ALREADY_LINKED')

  const link = await db.$transaction(async (tx) => {
    const created = await tx.communityCourse.create({ data: { communityId, courseId } })
    await tx.course.update({ where: { id: courseId }, data: { circuit: 'COMMUNITY' } })
    return created
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_COURSE_LINKED', targetType: 'Community', targetId: communityId,
    meta: { courseId, linkId: link.id },
  })

  return link
}

/**
 * Délie une ressource. La ligne est bornée, pas supprimée : tout membre qui y
 * avait accès pendant la liaison le conserve (arbitrage 48).
 *
 * **Le circuit ne revient pas à la marketplace** (arbitrages 53 et 137). Ce que
 * le formateur a annoncé comme inclus ne repasse pas derrière un péage sur un
 * simple geste de rangement : délier retire la ressource du catalogue
 * communautaire, cela ne la remet pas en vente.
 *
 * Le code faisait l'inverse — il rebasculait en `MARKETPLACE` — et contredisait
 * donc l'arbitrage qu'il était censé appliquer. Seule la **fermeture** de la
 * communauté libère les ressources, parce qu'il n'y a alors plus de communauté
 * pour les porter : voir `closeCommunity`.
 */
export async function unlinkCourseFromCommunity(
  communityId: string,
  courseId: string,
  trainerId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerId) throw new Error('NOT_OWNER')

  const { count } = await db.communityCourse.updateMany({
    where: { communityId, courseId, unlinkedAt: null },
    data: { unlinkedAt: new Date() },
  })
  if (count === 0) throw new Error('COURSE_NOT_LINKED')

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_COURSE_UNLINKED', targetType: 'Community', targetId: communityId,
    meta: { courseId },
  })
}

// --- Accès d'un membre à une ressource incluse ---

/**
 * Vrai si une période d'adhésion de l'apprenant chevauche une période de
 * liaison de la ressource (arbitrage 48).
 *
 * Les deux bornes ouvertes valent « jusqu'à maintenant » : un abonnement en
 * cours et une liaison en cours se chevauchent forcément.
 */
export async function hasCommunityAccess(learnerId: string, courseId: string): Promise<boolean> {
  const links = await db.communityCourse.findMany({
    where: { courseId },
    select: { communityId: true, linkedAt: true, unlinkedAt: true },
  })
  if (links.length === 0) return false

  const subs = await db.communitySubscription.findMany({
    where: {
      learnerId,
      communityId: { in: links.map((l) => l.communityId) },
    },
    select: { communityId: true, periodStart: true, periodEnd: true, status: true },
  })

  const now = new Date()
  return links.some((link) =>
    subs.some((sub) => {
      if (sub.communityId !== link.communityId) return false
      // Une période encore ouverte court jusqu'à maintenant : sa date de fin
      // sera repoussée au renouvellement, s'y fier fermerait l'accès à tort.
      const subEnd = OPEN_STATUSES.includes(sub.status as never) ? now : sub.periodEnd
      const linkEnd = link.unlinkedAt ?? now
      return sub.periodStart <= linkEnd && link.linkedAt <= subEnd
    }),
  )
}

/** Ressources incluses auxquelles l'apprenant a droit, liées ou non aujourd'hui. */
export async function listMyIncludedCourses(learnerId: string): Promise<CourseListItem[]> {
  const subs = await db.communitySubscription.findMany({
    where: { learnerId },
    select: { communityId: true, periodStart: true, periodEnd: true, status: true },
  })
  if (subs.length === 0) return []

  const links = await db.communityCourse.findMany({
    where: {
      communityId: { in: subs.map((s) => s.communityId) },
      // Même raison que sur la fiche publique : un brouillon n'a rien à faire
      // sur l'étagère d'un membre. L'accès au fichier, lui, n'est pas touché —
      // `hasCommunityAccess` juge un droit acquis, et le restreindre au statut
      // fermerait l'accès à ce qui a été publié puis archivé.
      course: { status: { not: 'draft' } },
    },
    select: { communityId: true, linkedAt: true, unlinkedAt: true, course: { select: COURSE_CARD } },
  })

  const now = new Date()
  const seen = new Set<string>()
  const out: CourseListItem[] = []
  for (const link of links) {
    if (seen.has(link.course.id)) continue
    const granted = subs.some((sub) => {
      if (sub.communityId !== link.communityId) return false
      const subEnd = OPEN_STATUSES.includes(sub.status as never) ? now : sub.periodEnd
      const linkEnd = link.unlinkedAt ?? now
      return sub.periodStart <= linkEnd && link.linkedAt <= subEnd
    })
    if (!granted) continue
    seen.add(link.course.id)
    out.push(toCard(link.course))
  }
  return out
}

// --- Projections ---

const SELECT_PUBLIC = {
  id: true, slug: true, name: true, description: true, priceFcfa: true,
  membersCount: true, visibility: true, coverS3Key: true, forumEnabled: true, eventsEnabled: true,
  resourcesEnabled: true,
  trainerProfile: {
    select: {
      id: true,
      slogan: true,
      userId: true,
      user: { select: { fullName: true, avatarS3Key: true, avatarUrl: true } },
    },
  },
  // Le compteur compte ce que les listes montrent : sans le filtre de
  // statut, la carte annonçait « 2 incluses » et la fiche n'en listait qu'une.
  _count: { select: { courseLinks: { where: { unlinkedAt: null, course: { status: { not: 'draft' } } } } } },
} as const

const COURSE_CARD = {
  id: true, slug: true, title: true, blurb: true, category: true, format: true,
  priceFcfa: true, level: true, durationSeconds: true, coverS3Key: true, publishedAt: true,
  trainerProfile: {
    select: {
      id: true, ratingAverage: true, ratingCount: true, slogan: true,
      user: { select: { fullName: true } },
    },
  },
} as const

function toPublic(c: any): PublicCommunity {
  return {
    id: c.id, slug: c.slug, name: c.name, description: c.description,
    priceFcfa: c.priceFcfa, membersCount: c.membersCount, visibility: c.visibility,
    coverS3Key: c.coverS3Key,
    forumEnabled: c.forumEnabled, eventsEnabled: c.eventsEnabled,
    resourcesEnabled: c.resourcesEnabled,
    trainer: {
      id: c.trainerProfile.id,
      userId: c.trainerProfile.userId,
      fullName: c.trainerProfile.user.fullName,
      slogan: c.trainerProfile.slogan,
      avatarS3Key: c.trainerProfile.user.avatarS3Key,
      avatarUrl: c.trainerProfile.user.avatarUrl,
    },
    includedCount: c._count.courseLinks,
  }
}

function toCard(c: any): CourseListItem {
  return {
    ...c,
    publishedAt: c.publishedAt?.toISOString() ?? null,
    trainerProfile: {
      id: c.trainerProfile.id,
      user: { fullName: c.trainerProfile.user.fullName },
      ratingAverage: c.trainerProfile.ratingAverage,
      ratingCount: c.trainerProfile.ratingCount,
      slogan: c.trainerProfile.slogan,
    },
  } as CourseListItem
}
