// ==========================================================================
// Aide & FAQ — la partie pure, partagée par le serveur et le navigateur
// ==========================================================================
// Marqueurs, liens, rendu d'une réponse : rien ici ne touche la base, pour que
// l'écran d'administration montre l'aperçu exact de ce que le site affichera.
// Les règles sont décrites en tête de `help-content.ts`.
// ==========================================================================

// --- Icônes : liste fermée, l'écran les dessine (`help-icons.tsx`) -------

export const HELP_ICON_KEYS = ['play', 'credit-card', 'users', 'user-cog', 'shield', 'book', 'video', 'wallet', 'message'] as const
export type HelpIconKey = (typeof HELP_ICON_KEYS)[number]

export const HELP_ICON_LABELS: Record<HelpIconKey, string> = {
  play: 'Démarrer',
  'credit-card': 'Paiement',
  users: 'Communauté',
  'user-cog': 'Compte',
  shield: 'Formateur',
  book: 'Ressource',
  video: 'Vidéo, live',
  wallet: 'Portefeuille',
  message: 'Messagerie',
}

// --- Marqueurs --------------------------------------------------------------

export const HELP_MARKERS = {
  commission: 'Commission prélevée sur chaque vente',
  part_formateur: 'Part du prix qui revient au formateur',
  abonnement_formateur: "Phrase sur l'abonnement formateur en vigueur",
  delai_contestation: "Délai pour contester un achat (en jours)",
  seuil_consommation: 'Part consultée au-delà de laquelle on ne rembourse plus',
  delai_reponse_apprenant: "Délai de réponse de l'apprenant pendant une contestation",
  delai_suppression: "Délai avant la suppression effective d'un compte",
  retrait_minimum: 'Montant minimum pour demander un retrait',
  carence_moyen_paiement: "Attente avant le premier retrait vers un nouveau compte",
  delai_support: 'Délai de réponse du support',
  operateurs: 'Opérateurs mobile money proposés',
  pays: 'Pays où NKAMVA encaisse',
} as const

export type HelpMarker = keyof typeof HELP_MARKERS
export type HelpValues = Record<HelpMarker, string>

// --- Lecture d'une réponse ----------------------------------------------------

export type AnswerSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; href: string }

type RawSegment = AnswerSegment | { type: 'marker'; key: string }

const TOKEN = /\{([a-z_]+)\}|\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)/g

/** Un chemin du site : commence par `/`, jamais par `//` (qui sortirait du domaine). */
export function isInternalPath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')
}

function tokenize(text: string): RawSegment[] {
  const out: RawSegment[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ type: 'text', value: text.slice(last, m.index) })
    if (m[1]) out.push({ type: 'marker', key: m[1] })
    else out.push({ type: 'link', label: m[2], href: m[3] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

/** Ce qu'une réponse a de refusable, dit pour la personne qui l'écrit. */
export function answerProblems(text: string): string[] {
  const problems: string[] = []
  for (const seg of tokenize(text)) {
    if (seg.type === 'marker' && !(seg.key in HELP_MARKERS)) {
      problems.push(`Marqueur inconnu : {${seg.key}}.`)
    }
    if (seg.type === 'link' && !isInternalPath(seg.href)) {
      problems.push(`Lien refusé : « ${seg.href} ». Seuls les chemins du site, commençant par « / », sont acceptés.`)
    }
  }
  return problems
}

/** La réponse prête à afficher : marqueurs remplacés, textes voisins fusionnés. */
export function renderAnswer(text: string, values: HelpValues): AnswerSegment[] {
  const out: AnswerSegment[] = []
  const pushText = (value: string) => {
    const prev = out[out.length - 1]
    if (prev?.type === 'text') prev.value += value
    else out.push({ type: 'text', value })
  }
  for (const seg of tokenize(text)) {
    if (seg.type === 'marker') {
      // Un marqueur inconnu ne peut pas être en base (refusé à l'écriture) ; si
      // une clé disparaît du registre, il s'affiche tel quel plutôt que vide.
      pushText(seg.key in HELP_MARKERS ? values[seg.key as HelpMarker] : `{${seg.key}}`)
    } else if (seg.type === 'link') {
      if (isInternalPath(seg.href)) out.push(seg)
      else pushText(seg.label)
    } else {
      pushText(seg.value)
    }
  }
  return out
}

/** Le texte nu d'une réponse rendue, pour la recherche. */
export function answerPlainText(segments: AnswerSegment[]): string {
  return segments.map((s) => (s.type === 'text' ? s.value : s.label)).join('')
}

/** Un identifiant d'ancre lisible, tiré du titre : « Mon compte » → « mon-compte ». */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'rubrique'
}
