// Callback PawaPay — un encaissement a atteint son statut final.
//
// C'est la seule voie par laquelle un achat devient payé. Rien d'autre dans le
// code ne passe un `Purchase` en `SUCCEEDED` : ni l'initiation, ni un mode
// « dev », ni une réconciliation qui se contenterait de croire le client.
import { db } from '@/lib/db'
import { auditStandalone } from '@/lib/audit'
import { creditWalletOnPurchase } from '@/lib/wallet'
import { issueInvoiceQuietly } from '@/lib/invoices'
import { acknowledge, readSignedCallback } from '@/lib/pawapay-callbacks'

export async function POST(request: Request) {
  const read = await readSignedCallback(request, 'DEPOSIT')
  if (!read.ok) return read.response

  const { snapshot } = read
  const depositId = snapshot.depositId
  if (!depositId) {
    await auditStandalone({ action: 'PAWAPAY_CALLBACK_IGNORED', meta: { kind: 'DEPOSIT', reason: 'missing_deposit_id' } })
    return acknowledge()
  }

  switch (snapshot.status) {
    case 'COMPLETED': {
      const credit = await db.$transaction((tx) => creditWalletOnPurchase(tx, depositId, 'PAWAPAY'))
      // La facture s'émet après le commit, et son échec ne remonte pas au
      // fournisseur : un callback en erreur serait rejoué, et l'accès de
      // l'apprenant ne doit pas dépendre d'une pièce comptable.
      if (credit.credited && credit.purchaseId) await issueInvoiceQuietly(credit.purchaseId)
      break
    }

    case 'FAILED': {
      // Seul un achat encore en attente bascule : un achat déjà payé ne se
      // défait pas sur un callback tardif.
      const failed = await db.purchase.updateMany({
        where: { providerTransactionId: depositId, providerStatus: 'PENDING' },
        data: { providerStatus: 'FAILED' },
      })
      await auditStandalone({
        action: failed.count > 0 ? 'PURCHASE_FAILED' : 'PAWAPAY_CALLBACK_IGNORED',
        meta: {
          kind: 'DEPOSIT', depositId,
          failureCode: snapshot.failureReason?.failureCode ?? null,
          failureMessage: snapshot.failureReason?.failureMessage ?? null,
        },
      })
      break
    }

    default:
      // ACCEPTED / PROCESSING / IN_RECONCILIATION ne sont pas des états finaux.
      await auditStandalone({
        action: 'PAWAPAY_CALLBACK_IGNORED',
        meta: { kind: 'DEPOSIT', depositId, status: snapshot.status },
      })
  }

  return acknowledge()
}
