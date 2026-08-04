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
      contentS3Key: true, contentMimeType: true, contentSizeBytes: true,
    },
  })

  if (!course) throw new Error('COURSE_NOT_FOUND')

  // La clé est celle enregistrée à la confirmation du téléversement. Elle était
  // auparavant devinée — `course-content/{courseId}/main.mp4` — alors que le
  // formateur déposait sous `course-assets/…` : l'apprenant recevait une URL
  // signée vers un objet qui n'a jamais existé.
  //
  // Un cours publié ne peut plus être sans contenu (`publishCourse` le refuse),
  // mais un cours publié avant cette garde le peut : mieux vaut une erreur
  // explicite qu'un lecteur qui tourne dans le vide.
  if (!course.contentS3Key) throw new Error('CONTENT_UNAVAILABLE')

  const url = await presignDownload(course.contentS3Key)

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

export interface MyResourcesCounts { all: number; started: number; unstarted: number }

/**
 * « Commencé » se décide sur le CourseView, que la base ne sait pas filtrer en
 * même temps que la pagination des achats. On résout donc en deux temps : les
 * identifiants d'abord — une liste courte, un achat par ressource — puis la
 * page demandée seulement. Filtrer après avoir paginé, comme le faisait la
 * version précédente, donnait des compteurs calculés sur la page courante et
 * une pagination fausse dès qu'un apprenant dépassait `pageSize` achats.
 *
 * Les achats remboursés sortent de la liste (l'accès est retiré), et ceux qui
 * portent sur une communauté n'ont pas de `courseId` : les inclure faisait
 * chercher un CourseView sur un identifiant nul.
 */
export async function listMyResources(learnerId: string, filter?: 'all' | 'started' | 'unstarted', page = 1, pageSize = 20) {
  const where = {
    learnerId,
    providerStatus: 'SUCCEEDED' as const,
    refundedAt: null,
    courseId: { not: null },
  }

  const owned = await db.purchase.findMany({
    where,
    select: { id: true, courseId: true },
    orderBy: { createdAt: 'desc' },
  })

  const courseIds = owned.map((p) => p.courseId!).filter(Boolean)
  const views = await db.courseView.findMany({
    where: { learnerId, courseId: { in: courseIds } },
  })
  const viewByCourse = new Map(views.map((v) => [v.courseId, v]))

  const isStarted = (courseId: string) => {
    const view = viewByCourse.get(courseId)
    return (view?.watchedSeconds ?? 0) > 0 || Boolean(view?.downloaded)
  }

  const counts: MyResourcesCounts = {
    all: owned.length,
    started: owned.filter((p) => isStarted(p.courseId!)).length,
    unstarted: 0,
  }
  counts.unstarted = counts.all - counts.started

  const selected =
    filter === 'started' ? owned.filter((p) => isStarted(p.courseId!))
    : filter === 'unstarted' ? owned.filter((p) => !isStarted(p.courseId!))
    : owned

  const total = selected.length
  const pageIds = selected.slice((page - 1) * pageSize, page * pageSize).map((p) => p.id)

  const purchases = await db.purchase.findMany({
    where: { id: { in: pageIds } },
    include: {
      course: {
        select: {
          id: true, title: true, slug: true, format: true,
          coverS3Key: true, durationSeconds: true, category: true,
          trainerProfile: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
  })

  // `findMany` sur un `in` ne garantit pas l'ordre : on rétablit celui des ids.
  const byId = new Map(purchases.map((p) => [p.id, p]))
  const items = pageIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      ...p,
      courseView: viewByCourse.get(p.courseId!) ?? null,
      isStarted: isStarted(p.courseId!),
    }))

  return { items, total, counts, page, pageSize }
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
