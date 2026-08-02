/**
 * Lives et replays de démonstration (`nkamva-lives.js`, `nkamva-live.js`,
 * `nkamva-replay.js` de la maquette). Voir l'avertissement en tête de
 * `catalog-data.ts` : rien ici ne vient de la base — aucun modèle `LiveSession`
 * n'existe encore. Les règles à trancher sont listées dans
 * `docs/espace-apprenant-a-brancher.md`.
 */

import { AUTHORS, type Author } from './catalog-data'
import { COMMUNITIES, type Community } from './community-data'

export interface LiveSession {
  id: string
  title: string
  community: Community
  host: Author
  /** Début planifié. Le passé bascule l'écran de la salle d'attente au direct. */
  startsAt: Date
  durationMinutes: number
  description: string
  attendees: number
}

export interface Replay {
  id: string
  title: string
  community: Community
  host: Author
  recordedAt: Date
  durationSeconds: number
  description: string
  downloadable: boolean
}

function community(slug: string): Community {
  const found = COMMUNITIES.find((c) => c.slug === slug)
  if (!found) throw new Error(`Communauté de démonstration inconnue : ${slug}`)
  return found
}

/** Décalages relatifs à maintenant : le jeu reste crédible dans le temps. */
function inHours(hours: number): Date {
  return new Date(Date.now() + hours * 3600 * 1000)
}

export const LIVE_SESSIONS: LiveSession[] = [
  {
    id: 'revue-checklists-qa',
    title: 'Revue de checklists QA',
    community: community('qa-tests-logiciels'),
    host: AUTHORS.dt,
    // En cours : ouvre directement sur le direct plutôt que sur l'attente.
    startsAt: inHours(-0.4),
    durationMinutes: 60,
    description:
      "On passe en revue vos checklists de recette, une par une, et on coupe ce qui ne sert jamais.",
    attendees: 38,
  },
  {
    id: 'architecture-paiements',
    title: "Architecture d'un système de paiement résilient",
    community: community('ingenierie-logicielle-afrique'),
    host: AUTHORS.as,
    startsAt: inHours(51),
    durationMinutes: 90,
    description:
      "Reprises sur incident, idempotence des webhooks, réconciliation : le live détaille un cas réel de production.",
    attendees: 112,
  },
  {
    id: 'montage-rythme',
    title: 'Atelier montage : trouver le rythme',
    community: community('createurs-video-montage'),
    host: AUTHORS.yo,
    startsAt: inHours(146),
    durationMinutes: 75,
    description: 'Un atelier en direct sur le découpage, avec vos rushs si vous en apportez.',
    attendees: 64,
  },
]

export const REPLAYS: Replay[] = [
  {
    id: 'plan-de-test-solide',
    title: 'Concevoir un plan de test solide',
    community: community('qa-tests-logiciels'),
    host: AUTHORS.dt,
    recordedAt: inHours(-17 * 24),
    durationSeconds: 2530,
    description:
      "Du périmètre au jeu de données : construire un plan de test qu'une équipe peut réellement tenir.",
    downloadable: true,
  },
  {
    id: 'revue-code-erreurs',
    title: 'Revue de code en direct : gestion des erreurs',
    community: community('ingenierie-logicielle-afrique'),
    host: AUTHORS.as,
    recordedAt: inHours(-24 * 24),
    durationSeconds: 3090,
    description: "Une revue commentée, sur du code réel, centrée sur les chemins d'échec.",
    downloadable: true,
  },
  {
    id: 'notion-freelance',
    title: 'Organiser son activité freelance dans Notion',
    community: community('freelances-independants'),
    host: AUTHORS.km,
    recordedAt: inHours(-38 * 24),
    durationSeconds: 2285,
    description: 'Missions, facturation, relances : un espace de travail monté en direct.',
    downloadable: false,
  },
]

export function liveSessionById(id: string): LiveSession | undefined {
  return LIVE_SESSIONS.find((s) => s.id === id)
}

export function replayById(id: string): Replay | undefined {
  return REPLAYS.find((r) => r.id === id)
}

/** Une session est « en direct » entre son début et sa fin planifiée. */
export function isLiveNow(session: LiveSession): boolean {
  const start = session.startsAt.getTime()
  return Date.now() >= start && Date.now() < start + session.durationMinutes * 60 * 1000
}

/** Messages de salon d'un live, pour peupler le panneau latéral. */
export const LIVE_CHAT: Array<{ id: string; author: string; initials: string; text: string; self?: boolean }> = [
  { id: 'm1', author: 'Daniel Tongo', initials: 'DT', text: 'On démarre dans deux minutes, le temps que tout le monde arrive.' },
  { id: 'm2', author: 'Nadia Bamba', initials: 'NB', text: 'Bonjour à tous 👋' },
  { id: 'm3', author: 'Seydou Keïta', initials: 'SK', text: 'Est-ce que le replay sera dispo ?' },
  { id: 'm4', author: 'Daniel Tongo', initials: 'DT', text: 'Oui, dans la communauté sous 24 h.' },
]

export interface LiveParticipant {
  id: string
  name: string
  initials: string
  /** Le formateur : il anime et modère (arbitrage 35). */
  host?: boolean
  self?: boolean
  /** Détection du locuteur actif, fournie par le transport temps réel. */
  speaking?: boolean
  /** Micro fermé par l'animateur : le participant ne peut pas le rouvrir seul. */
  mutedByHost?: boolean
  /**
   * Horodatage de la levée de main. L'ordre de la file se lit dessus : c'est ce
   * qui permet de savoir qui a demandé la parole en premier (arbitrage 36).
   */
  handRaisedAt?: number
}

const now = Date.now()

export const LIVE_PARTICIPANTS: LiveParticipant[] = [
  { id: 'p1', name: 'Daniel Tongo', initials: 'DT', host: true, speaking: true },
  { id: 'p2', name: 'Vous', initials: 'AD', self: true },
  { id: 'p3', name: 'Nadia Bamba', initials: 'NB', handRaisedAt: now - 95_000 },
  { id: 'p4', name: 'Seydou Keïta', initials: 'SK', mutedByHost: true },
  { id: 'p5', name: 'Clarisse Mvondo', initials: 'CM', handRaisedAt: now - 40_000 },
]
