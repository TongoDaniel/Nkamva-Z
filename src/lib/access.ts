// ==========================================================================
// Lot 4 — Accès au contenu acheté : lecture, téléchargement, CourseView
// ==========================================================================
// Respecte Purchase.accessSuspended (décision 18) et alimente CourseView
// dont dépend la règle de remboursement 30% du Lot 2.
// ==========================================================================

import { db } from './db'
import { hasCommunityAccess, OPEN_STATUSES } from './communities'
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

  // Arbitrage 45 — une ressource incluse s'obtient par l'adhésion, sans achat.
  if (!purchase) {
    const included = await hasCommunityAccess(learnerId, courseId)
    return included ? { granted: true } : { granted: false, reason: 'NOT_PURCHASED' }
  }
  if (purchase.accessSuspended) return { granted: false, reason: 'ACCESS_SUSPENDED', purchase }

  // Arbitrage 63 — l'exclusion retire l'accès aux ressources déjà payées. La
  // restriction ne le fait pas : elle écarte la parole, pas la lecture.
  const learner = await db.user.findUnique({
    where: { id: learnerId },
    select: { sanctionLevel: true },
  })
  if (learner?.sanctionLevel === 'BANNED') return { granted: false, reason: 'ACCOUNT_BANNED', purchase }

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

// --- Enregistrer la position de lecture (F3.1) ---

/**
 * Ce que l'écran de lecture rapporte. Un seul champ à la fois, selon le format
 * : la position d'une vidéo est **une seconde**, celle d'un document **une
 * page**, et une archive n'en a pas — elle porte un marqueur que l'apprenant
 * pose lui-même.
 */
export interface ReadingPosition {
  /** Vidéo. Le point atteint ; seul le plus lointain est conservé. */
  watchedSeconds?: number
  /** Document. La page affichée ; la dernière écrite fait foi. */
  lastPage?: number
  /** Archive. `true` marque la ressource terminée, `false` la rouvre. */
  completed?: boolean
}

/**
 * Enregistre la position atteinte. Une seule donnée, plusieurs lectures : c'est
 * elle que l'écran rend à l'apprenant *et* que l'agent du support lit dans le
 * résumé de consommation d'un litige — il n'en existe pas deux (F3.6).
 *
 * **Les bornes viennent du serveur.** Le client annonce une seconde ou une
 * page ; le serveur les ramène dans ce que le fichier permet, en s'appuyant sur
 * les mesures faites au dépôt. Sans cela, il suffisait d'annoncer une durée
 * absurde pour peser sur le seuil des 30 % — et un nombre venu du navigateur
 * décidait d'un remboursement.
 *
 * **La vidéo garde son maximum, le document sa dernière page.** L'asymétrie est
 * délibérée : `watchedSeconds` arbitre automatiquement un remboursement, un
 * recul ne doit donc pas rouvrir un droit que la lecture a consommé ; `lastPage`
 * ne sert qu'à reprendre et à renseigner, et reprendre à la page la plus
 * lointaine ferait perdre sa page à qui revient en arrière.
 */
export async function updateReadingPosition(
  courseId: string,
  learnerId: string,
  position: ReadingPosition,
): Promise<void> {
  const access = await checkCourseAccess(courseId, learnerId)
  if (!access.granted) throw new Error(access.reason || 'ACCESS_DENIED')

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { format: true, durationSeconds: true, pageCount: true },
  })
  if (!course) throw new Error('COURSE_NOT_FOUND')

  const existing = await db.courseView.findUnique({
    where: { courseId_learnerId: { courseId, learnerId } },
    select: { watchedSeconds: true },
  })

  const data: {
    watchedSeconds?: number
    lastPage?: number
    completedAt?: Date | null
    lastViewedAt: Date
  } = { lastViewedAt: new Date() }

  if (position.watchedSeconds !== undefined) {
    const borne = course.durationSeconds && course.durationSeconds > 0
      ? Math.min(position.watchedSeconds, course.durationSeconds)
      : position.watchedSeconds
    data.watchedSeconds = Math.max(0, Math.floor(borne), existing?.watchedSeconds ?? 0)
  }

  if (position.lastPage !== undefined) {
    const borne = course.pageCount && course.pageCount > 0
      ? Math.min(position.lastPage, course.pageCount)
      : position.lastPage
    data.lastPage = Math.max(1, Math.floor(borne))
  }

  if (position.completed !== undefined) {
    data.completedAt = position.completed ? new Date() : null
  }

  await db.courseView.upsert({
    where: { courseId_learnerId: { courseId, learnerId } },
    update: data,
    create: {
      courseId,
      learnerId,
      watchedSeconds: data.watchedSeconds ?? 0,
      lastPage: data.lastPage ?? null,
      completedAt: data.completedAt ?? null,
      lastViewedAt: data.lastViewedAt,
    },
  })
}

/**
 * Ancienne porte d'entrée, conservée pour les appelants qui ne connaissent que
 * les secondes. Elle délègue : il n'y a qu'un seul chemin d'écriture.
 */
