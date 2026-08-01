// ==========================================================================
// Garde-fou : l'environnement de test doit rester hermétique
// ==========================================================================
// Le .env de dev porte des secrets RÉELS (Resend actif, R2 production, Stripe).
// Si l'un d'eux fuit dans une exécution de tests, la suite enverrait de vrais
// emails, écrirait dans le bucket de production ou appellerait l'API Stripe.
// Ce fichier échoue AVANT que ça n'arrive.
// ==========================================================================

import { describe, it, expect } from 'vitest'
import './setup'

describe('environnement de test', () => {
  it('aucune clé de service externe n\'est active', () => {
    for (const key of [
      'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY',
      'CINETPAY_API_KEY', 'CINETPAY_SITE_ID',
      'RESEND_API_KEY',
      'R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET_KEY',
    ]) {
      expect(process.env[key], `${key} doit être neutralisée pendant les tests`).toBeFalsy()
      // `delete` mal restauré produit la chaîne "undefined", qui est truthy
      // mais passerait un simple test de nullité côté code applicatif.
      expect(process.env[key]).not.toBe('undefined')
    }
  })

  it('la base visée est bien une base de test, jamais la base de dev', () => {
    expect(process.env.DATABASE_URL).toBeTruthy()
    expect(process.env.DATABASE_URL).toMatch(/_test(\?|$)/)
  })
})
