// ==========================================================================
// Job : clôture automatique des litiges sans réponse de l'apprenant (T8)
// ==========================================================================
// Quand le support pose une question, l'apprenant a sept jours pour répondre.
// Passé ce délai, le dossier ne peut pas rester ouvert indéfiniment : il gèle
// l'argent du formateur et prive l'apprenant de sa ressource.
//
// La clôture rétablit l'état antérieur — fonds rendus, accès restitué — plutôt
// que de trancher au fond. Faute de réponse, aucune décision n'a été prise :
// on ne peut ni rembourser sans instruction, ni écarter une demande qui n'a
// peut-être jamais été lue.
// ==========================================================================

import { db } from '../db'
import { audit } from '../audit'
import { notify } from '../notification'
import { sendEmail } from '../email'
import { releaseReservations } from '../dispute-review'

export interface AutoCloseResult {
  eligible: number
  closed: number
  failed: number
}

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://nkamva.com'
  return `${base}${path}`
}

/**
 * Clôt un dossier échu. Idempotent : le garde porte à la fois sur le statut et
 * sur l'échéance, donc deux exécutions concurrentes n'en traitent qu'une, et un
 * apprenant qui répond entre la sélection et la transaction voit sa réponse
 * respectée — répondre remet le dossier en examen et efface l'échéance.
 */
async function closeDispute(disputeId: string, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.dispute.updateMany({
      where: {
        id: disputeId,
        status: 'WAITING_LEARNER',
        learnerDeadlineAt: { not: null, lt: now },
      },
      data: {
        status: 'RESOLVED_AUTO',
        resolution: 'AUTO_TIMEOUT',
        refundStatus: 'NOT_APPLICABLE',
        // Personne n'a tranché : le dossier se referme sans décideur.
        resolvedById: null,
        resolvedAt: now,
        learnerDeadlineAt: null,
        lastActivityAt: now,
      },
    })
    if (count === 0) return false

    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      select: { purchaseId: true, learnerId: true },
    })
    if (!dispute) return false

    await releaseReservations(tx, disputeId, null, 'DISPUTE_AUTO_CLOSED')

    // L'accès revient : rien ne justifie de le priver plus longtemps.
    await tx.purchase.update({
      where: { id: dispute.purchaseId },
      data: { accessSuspended: false, accessRestoredAt: now },
    })

    await tx.disputeMessage.create({
      data: {
        disputeId,
        authorRole: 'SYSTEM',
        body: "Faute de réponse dans le délai imparti, ce dossier a été clos automatiquement. Votre accès à la ressource est rétabli. Vous pouvez contacter le support si la situation persiste.",
        readBySupport: true,
        readByLearner: false,
      },
    })
    await tx.disputeReviewEvent.create({
      data: {
        disputeId,
        fromStatus: 'WAITING_LEARNER',
        toStatus: 'RESOLVED_AUTO',
        actorRole: 'SYSTEM',
      },
    })
    await audit(tx, {
      actorRole: 'SYSTEM',
      action: 'DISPUTE_AUTO_CLOSED',
      targetType: 'Dispute',
      targetId: disputeId,
      meta: { purchaseId: dispute.purchaseId },
    })

    return true
  })
}

export async function autoCloseDisputes(now: Date = new Date()): Promise<AutoCloseResult> {
  const candidates = await db.dispute.findMany({
    where: { status: 'WAITING_LEARNER', learnerDeadlineAt: { not: null, lt: now } },
    select: { id: true, learnerId: true },
    orderBy: { learnerDeadlineAt: 'asc' },
    take: 500,
  })

  let closed = 0
  let failed = 0
  for (const candidate of candidates) {
    try {
      if (!(await closeDispute(candidate.id, now))) continue
      closed++

      await notify(candidate.learnerId, {
        type: 'DISPUTE_AUTO_CLOSED',
        title: 'Votre contestation a été close',
        body: "Faute de réponse dans le délai, le dossier est clos et votre accès rétabli.",
        link: `/mes-litiges/${candidate.id}`,
      })

      const learner = await db.user.findUnique({
        where: { id: candidate.learnerId },
        select: { email: true },
      })
      if (learner?.email) {
        await sendEmail({
          to: learner.email,
          subject: 'Votre contestation a été close — NkamVa',
          html: `<p>Faute de réponse de votre part dans le délai imparti, votre contestation a été close.</p><p>Votre accès à la ressource est rétabli. Si le problème persiste, écrivez au support depuis le dossier :<br><a href="${appUrl(`/mes-litiges/${candidate.id}`)}">${appUrl(`/mes-litiges/${candidate.id}`)}</a></p>`,
          text: `Faute de réponse dans le délai imparti, votre contestation a été close.\n\nVotre accès à la ressource est rétabli.\n\n${appUrl(`/mes-litiges/${candidate.id}`)}`,
          tags: ['dispute'],
        })
      }
    } catch (err) {
      failed++
      console.error('[JOB:auto-close-disputes] échec', {
        disputeId: candidate.id,
        error: String(err),
      })
    }
  }

  return { eligible: candidates.length, closed, failed }
}
