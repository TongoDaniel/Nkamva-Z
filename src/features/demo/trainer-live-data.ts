/**
 * Côté formateur d'un live de démonstration. Voir l'avertissement en tête de
 * `catalog-data.ts` : rien ici ne vient de la base — aucun modèle `LiveSession`
 * n'existe encore.
 *
 * Ce fichier ne redéfinit ni les sessions ni les replays : la console formateur
 * ouvre les **mêmes** identifiants que l'écran apprenant de `live-data.ts`. Une
 * session vue des deux côtés reste une seule session. Ce qui s'ajoute ici, c'est
 * le plateau que le formateur modère (arbitrages 35 à 37) et qui n'a pas d'
 * équivalent apprenant : celui-ci ne voit qu'une poignée de participants, le
 * formateur les voit tous.
 */

export interface ConsoleParticipant {
  id: string
  name: string
  /** Le formateur lui-même. Il n'apparaît pas dans les gestes de modération. */
  host?: boolean
  /**
   * Micro **verrouillé** par l'animateur (arbitrage 35). Ce n'est pas l'état du
   * micro : c'est un verrou. Le lever ne rallume rien, cela rend seulement au
   * participant la commande de son propre micro.
   */
  mutedByHost?: boolean
  /** Micro fermé par le participant lui-même. Le formateur ne le force jamais. */
  selfMuted?: boolean
  /** Locuteur actif (arbitrage 37), fourni par le transport temps réel. */
  speaking?: boolean
  /**
   * Horodatage de la levée de main. C'est lui, et non un booléen, qui ordonne
   * et numérote la file des demandes de parole (arbitrage 36).
   */
  handRaisedAt?: number
}

const now = Date.now()

/**
 * Neuf participants : assez pour que « couper la sélection » ait un sens, et
 * pour que la file des demandes de parole ait plus de deux entrées.
 */
export const CONSOLE_PARTICIPANTS: ConsoleParticipant[] = [
  { id: 'h', name: 'Vous', host: true, speaking: true },
  { id: 'p3', name: 'Nadia Bamba', handRaisedAt: now - 95_000 },
  { id: 'p5', name: 'Clarisse Mvondo', handRaisedAt: now - 40_000 },
  { id: 'p7', name: 'Ibrahim Diallo', handRaisedAt: now - 12_000, selfMuted: true },
  { id: 'p4', name: 'Seydou Keïta', mutedByHost: true },
  { id: 'p2', name: 'Awa Diop', selfMuted: true },
  { id: 'p6', name: 'Éric Nkodo' },
  { id: 'p8', name: 'Fatou Cissé', selfMuted: true },
  { id: 'p9', name: 'Modeste Abena', mutedByHost: true },
]

/** Salon du live, côté formateur : le fil est le même que celui des apprenants. */
export const CONSOLE_CHAT: Array<{ id: string; author: string; self?: boolean; text: string }> = [
  { id: 'c1', author: 'Vous', self: true, text: 'On démarre dans deux minutes, le temps que tout le monde arrive.' },
  { id: 'c2', author: 'Nadia Bamba', text: 'Bonjour à tous 👋' },
  { id: 'c3', author: 'Seydou Keïta', text: 'Est-ce que le replay sera dispo ?' },
  { id: 'c4', author: 'Vous', self: true, text: 'Oui, dans la communauté sous 24 h.' },
  { id: 'c5', author: 'Ibrahim Diallo', text: "J'ai une question sur la checklist de recette." },
]
