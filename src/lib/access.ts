// ==========================================================================
// Lot 4 — Accès au contenu acheté : lecture, téléchargement, CourseView
// ==========================================================================
// Respecte Purchase.accessSuspended (décision 18) et alimente CourseView
// dont dépend la règle de remboursement 30% du Lot 2.
// ==========================================================================

import { db } from './db'
import { presignDownload } from './s3'
import { auditStandalone } from './audit'

// --- Vérifier l'accès à un cours acheté ---

export async function checkCourseAccess(
  courseId: string,
  learnerId: string,
): Promise<{ granted: boolean; reason?: string; purchase?: any }> {
  const purchase = await db.purchase.findFirst({
    where: {
      learnerId,
      courseId,
      providerStatus: 'SUCCEEDED',
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, accessSuspended: true, accessSuspendedAt: true },
  })

  if (!purchase) return { granted: false, reason: 'NOT_PURCHASED' }
  if (purchase.accessSuspended) return { granted: false, reason: 'ACCESS_SUSPENDED', purchase }

  return { granted: true, purchase }
}

// --- Obtenir l'URL de lecture/streaming d'un cours acheté ---

export async function getCourseContentUrl(
  courseId: string,
  learnerId: string,
): Promise<{ url: string; course: any }> {
  const access = await checkCourseAccess(courseId, learnerId)
  if (!access.granted) {
    throw new Error(access.reason || 'ACCESS_DENIED')
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true, title: true, format: true, durationSeconds: true,
      coverS3Key: true, trainerId: true,
      // En production, le contenu du cours (vidéo, PDF) serait stocké sur R2
      // avec une clé comme course-content/{courseId}/main.mp4
      // Pour l'instant, on simule avec coverS3Key
    },
  })

  if (!course) throw new Error('COURSE_NOT_FOUND')

  // Générer une URL signée pour le contenu
  // En production : presignDownload(`course-content/${courseId}/main.${course.format === 'video' ? 'mp4' : 'pdf'}`)
  // En dev : URL factice
  const contentKey = `course-content/${courseId}/main.${course.format === 'video' ? 'mp4' : 'pdf'}`
  const url = await presignDownload(contentKey)

  return { url, course }
}

// --- Mettre à jour la progression de visionnage (streaming) ---

export async function updateWatchProgress(
  courseId: string,
  learnerId: string,
  watchedSeconds: number,
): Promise<void> {
  // Vérifier l'accès
  const access = await checkCourseAccess(courseId, learnerId)
  if (!access.granted) throw new Error(access.reason || 'ACCESS_DENIED')

  // Upsert CourseView
  await db.courseView.upsert({
    where: {
      courseId_learnerId: { courseId, learnerId },
    },
    update: {
      watchedSeconds: Math.max(watchedSeconds, (await db.courseView.findUnique({
        where: { courseId_learnerId: { courseId, learnerId } },
        select: { watchedSeconds: true },
      }))?.watchedSeconds || 0),
      lastViewedAt: new Date(),
    },
    create: {
      courseId,
      learnerId,
      watchedSeconds,
      lastViewedAt: new Date(),
    },
  })
}

// --- Marquer un cours comme téléchargé (formats téléchargeables) ---

export async function markCourseDownloaded(
  courseId: string,
  learnerId: string,
): Promise<void> {
  const access = await checkCourseAccess(courseId, learnerId)
  if (!access.granted) throw new Error(access.reason || 'ACCESS_DENIED')

  // Vérifier que le cours est un format téléchargeable
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { format: true },
  })
  if (!course) throw new Error('COURSE_NOT_FOUND')

  // Les formats téléchargeables sont : pdf, kit, notion, tableur
  // (pas video qui est streamé)
  const downloadableFormats = ['pdf', 'kit', 'notion', 'tableur']
  if (!downloadableFormats.includes(course.format)) {
    throw new Error('NOT_DOWNLOADABLE')
  }

  await db.courseView.upsert({
    where: {
      courseId_learnerId: { courseId, learnerId },
    },
    update: {
      downloaded: true,
      downloadedAt: new Date(),
      lastViewedAt: new Date(),
    },
    create: {
      courseId,
      learnerId,
      downloaded: true,
      downloadedAt: new Date(),
      lastViewedAt: new Date(),
    },
  })

  await auditStandalone({
    actorId: learnerId, actorRole: 'LEARNER',
    action: 'COURSE_DOWNLOADED', targetType: 'Course', targetId: courseId,
    meta: { format: course.format },
  })
}

// --- Lister les ressources achetées (avec CourseView) ---

export async function listMyResources(learnerId: string, filter?: 'all' | 'started' | 'unstarted', page = 1, pageSize = 20) {
  const where: any = {
    learnerId,
    providerStatus: 'SUCCEEDED',
  }

  const [purchases, total] = await Promise.all([
    db.purchase.findMany({
      where,
      include: {
        course: {
          select: {
            id: true, title: true, slug: true, format: true,
            coverS3Key: true, durationSeconds: true, category: true,
            trainerProfile: { select: { user: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.count({ where }),
  ])

  // Enrichir avec CourseView
  const enriched = await Promise.all(
    purchases.map(async (p) => {
      const view = await db.courseView.findUnique({
        where: { courseId_learnerId: { courseId: p.courseId!, learnerId } },
      })
      return {
        ...p,
        courseView: view,
        // Considéré comme "consulté" si watchedSeconds > 0 ou downloaded
        isStarted: (view?.watchedSeconds || 0) > 0 || view?.downloaded,
      };
    }),
  )

  // Filtrer
  let filtered = enriched
  if (filter === 'started') filtered = enriched.filter(p => p.isStarted)
  else if (filter === 'unstarted') filtered = enriched.filter(p => !p.isStarted)

  return { items: filtered, total, page, pageSize }
}

// --- Obtenir le % de consommation d'un cours (pour affichage) ---

export async function getConsumptionPercent(courseId: string, learnerId: string): Promise<number> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { format: true, durationSeconds: true, lessonsCount: true },
  })
  if (!course) return 0

  const view = await db.courseView.findUnique({
    where: { courseId_learnerId: { courseId, learnerId } },
  })
  if (!view) return 0

  if (view.downloaded) return 100

  if (course.format === 'video' && course.durationSeconds && course.durationSeconds > 0) {
    return Math.min(100, Math.round((view.watchedSeconds / course.durationSeconds) * 100))
  }

  return 0
}
