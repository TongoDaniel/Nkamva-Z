// Traduction des codes d'arbitrage en réponses HTTP.
import { error } from '@/lib/api'
import { DisputeError } from '@/lib/disputes'

const MAPPING: Record<string, { message: string; status: number }> = {
  DISPUTE_NOT_FOUND: { message: 'Dossier introuvable.', status: 404 },
  DISPUTE_CLOSED: { message: 'Ce dossier est clos.', status: 409 },
  DISPUTE_NOT_ACTIONABLE: { message: "Ce dossier n'est pas dans un état permettant cette action.", status: 422 },
  DISPUTE_NOT_REFUNDED: { message: "Ce dossier n'attend pas de remboursement.", status: 422 },
  // 409 : le dossier a bougé depuis l'affichage, le client doit se resynchroniser.
  STALE_DISPUTE: {
    message: 'Ce dossier a été modifié entre-temps. Rechargez la page avant de décider.',
    status: 409,
  },
  MESSAGE_EMPTY: { message: 'Message vide.', status: 400 },
  MESSAGE_TOO_LONG: { message: 'Message trop long.', status: 400 },
  QUESTION_TOO_SHORT: { message: 'Formulez une question exploitable par l’apprenant.', status: 400 },
  RESOLUTION_NOTE_REQUIRED: { message: 'Un motif de décision est obligatoire.', status: 400 },
  PARTIAL_AMOUNT_INVALID: {
    message: 'Le montant partiel doit être strictement compris entre 0 et le montant contesté.',
    status: 400,
  },
  POLICY_OVERRIDE_FORBIDDEN: {
    message: 'Ce dossier est hors barème : seul un super-administrateur peut le rembourser.',
    status: 403,
  },
  OVERRIDE_JUSTIFICATION_REQUIRED: {
    message: 'Un remboursement hors barème doit être justifié.',
    status: 400,
  },
  PROVIDER_DISPUTE_ACTIVE: {
    message: "Un chargeback est en cours chez l'opérateur : rembourser ici débiterait deux fois le formateur.",
    status: 409,
  },
  ALREADY_REFUNDED: { message: 'Cet achat a déjà été remboursé.', status: 409 },
  TASK_NOT_FOUND: { message: 'Tâche introuvable.', status: 404 },
  TASK_NOT_PENDING: { message: 'Cette tâche a déjà été traitée.', status: 409 },
  TICKET_NOT_OPEN: { message: 'Cette contestation a déjà reçu une réponse.', status: 409 },
  ERROR_MESSAGE_REQUIRED: { message: 'Indiquez la raison de l’échec.', status: 400 },
}

export function reviewError(err: unknown) {
  if (err instanceof DisputeError) {
    const known = MAPPING[err.message]
    if (known) return error(err.message, known.message, known.status)
  }
  console.error('[admin/disputes]', err)
  return error('INTERNAL_ERROR', 'Erreur', 500)
}
