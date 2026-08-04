// ==========================================================================
// Lot 4 — Gestion des cours côté formateur : CRUD, upload R2, publication
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { presignUpload, headObject, validateMagicNumber } from './s3'
import { canTrainerWrite } from './subscriptions'
import type { PrismaTransaction } from './types'

export const COURSE_UPLOAD_LIMITS = {
  video: { mimes: ['video/mp4'], maxSize: 2_147_483_648 },
  pdf: { mimes: ['application/pdf'], maxSize: 10_485_760 },
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxSize: 5_242_880 },
} as const

/**
 * Arbitrage 54 — 40 Go inclus par formateur. Le quota porte sur celui qui
 * téléverse, pas sur la communauté ni sur l'apprenant.
 */
export const TRAINER_STORAGE_QUOTA_BYTES = 40 * 1024 ** 3

/**
 * Arbitrage 69 — au-delà des 40 Go, le stockage s'achète par tranches de 50 Go.
 * La constante vit ici parce que le quota se calcule ici ; le **prix**, lui,
 * est administré et vit en base (voir `storage-tiers.ts`).
 */
export const STORAGE_TIER_BYTES = 50 * 1024 ** 3

/**
 * Octets déjà occupés par un formateur. Somme les tailles réellement
 * enregistrées à la confirmation, jamais celles annoncées par le client.
 *
 * **Les replays y entrent** (arbitrage 54) : un live en produit un
 * automatiquement (arbitrage 38), un formateur peut donc épuiser son quota sans
 * avoir rien téléversé lui-même. Un replay purgé au bout de 24 mois
 * (arbitrage 51) lui rend la place — d'où le filtre sur `purgedAt`.
 */
export async function trainerStorageUsedBytes(trainerId: string): Promise<number> {
  const [courses, replays] = await Promise.all([
    db.course.aggregate({
      where: { trainerId },
      _sum: { contentSizeBytes: true, coverSizeBytes: true },
    }),
    db.replay.aggregate({
      where: { trainerId, purgedAt: null },
      _sum: { sizeBytes: true },
    }),
  ])
  // Colonnes BIGINT — une seule vidéo peut peser 2 Go, soit un octet de plus
  // qu'un entier 32 bits. La somme repasse en `number` ici : 40 Go tient
  // largement sous la limite d'exactitude de JavaScript (9 Po).
  // `BigInt(0)` plutôt que le littéral `0n` : la cible TypeScript du projet
  // est antérieure à ES2020.
  const total =
    (courses._sum.contentSizeBytes ?? BigInt(0)) +
    (courses._sum.coverSizeBytes ?? BigInt(0)) +
    (replays._sum.sizeBytes ?? BigInt(0))
  return Number(total)
}

/**
 * Quota effectif : les 40 Go inclus, plus les paliers de 50 Go achetés
 * (arbitrage 69). Lire le profil ici plutôt que la constante seule est ce qui
 * rend l'extension réelle — sinon un formateur paierait de l'espace sans jamais
 * pouvoir s'en servir.
 */
export async function trainerStorage(trainerId: string) {
  const [usedBytes, profile] = await Promise.all([
    trainerStorageUsedBytes(trainerId),
    db.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { storageTiers: true },
    }),
  ])
  const quotaBytes =
    TRAINER_STORAGE_QUOTA_BYTES + (profile?.storageTiers ?? 0) * STORAGE_TIER_BYTES
  return {
    usedBytes,
    quotaBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
  }
}

