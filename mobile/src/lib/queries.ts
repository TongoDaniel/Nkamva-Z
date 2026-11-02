import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useAuth } from './auth'
import type {
  AgendaSession, CatalogFacets, CatalogFilters, CommunityListItem, CommunitySpace, MyCommunity, ContentAccess, ConversationDetail, ConversationSummary,
  CourseDetail, CourseListItem, Message, NotificationItem, Profile, PublicCommunity, PublicTrainer, PublicTrainerDetail, ResourceItem,
} from './types'

/**
 * Les requêtes de l'espace personnel (`me/*`, agenda, messages) ne partent que
 * pour un compte connecté. Un visiteur parcourt le catalogue et les
 * communautés sans compte : leurs écrans ne doivent pas appeler une route qui
 * lui répondrait 401.
 */
function useSignedIn(): boolean {
  return useAuth().status === 'signedIn'
}

export const keys = {
  profile: ['profile'] as const,
  resources: ['resources'] as const,
  catalog: (filters: CatalogFilters) => ['catalog', filters] as const,
  facets: ['facets'] as const,
  trainers: (search: string) => ['trainers', search] as const,
  trainer: (id: string) => ['trainer', id] as const,
  course: (slug: string) => ['course', slug] as const,
  content: (courseId: string) => ['content', courseId] as const,
  communities: (search: string) => ['communities', search] as const,
  myCommunities: ['my-communities'] as const,
  favorites: ['favorites'] as const,
  community: (slug: string) => ['community', slug] as const,
  publicCommunity: (slug: string) => ['public-community', slug] as const,
  lives: ['lives'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  notifications: ['notifications'] as const,
}

export function useProfile(enabled = true) {
  const signedIn = useSignedIn()
  return useQuery({ queryKey: keys.profile, enabled: enabled && signedIn, queryFn: ({ signal }) => api.get<Profile>('me/profile', signal) })
}

/** Toute la bibliothèque : l'API plafonne à 50 par page, on suit les pages. */
export function useResources() {
  return useQuery({
    queryKey: keys.resources,
    enabled: useSignedIn(),
    queryFn: async ({ signal }) => {
      const all: ResourceItem[] = []
      for (let page = 1; page < 20; page++) {
        const res = await api.page<ResourceItem[]>(`me/resources?page=${page}&pageSize=50`, signal)
        all.push(...res.data)
        const total = Number(res.meta?.total ?? all.length)
        if (all.length >= total || res.data.length === 0) break
      }
      return all
    },
  })
}

const CATALOG_PAGE = 20

export const NO_FILTERS: CatalogFilters = { search: '', category: null, format: null, level: null, sort: 'newest' }

/** Combien de filtres sont posés, hors recherche et hors tri par défaut. */
export function activeFilterCount(f: CatalogFilters): number {
  return [f.category, f.format, f.level].filter(Boolean).length + (f.sort !== 'newest' ? 1 : 0)
}

function catalogParams(f: CatalogFilters, page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: f.sort })
  if (f.search) params.set('search', f.search)
  if (f.category) params.set('category', f.category)
  if (f.format) params.set('format', f.format)
  if (f.level) params.set('level', f.level)
  return params
}

/**
 * Le catalogue filtré, page par page. Changer un filtre garde la liste
 * précédente à l'écran le temps que la nouvelle arrive (pas de squelette qui
 * clignote à chaque choix), et chaque combinaison déjà vue revient du cache
 * sans attendre.
 */
export function useCatalog(filters: CatalogFilters = NO_FILTERS, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.catalog(filters),
    enabled,
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ pageParam, signal }) => api.page<CourseListItem[]>(`catalog/courses?${catalogParams(filters, pageParam, CATALOG_PAGE)}`, signal),
    getNextPageParam: (last, pages) => {
      const total = Number(last.meta?.total ?? 0)
      const loaded = pages.reduce((n, p) => n + p.data.length, 0)
      return loaded < total ? pages.length + 1 : undefined
    },
  })
}

/** Thèmes, formats et niveaux proposables, avec leurs effectifs. Change peu. */
export function useCatalogFacets() {
  return useQuery({
    queryKey: keys.facets,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => api.get<CatalogFacets>('catalog/facets', signal),
  })
}

export function useCourse(slug: string) {
  return useQuery({ queryKey: keys.course(slug), queryFn: ({ signal }) => api.get<CourseDetail>(`courses/${encodeURIComponent(slug)}`, signal) })
}

/** L'URL signée expire en cinq minutes : on ne la garde jamais en cache. */
export function useContent(courseId: string) {
  return useQuery({
    queryKey: keys.content(courseId),
    queryFn: ({ signal }) => api.get<ContentAccess>(`me/resources/${courseId}/content`, signal),
    staleTime: 0,
    gcTime: 0,
  })
}

