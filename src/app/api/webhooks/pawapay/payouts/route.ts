// Callback PawaPay — un retrait formateur a atteint son statut final.
//
// Avant PawaPay, `markPayoutPaid` était purement déclaratif : un administrateur
// faisait le virement à la main puis venait cocher. Le versement mobile money
// se confirme désormais ici, et l'acteur est le système — pas un humain qui
// affirme avoir agi.
//
// `Payout.id` sert d'identifiant PawaPay : c'est déjà un UUID, il rend
// l'idempotence gratuite et évite une colonne de correspondance de plus.
import { auditStandalone } from '@/lib/audit'
import { markPayoutFailed, markPayoutPaid } from '@/lib/payouts'
import { acknowledge, readSignedCallback } from '@/lib/pawapay-callbacks'

export async function POST(request: Request) {
  const read = await readSignedCallback(request, 'PAYOUT')
  if (!read.ok) return read.response

  const { snapshot } = read
  const payoutId = snapshot.payoutId
  if (!payoutId) {
    await auditStandalone({ action: 'PAWAPAY_CALLBACK_IGNORED', meta: { kind: 'PAYOUT', reason: 'missing_payout_id' } })
    return acknowledge()
  }

  try {
    switch (snapshot.status) {
      case 'COMPLETED':
        await markPayoutPaid(payoutId, {
          providerReference: snapshot.providerTransactionId ?? null,
          actorId: null,
          actorRole: 'SYSTEM',
        })
        break

      case 'FAILED':
        await markPayoutFailed(payoutId, {
          reason:
            snapshot.failureReason?.failureMessage ||
            snapshot.failureReason?.failureCode ||
            'Échec du versement chez le fournisseur',
          actorId: null,
          actorRole: 'SYSTEM',
        })
        break

      default:
        await auditStandalone({
          action: 'PAWAPAY_CALLBACK_IGNORED',
          meta: { kind: 'PAYOUT', payoutId, status: snapshot.status },
        })
    }
  } catch (err) {
    // Un retrait inconnu, ou déjà tranché par un administrateur, ne doit pas
    // faire boucler le fournisseur : on acquitte et on trace l'écart pour que
    // Finances puisse le rapprocher.
    await auditStandalone({
      action: 'PAWAPAY_CALLBACK_UNAPPLIED',
      targetType: 'Payout', targetId: payoutId,
      meta: { kind: 'PAYOUT', status: snapshot.status, error: err instanceof Error ? err.message : String(err) },
    })
  }

  return acknowledge()
}
