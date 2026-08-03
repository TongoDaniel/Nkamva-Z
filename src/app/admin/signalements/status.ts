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
  MESSAGE: "Message",
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
 * Seule une ressource peut être retirée du catalogue aujourd'hui. Les autres
 * cibles s'instruisent et se tracent, mais la sanction correspondante — la
 * suspension d'un compte — n'a ni route ni règle arbitrée.
 */
export const HIDEABLE_TARGETS = ["COURSE"];
