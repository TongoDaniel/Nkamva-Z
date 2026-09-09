// ==========================================================================
// Photos de profil — une personne, et un groupe
// ==========================================================================
// Même chaîne que la bannière d'une communauté (`presignCommunityCover` /
// `confirmCommunityCover`) : une URL présignée, un dépôt direct sur R2, puis
// une confirmation qui est le **seul** endroit où la clé entre en base. Sans
// cette seconde étape, l'objet vivrait dans le seau sans que rien ne le
// référence.
//
// Ce qui diffère de la bannière, et pourquoi :
//
//   · **Le service.** Une bannière est rendue par une page serveur, à chaque
//     visite : une URL signée de cinq minutes lui suffit. Une photo de profil
//     voyage dans du JSON — la liste des conversations, que l'écran garde
//     ouverte et resonde toutes les quinze secondes. Une signature s'y serait
//     périmée toute seule. Elle passe donc par une route qui redirige
//     (`/api/media/users/[userId]/avatar`), comme la couverture d'une
//     ressource : l'adresse est stable, le navigateur la met en cache, et la
//     clé ne sort jamais du serveur.
//
//   · **Le quota.** Le portrait d'une personne n'est pas pesé : l'arbitrage 54
//     compte ce qu'un formateur **publie**, et un apprenant n'a aucun quota où
//     l'imputer. La photo d'un groupe, elle, est publiée par son formateur au
//     même titre que sa bannière : elle est pesée, et `trainerStorageUsedBytes`
//     l'additionne.
//
//   · **Le plafond.** 2 Mo, contre 5 pour une bannière. Une photo est carrée et
//     réduite à 512 px avant l'envoi (`shrinkAvatar`) : au-delà de 2 Mo, ce
//     n'est plus un portrait qui monte, c'est une erreur.
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { canTrainerWrite } from './subscriptions'
import { trainerStorage } from './courses'
import { presignUpload, headObject, validateMagicNumber, deleteObject, isS3Configured } from './s3'

/** Miroir côté client dans `avatar-uploader.tsx`. Les deux doivent rester alignés. */
export const AVATAR_LIMITS = {
  mimes: ['image/png', 'image/jpeg', 'image/webp'],
  maxSize: 2_097_152,
} as const

/**
 * Préfixes de clés, vérifiés à la confirmation : la clé confirmée doit être
 * celle que nous avons émise **pour ce sujet-là**, sinon on rattacherait
 * l'objet d'un autre.
 *
 * Le groupe a son propre préfixe plutôt qu'un sous-dossier de
 * `community-assets/` : ce dernier est le préfixe de la bannière, et une clé
 * d'avatar y aurait aussi passé le contrôle de `confirmCommunityCover`.
 */
const userPrefix = (userId: string) => `user-avatars/${userId}/`
const communityPrefix = (communityId: string) => `community-avatars/${communityId}/`

