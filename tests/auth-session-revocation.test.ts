import { describe, it, expect } from 'vitest'
import { isRevoked } from '@/lib/auth'

/**
 * Régression : `iat` est en secondes entières, `sessionsValidAfter` en
 * millisecondes. Une comparaison directe rejetait un jeton pourtant émis
 * après l'invalidation, dès que celle-ci portait une fraction de seconde.
 */
describe('isRevoked', () => {
  const at = (iso: string) => new Date(iso).toISOString()

  it('accepte un jeton émis dans la même seconde que l’invalidation', () => {
    // Inscription à 20:15:01.229, connexion à 20:15:01.9 → iat = 20:15:01.
    const iat = Math.floor(new Date('2026-07-31T20:15:01.900Z').getTime() / 1000)
    expect(isRevoked(iat, at('2026-07-31T20:15:01.229Z'))).toBe(false)
  })

  it('accepte un jeton émis après l’invalidation', () => {
    const iat = Math.floor(new Date('2026-07-31T20:15:05.000Z').getTime() / 1000)
    expect(isRevoked(iat, at('2026-07-31T20:15:01.229Z'))).toBe(false)
  })

  it('révoque un jeton émis avant l’invalidation', () => {
    const iat = Math.floor(new Date('2026-07-31T20:14:59.000Z').getTime() / 1000)
    expect(isRevoked(iat, at('2026-07-31T20:15:01.229Z'))).toBe(true)
  })

  it('révoque encore après un changement de mot de passe plus ancien d’une seconde', () => {
    const iat = Math.floor(new Date('2026-07-31T20:15:00.999Z').getTime() / 1000)
    expect(isRevoked(iat, at('2026-07-31T20:15:01.000Z'))).toBe(true)
  })
})
