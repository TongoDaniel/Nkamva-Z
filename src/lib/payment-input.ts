// Saisie du moyen de paiement mobile money — schéma partagé.
//
// Deux tunnels demandent la même chose (l'achat à l'unité et l'adhésion à une
// communauté) : le schéma vit ici pour qu'ils ne divergent pas. C'est la seule
// exception au principe « chaque route porte son schéma », et elle se justifie
// par le fait que les deux alimentent le même appel fournisseur.
import { z } from 'zod'

/**
 * L'apprenant choisit un **code opérateur PawaPay** (`MTN_MOMO_CMR`,
 * `HALOTEL_TZA`), pas une marque générique.
 *
 * La liste des marques figée ici auparavant — quatre valeurs — ne pouvait pas
 * exprimer HaloPesa, TNM, Moov, Free, Tigo ni Zamtel, et obligeait à recroiser
 * marque × pays dans une table écrite à la main dont sept entrées désignaient
 * des opérateurs inexistants. La liste proposée à l'écran est désormais celle
 * que `/v2/active-conf` déclare pour le pays de l'apprenant : elle ne peut pas
 * annoncer un opérateur que le compte ne distribue pas.
 *
 * Le format est validé ici, l'existence l'est côté serveur par `resolveProvider`
 * — une valeur inventée est refusée avant tout appel au fournisseur.
 */
export const PROVIDER_CODE_RE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/

export const MobileMoneyPayerSchema = z.object({
  /**
   * Le numéro est accepté large et normalisé côté serveur (`toMsisdn`) : exiger
   * un format canonique dans le formulaire ferait échouer une saisie
   * parfaitement lisible comme « 6 70 00 00 00 ». On borne seulement la
   * longueur en chiffres.
   */
  phoneNumber: z
    .string()
    .trim()
    .min(6, 'Numéro trop court')
    .max(20, 'Numéro trop long')
    .refine((v) => v.replace(/\D/g, '').length >= 8, 'Saisissez un numéro de téléphone valide'),
  provider: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(PROVIDER_CODE_RE, 'Opérateur invalide'),
})

export type MobileMoneyPayerInput = z.infer<typeof MobileMoneyPayerSchema>

/** Miroir client de la règle ci-dessus, pour un message avant l'aller-retour. */
export function phoneNumberError(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return 'Saisissez le numéro qui recevra la demande de paiement.'
  if (digits.length < 8) return 'Ce numéro semble incomplet.'
  if (digits.length > 15) return 'Ce numéro comporte trop de chiffres.'
  return null
}

/** Forme minimale d'un opérateur telle que les écrans la consomment. */
export interface PayableProvider {
  provider: string
  displayName: string
  countryCode: string
  /** Indicatif du pays de l'opérateur, sans « + » — `237`, `221`. */
  prefix: string
}

/**
 * « MTN, Orange, Airtel » — ou le motif de l'absence, plutôt qu'une ligne vide.
 *
 * Dédoublonné par nom commercial : la liste couvre tous les pays encaissables,
 * et une marque y figure une fois par pays (Orange au Sénégal, au Cameroun, en
 * Côte d'Ivoire…). Sans cela, le résumé répétait « MTN » six fois.
 */
export function operatorsLabel(providers: PayableProvider[]): string {
  if (!providers.length) return 'Indisponible dans votre pays'
  return [...new Set(providers.map((p) => p.displayName))].join(', ')
}

// --- Pays -----------------------------------------------------------------
// Ici et non dans `markets.ts` : l'écran de paiement en a besoin côté client, et
// `markets.ts` importe la base de données.

/** Noms français des pays que PawaPay peut servir. Pure traduction de codes. */
const COUNTRY_NAMES: Record<string, string> = {
  BJ: 'Bénin',
  BF: 'Burkina Faso',
  CM: 'Cameroun',
  CI: "Côte d'Ivoire",
  CD: 'RDC',
  CG: 'Congo',
  GA: 'Gabon',
  GH: 'Ghana',
  KE: 'Kenya',
  ML: 'Mali',
  MW: 'Malawi',
  MZ: 'Mozambique',
  NG: 'Nigeria',
  RW: 'Rwanda',
  SN: 'Sénégal',
  SL: 'Sierra Leone',
  TZ: 'Tanzanie',
  TG: 'Togo',
  UG: 'Ouganda',
  ZM: 'Zambie',
}

