// ==========================================================================
// Libellés côté instructeur — file des moyens de paiement
// ==========================================================================
// Distincts de ceux de l'espace formateur (`portefeuille/payout-status.ts`) :
// là-bas un statut dit au formateur où en est son dossier, ici il dit à
// l'instructeur ce qu'il lui reste à faire. Les mêmes mots ne conviennent pas
// aux deux.
// ==========================================================================

import type { StPillProps } from "@/components/nk/status-pill";

type Tone = NonNullable<StPillProps["tone"]>;

export interface AdminStatusMeta {
  label: string;
  tone: Tone;
  help: string;
}

export const METHOD_STATUS: Record<string, AdminStatusMeta> = {
  PENDING_REVIEW: {
    label: "À instruire",
    tone: "warn",
    help: "Comparez le titulaire au nom légal vérifié, puis tranchez.",
  },
  AUTO_VERIFIED: {
    label: "Auto-vérifié",
    tone: "info",
    help: "L'opérateur a confirmé le nom du compte. La carence court encore.",
  },
  MANUAL_VERIFIED: {
    label: "Vérifié manuellement",
    tone: "info",
    help: "Vérifié par Finances. La carence court encore.",
  },
  VERIFIED: {
    label: "Vérifié",
    tone: "ok",
    help: "Carence écoulée : le formateur peut demander un retrait.",
  },
  REJECTED: {
    label: "Refusé",
    tone: "bad",
    help: "Le formateur peut en enregistrer un autre.",
  },
  BLOCKED: {
    label: "Escalade",
    tone: "bad",
    help: "Trois refus : seul un Super-admin peut trancher (décision 27).",
  },
  ARCHIVED: {
    label: "Archivé",
    tone: "muted",
    help: "Remplacé par un moyen plus récent. Conservé pour l'audit.",
  },
};

export const OPERATOR_LABELS: Record<string, string> = {
  WAVE: "Wave",
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  AIRTEL_MONEY: "Airtel Money",
  M_PESA: "M-Pesa",
};

export const NATURE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Compte personnel",
  BUSINESS: "Compte d'entreprise",
};

export const VERIFICATION_METHOD_LABELS: Record<string, string> = {
  NAME_LOOKUP: "Contrôle opérateur",
  MANUAL_FINANCE: "Revue manuelle Finances",
  MICRO_DEPOSIT: "Micro-virements",
  ESCALATION: "Décision d'escalade",
};

export const DOCUMENT_LABELS: Record<string, string> = {
  BUSINESS_DOC: "Document d'immatriculation (RCCM)",
  LEGAL_REP_PROOF: "Preuve de représentation légale",
};

/**
 * Âge d'un dossier en heures — sert à repérer les dépassements du SLA de
 * revue (réglage `payouts.review_sla_hours`) sans afficher une date que
 * l'instructeur devrait convertir de tête.
 */
export function hoursSince(date: Date | string): number {
  return (Date.now() - new Date(date).getTime()) / 3_600_000;
}

export function formatAge(hours: number): string {
  if (hours < 1) return "moins d'une heure";
  if (hours < 48) return `${Math.floor(hours)} h`;
  return `${Math.floor(hours / 24)} jours`;
}
