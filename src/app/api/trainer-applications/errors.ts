// Traduction des codes du service en réponses HTTP, partagée par les routes.
import { error } from '@/lib/api'
import { TrainerApplicationError } from '@/lib/trainer-applications'

const MAPPING: Record<string, { message: string; status: number }> = {
  USER_NOT_FOUND: { message: 'Compte introuvable', status: 404 },
  ALREADY_TRAINER: { message: 'Vous êtes déjà formateur sur NkamVa.', status: 409 },
  APPLICATION_ALREADY_EXISTS: { message: 'Une candidature est déjà en cours.', status: 409 },
  APPLICATION_NOT_FOUND: { message: 'Aucune candidature en cours.', status: 404 },
  APPLICATION_NOT_EDITABLE: {
    message: "Votre dossier est en cours d'examen : il n'est plus modifiable.",
    status: 422,
  },
  APPLICATION_NOT_SUBMITTABLE: { message: 'Ce dossier ne peut pas être soumis.', status: 422 },
  DOCUMENTS_INCOMPLETE: {
    message: 'Les trois pièces doivent être déposées avant de soumettre.',
    status: 422,
  },
  DOCUMENT_NOT_FOUND: { message: 'Pièce introuvable.', status: 404 },
  DOCUMENT_SUPERSEDED: { message: 'Cette pièce a été remplacée.', status: 409 },
  DOCUMENT_NOT_AWAITING_UPLOAD: { message: 'Cette pièce a déjà été confirmée.', status: 409 },
  DOCUMENT_NOT_REJECTED: { message: 'Seule une pièce refusée peut être remplacée.', status: 422 },
  DOCUMENT_NOT_REPLACEABLE: { message: "Cette pièce ne peut plus être remplacée.", status: 422 },
  MAX_RESUBMISSIONS_REACHED: {
    message: 'Le nombre de renvois autorisés pour cette pièce est atteint.',
    status: 422,
  },
  MIME_NOT_ALLOWED: { message: 'Format de fichier non accepté.', status: 400 },
  SIZE_EXCEEDS_LIMIT: { message: 'Fichier trop volumineux.', status: 400 },
  EMPTY_FILE: { message: 'Le fichier est vide.', status: 400 },
  UPLOAD_NOT_FOUND: { message: "Aucun fichier reçu. Relancez l'envoi.", status: 422 },
  CANNOT_READ_FILE: { message: 'Le fichier déposé est illisible.', status: 422 },
  MAGIC_NUMBER_MISMATCH: {
    message: "Le contenu du fichier ne correspond pas à son extension.",
    status: 422,
  },
  NOT_OWNER: { message: 'Non possédé', status: 403 },
  STORAGE_NOT_CONFIGURED: {
    message: "Le stockage des pièces n'est pas configuré sur cet environnement.",
    status: 503,
  },
}

export function applicationError(err: unknown) {
  if (err instanceof TrainerApplicationError) {
    const known = MAPPING[err.message]
    if (known) return error(err.message, known.message, known.status)
  }
  console.error('[trainer-applications]', err)
  return error('INTERNAL_ERROR', 'Erreur', 500)
}
