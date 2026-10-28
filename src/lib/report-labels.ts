// ==========================================================================
// Libellés des signalements — une seule source
// ==========================================================================
// Lus par les écrans de Modération et par l'avis envoyé à l'arrivée d'un
// signalement. L'avis interpolait les codes bruts (« USER, motif SPAM ») :
// les libellés n'existaient que côté écran. Module sans dépendance, importable
// des deux côtés.
// ==========================================================================

export const REPORT_TARGET_LABELS: Record<string, string> = {
  COURSE: "Ressource",
  USER: "Compte",
  COMMUNITY: "Communauté",
  COMMUNITY_POST: "Billet de communauté",
  COMMUNITY_POST_REPLY: "Réponse de communauté",
  MESSAGE: "Message privé",
  LIVE_MESSAGE: "Message de salon live",
  DISPUTE_MESSAGE: "Message de litige",
};

export const REPORT_REASON_LABELS: Record<string, string> = {
  ILLEGAL: "Contenu illégal",
  MISLEADING: "Contenu trompeur",
  HARASSMENT: "Harcèlement",
  SPAM: "Spam",
  INTELLECTUAL_PROPERTY: "Propriété intellectuelle",
  OTHER: "Autre",
};
