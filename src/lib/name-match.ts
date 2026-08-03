// ==========================================================================
// Comparaison de noms — décision 22a
// ==========================================================================
// « Comparaison automatique au verifiedLegalName après normalisation (casse,
// accents, ordre des mots). » Ce module implémente cette normalisation, et
// rien d'autre.
//
// CE QU'IL NE FAIT PAS, et ne doit jamais faire : décider qu'un moyen de
// paiement est vérifié. Comparer deux chaînes fournies par le formateur ne
// prouve rien — il suffirait de recopier l'une dans l'autre. La comparaison
// n'a de valeur que lorsque l'un des deux noms vient d'une source externe :
// l'API d'un opérateur (couche a) ou la lecture d'un document par un humain
// (couche b). Voir `lookupMobileMoneyName` dans `payout-methods.ts`.
// ==========================================================================

export type NameComparison = 'MATCH' | 'MISMATCH'

/**
 * Formes juridiques retirées avant comparaison : « Sarr Formation » et
 * « Sarr Formation SARL » désignent la même entité, et le registre du commerce
 * ne porte pas toujours le suffixe comme le fait le compte bancaire.
 */
const LEGAL_FORMS = new Set([
  'sarl', 'sarlu', 'sa', 'sas', 'sasu', 'eurl', 'snc', 'sci', 'scs', 'sca',
  'gie', 'ets', 'etablissement', 'etablissements', 'entreprise', 'ei', 'eirl',
  'ltd', 'limited', 'llc', 'inc', 'plc', 'corp', 'gmbh', 'bv', 'nv', 'ag',
])

/** Mots vides, qui ne portent aucune information d'identité. */
const STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'and', 'the', 'of'])

/**
 * Réduit un nom à ses jetons signifiants : minuscules, sans accents, sans
 * ponctuation, sans forme juridique ni mot vide.
 *
 * Les jetons sont **triés et dédoublonnés**, ce qui rend la comparaison
 * insensible à l'ordre des mots — « Awa Sarr » et « Sarr Awa » désignent la
 * même personne, et les relevés bancaires inversent couramment nom et prénom.
 */
export function normalizeName(value: string): string[] {
  const tokens = value
    // NFD sépare la lettre de son accent, `\p{M}` retire l'accent : « Kouamé »
    // et « Kouame » doivent produire le même jeton. Sans cette étape, l'accent
    // n'étant pas dans [a-z0-9], il couperait le mot en deux au lieu de
    // disparaître — « Béatrice » deviendrait « be » + « atrice ».
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // L'apostrophe et le trait d'union séparent : « d'Almeida », « Ndiaye-Fall ».
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !LEGAL_FORMS.has(token) && !STOP_WORDS.has(token))

  return [...new Set(tokens)].sort()
}

/** Forme lisible d'un nom normalisé, pour l'affichage et les journaux. */
export function normalizedLabel(value: string): string {
  return normalizeName(value).join(' ')
}

/**
 * Deux noms désignent-ils la même entité ? Exige des jetons **identiques** :
 * ni sous-ensemble, ni préfixe. « Sarr Formation » et « Sarr Formation
 * Digitale » sont deux entités distinctes, et les confondre ferait verser des
 * revenus sur le mauvais compte.
 */
export function compareNames(
  a: string | null | undefined,
  b: string | null | undefined,
): NameComparison {
  if (!a || !b) return 'MISMATCH'
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (left.length === 0 || right.length === 0) return 'MISMATCH'
  return left.length === right.length && left.every((token, i) => token === right[i])
    ? 'MATCH'
    : 'MISMATCH'
}