export async function updateWatchProgress(
  courseId: string,
  learnerId: string,
  watchedSeconds: number,
): Promise<void> {
  await updateReadingPosition(courseId, learnerId, { watchedSeconds })
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

  const achats = await db.purchase.findMany({
    where,
    select: { id: true, courseId: true, createdAt: true, accessSuspended: true },
    orderBy: { createdAt: 'desc' },
  })

  // Les ressources **incluses** entrent dans la même liste (F3.11). Elles n'y
  // étaient pas : on ne les retrouvait que par « Mes communautés », deux écrans
  // plus loin, et l'apprenant qui cherchait « la ressource que j'ai » ne la
  // voyait pas là où il la cherchait. C'est le constat 4 de l'audit.
  const incluses = await listMyIncludedEntries(learnerId)

  /** Une entrée de la liste, quelle que soit la façon dont on y a droit. */
  type Entree = {
    /** Clé de rendu : l'achat, ou la liaison qui donne le droit. */
    id: string
    courseId: string
    createdAt: Date
    accessSuspended: boolean
    origin: 'purchase' | 'community'
    community: { slug: string; name: string } | null
  }

  const owned: Entree[] = [
    ...achats.map((p) => ({
      id: p.id,
      courseId: p.courseId!,
      createdAt: p.createdAt,
      accessSuspended: p.accessSuspended,
      origin: 'purchase' as const,
      community: null,
    })),
    ...incluses.map((i) => ({
      id: `inclusion:${i.courseId}`,
      courseId: i.courseId,
      createdAt: i.since,
      // Une ressource incluse ne s'achète pas : aucun litige ne peut en
      // suspendre l'accès.
      accessSuspended: false,
      origin: 'community' as const,
      community: i.community,
    })),
  ]
    // Un achat prime sur une inclusion pour la même ressource : c'est le cas
    // limite de l'arbitrage 45, où un membre a acheté avant que la ressource
    // ne devienne incluse.
    .filter((e, i, all) => all.findIndex((a) => a.courseId === e.courseId) === i)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const courseIds = owned.map((p) => p.courseId).filter(Boolean)
  const views = await db.courseView.findMany({
    where: { learnerId, courseId: { in: courseIds } },
  })
  const viewByCourse = new Map(views.map((v) => [v.courseId, v]))

  // « Commencé » couvre les trois positions possibles (F3.1) : une seconde de
  // vidéo, une page de document, une archive téléchargée ou déclarée terminée.
  // Sans la page, un apprenant qui a lu la moitié d'un PDF en ligne restait
  // rangé dans « pas commencé ».
  const isStarted = (courseId: string) => {
    const view = viewByCourse.get(courseId)
    return (view?.watchedSeconds ?? 0) > 0
      || (view?.lastPage ?? 0) > 0
      || Boolean(view?.downloaded)
      || Boolean(view?.completedAt)
  }

  const counts: MyResourcesCounts = {
    all: owned.length,
    started: owned.filter((p) => isStarted(p.courseId)).length,
    unstarted: 0,
  }
  counts.unstarted = counts.all - counts.started

  const selected =
    filter === 'started' ? owned.filter((p) => isStarted(p.courseId))
    : filter === 'unstarted' ? owned.filter((p) => !isStarted(p.courseId))
    : owned

  const total = selected.length
  const pageEntries = selected.slice((page - 1) * pageSize, page * pageSize)

  const courses = await db.course.findMany({
    where: { id: { in: pageEntries.map((e) => e.courseId) } },
    select: {
      id: true, title: true, slug: true, format: true,
      coverS3Key: true, durationSeconds: true, pageCount: true, category: true,
      trainerProfile: { select: { user: { select: { fullName: true } } } },
    },
  })
  // `findMany` sur un `in` ne garantit pas l'ordre : on rétablit celui des
  // entrées, qui porte le tri par date.
  const courseById = new Map(courses.map((c) => [c.id, c]))

  const items = pageEntries
    .map((e) => {
      const course = courseById.get(e.courseId)
      if (!course) return null
      return {
        id: e.id,
        courseId: e.courseId,
        createdAt: e.createdAt,
        accessSuspended: e.accessSuspended,
        origin: e.origin,
        community: e.community,
        course,
        courseView: viewByCourse.get(e.courseId) ?? null,
        isStarted: isStarted(e.courseId),
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))

  return { items, total, counts, page, pageSize }
}

/**
 * Les ressources auxquelles une adhésion donne droit, avec la communauté qui
 * les porte et la date depuis laquelle le droit existe.
 *
 * Même règle de chevauchement que `hasCommunityAccess` : une adhésion et une
 * liaison qui se sont croisées suffisent, même si l'une ou l'autre est finie
 * depuis (arbitrages 34 et 48). D'où la lecture des liaisons **déliées** :
 * ce qui a été donné reste donné.
 */
async function listMyIncludedEntries(learnerId: string): Promise<
  Array<{ courseId: string; since: Date; community: { slug: string; name: string } }>
> {
  const subs = await db.communitySubscription.findMany({
    where: { learnerId },
    select: { communityId: true, periodStart: true, periodEnd: true, status: true },
  })
  if (subs.length === 0) return []

  const links = await db.communityCourse.findMany({
    where: { communityId: { in: subs.map((s) => s.communityId) } },
    select: {
      courseId: true, communityId: true, linkedAt: true, unlinkedAt: true,
      community: { select: { slug: true, name: true } },
    },
    orderBy: { linkedAt: 'desc' },
  })

  const now = new Date()
  const vues = new Set<string>()
  const out: Array<{ courseId: string; since: Date; community: { slug: string; name: string } }> = []

  for (const link of links) {
    if (vues.has(link.courseId)) continue
    const droit = subs.some((sub) => {
      if (sub.communityId !== link.communityId) return false
      const subEnd = OPEN_STATUSES.includes(sub.status as never) ? now : sub.periodEnd
      const linkEnd = link.unlinkedAt ?? now
      return sub.periodStart <= linkEnd && link.linkedAt <= subEnd
    })
    if (!droit) continue
    vues.add(link.courseId)
    out.push({ courseId: link.courseId, since: link.linkedAt, community: link.community })
  }

  return out
}

// --- Obtenir le % de consommation d'un cours (pour affichage) ---

export async function getConsumptionPercent(courseId: string, learnerId: string): Promise<number> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { format: true, durationSeconds: true },
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
