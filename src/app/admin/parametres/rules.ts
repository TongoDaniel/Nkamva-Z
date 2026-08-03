// ==========================================================================
// Règles en vigueur — affichage seul
// ==========================================================================
// Ces valeurs portent des arbitrages, pas des préférences : les rendre
// modifiables depuis un écran reviendrait à laisser changer une décision par
// un clic. On les affiche pour qu'elles soient vérifiables, et on dit où elles
// vivent.
//
// Chaque valeur est importée de sa source, jamais recopiée : une constante
// dupliquée ici finirait par mentir.
// ==========================================================================

import { PAYOUT_METHOD_CARENCE_HOURS, PAYOUT_METHOD_MAX_REJECTIONS, BUSINESS_DOC_MAX_SIZE_BYTES } from "@/lib/payout-methods";
import { PAYOUT_MIN_AMOUNT_FCFA, PAYOUT_REVIEW_SLA_HOURS } from "@/lib/payouts";
import { KYC_THRESHOLD_VERIFIED, KYC_THRESHOLD_TO_VERIFY } from "@/lib/kyc";
import { fmtFcfa } from "@/lib/format";

export interface PlatformRule {
  label: string;
  value: string;
  source: string;
  note?: string;
}

export const PLATFORM_RULES: PlatformRule[] = [
  {
    label: "Commission sur les ventes",
    value: "15 %",
    source: "décision 11",
    note: "portée par formateur, snapshotée sur chaque achat",
  },
  {
    label: "Retrait minimum",
    value: fmtFcfa(PAYOUT_MIN_AMOUNT_FCFA),
    source: "lib/payouts",
  },
  {
    label: "Délai de sécurité après ajout d'un moyen de paiement",
    value: `${PAYOUT_METHOD_CARENCE_HOURS} h`,
    source: "décision 23",
    note: "même si la vérification aboutit plus tôt",
  },
  {
    label: "SLA de revue manuelle",
    value: `${PAYOUT_REVIEW_SLA_HOURS} h`,
    source: "décision 23",
  },
  {
    label: "Refus avant blocage d'un moyen de paiement",
    value: String(PAYOUT_METHOD_MAX_REJECTIONS),
    source: "décision 23",
    note: "compteur porté par le formateur, pas par le moyen",
  },
  {
    label: "Score de confiance — seuil « vérifié »",
    value: `${KYC_THRESHOLD_VERIFIED} / 100`,
    source: "décision 1",
    note: "auto-approbation, sauf premier retrait",
  },
  {
    label: "Score de confiance — seuil « à vérifier »",
    value: `${KYC_THRESHOLD_TO_VERIFY} / 100`,
    source: "décision 1",
  },
  {
    label: "Délai d'ouverture d'un litige",
    value: "14 jours",
    source: "décisions 2 et 18",
    note: "accès suspendu dès l'ouverture",
  },
  {
    label: "Consommation bloquant le remboursement automatique",
    value: "30 %",
    source: "décisions 2 et 14",
    note: "formats streamés uniquement",
  },
  {
    label: "Quota de stockage par formateur",
    value: "40 Go",
    source: "décision 54",
    note: "extension payante ; le blocage ne porte que sur le téléversement",
  },
  {
    label: "Taille maximale d'un document d'entreprise",
    value: `${Math.round(BUSINESS_DOC_MAX_SIZE_BYTES / 1_048_576)} Mo`,
    source: "décision 28",
  },
  {
    label: "Conservation d'un replay",
    value: "24 mois",
    source: "décision 51",
    note: "à compter de la date du live",
  },
  {
    label: "Purge des pièces d'identité",
    value: "90 jours",
    source: "décision 3",
    note: "après la décision ; la réouverture devient impossible",
  },
];
