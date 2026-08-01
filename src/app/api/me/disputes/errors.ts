// Traduction des codes de litige en réponses HTTP.
import { error } from '@/lib/api'
import { DisputeError } from '@/lib/disputes'

const MAPPING: Record<string, { message: string; status: number }> = {
  PURCHASE_NOT_FOUND: { message: 'Achat introuvable.', status: 404 },
  PURCHASE_NOT_ELIGIBLE: {
    message: "Cet achat ne peut pas faire l'objet d'une contestation.",
    status: 422,
  },
  ALREADY_REFUNDED: { message: 'Cet achat a déjà été remboursé.', status: 409 },
  DISPUTE_ALREADY_OPEN: { message: 'Une contestation est déjà en cours sur cet achat.', status: 409 },
  DISPUTE_NOT_FOUND: { message: 'Contestation introuvable.', status: 404 },
  DISPUTE_CLOSED: { message: 'Cette contestation est close.', status: 409 },
  MESSAGE_EMPTY: { message: 'Votre message est vide.', status: 400 },
  MESSAGE_TOO_LONG: { message: 'Message trop long.', status: 400 },
  TRAINER_WALLET_MISSING: {
    message: "Le dossier ne peut pas être ouvert pour l'instant. Contactez le support.",
    status: 422,
  },
  // Motifs de non-éligibilité : 422, la demande est comprise mais irrecevable.
  WINDOW_EXPIRED: {
    message: 'Le délai de 14 jours pour contester cet achat est dépassé.',
    status: 422,
  },
  RESOURCE_DOWNLOADED: {
    message: 'Cette ressource a été téléchargée : elle ne peut plus être remboursée.',
    status: 422,
  },
  CONSUMPTION_EXCEEDED: {
    message: 'Vous avez consulté plus de 30 % de cette ressource.',
    status: 422,
  },
}

export function disputeError(err: unknown) {
  if (err instanceof DisputeError) {
    const known = MAPPING[err.message]
    if (known) return error(err.message, known.message, known.status)
  }
  console.error('[disputes]', err)
  return error('INTERNAL_ERROR', 'Erreur', 500)
}
