// Traduction des codes de revue en réponses HTTP.
import { error } from '@/lib/api'
import { TrainerApplicationError } from '@/lib/trainer-applications'

const MAPPING: Record<string, { message: string; status: number }> = {
  APPLICATION_NOT_FOUND: { message: 'Candidature introuvable.', status: 404 },
  APPLICATION_NOT_REVIEWABLE: {
    message: "Ce dossier n'est pas dans un état permettant cette décision.",
    status: 422,
  },
  APPLICATION_NOT_REJECTED: { message: "Ce dossier n'a pas été refusé.", status: 422 },
  // 409 : la ressource a bougé depuis l'affichage, le client doit se resynchroniser.
  STALE_APPLICATION: {
    message: 'Ce dossier a été modifié entre-temps. Rechargez la page avant de décider.',
    status: 409,
  },
  ALREADY_REOPENED: { message: 'Ce dossier a déjà été rouvert une fois.', status: 409 },
  ALREADY_TRAINER: { message: 'Ce compte dispose déjà d’un profil formateur.', status: 409 },
  REOPEN_TOO_EARLY: {
    message: 'La réouverture n’est possible que 24 h après le refus.',
    status: 422,
  },
  DOCUMENTS_PURGED: {
    message: 'Les pièces ont été effacées : le dossier ne peut plus être réexaminé.',
    status: 410,
  },
  DOCUMENT_NOT_FOUND: { message: 'Pièce introuvable dans ce dossier.', status: 404 },
  DOCUMENT_PURGED: { message: 'Cette pièce a été effacée.', status: 410 },
  NO_DOCUMENT_REJECTED: { message: 'Indiquez au moins une pièce à refuser.', status: 400 },
  REJECTION_REASON_REQUIRED: { message: 'Un motif est obligatoire.', status: 400 },
  LEGAL_NAME_REQUIRED: { message: 'Le nom légal vérifié est obligatoire.', status: 400 },
  MAX_RESUBMISSIONS_REACHED: {
    message: 'Cette pièce a atteint le nombre de renvois autorisés : tranchez définitivement.',
    status: 422,
  },
}

export function reviewError(err: unknown) {
  if (err instanceof TrainerApplicationError) {
    const known = MAPPING[err.message]
    if (known) return error(err.message, known.message, known.status)
  }
  console.error('[admin/trainer-applications]', err)
  return error('INTERNAL_ERROR', 'Erreur', 500)
}
