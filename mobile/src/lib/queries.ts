import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  AgendaSession, CommunityListItem, CommunitySpace, MyCommunity, ContentAccess, ConversationDetail, ConversationSummary,
  CourseDetail, CourseListItem, Message, NotificationItem, Profile, ResourceItem,
} from './types'

export const keys = {
  profile: ['profile'] as const,
  resources: ['resources'] as const,
  catalog: (search: string, format: string | null) => ['catalog', search, format] as const,
  course: (slug: string) => ['course', slug] as const,
  content: (courseId: string) => ['content', courseId] as const,
  communities: ['communities'] as const,
  myCommunities: ['my-communities'] as const,
  community: (slug: string) => ['community', slug] as const,
  lives: ['lives'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  notifications: ['notifications'] as const,
}

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: ({ signal }) => api.get<Profile>('me/profile', signal) })
}

/** Toute la bibliothèque : l'API plafonne à 50 par page, on suit les pages. */
export function useResources() {
  return useQuery({
    queryKey: keys.resources,
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

export function useCatalog(search: string, format: string | null) {
  return useInfiniteQuery({
    queryKey: keys.catalog(search, format),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: String(CATALOG_PAGE) })
      if (search) params.set('search', search)
      if (format) params.set('format', format)
      return api.page<CourseListItem[]>(`catalog/courses?${params}`, signal)
    },
    getNextPageParam: (last, pages) => {
      const total = Number(last.meta?.total ?? 0)
      const loaded = pages.reduce((n, p) => n + p.data.length, 0)
      return loaded < total ? pages.length + 1 : undefined
    },
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

export function useCommunities() {
  return useQuery({ queryKey: keys.communities, queryFn: ({ signal }) => api.get<CommunityListItem[]>('communities?pageSize=30', signal) })
}

export function useMyCommunities() {
  return useQuery({ queryKey: keys.myCommunities, queryFn: ({ signal }) => api.get<MyCommunity[]>('me/communities', signal) })
}

export function useCommunitySpace(slug: string) {
  return useQuery({ queryKey: keys.community(slug), queryFn: ({ signal }) => api.get<CommunitySpace>(`me/communities/${encodeURIComponent(slug)}`, signal) })
}

/** Ouvre le fil privé avec le formateur d'une communauté, ou retrouve celui qui existe. */
export function useOpenTrainerConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (communitySlug: string) => api.post<{ id: string }>('me/conversations', { communitySlug }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: keys.conversations }) },
  })
}

export function useLives() {
  return useQuery({ queryKey: keys.lives, queryFn: ({ signal }) => api.get<AgendaSession[]>('lives', signal) })
}

export function useConversations() {
  return useQuery({
    queryKey: keys.conversations,
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
