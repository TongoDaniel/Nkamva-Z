// ==========================================================================
// Libellés du portefeuille formateur — retraits et moyens de paiement
// ==========================================================================
// Les enums Prisma ne sont jamais rendus tels quels : chaque état porte ici
// son libellé, son ton et surtout ce qu'il implique pour le formateur. Un
// statut qui ne dit pas ce qu'il reste à faire n'aide personne.
// ==========================================================================

import type { StPillProps } from "@/components/nk/status-pill";

type Tone = NonNullable<StPillProps["tone"]>;

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Ce que le formateur doit comprendre — affiché sous le statut. */
  help: string;
}

export const PAYOUT_STATUS: Record<string, StatusMeta> = {
  PENDING: {
    label: "Enregistrée",
    tone: "muted",
    help: "La demande vient d'être créée.",
  },
  IN_REVIEW: {
    label: "En revue",
    tone: "warn",
    help: "Instruite par l'équipe Finances sous 48 h.",
  },
  AUTO_APPROVED: {
    label: "Approuvée",
    tone: "info",
    help: "Approuvée automatiquement, le versement est en préparation.",
  },
  APPROVED: {
    label: "Approuvée",
    tone: "info",
    help: "Le versement est en préparation.",
  },
  PAID: {
    label: "Versée",
    tone: "ok",
    help: "Le montant a été débité de votre solde et envoyé.",
  },
  REJECTED: {
    label: "Refusée",
    tone: "bad",
    help: "Le montant est resté sur votre solde, vous pouvez redemander.",
  },
  FAILED: {
    label: "Échec du versement",
    tone: "bad",
    help: "Le virement n'a pas abouti. L'équipe Finances reprend la main.",
  },
};

export const PAYOUT_METHOD_STATUS: Record<string, StatusMeta> = {
  PENDING_REVIEW: {
    label: "En cours de vérification",
    tone: "warn",
    help: "Revue manuelle par l'équipe Finances, sous 48 h ouvrées.",
  },
  AUTO_VERIFIED: {
    label: "Vérifié",
    tone: "info",
    help: "Vérifié automatiquement auprès de l'opérateur.",
  },
  MANUAL_VERIFIED: {
    label: "Vérifié",
    tone: "info",
    help: "Vérifié par l'équipe Finances.",
  },
  VERIFIED: {
    label: "Vérifié",
    tone: "ok",
    help: "Utilisable pour vos retraits.",
  },
  REJECTED: {
    label: "Refusé",
    tone: "bad",
    help: "Vous pouvez en enregistrer un autre.",
  },
  BLOCKED: {
    label: "Vérification suspendue",
    tone: "bad",
    help: "Après trois refus, un responsable reprend le dossier. Contactez le support.",
  },
  ARCHIVED: {
    label: "Remplacé",
    tone: "muted",
    help: "Conservé pour l'historique, il ne sert plus aux retraits.",
  },
};

export const OPERATOR_LABELS: Record<string, string> = {
  WAVE: "Wave",
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  AIRTEL_MONEY: "Airtel Money",
  M_PESA: "M-Pesa",
};

export const ACCOUNT_NATURE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Compte personnel",
  BUSINESS: "Compte d'entreprise",
};

/**
 * Un IBAN ne s'affiche jamais en entier après coup : le formateur doit pouvoir
 * reconnaître son compte, pas le recopier depuis un écran laissé ouvert.
 */
export function maskIban(iban: string): string {
  const clean = iban.replace(/\s+/g, "");
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return `•••• ${phone.slice(-4)}`;
}

/** Résumé d'une ligne de moyen de paiement, tous types confondus. */
export function describeMethod(method: {
  type: string;
  iban?: string | null;
  mobileOperator?: string | null;
  mobilePhone?: string | null;
}): string {
  if (method.type === "BANK_IBAN") {
    return method.iban ? `Virement bancaire · ${maskIban(method.iban)}` : "Virement bancaire";
  }
  const operator = method.mobileOperator ? OPERATOR_LABELS[method.mobileOperator] : "Mobile money";
  return method.mobilePhone ? `${operator} · ${maskPhone(method.mobilePhone)}` : operator;
}
