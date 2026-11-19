// ==========================================================================
// Réactions et sondage éclair d'un direct : la logique sans écran
// ==========================================================================
// Ce que `components/nk/live-interactions.tsx` reçoit du canal de données de
// la salle vient d'un autre navigateur : rien n'y est fiable. Ces fonctions
// décident de ce qu'on en garde, et elles sont testées à part
// (`tests/live-interactions.test.ts`), sans salle ni navigateur.
// ==========================================================================

export const REACTION_IDS = ['compris', 'lentement', 'entends', 'merci'] as const
export type ReactionId = (typeof REACTION_IDS)[number]

export function isReaction(value: unknown): value is { id: ReactionId } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (REACTION_IDS as readonly unknown[]).includes((value as { id?: unknown }).id)
  )
}

export interface Poll {
  id: string
  question: string
  options: string[]
  /** Le décompte, publié par l'animateur à la clôture. */
  results?: number[]
}

export type PollMessage =
  | { type: 'open'; poll: Poll }
  | { type: 'close'; poll: Poll }
  | { type: 'vote'; pollId: string; option: number }
  | { type: 'ask' }

export function isPollMessage(value: unknown): value is PollMessage {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  return type === 'open' || type === 'close' || type === 'vote' || type === 'ask'
}

/** Un sondage reçu : deux à quatre réponses, des textes, et des résultats cohérents s'il y en a. */
export function validPoll(poll: unknown): poll is Poll {
  if (typeof poll !== 'object' || poll === null) return false
  const p = poll as Poll
  return (
    typeof p.id === 'string' &&
    typeof p.question === 'string' &&
    Array.isArray(p.options) &&
    p.options.length >= 2 &&
    p.options.length <= 4 &&
    p.options.every((o) => typeof o === 'string') &&
    (p.results === undefined ||
      (Array.isArray(p.results) &&
        p.results.length === p.options.length &&
        p.results.every((n) => Number.isInteger(n) && n >= 0)))
  )
}

/**
 * Le vote à retenir, côté animateur, ou `null` s'il ne compte pas : pas de
 * sondage ouvert, un autre sondage, ou une réponse qui n'existe pas.
 */
export function acceptedVote(
  open: Poll | null,
  closed: boolean,
  message: { pollId: string; option: unknown },
): number | null {
  if (!open || closed || message.pollId !== open.id) return null
  const option = message.option
  if (typeof option !== 'number' || !Number.isInteger(option)) return null
  if (option < 0 || option >= open.options.length) return null
  return option
}

/** Le décompte : un vote par personne, le dernier remplaçant le précédent. */
export function tallyVotes(poll: Poll, votes: ReadonlyMap<string, number>): number[] {
  const counts = poll.options.map(() => 0)
  for (const option of votes.values()) {
    if (option >= 0 && option < counts.length) counts[option] += 1
  }
  return counts
}

/** Les pourcentages affichés, arrondis, à zéro quand personne n'a voté. */
export function percents(tally: number[]): number[] {
  const total = tally.reduce((a, b) => a + b, 0)
  return tally.map((n) => (total > 0 ? Math.round((n / total) * 100) : 0))
}