export function countryName(alpha2: string): string {
  return COUNTRY_NAMES[alpha2.toUpperCase()] ?? alpha2.toUpperCase()
}

// --- Motifs d'échec --------------------------------------------------------
// Ce que le fournisseur a refusé, dit à l'apprenant. Le générique
// « l'opérateur a refusé ou annulé la transaction » ne lui apprenait rien : il
// ne savait pas s'il devait recharger son compte, approuver la demande sur son
// téléphone, ou corriger son numéro.
//
// ⚠️ **Aucun code n'est inventé ici.** La liste vient de
// `docs.pawapay.io/v2/docs/failure_codes` et de la table des numéros de test du
// bac à sable — laquelle produit `PAYER_LIMIT_REACHED` là où la documentation
// nomme `WALLET_LIMIT_REACHED` : les deux sont donc traités. Un code absent de
// cette table n'est pas deviné, il retombe sur le message générique.

const PAWAPAY_FAILURES: Record<string, string> = {
  // — Transaction, côté payeur : c'est ce que l'apprenant peut corriger.
  PAYMENT_NOT_APPROVED:
    "Vous n'avez pas approuvé la demande sur votre téléphone. Relancez le paiement et validez avec votre code secret.",
  INSUFFICIENT_BALANCE:
    "Le solde de votre compte mobile money est insuffisant. Rechargez-le, puis relancez le paiement.",
  PAYMENT_IN_PROGRESS:
    "Une autre transaction est déjà en cours sur ce numéro. Attendez qu'elle se termine avant de relancer.",
  PAYER_NOT_FOUND:
    "Ce numéro n'appartient pas à l'opérateur choisi. Vérifiez le numéro, ou sélectionnez le bon opérateur.",
  WALLET_LIMIT_REACHED:
    "Votre compte mobile money a atteint son plafond. Contactez votre opérateur, ou réglez par carte bancaire.",
  PAYER_LIMIT_REACHED:
    "Votre compte mobile money a atteint son plafond. Contactez votre opérateur, ou réglez par carte bancaire.",
  UNSPECIFIED_FAILURE:
    "Votre opérateur a refusé la transaction sans en préciser la raison. Vous pouvez réessayer.",

  // — Saisie : l'apprenant peut encore agir, sur le numéro ou le montant.
  INVALID_PHONE_NUMBER:
    "Ce numéro n'est pas au bon format. Saisissez-le sans espace, avec l'indicatif du pays.",
  AMOUNT_OUT_OF_BOUNDS:
    "Le montant sort des limites autorisées par votre opérateur pour une seule transaction.",

  // — Panne côté fournisseur : rien à corriger, seulement à réessayer.
  PROVIDER_TEMPORARILY_UNAVAILABLE:
    "Votre opérateur est momentanément indisponible. Réessayez dans quelques minutes.",
  DEPOSITS_NOT_ALLOWED:
    "Ce moyen de paiement n'est pas disponible pour le moment. Réglez par carte bancaire, ou contactez le support.",
}

/** Échecs propres au tunnel carte. Nommés par nous, faute d'équivalent Stripe. */
const CARD_FAILURES: Record<string, string> = {
  SESSION_EXPIRED:
    "La page de paiement a expiré avant que le règlement n'aboutisse. Relancez le paiement pour en ouvrir une nouvelle.",
  card_declined:
    "Votre banque a refusé la carte. Essayez une autre carte, ou réglez par mobile money.",
  expired_card: "Cette carte est expirée. Essayez-en une autre.",
  insufficient_funds:
    "Le solde de la carte est insuffisant. Essayez une autre carte, ou réglez par mobile money.",
}

/**
 * Phrase à afficher pour un échec de paiement, ou `null` si le code est inconnu
 * — l'écran garde alors sa formulation générique plutôt que d'affirmer une
 * cause qu'il ignore.
 */
export function paymentFailureMessage(code: string | null | undefined): string | null {
  if (!code) return null
  return PAWAPAY_FAILURES[code] ?? CARD_FAILURES[code] ?? null
}
