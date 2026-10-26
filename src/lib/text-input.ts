// ==========================================================================
// Champs de texte reçus par les routes — normalisation et contrôles serveur
// ==========================================================================
// Les formulaires posent `noValidate` et contrôlent côté client
// (`lib/validation.ts`), mais une route ne peut pas compter sur son formulaire :
// la campagne du 12 octobre 2026 a envoyé directement au serveur ce que les
// écrans n'auraient jamais laissé passer.
//
//   · m1  — un nom légal fait de deux espaces, accepté à l'approbation puis
//           recopié sur le moyen de paiement ;
//   · m2  — `websiteUrl: "javascript:alert(1)"`, accepté puis rendu en `href` ;
//   · m4  — titre, résumé, description, catégorie faits d'espaces ;
//   · m13 — pays « ZZ » et « 42 » acceptés à l'inscription et au profil ;
//   · m15 — « ​​​A » (trois caractères de largeur nulle) franchit le minimum de
//           deux lettres, et `Admin‮gnp.exe` s'affiche « Adminexe.png » ;
//   · m21 — un message d'un seul caractère invisible.
//
// Une seule règle les couvre : on retire ce qui ne s'affiche pas et ce qui
// retourne le sens du texte, on élague les espaces, **puis** on mesure.
// ==========================================================================

import { z } from 'zod'
import { isValidUrl, URL_ERROR } from './validation'

/** Caractères de largeur nulle et trait d'union conditionnel : ils ne s'affichent pas. */
const INVISIBLE = /[​-‍⁠﻿­]/g

/**
 * Contrôles de direction : ils retournent l'affichage d'une partie du texte.
 * Dans un nom, c'est un outil d'usurpation, pas une mise en forme.
 */
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/g

export function cleanText(value: string): string {
  return value.replace(INVISIBLE, '').replace(BIDI_CONTROLS, '').trim()
}

/** Un texte nettoyé, dont la longueur se mesure **après** nettoyage. */
export function textField(min: number, max: number) {
  return z.string().transform(cleanText).pipe(z.string().min(min).max(max))
}

/**
 * Comme `textField`, et doit contenir au moins une lettre : une catégorie
 * « 💩 » ou un titre fait de ponctuation n'identifie rien (m4, m5).
 */
export function wordsField(min: number, max: number) {
  return textField(min, max).refine((v) => /\p{L}/u.test(v), { message: 'Doit contenir au moins une lettre' })
}

/**
 * Adresse web en http ou https uniquement. `z.string().url()` acceptait
 * `javascript:` — c'est `new URL()` qui le fait, et `isValidUrl` le refuse (m2).
 */
export function httpUrlField(max: number) {
  return z.string().trim().max(max).refine(isValidUrl, { message: URL_ERROR })
}

/**
 * Codes ISO 3166-1 réservés à un usage privé ou désignant un ensemble, pas un
 * pays : `Intl` leur donne un nom, mais personne n'y habite.
 */
const NOT_A_COUNTRY = new Set(['AA', 'EU', 'EZ', 'UN', 'ZZ'])
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** Un code pays à deux lettres qui désigne un pays existant (m13). */
export function isCountryCode(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code)) return false
  if (NOT_A_COUNTRY.has(code) || /^(Q[M-Z]|X[A-Z])$/.test(code)) return false
  const name = regionNames.of(code)
  return name !== undefined && name !== code && name !== 'Unknown Region'
}

export function countryCodeField() {
  return z.string().trim().toUpperCase().refine(isCountryCode, { message: 'Code pays inconnu' })
}
