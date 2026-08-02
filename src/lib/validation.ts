// ==========================================================================
// Règles de saisie partagées entre les formulaires publics.
//
// Les formulaires posent `noValidate` pour maîtriser les messages : ceux du
// navigateur dépendent de sa langue et ne correspondent pas aux règles du
// serveur. La contrepartie est que TOUTE vérification doit être refaite ici —
// c'est le rôle de ce fichier, et c'est aussi le miroir exact des règles
// appliquées par `POST /api/auth/register`.
// ==========================================================================

/**
 * Validation d'adresse e-mail volontairement permissive : une partie locale,
 * une arobase, un domaine pointé. Chercher à implémenter la RFC 5322 rejette
 * des adresses valides — seul l'envoi d'un code de vérification prouve qu'une
 * adresse existe, et ce chemin existe déjà.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export const EMAIL_ERROR = "Saisissez une adresse e-mail valide, par exemple nom@exemple.com.";

/**
 * Adresse de site : `new URL()` fait foi plutôt qu'une expression régulière,
 * et on impose http/https — `javascript:` passe `new URL()` sans problème.
 */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const URL_ERROR = "Saisissez une adresse complète, commençant par https://.";

/**
 * Longueur minimale de la présentation d'un formateur. Partagée entre le
 * wizard d'inscription et l'écran de candidature : deux seuils différents pour
 * le même champ enverraient des candidatures refusées à l'étape suivante.
 */
export const MIN_TRAINER_DESCRIPTION = 50;

export interface PasswordRule {
  id: string;
  /** Formulé à l'infinitif : sert de consigne avant saisie et de constat après. */
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "Au moins 8 caractères", test: (v) => v.length >= 8 },
  { id: "upper", label: "Au moins une majuscule", test: (v) => /[A-Z]/.test(v) },
  { id: "digit", label: "Au moins un chiffre", test: (v) => /\d/.test(v) },
];

/** Règles non satisfaites, dans l'ordre d'affichage. Vide = mot de passe accepté. */
export function passwordIssues(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

/**
 * Message d'erreur unique listant TOUT ce qui manque.
 * N'annoncer que la première règle non respectée oblige à corriger, resoumettre,
 * découvrir la suivante — autant la donner d'un coup.
 */
export function passwordError(value: string): string | null {
  const issues = passwordIssues(value);
  if (issues.length === 0) return null;
  const missing = issues.map((rule) => rule.label.replace(/^Au moins /, "").toLowerCase());
  return `Il manque : ${missing.join(", ")}.`;
}
