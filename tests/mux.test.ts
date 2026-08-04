// ==========================================================================
// Mux — vérification de signature des webhooks
// ==========================================================================
// Un webhook non authentifié peut marquer n'importe quel replay comme prêt,
// avec n'importe quelle vidéo. C'est la seule porte d'entrée non authentifiée
// de ce chantier : elle mérite ses tests.

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import './setup'
import { verifyWebhookSignature } from '@/lib/mux'

const SECRET = 'secret-de-test'
const BODY = JSON.stringify({ type: 'video.asset.ready', data: { id: 'asset_1' } })

function sign(body: string, secret = SECRET, timestamp = '1785840000'): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `t=${timestamp},v1=${mac}`
}

describe('Webhook Mux', () => {
  it('accepte une signature valide', () => {
    process.env.MUX_WEBHOOK_SECRET = SECRET
    try {
      expect(verifyWebhookSignature(BODY, sign(BODY))).toBe(true)
    } finally {
      process.env.MUX_WEBHOOK_SECRET = ''
    }
  })

  it('refuse un corps modifié après signature', () => {
    process.env.MUX_WEBHOOK_SECRET = SECRET
    try {
      const header = sign(BODY)
      const tampered = JSON.stringify({ type: 'video.asset.ready', data: { id: 'asset_pirate' } })
      expect(verifyWebhookSignature(tampered, header)).toBe(false)
    } finally {
      process.env.MUX_WEBHOOK_SECRET = ''
    }
  })

  it('refuse une signature d\'un autre secret', () => {
    process.env.MUX_WEBHOOK_SECRET = SECRET
    try {
      expect(verifyWebhookSignature(BODY, sign(BODY, 'autre-secret'))).toBe(false)
    } finally {
      process.env.MUX_WEBHOOK_SECRET = ''
    }
  })

  it('refuse quand aucun secret n\'est configuré', () => {
    // Le sens du refus compte : sans secret, on n'accepte pas « faute de mieux ».
    process.env.MUX_WEBHOOK_SECRET = ''
    expect(verifyWebhookSignature(BODY, sign(BODY))).toBe(false)
  })

  it('refuse un en-tête absent ou malformé', () => {
    process.env.MUX_WEBHOOK_SECRET = SECRET
    try {
      expect(verifyWebhookSignature(BODY, null)).toBe(false)
      expect(verifyWebhookSignature(BODY, 'n_importe_quoi')).toBe(false)
      expect(verifyWebhookSignature(BODY, 't=1785840000')).toBe(false)
    } finally {
      process.env.MUX_WEBHOOK_SECRET = ''
    }
  })
})
