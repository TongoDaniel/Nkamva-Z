// ==========================================================================
// Réactions et sondage éclair : ce qu'on garde de ce que la salle envoie
// ==========================================================================
// Ne touche ni la base ni le serveur : pas d'import de `./setup`. Les messages
// du canal de données viennent d'autres navigateurs ; ces tests fixent ce qui
// est accepté et comment le décompte se fait.

import { describe, it, expect } from 'vitest'
import {
  acceptedVote,
  isPollMessage,
  isReaction,
  percents,
  tallyVotes,
  validPoll,
  type Poll,
} from '@/lib/live-interactions'

const sondage: Poll = { id: 'p1', question: 'Vous suivez ?', options: ['Oui', 'Pas trop', 'Non'] }

describe('Réactions', () => {
  it("n'accepte que les quatre réactions prévues", () => {
    expect(isReaction({ id: 'compris' })).toBe(true)
    expect(isReaction({ id: 'merci' })).toBe(true)
    expect(isReaction({ id: 'insulte' })).toBe(false)
    expect(isReaction('compris')).toBe(false)
    expect(isReaction(null)).toBe(false)
  })
})

describe('Sondage éclair', () => {
  it('reconnaît les quatre messages, et rien d’autre', () => {
    expect(isPollMessage({ type: 'open', poll: sondage })).toBe(true)
    expect(isPollMessage({ type: 'ask' })).toBe(true)
    expect(isPollMessage({ type: 'delete' })).toBe(false)
    expect(isPollMessage(42)).toBe(false)
  })

  it('refuse un sondage mal formé', () => {
    expect(validPoll(sondage)).toBe(true)
    expect(validPoll({ ...sondage, options: ['Seule'] })).toBe(false)
    expect(validPoll({ ...sondage, options: ['a', 'b', 'c', 'd', 'e'] })).toBe(false)
    expect(validPoll({ ...sondage, options: ['a', 3] })).toBe(false)
    expect(validPoll({ ...sondage, results: [1, 2] })).toBe(false)
    expect(validPoll({ ...sondage, results: [1, -2, 0] })).toBe(false)
    expect(validPoll({ ...sondage, results: [1, 2, 0] })).toBe(true)
  })

  it('ne compte un vote que pour le sondage ouvert, et une réponse qui existe', () => {
    expect(acceptedVote(sondage, false, { pollId: 'p1', option: 1 })).toBe(1)
    expect(acceptedVote(sondage, true, { pollId: 'p1', option: 1 })).toBeNull()
    expect(acceptedVote(sondage, false, { pollId: 'ancien', option: 1 })).toBeNull()
    expect(acceptedVote(sondage, false, { pollId: 'p1', option: 3 })).toBeNull()
    expect(acceptedVote(sondage, false, { pollId: 'p1', option: -1 })).toBeNull()
    expect(acceptedVote(sondage, false, { pollId: 'p1', option: 1.5 })).toBeNull()
    expect(acceptedVote(sondage, false, { pollId: 'p1', option: '1' })).toBeNull()
    expect(acceptedVote(null, false, { pollId: 'p1', option: 0 })).toBeNull()
  })

  it('compte une voix par personne, la dernière remplaçant la première', () => {
    const votes = new Map<string, number>()
    votes.set('aminata', 0)
    votes.set('koffi', 2)
    votes.set('aminata', 1) // Aminata change d'avis.
    expect(tallyVotes(sondage, votes)).toEqual([0, 1, 1])
  })

  it('donne des pourcentages, à zéro quand personne n’a voté', () => {
    expect(percents([0, 0, 0])).toEqual([0, 0, 0])
    expect(percents([1, 1, 2])).toEqual([25, 25, 50])
  })
})
