// ==========================================================================
// Lot 4 — Gestion des cours côté formateur : CRUD, upload R2, publication
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { presignUpload } from './s3'
import type { PrismaTransaction } from './types'

export const COURSE_UPLOAD_LIMITS = {
  video: { mimes: ['video/mp4'], maxSize: 2_147_483_648 },
  pdf: { mimes: ['application/pdf'], maxSize: 10_485_760 },
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxSize: 5_242_880 },
} as const

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

  const limits = COURSE_UPLOAD_LIMITS[params.kind]
  // `mimes` est un tuple de littéraux : sans élargissement, `includes` refuse
  // toute chaîne quelconque et ne compile pas.
  if (!(limits.mimes as readonly string[]).includes(params.mimeType)) throw new Error('MIME_NOT_ALLOWED')
  if (params.sizeBytes > limits.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')

  const ext = params.mimeType.split('/')[1]
  const s3Key = `course-assets/${courseId}/${params.kind}-${crypto.randomUUID()}.${ext}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)

  return { uploadUrl, s3Key, expiresAt }
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