/** L'annuaire des communautés, affiné à la frappe, page par page. */
export function useCommunities(search = '') {
  return useInfiniteQuery({
    queryKey: keys.communities(search),
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam) })
      if (search) params.set('search', search)
      return api.page<CommunityListItem[]>(`communities?${params}`, signal)
    },
    getNextPageParam: (last, pages) => {
      const total = Number(last.meta?.total ?? 0)
      const loaded = pages.reduce((n, p) => n + p.data.length, 0)
      return loaded < total && last.data.length > 0 ? pages.length + 1 : undefined
    },
  })
}

/** L'annuaire public des formateurs. */
export function useTrainers(search = '') {
  return useQuery({
    queryKey: keys.trainers(search),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => api.get<PublicTrainer[]>(`trainers${search ? `?search=${encodeURIComponent(search)}` : ''}`, signal),
  })
}

export function useTrainer(id: string) {
  return useQuery({ queryKey: keys.trainer(id), queryFn: ({ signal }) => api.get<PublicTrainerDetail>(`trainers/${encodeURIComponent(id)}`, signal) })
}

export function useMyCommunities() {
  return useQuery({ queryKey: keys.myCommunities, enabled: useSignedIn(), queryFn: ({ signal }) => api.get<MyCommunity[]>('me/communities', signal) })
}

export function useCommunitySpace(slug: string, enabled = true) {
  const signedIn = useSignedIn()
  return useQuery({ queryKey: keys.community(slug), enabled: enabled && signedIn, queryFn: ({ signal }) => api.get<CommunitySpace>(`me/communities/${encodeURIComponent(slug)}`, signal) })
}

/** Fiche publique d'une communauté : lisible sans compte, comme sur le site. */
export function usePublicCommunity(slug: string, enabled = true) {
  return useQuery({
    queryKey: keys.publicCommunity(slug),
    enabled,
    queryFn: ({ signal }) => api.get<PublicCommunity>(`communities/${encodeURIComponent(slug)}`, signal),
  })
}

/** Ouvre le fil privé avec le formateur d'une communauté, ou retrouve celui qui existe. */
export function useOpenTrainerConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communitySlug: string) => api.post<{ id: string }>('me/conversations', { communitySlug }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: keys.conversations }) },
  })
}

interface Favorites { courses: CourseListItem[]; communities: unknown[] }

export function useFavorites() {
  return useQuery({ queryKey: keys.favorites, enabled: useSignedIn(), queryFn: ({ signal }) => api.get<Favorites>('me/favorites', signal) })
}

/**
 * Ajoute ou retire une ressource des favoris. Le cœur change tout de suite, et
 * revient en arrière si le serveur refuse.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (course: CourseListItem) => api.post<{ favorited: boolean }>('me/favorites', { courseId: course.id }),
    onMutate: async (course) => {
      await queryClient.cancelQueries({ queryKey: keys.favorites })
      const previous = queryClient.getQueryData<Favorites>(keys.favorites)
      if (previous) {
        const has = previous.courses.some((c) => c.id === course.id)
        queryClient.setQueryData<Favorites>(keys.favorites, {
          ...previous,
          courses: has ? previous.courses.filter((c) => c.id !== course.id) : [course, ...previous.courses],
        })
      }
      return { previous }
    },
    onError: (_err, _course, context) => {
      if (context?.previous) queryClient.setQueryData(keys.favorites, context.previous)
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: keys.favorites }) },
  })
}

export function useLives() {
  return useQuery({ queryKey: keys.lives, enabled: useSignedIn(), queryFn: ({ signal }) => api.get<AgendaSession[]>('lives', signal) })
}

export function useConversations() {
  return useQuery({
    queryKey: keys.conversations,
    enabled: useSignedIn(),
    queryFn: ({ signal }) => api.get<ConversationSummary[]>('me/conversations', signal),
    refetchInterval: 30_000,
  })
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: keys.conversation(id),
    queryFn: ({ signal }) => api.get<ConversationDetail>(`me/conversations/${id}`, signal),
    refetchInterval: 10_000,
  })
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      api.post<Message>(`me/conversations/${conversationId}`, {
        body,
        clientKey: `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversation(conversationId) })
      void queryClient.invalidateQueries({ queryKey: keys.conversations })
    },
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    enabled: useSignedIn(),
    queryFn: ({ signal }) => api.page<NotificationItem[]>('me/notifications', signal),
    refetchInterval: 60_000,
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('me/notifications/read', {}),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: keys.notifications }) },
  })
}

export function useSaveProgress(courseId: string) {
  return useMutation({
    mutationFn: (body: { watchedSeconds?: number; lastPage?: number; completed?: boolean }) =>
      api.post(`me/resources/${courseId}/progress`, body),
  })
}
