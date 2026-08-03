// ==========================================================================
// Job : rappel avant l'effacement d'un compte
// ==========================================================================
// Prévient l'utilisateur pendant qu'il peut encore revenir sur sa décision.
// L'idempotence ne s'appuie pas sur une colonne dédiée mais sur le journal
// d'audit : une action distincte par échéance, recherchée depuis la date de
// la demande. Une demande annulée puis reformulée redonne donc droit aux
// rappels, sans migration ni champ à resynchroniser.
// ==========================================================================

import { db } from '../db'
import { auditStandalone } from '../audit'
import { sendEmail, renderSimpleEmail } from '../email'
import { fmtDate } from '../format'
import { DELETION_GRACE_DAYS } from '../dto'

const DAY = 86_400_000

/** Jours restants avant effacement auxquels un rappel part, du plus lointain au plus proche. */
export const REMINDER_MILESTONES = [7, 1] as const

export type ReminderMilestone = (typeof REMINDER_MILESTONES)[number]

export function reminderAction(daysLeft: ReminderMilestone): string {
  return `ACCOUNT_DELETION_REMINDER_${daysLeft}D`
}

export interface ReminderResult {
  eligible: number
  sent: number
  failed: number
}

function cancelUrl(): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://nkamva.com'
  return `${base}/profil?onglet=donnees`
}

function reminderCopy(daysLeft: ReminderMilestone, scheduledAt: Date) {
  const when = daysLeft === 1 ? 'demain' : `dans ${daysLeft} jours`
  return {
    subject:
      daysLeft === 1
        ? 'Votre compte NkamVa sera supprimé demain'
        : `Votre compte NkamVa sera supprimé dans ${daysLeft} jours`,
    ...renderSimpleEmail({
      title: `Votre compte sera supprimé ${when}`,
      paragraphs: [
        'Bonjour,',
        `Vous avez demandé la suppression de votre compte NkamVa. L'effacement aura lieu ${when}, le ${fmtDate(scheduledAt)}.`,
        'Passé cette date, vos ressources achetées ne seront plus accessibles et l\'opération sera irréversible.',
      ],
      cta: { label: 'Annuler la suppression', url: cancelUrl() },
      footnote: 'Si cette demande vient bien de vous et que vous la maintenez, aucune action n\'est nécessaire.',
    }),
  }
}

/**
 * Échéance à traiter pour ce compte : la plus proche parmi celles atteintes.
 * Si le job n'a pas tourné pendant plusieurs jours, l'utilisateur reçoit un
 * seul message — le plus pertinent — plutôt que la file des rappels manqués.
 */
export function dueMilestone(daysLeft: number): ReminderMilestone | null {
  if (daysLeft <= 0) return null // l'effacement est dû : le job de purge prend la main
  const due = REMINDER_MILESTONES.filter((m) => daysLeft <= m)
  return due.length ? (Math.min(...due) as ReminderMilestone) : null
}

export async function remindPendingDeletions(now: Date = new Date()): Promise<ReminderResult> {
  const widest = Math.max(...REMINDER_MILESTONES)
  // Borne la lecture : personne ne peut être concerné avant cette date.
  const notBefore = new Date(now.getTime() - (DELETION_GRACE_DAYS - widest) * DAY)

  const candidates = await db.user.findMany({
    where: {
      deletedAt: null,
      deletionRequestedAt: { not: null, lte: notBefore },
    },
    select: { id: true, email: true, deletionRequestedAt: true },
    orderBy: { deletionRequestedAt: 'asc' },
    take: 500,
  })

  let sent = 0
  let failed = 0
  let eligible = 0

  for (const user of candidates) {
    const requestedAt = user.deletionRequestedAt!
    const scheduledAt = new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY)
    const milestone = dueMilestone((scheduledAt.getTime() - now.getTime()) / DAY)
    if (!milestone) continue

    const action = reminderAction(milestone)
    // Déjà envoyé pour cette demande ? Le garde porte sur la date de demande,
    // pour qu'une nouvelle demande après annulation redonne droit au rappel.
    const already = await db.auditLog.count({
      where: { action, targetType: 'User', targetId: user.id, createdAt: { gte: requestedAt } },
    })
    if (already > 0) continue

    eligible++
    const copy = reminderCopy(milestone, scheduledAt)
    try {
      await sendEmail({ to: user.email, subject: copy.subject, html: copy.html, text: copy.text, tags: ['account-deletion'] })
      // Journalisé après l'envoi : en cas d'échec, le rappel sera retenté au
      // prochain passage plutôt que perdu silencieusement.
      await auditStandalone({
        actorRole: 'SYSTEM',
        action,
        targetType: 'User',
        targetId: user.id,
        meta: { daysLeft: milestone, scheduledAt: scheduledAt.toISOString() },
      })
      sent++
    } catch (err) {
      failed++
      console.error('[JOB:remind-pending-deletions] envoi échoué', { userId: user.id, error: String(err) })
    }
  }

  return { eligible, sent, failed }
}
