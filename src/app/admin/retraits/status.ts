// ==========================================================================
// Libellés côté instructeur — file des retraits
// ==========================================================================
// Chaque statut dit à Finances ce qu'il lui reste à faire, et surtout où en est
// l'argent : le formateur n'est réellement débité qu'au versement (P6), pas à
// la demande. Un statut qui laisse croire l'inverse fait mal compter.
// ==========================================================================

import type { StPillProps } from "@/components/nk/status-pill";

type Tone = NonNullable<StPillProps["tone"]>;

export interface PayoutStatusMeta {
  label: string;
  tone: Tone;
  help: string;
}

export const PAYOUT_STATUS: Record<string, PayoutStatusMeta> = {
  PENDING: {
    label: "Enregistrée",
    tone: "muted",
    help: "État transitoire : la demande vient d'être créée.",
  },
  IN_REVIEW: {
    label: "À instruire",
    tone: "warn",
    help: "Vérifiez le solde et le moyen de paiement, puis approuvez ou rejetez.",
  },
  AUTO_APPROVED: {
    label: "Auto-approuvée",
    tone: "info",
    help: "Score ≥ 80 et retrait non initial : à virer, puis à constater ici.",
  },
  APPROVED: {
    label: "Approuvée",
    tone: "info",
    help: "À virer, puis à constater ici. Le solde n'est pas encore débité.",
  },
  PAID: {
    label: "Versée",
    tone: "ok",
    help: "Le solde du formateur a été débité au moment du versement.",
  },
  REJECTED: {
    label: "Rejetée",
    tone: "bad",
    help: "L'engagement a été libéré, le solde du formateur est resté intact.",
  },
  FAILED: {
    label: "Échec du virement",
    tone: "bad",
    help: "L'engagement est retombé. Un Super-admin peut reprendre la demande.",
  },
};

/** Les statuts pour lesquels le montant est immobilisé mais pas débité. */
export const IN_FLIGHT_STATUSES = ["PENDING", "AUTO_APPROVED", "IN_REVIEW", "APPROVED"];

export const PAYOUT_METHOD_TYPE_LABELS: Record<string, string> = {
  BANK_IBAN: "Virement bancaire",
  MOBILE_MONEY: "Mobile money",
};

export const KYC_CRITERIA_LABELS: Record<string, string> = {
  piVerified: "Pièce d'identité vérifiée",
  ribVerified: "Moyen de paiement vérifié",
  seniority30Days: "Ancienneté de 30 jours",
  cleanSales3: "3 ventes réglées sans litige",
  noOpenDispute: "Aucun litige ouvert",
};

export function hoursSince(date: Date | string): number {
  return (Date.now() - new Date(date).getTime()) / 3_600_000;
}

export function formatAge(hours: number): string {
  if (hours < 1) return "moins d'une heure";
  if (hours < 48) return `${Math.floor(hours)} h`;
  return `${Math.floor(hours / 24)} jours`;
}