export async function createCourse(
  trainerId: string,
  userId: string,
  data: {
    title: string
    blurb: string
    description: string
    category: string
    format: string
    priceFcfa: number
    level?: string
    durationSeconds?: number
    lessonsCount?: number
    learnPoints?: string[]
    includes?: string[]
  },
) {
  if (data.priceFcfa < 500) throw new Error('PRICE_TOO_LOW')
  // Décision 68 — un abonnement suspendu bloque l'écriture. Jamais la lecture :
  // rien de ce qui est déjà acheté n'est touché.
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  const slug = await generateSlug(data.title)

  const course = await db.course.create({
    data: {
      trainerId,
      slug,
      title: data.title,
      blurb: data.blurb,
      description: data.description,
      category: data.category,
      format: data.format,
      priceFcfa: data.priceFcfa,
      level: data.level || null,
      durationSeconds: data.durationSeconds || null,
      lessonsCount: data.lessonsCount || null,
      learnPoints: data.learnPoints || [],
      includes: data.includes || [],
      status: 'draft',
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COURSE_CREATED', targetType: 'Course', targetId: course.id,
    meta: { title: data.title, slug },
  })

  return course
}

export async function updateCourse(
  courseId: string,
  trainerId: string,
  userId: string,
  data: Partial<{
    title: string
    blurb: string
    description: string
    category: string
    format: string
    priceFcfa: number
    level: string
    durationSeconds: number
    lessonsCount: number
    learnPoints: string[]
    includes: string[]
    coverS3Key: string
  }>,
) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')

  const updated = await db.course.update({
    where: { id: courseId },
    data: {
      ...(data.title && { title: data.title, slug: await generateSlug(data.title, courseId) }),
      ...(data.blurb !== undefined && { blurb: data.blurb }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category && { category: data.category }),
      ...(data.format && { format: data.format }),
      ...(data.priceFcfa !== undefined && { priceFcfa: data.priceFcfa }),
      ...(data.level !== undefined && { level: data.level }),
      ...(data.durationSeconds !== undefined && { durationSeconds: data.durationSeconds }),
      ...(data.lessonsCount !== undefined && { lessonsCount: data.lessonsCount }),
      ...(data.learnPoints !== undefined && { learnPoints: data.learnPoints }),
      ...(data.includes !== undefined && { includes: data.includes }),
      ...(data.coverS3Key !== undefined && { coverS3Key: data.coverS3Key }),
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COURSE_UPDATED', targetType: 'Course', targetId: courseId,
  })

  return updated
}

export async function publishCourse(courseId: string, trainerId: string, userId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')
  if (course.status === 'published') throw new Error('ALREADY_PUBLISHED')
  // Décision 68 — les ressources d'un formateur suspendu sortent du catalogue ;
  // il ne peut pas les y remettre en republiant.
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')
  // Rien ne l'empêchait de publier une ressource sans contenu, donc de la
  // vendre. L'acheteur ne l'aurait découvert qu'après paiement.
  if (!course.contentS3Key) throw new Error('CONTENT_REQUIRED')

  const updated = await db.course.update({
    where: { id: courseId },
    data: { status: 'published', publishedAt: new Date() },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COURSE_PUBLISHED', targetType: 'Course', targetId: courseId,
  })

  return updated
}

export async function archiveCourse(courseId: string, trainerId: string, userId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')

  return db.course.update({
    where: { id: courseId },
    data: { status: 'archived' },
  })
}

export async function listTrainerCourses(trainerId: string, status?: string) {
  return db.course.findMany({
    where: { trainerId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
  })
}

// --- Upload du contenu du cours via R2 présigné ---

export async function presignCourseUpload(
  courseId: string,
  trainerId: string,
  params: { mimeType: string; sizeBytes: number; kind: 'video' | 'pdf' | 'image' },
) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')
  // Décision 68 — le téléversement est un chemin d'écriture, il est bloqué.
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  const limits = COURSE_UPLOAD_LIMITS[params.kind]
  // `mimes` est un tuple de littéraux : sans élargissement, `includes` refuse
  // toute chaîne quelconque et ne compile pas.
  if (!(limits.mimes as readonly string[]).includes(params.mimeType)) throw new Error('MIME_NOT_ALLOWED')
  if (params.sizeBytes > limits.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')

  // Arbitrage 54 — le blocage ne porte que sur le chemin d'écriture. La taille
  // annoncée par le client suffit ici : la vérité est reprise à la
  // confirmation, sur l'objet réellement déposé.
  const { remainingBytes } = await trainerStorage(trainerId)
  if (params.sizeBytes > remainingBytes) throw new Error('STORAGE_QUOTA_EXCEEDED')

  const ext = params.mimeType.split('/')[1]
  const s3Key = `course-assets/${courseId}/${params.kind}-${crypto.randomUUID()}.${ext}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)

  return { uploadUrl, s3Key, expiresAt }
}

/**
 * Confirme un téléversement : c'est ici, et seulement ici, que la clé entre en
 * base. Sans cette étape le fichier existait sur R2 sans que rien ne le
 * référence — le formateur croyait avoir publié, l'acheteur recevait une URL
 * signée vers une clé devinée qui n'a jamais été écrite.
 *
 * La taille est relue sur l'objet (`headObject`), jamais reprise du client :
 * c'est elle qui alimente le quota, elle ne peut pas être déclarative.
 */
export async function confirmCourseUpload(
  courseId: string,
  trainerId: string,
  userId: string,
  params: { s3Key: string; kind: 'video' | 'pdf' | 'image'; mimeType: string },
) {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.trainerId !== trainerId) throw new Error('NOT_OWNER')
  if (!(await canTrainerWrite(trainerId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  // La clé doit être celle que nous avons émise pour CE cours : sinon un
  // formateur pourrait rattacher l'objet d'un autre.
  if (!params.s3Key.startsWith(`course-assets/${courseId}/`)) throw new Error('UPLOAD_NOT_FOUND')

  const limits = COURSE_UPLOAD_LIMITS[params.kind]
  if (!(limits.mimes as readonly string[]).includes(params.mimeType)) throw new Error('MIME_NOT_ALLOWED')

  // Même contrôle de contenu que les pièces justificatives du Lot 1 : un PDF
  // renommé en .mp4 est refusé. Sans identifiants R2, `headObject` renvoie null
  // et la validation est sautée — le mode dev ne dépose rien de réel.
  const head = await headObject(params.s3Key)
  if (head) {
    await validateMagicNumber(params.s3Key, params.mimeType)
    if (head.contentLength > limits.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')
  }
  const sizeBytes = head?.contentLength ?? 0

  const isCover = params.kind === 'image'
  const updated = await db.course.update({
    where: { id: courseId },
    data: isCover
      ? { coverS3Key: params.s3Key, coverSizeBytes: BigInt(sizeBytes) }
      : { contentS3Key: params.s3Key, contentSizeBytes: BigInt(sizeBytes), contentMimeType: params.mimeType },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: isCover ? 'COURSE_COVER_UPLOADED' : 'COURSE_CONTENT_UPLOADED',
    targetType: 'Course', targetId: courseId,
    meta: { s3Key: params.s3Key, sizeBytes, mimeType: params.mimeType },
  })

  return updated
}

// --- Helper : générer un slug unique ---

async function generateSlug(title: string, excludeId?: string): Promise<string> {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  let slug = base
  let counter = 1
  while (true) {
    const existing = await db.course.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!existing) break
    slug = `${base}-${counter++}`
  }
  return slug
}
