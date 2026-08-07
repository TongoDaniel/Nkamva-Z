// ==========================================================================
// Écran d'état des intégrations — les sondes elles-mêmes
// ==========================================================================
// Deux propriétés valent des tests, parce que leur violation ne se verrait pas :
//
//   · une intégration non configurée ne doit produire AUCUN appel sortant. Sans
//     cette garantie, la suite de tests appellerait les vrais fournisseurs — et
//     l'écran, ouvert sur un déploiement à moitié rempli, attendrait six délais
//     d'expiration avant de s'afficher ;
//   · aucun secret ne doit ressortir dans le détail rendu. Un SDK qui recopie la
//     clé dans son message d'erreur la publierait sur un écran d'administration,
//     donc dans la prochaine capture d'écran envoyée au support.

import { describe, it, expect, vi, afterEach } from 'vitest'
import './setup'
import { probeIntegrations, countByState } from '@/lib/integrations'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  process.env.STRIPE_SECRET_KEY = ''
  process.env.STRIPE_WEBHOOK_SECRET = ''
  process.env.PAWAPAY_API_TOKEN = ''
})

describe('Sondes d\'intégration', () => {
  it('ne sort pas du processus quand rien n\'est configuré', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const report = await probeIntegrations()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(report.integrations).toHaveLength(6)
    // `absent` et non `down` : personne n'a rien cassé, la configuration manque.
    for (const integration of report.integrations) {
      expect(integration.state, integration.name).toBe('absent')
    }
    expect(countByState(report.integrations).absent).toBe(6)
  })

  it('distingue « configuré » de « accepté par le fournisseur »', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_cle_de_test_refusee'
    globalThis.fetch = vi.fn(async () =>
      new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 }),
    ) as unknown as typeof fetch

    const stripe = (await probeIntegrations()).integrations.find((i) => i.key === 'stripe')!

    // La clé est bien posée — et pourtant l'intégration est en échec. C'est
    // toute la raison d'être de l'écran.
    expect(stripe.env.find((e) => e.name === 'STRIPE_SECRET_KEY')?.present).toBe(true)
    expect(stripe.state).toBe('down')
    expect(stripe.checks.find((c) => c.label === 'Solde lisible')?.state).toBe('down')
  })

  it('signale le webhook Stripe non signé, qui crédite un corps non vérifié', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_cle_acceptee'
    globalThis.fetch = vi.fn(async () => new Response('{"object":"balance"}', { status: 200 })) as unknown as typeof fetch

    const stripe = (await probeIntegrations()).integrations.find((i) => i.key === 'stripe')!
    const signature = stripe.checks.find((c) => c.label === 'Signature des webhooks')!

    // Hors production, c'est le chemin de la simulation de développement : une
    // réserve, pas une panne. En production, ce serait `down`.
    expect(signature.state).toBe('warn')
    expect(signature.detail).toContain('NON SIGNÉ')

    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_secret_de_test'
    const signed = (await probeIntegrations()).integrations
      .find((i) => i.key === 'stripe')!
      .checks.find((c) => c.label === 'Signature des webhooks')!
    expect(signed.state).toBe('ok')
  })

  it('n\'écrit jamais la valeur d\'un secret dans le détail rendu', async () => {
    const secret = 'sk_test_valeur_qui_ne_doit_pas_fuiter'
    process.env.STRIPE_SECRET_KEY = secret
    // Le cas réel : un client qui recopie l'identifiant dans son message.
    globalThis.fetch = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED using key ${secret}`)
    }) as unknown as typeof fetch

    const stripe = (await probeIntegrations()).integrations.find((i) => i.key === 'stripe')!
    const rendered = JSON.stringify(stripe)

    expect(rendered).not.toContain(secret)
    expect(stripe.checks.find((c) => c.label === 'Solde lisible')?.detail).toContain('••••')
  })

  it('dit ce que l\'absence provoque, pour chaque fournisseur', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
    const report = await probeIntegrations()

    // Un écran d'état qui ne dirait que « absent » laisserait croire que les six
    // absences se valent. Elles ne se valent pas : sans Resend, les codes de
    // connexion ne partent plus ; sans LiveKit, seule la diffusion manque.
    for (const integration of report.integrations) {
      expect(integration.whenAbsent.length, integration.name).toBeGreaterThan(40)
    }
    expect(report.integrations.find((i) => i.key === 'resend')!.whenAbsent).toContain('EMAIL:DEV')
  })

  it('rend le raccourci de paiement visible, et son état réel', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch

    // `tests/setup.ts` le pose : la suite exerce les règles métier de l'achat,
    // pas le fournisseur. Il doit donc se voir comme actif ici.
    expect(process.env.ALLOW_PAYMENT_SIMULATION).toBe('1')
    const active = await probeIntegrations()
    expect(active.paymentSimulation.active).toBe(true)
    expect(active.paymentSimulation.detail).toContain('SANS paiement')

    process.env.ALLOW_PAYMENT_SIMULATION = ''
    try {
      const closed = await probeIntegrations()
      expect(closed.paymentSimulation.declared).toBe(false)
      expect(closed.paymentSimulation.active).toBe(false)
    } finally {
      process.env.ALLOW_PAYMENT_SIMULATION = '1'
    }
  })
})
