// ==========================================================================
// L'horodatage d'une liste de conversations
// ==========================================================================
// `fmtRelative` répond à « depuis quand » — ce qui intéresse un fil qu'on lit.
// Une liste répond à « quand » : deux lignes à « il y a 2 h » et « il y a 3 h »
// ne se rangent pas dans une journée, 14:05 et 13:10 si.
//
// La règle qui compte, et qu'aucun écart d'heures ne donne : la comparaison
// porte sur le **jour calendaire**. Un message de 23 h 50 doit dire « Hier » à
// 0 h 10, pas « il y a 20 minutes ».

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fmtListStamp } from '@/lib/format'

/** Un mardi à midi, heure locale — le jour de semaine sert aux cas « cette semaine ». */
const MAINTENANT = new Date(2026, 8, 8, 12, 0, 0)

describe("Horodatage d'une liste de conversations", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(MAINTENANT)
  })
  afterEach(() => vi.useRealTimers())

  it("affiche l'heure pour aujourd'hui", () => {
    expect(fmtListStamp(new Date(2026, 8, 8, 9, 5))).toBe('09:05')
  })

  it('affiche l\'heure même pour un message d\'il y a une minute', () => {
    // « à l'instant » n'aide pas à situer une ligne parmi d'autres.
    expect(fmtListStamp(new Date(2026, 8, 8, 11, 59))).toBe('11:59')
  })

  it('dit « Hier » pour la veille', () => {
    expect(fmtListStamp(new Date(2026, 8, 7, 18, 30))).toBe('Hier')
  })

  it('dit « Hier » à minuit passé, pour un message de la veille au soir', () => {
    // Le cas qui distingue un calcul de **jours** d'un calcul d'**heures** :
    // vingt minutes d'écart, et pourtant deux jours différents.
    vi.setSystemTime(new Date(2026, 8, 9, 0, 10))
    expect(fmtListStamp(new Date(2026, 8, 8, 23, 50))).toBe('Hier')
  })

  it("garde l'heure pour un message de ce matin très tôt", () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 50))
    expect(fmtListStamp(new Date(2026, 8, 8, 0, 10))).toBe('00:10')
  })

  it('nomme le jour dans la semaine écoulée', () => {
    // Vendredi 4 septembre 2026, quatre jours plus tôt.
    expect(fmtListStamp(new Date(2026, 8, 4, 15, 0))).toBe('Vendredi')
  })

  it('passe à la date au-delà de six jours', () => {
    expect(fmtListStamp(new Date(2026, 8, 1, 15, 0))).toBe('01/09/26')
  })

  it('rend une date pour un message ancien', () => {
    expect(fmtListStamp(new Date(2025, 11, 24, 20, 0))).toBe('24/12/25')
  })

  it('rend null sans valeur, et sur une date invalide', () => {
    expect(fmtListStamp(null)).toBeNull()
    expect(fmtListStamp(undefined)).toBeNull()
    expect(fmtListStamp('pas une date')).toBeNull()
  })

  it('accepte une chaîne ISO comme le serveur la rend', () => {
    const iso = new Date(2026, 8, 8, 10, 30).toISOString()
    expect(fmtListStamp(iso)).toBe('10:30')
  })
})