function assertAcceptable(params: { mimeType: string; sizeBytes: number }) {
  if (!(AVATAR_LIMITS.mimes as readonly string[]).includes(params.mimeType)) {
    throw new Error('MIME_NOT_ALLOWED')
  }
  if (params.sizeBytes > AVATAR_LIMITS.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')
}

/**
 * L'objet est-il vraiment là, et est-il vraiment ce qu'il annonce ?
 *
 * Le `if (head)` seul — la forme qu'ont les couvertures — se dégrade en porte
 * ouverte : `headObject` rend `null` aussi bien quand le stockage n'est **pas
 * configuré** que quand l'objet n'existe **pas**. Confondre les deux laisse
 * enregistrer, sur une installation parfaitement configurée, la clé d'un fichier
 * que personne n'a déposé. Les deux cas sont donc distingués : sans stockage on
 * saute la vérification (rien n'a pu être déposé, et l'écran a déjà refusé
 * l'envoi sur l'URL factice) ; avec stockage, un objet absent est un refus.
 */
async function assertDeposee(s3Key: string, mimeType: string) {
  const head = await headObject(s3Key)
  if (!head) {
    if (isS3Configured()) throw new Error('UPLOAD_NOT_FOUND')
    return null
  }
  // Une image renommée est refusée : le magic number fait foi, pas l'extension.
  await validateMagicNumber(s3Key, mimeType)
  if (head.contentLength > AVATAR_LIMITS.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')
  return head
}

/** L'extension suit le type annoncé — la vérité est reprise au magic number. */
const keyFor = (prefix: string, mimeType: string) =>
  `${prefix}avatar-${crypto.randomUUID()}.${mimeType.split('/')[1]}`

// --- Ce qu'un écran met dans `src` ------------------------------------------
//
// Une seule fonction pour les deux origines possibles : la photo déposée ici,
// et l'adresse posée ailleurs (`avatarUrl` — comptes d'essai, demain une photo
// venue de Google). La clé l'emporte : c'est la plus récente des deux, et la
// seule que la personne contrôle depuis son écran.

/**
 * Empreinte courte de la clé, posée en `?v=` sur l'adresse servie.
 *
 * L'adresse d'une photo ne change pas quand la photo change — c'est tout
 * l'intérêt d'une route stable, et c'est aussi son piège : le navigateur garde
 * l'ancienne image jusqu'à l'expiration de son cache, et la personne qui vient
 * de remplacer son portrait revoit l'ancien. Chaque dépôt tire une clé neuve
 * (UUID) : son empreinte suffit à faire une adresse neuve, sans que la route
 * ait à lire ce paramètre.
 */
function empreinte(key: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function userAvatarSrc(user: {
  id: string
  avatarS3Key?: string | null
  avatarUrl?: string | null
}): string | null {
  if (user.avatarS3Key) {
    return `/api/media/users/${user.id}/avatar?v=${empreinte(user.avatarS3Key)}`
  }
  return user.avatarUrl ?? null
}

export function communityAvatarSrc(community: {
  id: string
  avatarS3Key?: string | null
}): string | null {
  return community.avatarS3Key
    ? `/api/media/communities/${community.id}/avatar?v=${empreinte(community.avatarS3Key)}`
    : null
}

// --- La photo d'une personne ------------------------------------------------

export async function presignUserAvatar(
  userId: string,
  params: { mimeType: string; sizeBytes: number },
) {
  assertAcceptable(params)
  const s3Key = keyFor(userPrefix(userId), params.mimeType)
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)
  return { uploadUrl, s3Key, expiresAt }
}

export async function confirmUserAvatar(
  userId: string,
  params: { s3Key: string; mimeType: string },
) {
  if (!params.s3Key.startsWith(userPrefix(userId))) throw new Error('UPLOAD_NOT_FOUND')
  if (!(AVATAR_LIMITS.mimes as readonly string[]).includes(params.mimeType)) {
    throw new Error('MIME_NOT_ALLOWED')
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, avatarS3Key: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')

  const head = await assertDeposee(params.s3Key, params.mimeType)

  const previousKey = user.avatarS3Key
  const updated = await db.user.update({
    where: { id: userId },
    data: { avatarS3Key: params.s3Key },
    select: { id: true, avatarS3Key: true, avatarUrl: true },
  })

  // Dans cet ordre : la nouvelle clé est en base avant que l'ancienne quitte le
  // seau, si bien qu'un échec de suppression ne laisse jamais un compte pointer
  // sur un objet effacé.
  if (previousKey && previousKey !== params.s3Key) {
    await deleteObject(previousKey).catch(() => {})
  }

  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'PROFILE_PHOTO_UPDATED', targetType: 'User', targetId: userId,
    meta: {
      s3Key: params.s3Key,
      mimeType: params.mimeType,
      sizeBytes: head?.contentLength ?? 0,
      replaced: Boolean(previousKey),
    },
  })

  return { avatarUrl: userAvatarSrc(updated) }
}

export async function removeUserAvatar(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { avatarS3Key: true, avatarUrl: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')
  // Retirer une photo qu'on n'a pas est déjà le résultat demandé : pas d'erreur.
  if (!user.avatarS3Key && !user.avatarUrl) return { avatarUrl: null }

  // Les **deux** origines partent, pas seulement la clé. « Retirer ma photo »
  // veut dire « qu'on ne montre plus mon visage » : laisser `avatarUrl`
  // reprendre la main afficherait encore un portrait après un retrait réussi,
  // et le bouton reviendrait à ne rien faire. Ce que la personne ne peut pas
  // poser depuis cet écran, elle doit au moins pouvoir l'en retirer.
  await db.user.update({
    where: { id: userId },
    data: { avatarS3Key: null, avatarUrl: null },
  })
  if (user.avatarS3Key) await deleteObject(user.avatarS3Key).catch(() => {})

  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'PROFILE_PHOTO_REMOVED', targetType: 'User', targetId: userId,
    meta: { s3Key: user.avatarS3Key, externalUrl: Boolean(user.avatarUrl) },
  })

  return { avatarUrl: null }
}

