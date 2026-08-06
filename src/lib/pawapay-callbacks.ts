// ==========================================================================
// Lecture d'un callback PawaPay — la porte d'entrée du fournisseur
// ==========================================================================
// Un seul chemin pour les trois callbacks (dépôts, retraits, remboursements) :
// la vérification de signature ne doit pas être réécrite trois fois, parce
// qu'elle ne serait alors juste que deux fois sur trois.
//
// ⚠️ **Aucun repli.** Le webhook CinetPay que ceci remplace vérifiait son HMAC
// « quand `CINETPAY_SECRET_KEY` est configurée » — donc jamais, si elle ne
// l'était pas, et acceptait alors n'importe quel POST anonyme comme une
// confirmation de paiement. Ici, l'absence de configuration, de signature ou de
// concordance renvoie 401 et n'écrit rien.
// ==========================================================================

import { auditStandalone } from './audit'
import {
  callbackAuthority, isPawaPayConfigured, verifyCallbackSignature,
  type TransactionSnapshot,
} from './pawapay'

/**
 * Âge maximal d'une signature. Large à dessein : PawaPay sait rejouer un
 * callback à la demande, et un renvoi légitime porte sa propre date fraîche.
 * La borne n'est là que pour fermer la fenêtre de rejeu d'un enregistrement
 * réseau ancien.
 */
const MAX_SIGNATURE_AGE_MS = 15 * 60 * 1000

export type CallbackKind = 'DEPOSIT' | 'PAYOUT' | 'REFUND'

export type CallbackRead =
  | { ok: true; snapshot: TransactionSnapshot }
  | { ok: false; response: Response }

function reject(kind: CallbackKind, reason: string, status: number): CallbackRead {
  // Journalisé sans attendre : un flot de rejets est le premier signe d'une
  // rotation de clé côté fournisseur, ou d'une tentative d'injection.
  void auditStandalone({
    action: 'PAWAPAY_CALLBACK_REJECTED',
    meta: { kind, reason },
  })
  return { ok: false, response: new Response(reason, { status }) }
}

/**
 * Vérifie et décode un callback. L'appelant reçoit soit l'instantané de
 * transaction, soit la réponse HTTP à renvoyer telle quelle.
 */
export async function readSignedCallback(
  request: Request,
  kind: CallbackKind,
): Promise<CallbackRead> {
  const rawBody = await request.text()

  // Sans jeton API on ne peut pas récupérer les clés publiques, donc pas
  // vérifier. On refuse : un callback non vérifiable vaut un callback non
  // authentifié, et il crédite de l'argent.
  if (!isPawaPayConfigured()) {
    return reject(kind, 'PAWAPAY_NOT_CONFIGURED', 503)
  }

  const signatureDate = request.headers.get('signature-date')
  if (!signatureDate) return reject(kind, 'MISSING_SIGNATURE_DATE', 401)
  const signedAt = Date.parse(signatureDate)
  if (!Number.isFinite(signedAt)) return reject(kind, 'INVALID_SIGNATURE_DATE', 401)
  if (Math.abs(Date.now() - signedAt) > MAX_SIGNATURE_AGE_MS) {
    return reject(kind, 'SIGNATURE_EXPIRED', 401)
  }

  const url = new URL(request.url)
  const verified = await verifyCallbackSignature({
    method: request.method,
    authority: callbackAuthority(request),
    path: url.pathname,
    headers: request.headers,
    rawBody,
  })
  if (!verified) return reject(kind, 'INVALID_SIGNATURE', 401)

  let snapshot: TransactionSnapshot
  try {
    snapshot = JSON.parse(rawBody)
  } catch {
    return reject(kind, 'INVALID_JSON', 400)
  }
  if (!snapshot?.status) return reject(kind, 'MISSING_STATUS', 400)

  return { ok: true, snapshot }
}

/**
 * Acquittement. PawaPay rejoue tant qu'il ne reçoit pas un 2xx : on acquitte
 * donc aussi ce qu'on choisit d'ignorer (transaction inconnue, statut non
 * final), sans quoi le fournisseur boucle indéfiniment sur un événement qui ne
 * nous concerne pas.
 */
export function acknowledge(): Response {
  return new Response(null, { status: 200 })
}
