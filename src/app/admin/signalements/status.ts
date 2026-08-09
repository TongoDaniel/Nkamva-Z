// ==========================================================================
// Libellés des signalements — côté Modération
// ==========================================================================

import type { StPillProps } from "@/components/nk/status-pill";

type Tone = NonNullable<StPillProps["tone"]>;

export const REPORT_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  OPEN: {
    label: "À instruire",
    tone: "warn",
    help: "Examinez la cible, puis retenez ou rejetez le signalement.",
  },
  UPHELD: {
    label: "Retenu",
    tone: "bad",
    help: "Le signalement était fondé.",
  },
  DISMISSED: {
    label: "Rejeté",
    tone: "muted",
    help: "Le signalement n'a pas été retenu.",
  },
};

export const TARGET_LABELS: Record<string, string> = {
  COURSE: "Ressource",
  USER: "Compte",
  COMMUNITY: "Communauté",
  COMMUNITY_POST: "Billet de communauté",
  COMMUNITY_POST_REPLY: "Réponse de communauté",
  MESSAGE: "Message privé",
  LIVE_MESSAGE: "Message de salon live",
  DISPUTE_MESSAGE: "Message de litige",
};

export const REASON_LABELS: Record<string, string> = {
  ILLEGAL: "Contenu illégal",
  MISLEADING: "Contenu trompeur",
  HARASSMENT: "Harcèlement",
  SPAM: "Spam",
  INTELLECTUAL_PROPERTY: "Propriété intellectuelle",
  OTHER: "Autre",
};

/**
 * Ce que la clôture sait retirer, et en quels termes le dire à celui qui
 * instruit : le geste diffère selon la cible, et une case à cocher qui
 * annoncerait « retirer du catalogue » sous un message mentirait.
 *
 * La liste fait autorité côté serveur (`HIDEABLE_TARGET_TYPES` dans
 * `lib/reports`) ; ici on ne porte que les mots.
 */
export const REMOVAL_LABELS: Record<string, { action: string; effect: string }> = {
  COURSE: {
    action: "Retirer du catalogue",
    effect:
      "La ressource n'apparaît plus au catalogue. Les personnes qui l'ont achetée gardent leur accès : l'achat est définitif, et un retrait ne rembourse personne.",
  },
  COMMUNITY_POST: {
    action: "Retirer ce billet du fil",
    effect:
      "Le billet laisse sa place et son auteur, jamais son texte. Ses réponses restent lisibles.",
  },
  COMMUNITY_POST_REPLY: {
    action: "Retirer cette réponse du fil",
    effect: "La réponse laisse sa place et son auteur, jamais son texte.",
  },
  MESSAGE: {
    action: "Retirer ce message du fil privé",
    effect:
      "Les deux correspondants voient un message retiré à sa place. Le reste du fil est intact.",
  },
  LIVE_MESSAGE: {
    action: "Retirer ce message du salon",
    effect:
      "Le salon reste attaché au replay : sans ce retrait, le propos resterait lisible bien après la séance.",
  },
};

export const HIDEABLE_TARGETS = Object.keys(REMOVAL_LABELS);
