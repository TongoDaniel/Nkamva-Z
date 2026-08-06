// Callback PawaPay — un remboursement a atteint son statut final.
//
// `Dispute.id` sert d'identifiant de remboursement PawaPay : c'est un UUID, il
// rend l'opération idempotente et permet de retrouver le litige sans table de
// correspondance.
//
// Un remboursement en échec ne disparaît pas : il retombe sur la tâche manuelle
// Finances, qui existait déjà pour CinetPay. La différence est qu'elle devient
// l'exception au lieu d'être le cas nominal.
import { auditStandalone } from '@/lib/audit'
import { completeRefund, fallBackToManualRefund } from '@/lib/disputes'
import { acknowledge, readSignedCallback } from '@/lib/pawapay-callbacks'

export async function POST(request: Request) {
  const read = await readSignedCallback(request, 'REFUND')
  if (!read.ok) return read.response

  const { snapshot } = read
  const disputeId = snapshot.refundId
  if (!disputeId) {
    await auditStandalone({ action: 'PAWAPAY_CALLBACK_IGNORED', meta: { kind: 'REFUND', reason: 'missing_refund_id' } })
    return acknowledge()
  }

  try {
    switch (snapshot.status) {
      case 'COMPLETED':
        await completeRefund(disputeId, snapshot.providerTransactionId ?? null, null)
        break

      case 'FAILED':
        await fallBackToManualRefund(
          disputeId,
          snapshot.failureReason?.failureMessage ||
            snapshot.failureReason?.failureCode ||
            'PROVIDER_REFUND_FAILED',
        )
        break

      default:
        await auditStandalone({
          action: 'PAWAPAY_CALLBACK_IGNORED',
          meta: { kind: 'REFUND', disputeId, status: snapshot.status },
        })
    }
  } catch (err) {
    await auditStandalone({
      action: 'PAWAPAY_CALLBACK_UNAPPLIED',
      targetType: 'Dispute', targetId: disputeId,
      meta: { kind: 'REFUND', status: snapshot.status, error: err instanceof Error ? err.message : String(err) },
    })
  }

  return acknowledge()
}