// --- La photo d'un groupe ---------------------------------------------------

/** Le sien, ouvert, et l'abonnement à jour — mêmes gardes que la bannière. */
async function assertOwnedAndWritable(communityId: string, trainerProfileId: string) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true, avatarS3Key: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')
  // Décision 68 — le téléversement est un chemin d'écriture, il est bloqué.
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')
  return community
}

export async function presignCommunityAvatar(
  communityId: string,
  trainerProfileId: string,
  params: { mimeType: string; sizeBytes: number },
) {
  await assertOwnedAndWritable(communityId, trainerProfileId)
  assertAcceptable(params)

  // La taille annoncée suffit ici : la vérité est reprise à la confirmation,
  // sur l'objet réellement déposé.
  const { remainingBytes } = await trainerStorage(trainerProfileId)
  if (params.sizeBytes > remainingBytes) throw new Error('STORAGE_QUOTA_EXCEEDED')

  const s3Key = keyFor(communityPrefix(communityId), params.mimeType)
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)
  return { uploadUrl, s3Key, expiresAt }
}

export async function confirmCommunityAvatar(
  communityId: string,
  trainerProfileId: string,
  userId: string,
  params: { s3Key: string; mimeType: string },
) {
  const community = await assertOwnedAndWritable(communityId, trainerProfileId)

  if (!params.s3Key.startsWith(communityPrefix(communityId))) throw new Error('UPLOAD_NOT_FOUND')
  if (!(AVATAR_LIMITS.mimes as readonly string[]).includes(params.mimeType)) {
    throw new Error('MIME_NOT_ALLOWED')
  }

  const head = await assertDeposee(params.s3Key, params.mimeType)
  const sizeBytes = head?.contentLength ?? 0

  const previousKey = community.avatarS3Key
  const updated = await db.community.update({
    where: { id: communityId },
    data: { avatarS3Key: params.s3Key, avatarSizeBytes: BigInt(sizeBytes) },
    select: { id: true, avatarS3Key: true },
  })
  if (previousKey && previousKey !== params.s3Key) {
    await deleteObject(previousKey).catch(() => {})
  }

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_AVATAR_UPLOADED', targetType: 'Community', targetId: communityId,
    meta: {
      s3Key: params.s3Key, sizeBytes, mimeType: params.mimeType, replaced: Boolean(previousKey),
    },
  })

  return { avatarUrl: communityAvatarSrc(updated) }
}

export async function removeCommunityAvatar(
  communityId: string,
  trainerProfileId: string,
  userId: string,
) {
  const community = await assertOwnedAndWritable(communityId, trainerProfileId)
  if (!community.avatarS3Key) return { avatarUrl: null }

  await db.community.update({
    where: { id: communityId },
    // La taille repart avec la clé : sans cela le quota resterait grevé d'une
    // image que plus rien n'affiche.
    data: { avatarS3Key: null, avatarSizeBytes: null },
  })
  await deleteObject(community.avatarS3Key).catch(() => {})

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_AVATAR_REMOVED', targetType: 'Community', targetId: communityId,
    meta: { s3Key: community.avatarS3Key },
  })

  return { avatarUrl: null }
}
