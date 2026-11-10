// ==========================================================================
// Plafond mensuel de dépassement des lives : modèle économique v1.1
// ==========================================================================
// Règles du lancement, de décembre à février, tant que les lives tournent sur
// LiveKit Cloud :
//
//   · un plafond mensuel de dépassement pour toute la plateforme, fixé par les
//     fondateurs (`lives.monthly_overrun_cap_fcfa`) ;
//   · à 80 %, alerte ; à 100 %, les nouveaux lives passent en audio jusqu'à la
//     fin du mois ;
//   · un live en cours n'est jamais coupé (principe 5).
//
// Le coût se déduit des h-participants : une personne présente pendant une
// heure de live. LiveKit Ship en inclut 2 500 par mois ; au-delà, ~18 FCFA par
// h-participant plus ~72 FCFA par Go, soit ~34 FCFA par h-participant en 360p
// (224,5 Mo/h). Ces valeurs viennent du modèle et se remplacent ici quand le
// live test aura mesuré la vraie consommation.
// ==========================================================================

import { db } from './db'
import { getSettingNumber } from './settings'
import { notifyAdminSubRole, deliverSideEffects } from './notification'
import { auditStandalone } from './audit'

/** Inclus dans LiveKit Ship, par mois. */
export const LIVEKIT_INCLUDED_PARTICIPANT_HOURS = 2_500
/** Coût d'une h-participant au-delà de l'inclus, en 360p (modèle v1.1). */
export const OVERRUN_FCFA_PER_PARTICIPANT_HOUR = 34
export const ALERT_RATIO = 0.8

/** Règles du lancement : 3 lives par semaine et par communauté, 2 h au plus. */
export const LAUNCH_MAX_LIVES_PER_WEEK = 3
export const LAUNCH_MAX_LIVE_MINUTES = 120

export type LiveBudgetState = 'NO_CAP' | 'OK' | 'ALERT' | 'AUDIO_ONLY'

export interface LiveBudget {
  monthStart: Date
  participantHours: number
  overrunHours: number
  overrunFcfa: number
  capFcfa: number
  ratio: number | null
  state: LiveBudgetState
}

export function monthStartUtc(at = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1))
}

/** Pur : l'état du plafond pour une consommation donnée. */
export function budgetState(participantHours: number, capFcfa: number) {
  const overrunHours = Math.max(0, participantHours - LIVEKIT_INCLUDED_PARTICIPANT_HOURS)
  const overrunFcfa = Math.round(overrunHours * OVERRUN_FCFA_PER_PARTICIPANT_HOUR)
  // Un plafond à 0 veut dire « pas encore fixé » : rien n'est restreint, mais
  // l'écran le dit.
  if (capFcfa <= 0) return { overrunHours, overrunFcfa, ratio: null, state: 'NO_CAP' as const }
  const ratio = overrunFcfa / capFcfa
  const state: LiveBudgetState = ratio >= 1 ? 'AUDIO_ONLY' : ratio >= ALERT_RATIO ? 'ALERT' : 'OK'
  return { overrunHours, overrunFcfa, ratio, state }
}

/**
 * Les h-participants du mois, toutes communautés confondues. Une présence
 * encore ouverte compte jusqu'à maintenant ; une présence commencée le mois
 * précédent ne compte que pour sa part du mois.
 */
export async function monthParticipantHours(at = new Date()): Promise<number> {
  const start = monthStartUtc(at)
  const rows = await db.liveParticipant.findMany({
    where: { OR: [{ leftAt: null }, { leftAt: { gte: start } }], joinedAt: { lte: at } },
    select: { joinedAt: true, leftAt: true, session: { select: { endedAt: true } } },
  })
  let ms = 0
  for (const r of rows) {
    const from = Math.max(r.joinedAt.getTime(), start.getTime())
    const end = r.leftAt ?? r.session.endedAt ?? at
    const to = Math.min(end.getTime(), at.getTime())
    if (to > from) ms += to - from
  }
  return ms / 3_600_000
}

export async function getLiveBudget(at = new Date()): Promise<LiveBudget> {
  const [participantHours, capFcfa] = await Promise.all([
    monthParticipantHours(at),
    getSettingNumber('lives.monthly_overrun_cap_fcfa'),
  ])
  return { monthStart: monthStartUtc(at), participantHours, capFcfa, ...budgetState(participantHours, capFcfa) }
}

/** Un nouveau live doit-il partir en audio ? Jamais pour un live déjà lancé. */
export async function newLivesAudioOnly(at = new Date()): Promise<boolean> {
  return (await getLiveBudget(at)).state === 'AUDIO_ONLY'
}

/**
 * Job horaire : prévient Finances et les Propriétaires à 80 % et à 100 %, une
 * fois par mois et par seuil (le journal d'audit sert de mémoire).
 */
export async function alertLiveBudget(at = new Date()): Promise<{ state: LiveBudgetState }> {
  const budget = await getLiveBudget(at)
  if (budget.state !== 'ALERT' && budget.state !== 'AUDIO_ONLY') return { state: budget.state }

  const action = budget.state === 'ALERT' ? 'LIVE_BUDGET_ALERT_80' : 'LIVE_BUDGET_AUDIO_ONLY'
  const already = await db.auditLog.findFirst({
    where: { action, createdAt: { gte: budget.monthStart } },
    select: { id: true },
  })
  if (already) return { state: budget.state }

  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM', action, targetType: 'Platform', targetId: 'lives',
    meta: { overrunFcfa: budget.overrunFcfa, capFcfa: budget.capFcfa, participantHours: Math.round(budget.participantHours) },
  })
  const body = budget.state === 'ALERT'
    ? `Le dépassement des lives atteint ${Math.round((budget.ratio ?? 0) * 100)} % du plafond du mois (${budget.overrunFcfa} FCFA sur ${budget.capFcfa}).`
    : `Le plafond du mois est atteint (${budget.overrunFcfa} FCFA). Les nouveaux lives partent en audio jusqu'à la fin du mois ; les lives en cours continuent.`
  for (const role of ['FINANCES', 'SUPER_ADMIN'] as const) {
    await deliverSideEffects(action, { type: 'Platform', id: 'lives' }, () =>
      notifyAdminSubRole(role, { type: action, title: 'Plafond des lives', body, link: '/admin/parametres' }),
    )
  }
  return { state: budget.state }
}

/** Début de la semaine (lundi 00:00 UTC) qui contient une date. */
export function weekStartUtc(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d
}

/**
 * Règles du lancement à la programmation : 2 h au plus, 3 lives par semaine et
 * par communauté (séances annulées non comptées).
 */
export async function assertLaunchLiveRules(communityId: string, scheduledStartAt: Date, durationMinutes: number) {
  if (durationMinutes > LAUNCH_MAX_LIVE_MINUTES) throw new Error('LIVE_TOO_LONG')
  const from = weekStartUtc(scheduledStartAt)
  const to = new Date(from.getTime() + 7 * 86_400_000)
  const count = await db.liveSession.count({
    where: {
      communityId,
      status: { not: 'CANCELED' },
      scheduledStartAt: { gte: from, lt: to },
    },
  })
  if (count >= LAUNCH_MAX_LIVES_PER_WEEK) throw new Error('LIVE_WEEKLY_LIMIT')
}
