// ==========================================================================
// Destination de reprise — le `callbackUrl` (arbitrage 124, F1.6)
// ==========================================================================
// Une action engagée sans compte — acheter, adhérer, accepter une invitation,
// ouvrir une ressource — doit reprendre une fois l'authentification faite. La
// destination voyage dans `callbackUrl` et traverse **toute** la chaîne :
// inscription → vérification par code → connexion. Aucune étape n'a le droit de
// la laisser tomber.
//
// Elle vient de l'URL, donc de n'importe qui. Elle est donc validée ici, et ici
// seulement : le garde-fou vivait jusqu'à présent dans `auth/deconnexion`, où
// personne d'autre ne pouvait l'atteindre — chaque nouvel écran qui en avait
// besoin l'aurait réécrit, et l'un d'eux l'aurait réécrit moins bien.
//
// **Ce module est importé par le middleware**, qui tourne sur le runtime Edge :
// il ne doit dépendre de rien — ni de Node, ni de Prisma, ni d'un composant.
// ==========================================================================

/** Où l'on va quand rien n'a été demandé, ou que ce qui l'a été est refusé. */
export const DEFAULT_CALLBACK_URL = '/accueil'

/**
 * Longueur maximale acceptée. Une destination interne raisonnable tient très
 * largement dedans ; au-delà, c'est qu'on transporte autre chose qu'un chemin.
 */
const MAX_LENGTH = 512

/**
 * Ne rend la destination demandée que si c'est un **chemin interne**.
 *
 * Les quatre refus, et pourquoi chacun :
 *
 *   · Ne commence pas par `/` — c'est une URL absolue, ou un chemin relatif
 *     dont on ne sait pas à quoi il se rapporte.
 *   · Commence par `//` — `//evil.com` est une URL **absolue** pour le
 *     navigateur (protocole hérité de la page courante). C'est le tremplin
 *     classique.
 *   · Commence par `/\` — même piège, en diagonale : les navigateurs
 *     normalisent l'antislash en barre oblique avant de résoudre l'URL, si bien
 *     que `/\evil.com` devient `//evil.com`. Un garde-fou qui ne teste que la
 *     double barre laisse passer celui-là.
 *   · Contient un caractère de contrôle — tabulation, retour chariot et saut de
 *     ligne sont **retirés** de l'URL par le navigateur avant résolution :
 *     `/<TAB>/evil.com` redevient `//evil.com`. On refuse plutôt que de nettoyer,
 *     parce qu'un chemin légitime n'en contient jamais.
 *
 * Un refus n'est pas une erreur : l'appelant retombe sur son repli. Personne ne
 * doit voir un écran d'erreur parce qu'un lien portait une destination douteuse.
 */
export function safeCallbackUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.length > MAX_LENGTH) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  return raw
}

/**
 * Ajoute `callbackUrl` à un lien d'authentification, s'il y a une destination à
 * transporter. Sans destination valable, le lien est rendu **inchangé** — il ne
 * porte pas un paramètre vide, qui n'aurait fait qu'encombrer l'URL et
 * l'historique.
 *
 * La requête existante de `path` est préservée : `verifier-code` porte déjà
 * l'adresse et le motif quand on lui accroche la destination.
 */
export function withCallbackUrl(path: string, raw: string | null | undefined): string {
  const callbackUrl = safeCallbackUrl(raw)
  if (!callbackUrl) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}callbackUrl=${encodeURIComponent(callbackUrl)}`
}
