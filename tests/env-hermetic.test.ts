// ==========================================================================
// Garde-fou : l'environnement de test doit rester hermétique
// ==========================================================================
// Le .env de dev porte des secrets RÉELS (Resend actif, stockage objet, Stripe,
// LiveKit). Si l'un d'eux fuit dans une exécution de tests, la suite enverrait
// de vrais emails, écrirait dans le seau de production, appellerait l'API
// Stripe ou ouvrirait de vraies salles de visioconférence facturées.
// Ce fichier échoue AVANT que ça n'arrive.
//
// ⚠️ Cette liste doit suivre les **vrais noms** de variables. Elle a listé
// `R2_*` pendant que le stockage s'appelait `AWS_*` : elle passait au vert sans
// rien protéger. Un garde-fou qui vise à côté est pire que pas de garde-fou.
// ==========================================================================

import { describe, it, expect } from 'vitest'
import './setup'

describe('environnement de test', () => {
  it('aucune clé de service externe n\'est active', () => {
    for (const key of [
      'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY',
      'CINETPAY_API_KEY', 'CINETPAY_SITE_ID',
      'RESEND_API_KEY',
      'AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
      'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
      'MUX_TOKEN_ID', 'MUX_TOKEN_SECRET',
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
