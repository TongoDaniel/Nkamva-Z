// ==========================================================================
// Mots de passe déjà fuités — Have I Been Pwned, par k-anonymat
// ==========================================================================
// Un mot de passe long mais déjà publié dans une fuite tombe au premier
// « credential stuffing » : l'attaquant ne devine rien, il rejoue une liste.
// Le plancher de longueur (lib/validation) ne voit pas ce cas ; ce contrôle si.
//
// Rien de secret ne sort : seuls les 5 premiers caractères de l'empreinte SHA-1
// partent vers l'API, qui renvoie toutes les empreintes commençant ainsi — des
// centaines — et la comparaison se fait ici. `Add-Padding` brouille en plus la
// taille de la réponse.
//
// Échec OUVERT, et c'est délibéré, contrairement aux gardes de session ou de
// paiement (cf. la règle du dépôt sur les variables de sécurité) : ce contrôle
// est une couche de conseil au-dessus d'un mot de passe déjà conforme. Bloquer
// inscriptions et réinitialisations parce qu'un service tiers ne répond pas
// fermerait la plateforme sans rien protéger de plus.
// ==========================================================================

import { createHash } from 'node:crypto'

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const TIMEOUT_MS = 2_500

/** Coupé par `PASSWORD_BREACH_CHECK=off` — les tests le posent pour rester hermétiques. */
function enabled(): boolean {
  return process.env.PASSWORD_BREACH_CHECK !== 'off'
}

/**
 * Vrai si le mot de passe figure dans une fuite connue. Faux s'il n'y figure
 * pas, **ou** si le service est injoignable (voir l'en-tête).
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (!enabled()) return false

  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = digest.slice(0, 5)
  const suffix = digest.slice(5)

  try {
    const res = await fetch(`${RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'NKAMVA-password-check' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn('[breached-password] réponse inattendue', res.status)
      return false
    }
    const body = await res.text()
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':')
      // Les lignes de remplissage portent un compte nul.
      if (hashSuffix === suffix && Number(count) > 0) return true
    }
    return false
  } catch (err) {
    console.warn('[breached-password] service injoignable, contrôle ignoré', err)
    return false
  }
}

export const BREACHED_PASSWORD_MESSAGE =
  'Ce mot de passe figure dans une fuite de données publique. Choisissez-en un autre.'
