import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { AgendaSession } from './types'

/**
 * Espace formateur : types et requêtes. Les routes sont celles du site
 * (`src/app/api/trainer/**`, `lives`), plus `trainer/overview` et
 * `trainer/sales` ajoutées pour l'app. Le serveur refuse tout appel d'un
 * compte qui n'est pas formateur (`requireTrainer`).
 */

export interface TrainerOverview {
  overview: {
    courseCount: number
    publishedCount: number
    draftCount: number
    archivedCount: number
    salesCount: number
    netRevenueFcfa: number
  }
  wallet: {
    balanceFcfa: number
    reservedFcfa: number
    pendingPayoutFcfa: number
    withdrawableFcfa: number
    negativeSince: string | null
  }
  subscription: {
    subscriptionStatus: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED' | string
    subscriptionCurrentPeriodEnd: string | null
    dueTotalFcfa: number
    suspensionAt: string | null
  } | null
  activeMembers: number
  disputesToContest: number
  unreadMessages: number
  salesByCourse: Array<{ courseId: string; salesCount: number; netRevenueFcfa: number }>
  payout: {
    minimumFcfa: number
    inProgress: boolean
    blockedBy: 'PAYOUT_METHOD_MISSING' | 'PAYOUT_METHOD_NOT_VERIFIED' | 'PAYOUT_METHOD_CARENCE' | null
  }
}

export interface Sale {
  id: string
  createdAt: string
  subject:
    | { kind: 'COURSE'; title: string; slug: string; format: string }
    | { kind: 'COMMUNITY'; title: string; slug: string }
    | { kind: 'GONE' }
  providerStatus: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | string
  amountFcfa: number
  trainerShareFcfa: number
  refundedAt: string | null
  refundAmountFcfa: number | null
  accessSuspended: boolean
  disputeActive: boolean
}

export interface SalesSummary {
  count: number
  grossFcfa: number
  commissionFcfa: number
  netFcfa: number
  refundedCount: number
  refundedFcfa: number
}

export interface Payout {
  id: string
  amountFcfa: number
  feeFcfa: number
  status: 'PENDING' | 'AUTO_APPROVED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID' | 'FAILED'
  submittedAt: string
  paidAt: string | null
  rejectionReason: string | null
  failureReason: string | null
}

export interface TrainerCourse {
  id: string
  slug: string
  title: string
  blurb: string
  category: string
  format: string
  status: 'draft' | 'published' | 'archived'
  circuit: 'MARKETPLACE' | 'COMMUNITY'
  coverS3Key: string | null
  contentS3Key: string | null
  durationSeconds: number | null
  pageCount: number | null
  createdAt: string
}

export interface TrainerCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  membersCount: number
  forumEnabled: boolean
  messagingEnabled: boolean
  resourcesEnabled: boolean
  eventsEnabled: boolean
}

export interface CommunityMember {
  learnerId: string
  fullName: string | null
  avatarUrl: string | null
  status: 'ACTIVE' | 'PAST_DUE' | 'BANNED' | 'CANCELED' | 'EXPIRED'
  periodEnd: string
  bannedAt: string | null
  canceledAt: string | null
  viaInvitation: boolean
  joinedAt: string
}

export interface TrainerDispute {
  id: string
  status: 'OPEN' | 'IN_REVIEW' | 'WAITING_LEARNER' | 'RESOLVED_REFUNDED' | 'RESOLVED_REJECTED' | 'RESOLVED_AUTO'
  reason: string
  disputedAmountFcfa: number
  openedAt: string
  resolvedAt: string | null
  purchase: { course: { title: string } | null; community: { name: string } | null }
  supportTickets: unknown[]
}

export const studioKeys = {
  overview: ['studio', 'overview'] as const,
  sales: ['studio', 'sales'] as const,
  payouts: ['studio', 'payouts'] as const,
  courses: ['studio', 'courses'] as const,
  community: ['studio', 'community'] as const,
  members: (communityId: string) => ['studio', 'members', communityId] as const,
  sessions: ['studio', 'sessions'] as const,
  disputes: ['studio', 'disputes'] as const,
}

export function useTrainerOverview() {
  return useQuery({ queryKey: studioKeys.overview, queryFn: ({ signal }) => api.get<TrainerOverview>('trainer/overview', signal) })
}

const SALES_PAGE = 20

export function useSales() {
  return useInfiniteQuery({
    queryKey: studioKeys.sales,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api.page<Sale[]>(`trainer/sales?page=${pageParam}&pageSize=${SALES_PAGE}`, signal),
    getNextPageParam: (last, pages) => {
      const total = Number(last.meta?.total ?? 0)
      const loaded = pages.reduce((n, p) => n + p.data.length, 0)
      return loaded < total ? pages.length + 1 : undefined
    },
  })
}

export function usePayouts() {
  return useQuery({ queryKey: studioKeys.payouts, queryFn: ({ signal }) => api.get<Payout[]>('trainer/payouts', signal) })
}

export function useRequestPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (amountFcfa: number) => api.post<Payout>('trainer/payouts', { amountFcfa }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioKeys.payouts })
      void queryClient.invalidateQueries({ queryKey: studioKeys.overview })
    },
  })
}

export function useTrainerCourses() {
  return useQuery({ queryKey: studioKeys.courses, queryFn: ({ signal }) => api.get<TrainerCourse[]>('trainer/courses', signal) })
}

/** Publier ou archiver : les deux actions que l'app propose sur une ressource. */
export function useCourseAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, action }: { courseId: string; action: 'publish' | 'archive' }) =>
      api.post<TrainerCourse>(`trainer/courses/${courseId}/${action}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioKeys.courses })
      void queryClient.invalidateQueries({ queryKey: studioKeys.overview })
    },
  })
}

export function useTrainerCommunity() {
  return useQuery({
    queryKey: studioKeys.community,
    queryFn: ({ signal }) => api.get<TrainerCommunity | null>('trainer/communities', signal),
  })
}

export function useCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: studioKeys.members(communityId ?? ''),
    enabled: !!communityId,
    queryFn: ({ signal }) => api.get<CommunityMember[]>(`trainer/communities/${communityId}/members`, signal),
  })
}

export function useTrainerSessions() {
  return useQuery({ queryKey: studioKeys.sessions, queryFn: ({ signal }) => api.get<AgendaSession[]>('lives?role=trainer', signal) })
}

export interface ScheduleInput {
  communityId: string
  title: string
  description?: string
  scheduledStartAt: string
  durationMinutes: number
  timeZone?: string
}

export function useScheduleLive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleInput) => api.post<AgendaSession>('lives', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioKeys.sessions })
      void queryClient.invalidateQueries({ queryKey: ['lives'] })
    },
  })
}

export function useCancelLive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => api.post(`lives/${sessionId}`, { action: 'cancel' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioKeys.sessions })
      void queryClient.invalidateQueries({ queryKey: ['lives'] })
    },
  })
}

export function useTrainerDisputes() {
  return useQuery({ queryKey: studioKeys.disputes, queryFn: ({ signal }) => api.get<TrainerDispute[]>('trainer/disputes', signal) })
}
