/**
 * Formes de données de l'API NKAMVA, relevées sur les réponses réelles du
 * serveur. Miroir partiel de `src/lib/dto.ts` côté site : seuls les champs que
 * l'app lit y figurent.
 */

export type Role = 'LEARNER' | 'PENDING_TRAINER' | 'TRAINER' | 'ADMIN'

export interface SessionUser {
  id: string
  email: string
  role: Role
  trainerId: string | null
}

export interface Profile {
  id: string
  email: string
  emailVerifiedAt: string | null
  fullName: string | null
  preferredName: string | null
  phone: string | null
  countryCode: string | null
  bio: string | null
  avatarUrl: string | null
  role: Role
  isTrainer: boolean
  relationalEmails: boolean
  subscriptionNoticeEmails: boolean
  createdAt: string
  /** Suppression demandée : le compte s'efface à cette date, sauf annulation. */
  deletionScheduledAt: string | null
}

export interface TrainerSummary {
  id: string
  user: { id?: string; fullName: string | null; bio?: string | null }
  ratingAverage: number
  ratingCount: number
  slogan?: string | null
  description?: string | null
}

export type CourseFormat = 'video' | 'pdf' | 'kit' | 'notion' | 'tableur'

export interface CourseListItem {
  id: string
  slug: string
  title: string
  blurb: string
  category: string
  format: CourseFormat | string
  priceFcfa: number
  level: string | null
  durationSeconds: number | null
  publishedAt: string | null
  coverS3Key: string | null
  trainerProfile: TrainerSummary
}

export interface CourseDetail extends CourseListItem {
  description: string
  learnPoints: string[]
  includes: string[]
  language: string
  pageCount: number | null
  circuit: 'MARKETPLACE' | 'COMMUNITY'
}

export interface CourseViewState {
  watchedSeconds: number
  lastPage: number | null
  completedAt: string | null
  downloaded: boolean
  lastViewedAt: string | null
}

export interface ResourceItem {
  id: string
  courseId: string | null
  createdAt: string
  accessSuspended: boolean
  origin?: 'purchase' | 'community'
  community?: { slug: string; name: string } | null
  course: {
    id: string
    title: string
    slug: string
    format: CourseFormat | string
    coverS3Key: string | null
    durationSeconds: number | null
    pageCount: number | null
    category: string
    trainerProfile: { user: { fullName: string | null } }
  } | null
  courseView: CourseViewState | null
  isStarted: boolean
}

export interface ContentAccess {
  url: string
  course: { id: string; title: string; format: string; durationSeconds: number | null; contentMimeType?: string | null }
}

export interface CommunityListItem {
  id: string
  slug: string
  name: string
  priceFcfa: number
  membersCount: number
  visibility: 'PUBLIC' | 'PRIVATE'
  trainerName: string
  trainerAvatarUrl: string | null
}

export interface AgendaSession {
  mine: boolean
  id: string
  title: string
  description: string | null
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELED'
  startsAt: string
  timeZone: string | null
  durationMinutes: number
  community: { id: string; name: string; slug: string }
  host: { name: string; role: string | null; avatarUrl: string | null }
  attendees: number
  live: boolean
}

export interface ConversationSummary {
  id: string
  kind: 'GROUP' | 'DIRECT'
  communityId: string
  communitySlug: string
  communityName: string
  title: string
  peer: { name: string } | null
  avatarUrl: string | null
  lastMessage: { body: string; createdAt: string; mine: boolean; deleted: boolean; authorName: string | null } | null
  unreadCount: number
  canWrite: boolean
  readOnlyReason: string | null
  pinned: boolean
}

export interface Message {
  id: string
  body: string
  createdAt: string
  mine: boolean
  /** Fil direct : lu par l'autre. Toujours nul dans un groupe. */
  readAt: string | null
  deleted: boolean
  announcement: boolean
  authorName: string | null
}

export interface ConversationDetail extends ConversationSummary {
  messages: Message[]
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface MyCommunity {
  subscriptionId: string
  status: 'ACTIVE' | 'PAST_DUE' | 'BANNED' | 'CANCELED' | 'EXPIRED'
  periodEnd: string
  canceledAt: string | null
  community: {
    id: string
    slug: string
    name: string
    membersCount: number
    visibility: 'PUBLIC' | 'PRIVATE'
    trainerName: string | null
  }
}

/** GET /api/me/communities/[slug] : l'espace d'une communauté dont on est membre. */
export interface CommunitySpace {
  communityId: string
  slug: string
  name: string
  description: string | null
  forumEnabled: boolean
  resourcesEnabled: boolean
  eventsEnabled: boolean
  messagingEnabled: boolean
  trainerName: string | null
  isTrainer: boolean
  canSpeak: boolean
  courses: CourseListItem[]
  sessions: AgendaSession[]
  replaysCount: number
  membership: { status: string; periodEnd: string; canceledAt: string | null; dueAmountFcfa: number | null } | null
  groupConversationId: string | null
}

/** Fiche publique d'une communauté (`GET /api/communities/[slug]`). */
export interface PublicCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  rules: string | null
  membersCount: number
  visibility: 'PUBLIC' | 'PRIVATE'
  acceptsMembers: boolean
  forumEnabled: boolean
  eventsEnabled: boolean
  resourcesEnabled: boolean
  trainer: { fullName: string | null; slogan: string | null }
  courses: Array<{ id: string; slug: string; title: string; format: string; category: string; coverS3Key: string | null }>
}

export interface CatalogFacet {
  value: string
  count: number
}

/** Les choix des filtres du catalogue, avec le nombre de ressources derrière chacun. */
export interface CatalogFacets {
  categories: CatalogFacet[]
  formats: CatalogFacet[]
  levels: CatalogFacet[]
}

export type CatalogSort = 'newest' | 'popular'

export interface CatalogFilters {
  search: string
  category: string | null
  format: string | null
  level: string | null
  sort: CatalogSort
}

/** Un formateur de l'annuaire public (`GET /api/trainers`). */
export interface PublicTrainer {
  id: string
  fullName: string | null
  avatarUrl: string | null
  slogan: string | null
  description: string | null
  domains: string[]
  experienceYears: number | null
  ratingAverage: number
  ratingCount: number
  learners: number
  publishedCount: number
  communityCount: number
}

export interface PublicTrainerDetail extends PublicTrainer {
  websiteUrl: string | null
  courses: Array<Pick<CourseListItem, 'id' | 'slug' | 'title' | 'blurb' | 'category' | 'format' | 'level' | 'durationSeconds' | 'coverS3Key' | 'publishedAt'>>
  community: { slug: string; name: string; description: string | null; membersCount: number } | null
}
