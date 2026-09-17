// ==========================================================================
// Le visuel d'une communauté : de quoi poser une vignette
// ==========================================================================
// L'accueil pose une image à côté de chaque communauté et de chaque séance. Une
// séance n'en a pas ; une communauté en a jusqu'à trois, et c'est l'ordre qui
// compte :
//
//   1. sa **bannière** (16:9), faite pour être regardée en grand ;
//   2. sa **photo de groupe**, carrée ;
//   3. le **portrait de qui l'anime** — la seule image qu'on retrouve d'une
//      communauté à l'autre, et celle que `CommunityCard` a choisie pour la
//      même raison : beaucoup de communautés n'ont pas déposé de bannière.
//
// Sans aucune des trois, la vignette pose des initiales sur un fond rayé. Jamais
// une photo d'illustration : une image qui ne vient pas de la communauté dirait
// quelque chose de faux sur elle.
//
// Module serveur. Les clés de stockage ne quittent pas ce fichier : ce qui en
// sort, ce sont des adresses.
// ==========================================================================

import { db } from './db'
import { isS3Configured, presignDownload } from './s3'
import { communityAvatarSrc, userAvatarSrc } from './avatars'
import type { MyCommunity } from './memberships'

/** Voir `communities.ts` — les listes de statuts ouverts restent alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

export const COMMUNITY_VISUAL_SELECT = {
  id: true,
  name: true,
  coverS3Key: true,
  avatarS3Key: true,
  trainerProfile: {
    select: {
      userId: true,
      user: { select: { fullName: true, avatarS3Key: true, avatarUrl: true } },
    },
  },
} as const

export interface CommunityVisual {
  id: string
  name: string
  coverS3Key: string | null
  avatarS3Key: string | null
  trainerUserId: string
  trainerName: string | null
  trainerAvatarS3Key: string | null
  trainerAvatarUrl: string | null
}

export function toCommunityVisual(c: {
  id: string
  name: string
  coverS3Key: string | null
  avatarS3Key: string | null
  trainerProfile: {
    userId: string
    user: { fullName: string | null; avatarS3Key: string | null; avatarUrl: string | null }
  }
}): CommunityVisual {
  return {
    id: c.id,
    name: c.name,
    coverS3Key: c.coverS3Key,
    avatarS3Key: c.avatarS3Key,
    trainerUserId: c.trainerProfile.userId,
    trainerName: c.trainerProfile.user.fullName,
    trainerAvatarS3Key: c.trainerProfile.user.avatarS3Key,
    trainerAvatarUrl: c.trainerProfile.user.avatarUrl,
  }
}

/**
 * Le visuel d'une adhésion, sans requête : `listMyMemberships` lit déjà tout ce
 * qu'il faut. C'est ce qui épargne à l'accueil apprenant une lecture de plus.
 */
export function visualOfMembership(m: MyCommunity): CommunityVisual {
  return {
    id: m.community.id,
    name: m.community.name,
    coverS3Key: m.community.coverS3Key,
    avatarS3Key: m.community.avatarS3Key,
    trainerUserId: m.community.trainerUserId,
    trainerName: m.community.trainerName,
    trainerAvatarS3Key: m.community.trainerAvatarS3Key,
    trainerAvatarUrl: m.community.trainerAvatarUrl,
  }
}

/**
 * Les visuels des communautés d'une personne : celles dont elle est membre, et
 * celle qu'elle anime. C'est exactement l'ensemble dont l'agenda
 * (`listAgenda`) tire ses séances — une séance de l'onglet « Mes communautés »
 * trouve donc toujours son visuel ici.
 *
 * Une seule requête, pensée pour partir dans la même vague que l'agenda : lire
 * les visuels **après** coup ajouterait un aller-retour de plus à la cascade.
 */
export async function visualsOfMember(
  userId: string,
  trainerProfileId: string | null,
): Promise<Map<string, CommunityVisual>> {
  const rows = await db.community.findMany({
    where: {
      OR: [
        { subscriptions: { some: { learnerId: userId, status: { in: [...OPEN_STATUSES] } } } },
        ...(trainerProfileId ? [{ trainerId: trainerProfileId }] : []),
      ],
    },
    select: COMMUNITY_VISUAL_SELECT,
  })
  return new Map(rows.map((row) => [row.id, toCommunityVisual(row)]))
}

/** Ce qu'une vignette reçoit : des adresses, jamais des clés. */
export interface Thumbnail {
  /** La bannière, signée pour la durée de la page. */
  cover: string | null
  /** Photo de groupe, sinon portrait du formateur — adresse stable. */
  portrait: string | null
  /** Porte les initiales quand il n'y a aucune image. */
  name: string
}

/**
 * La bannière passe par une URL **signée**, pas par une route stable : c'est le
 * chemin assumé des communautés (une page serveur rendue à chaque visite, dont
 * la signature de cinq minutes tient). Sans stockage configuré, `presignDownload`
 * rend une adresse `data:` factice qui s'afficherait en image cassée : on rend
 * alors `null`, et la vignette retombe sur le portrait.
 */
export async function thumbnailOf(visual: CommunityVisual): Promise<Thumbnail> {
  const cover =
    visual.coverS3Key && isS3Configured() ? await presignDownload(visual.coverS3Key) : null
  const portrait =
    communityAvatarSrc({ id: visual.id, avatarS3Key: visual.avatarS3Key }) ??
    userAvatarSrc({
      id: visual.trainerUserId,
      avatarS3Key: visual.trainerAvatarS3Key,
      avatarUrl: visual.trainerAvatarUrl,
    })
  return { cover, portrait, name: visual.name }
}
