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
import { failActivationPayment, settleActivationPayment } from '@/lib/trainer-activation'
import { failSubscriptionPayment, settleSubscriptionPayment } from '@/lib/subscription-payment'

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
      // Deux sujets peuvent s'encaisser ici depuis que le premier abonnement
      // d'un formateur se règle en mobile money : un achat, ou l'ouverture d'un
      // espace formateur. L'identifiant de dépôt ne dit pas lequel — chaque
      // chemin ne reconnaît que ses propres lignes et laisse passer les autres.
      const activation = await settleActivationPayment(depositId, 'PAWAPAY')
      if (activation.settled) break

      // Troisième sujet depuis l'arbitrage 11 : le règlement d'une échéance
      // d'abonnement par un formateur déjà installé.
      const subscription = await settleSubscriptionPayment(depositId, 'PAWAPAY')
      if (subscription.settled) break

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
      // Le motif est porté par l'achat, et plus seulement par le journal : sans
      // lui, l'écran de confirmation ne peut dire que « l'opérateur a refusé »,
      // là où l'apprenant a besoin de savoir s'il doit recharger son compte ou
      // approuver la demande sur son téléphone.
      const failureCode = snapshot.failureReason?.failureCode ?? 'UNSPECIFIED_FAILURE'

      // Même partage qu'au succès : le refus peut porter sur une activation.
      // Sans ce chemin, la tentative resterait PENDING pour toujours et le
      // garde-fou « une seule tentative en cours » interdirait au candidat de
      // réessayer — un échec d'opérateur lui fermerait la porte définitivement.
      if (await failActivationPayment(depositId, failureCode)) {
        await auditStandalone({
          action: 'TRAINER_ACTIVATION_FAILED',
          meta: {
            kind: 'DEPOSIT', depositId, failureCode,
            failureMessage: snapshot.failureReason?.failureMessage ?? null,
          },
        })
        break
      }

      // Même raison pour l'échéance d'abonnement : sans ce chemin, la tentative
      // resterait PENDING et le garde-fou « une seule tentative en cours »
      // interdirait au formateur de réessayer. Un refus d'opérateur le
      // laisserait en impayé jusqu'à la suspension, sans recours.
      if (await failSubscriptionPayment(depositId, failureCode)) break

      const failed = await db.purchase.updateMany({
        where: { providerTransactionId: depositId, providerStatus: 'PENDING' },
        data: { providerStatus: 'FAILED', failureCode },
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
