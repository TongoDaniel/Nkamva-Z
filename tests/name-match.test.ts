// ==========================================================================
// Décision 22a — normalisation et comparaison de noms
// ==========================================================================
// Ce module ne touche pas la base : ce sont des tests purs, et c'est voulu.
// La comparaison est le seul endroit où une erreur silencieuse ferait verser
// des revenus sur le compte de quelqu'un d'autre.
// ==========================================================================

import { describe, it, expect } from 'vitest'
import { normalizeName, normalizedLabel, compareNames } from '@/lib/name-match'

describe('normalizeName', () => {
  it('ignore la casse et les accents', () => {
    expect(normalizedLabel('Yao KOUAMÉ')).toBe(normalizedLabel('yao kouame'))
  })

  it('ne coupe pas un mot accentué en deux', () => {
    // Sans le retrait explicite des diacritiques, « Béatrice » deviendrait
    // « be » + « atrice » et ne correspondrait plus à « Beatrice ».
    expect(normalizeName('Béatrice')).toEqual(['beatrice'])
  })

  it('sépare sur l\'apostrophe et le trait d\'union', () => {
    expect(normalizeName('Ndiaye-Fall')).toEqual(['fall', 'ndiaye'])
    expect(normalizeName("d'Almeida")).toEqual(['almeida', 'd'])
  })

  it('retire les formes juridiques et les mots vides', () => {
    expect(normalizeName('Sarr Formation SARL')).toEqual(['formation', 'sarr'])
    expect(normalizeName('Les Ateliers de Sarr')).toEqual(['ateliers', 'sarr'])
  })

  it('trie les jetons — l\'ordre des mots ne compte pas', () => {
    expect(normalizeName('Awa Sarr')).toEqual(normalizeName('Sarr Awa'))
  })
})

describe('compareNames', () => {
  it('rapproche les écritures d\'une même entité', () => {
    expect(compareNames('Awa Sarr', 'SARR  awa')).toBe('MATCH')
    expect(compareNames('Sarr Formation', 'SARL Sarr Formation')).toBe('MATCH')
    expect(compareNames('Yao Kouamé', 'YAO KOUAME')).toBe('MATCH')
  })

  it('refuse un sous-ensemble : ce sont deux entités distinctes', () => {
    // C'est le cas dangereux : « Sarr Formation Digitale » n'est pas
    // « Sarr Formation », et confondre les deux ferait payer le mauvais compte.
    expect(compareNames('Sarr Formation', 'Sarr Formation Digitale')).toBe('MISMATCH')
    expect(compareNames('Awa Sarr', 'Awa Sarr Diop')).toBe('MISMATCH')
  })

  it('refuse un nom absent ou vide', () => {
    expect(compareNames(null, 'Awa Sarr')).toBe('MISMATCH')
    expect(compareNames('Awa Sarr', undefined)).toBe('MISMATCH')
    expect(compareNames('   ', 'Awa Sarr')).toBe('MISMATCH')
    // Une chaîne qui ne contient qu'une forme juridique ne désigne personne.
    expect(compareNames('SARL', 'SARL')).toBe('MISMATCH')
  })

  it('ne se laisse pas berner par la ponctuation ou les espaces', () => {
    expect(compareNames('Sarr, Awa.', 'awa   sarr')).toBe('MATCH')
  })
})
