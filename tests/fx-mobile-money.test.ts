// ==========================================================================
// Change et devise d'encaissement
// ==========================================================================
// La devise était figée à XAF dans l'adaptateur PawaPay : hors zone franc, la
// capacité de l'opérateur était cherchée dans une devise qu'il n'annonce pas,
// et l'achat échouait en `PROVIDER_NOT_SUPPORTED` quel que soit le contenu de
// la table des opérateurs. Ces tests tiennent la frontière FCFA → devise locale.
//
// Ce qui n'est pas testé ici, faute de fournisseur joignable : la résolution
// d'opérateur elle-même, qui lit `/v2/active-conf`. `tests/setup.ts` neutralise
// `PAWAPAY_API_TOKEN`, et c'est voulu — la suite ne doit appeler personne. Elle
// est éprouvée par `scripts/smoke-pawapay.ts`, contre le bac à sable.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  convertFromFcfa, fxRate, isParWithPlatform, setFxRate, settleAmount,
  payableProvidersForUser, configuredFxRates,
} from '@/lib/fx'
import { assertWithinBounds, formatAmount, type ResolvedProvider } from '@/lib/pawapay'

/** Opérateur factice : la forme que `/v2/active-conf` rendrait. */
function provider(currency: string, over: Partial<ResolvedProvider> = {}): ResolvedProvider {
  return {
    provider: `TEST_${currency}`,
    displayName: 'Test',
    countryCode: 'CM',
    prefix: '237',
    currency,
    operation: {
      minAmount: '10',
      maxAmount: '1000000',
      decimalsInAmount: 'NONE',
      status: 'OPERATIONAL',
    },
    ...over,
  }
}

describe('Change et devise d’encaissement', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it('le franc CFA est à parité fixe, sans taux à administrer', async () => {
    // XAF et XOF valent l'un pour l'autre depuis 1945 : un taux saisi à la main
    // ne pourrait qu'introduire une erreur.
    expect(isParWithPlatform('XAF')).toBe(true)
    expect(isParWithPlatform('XOF')).toBe(true)
    expect(isParWithPlatform('TZS')).toBe(false)

    expect(await fxRate('XAF')).toBe(1)
    expect(await fxRate('XOF')).toBe(1)

    const converted = await convertFromFcfa(15_000, 'XOF', 'NONE')
    expect(converted.amount).toBe('15000')
    expect(converted.rate).toBe(1)
  })

  it('une devise sans taux ne se devine pas : elle refuse', async () => {
    expect(await fxRate('TZS')).toBeNull()
    await expect(convertFromFcfa(15_000, 'TZS', 'NONE')).rejects.toThrow('FX_RATE_MISSING')
  })

  it('un taux illisible est une erreur, pas une absence', async () => {
    // Traité comme « pas de taux », le pays paraîtrait simplement fermé et
    // personne ne verrait la faute de saisie.
    await prisma.fxRate.create({ data: { currency: 'TZS', unitsPerXaf: 0 } })
    await expect(fxRate('TZS')).rejects.toThrow('FX_RATE_INVALID')
  })

  it('convertit et arrondit selon les décimales admises par la devise', async () => {
    await setFxRate('TZS', 4.3, null)
    const shillings = await convertFromFcfa(15_000, 'TZS', 'NONE')
    expect(shillings).toMatchObject({ amount: '64500', currency: 'TZS', rate: 4.3 })

    // Deux décimales : le montant ne doit pas partir en flottant brut.
    await setFxRate('USD', 0.0016, null)
    const dollars = await convertFromFcfa(15_000, 'USD', 'TWO_PLACES')
    expect(dollars.amount).toBe('24.00')
  })

  it('refuse de poser un taux sur une devise à parité fixe, ou un taux nul', async () => {
    await expect(setFxRate('XOF', 1, null)).rejects.toThrow('FX_RATE_NOT_APPLICABLE')
    await expect(setFxRate('TZS', 0, null)).rejects.toThrow('FX_RATE_INVALID')
    await expect(setFxRate('TZS', -3, null)).rejects.toThrow('FX_RATE_INVALID')
  })

  it('le taux se corrige sans créer de doublon, et garde son auteur', async () => {
    const admin = await prisma.user.create({ data: { email: 'admin-fx@test.com', role: 'ADMIN' } })
    await setFxRate('KES', 0.22, admin.id)
    await setFxRate('KES', 0.24, admin.id)

    const rows = await configuredFxRates()
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].unitsPerXaf)).toBe(0.24)
    const stored = await prisma.fxRate.findUniqueOrThrow({ where: { currency: 'KES' } })
    expect(stored.updatedById).toBe(admin.id)
  })

  it('choisit la première devise de l’opérateur pour laquelle un taux existe', async () => {
    // Airtel et Orange en RDC encaissent en CDF **et** en USD. Ouvrir le pays
    // ne doit pas exiger de renseigner les deux.
    const candidates = [provider('CDF'), provider('USD', {
      operation: { minAmount: '0.1', maxAmount: '2500', decimalsInAmount: 'TWO_PLACES', status: 'OPERATIONAL' },
    })]

    await expect(settleAmount(candidates, 15_000)).rejects.toThrow('FX_RATE_MISSING')

    await setFxRate('USD', 0.0016, null)
    const { provider: chosen, converted } = await settleAmount(candidates, 15_000)
    expect(chosen.currency).toBe('USD')
    expect(converted.amount).toBe('24.00')

    // Le taux local posé, c'est lui qui l'emporte : il vient en premier.
    await setFxRate('CDF', 4.6, null)
    const local = await settleAmount(candidates, 15_000)
    expect(local.provider.currency).toBe('CDF')
    expect(local.converted.amount).toBe('69000')
  })

  it('les bornes de l’opérateur se comparent dans SA devise', async () => {
    // C'est le défaut de fond : 15 000 FCFA valent 64 500 TZS, et les bornes
    // annoncées par Vodacom sont en TZS. Comparer les FCFA aux bornes revenait
    // à confronter des francs à des shillings.
    const tzs = provider('TZS', {
      operation: { minAmount: '100', maxAmount: '5000000', decimalsInAmount: 'NONE', status: 'OPERATIONAL' },
    })
    expect(() => assertWithinBounds(tzs, formatAmount(64_500, 'NONE'))).not.toThrow()
    expect(() => assertWithinBounds(tzs, '50')).toThrow('AMOUNT_BELOW_PROVIDER_MINIMUM')
    expect(() => assertWithinBounds(tzs, '9000000')).toThrow('AMOUNT_ABOVE_PROVIDER_MAXIMUM')
  })

  it('un opérateur fermé se refuse avant l’appel, pas après le rejet', async () => {
    const closed = provider('XAF', {
      operation: { minAmount: '1', maxAmount: '1000000', decimalsInAmount: 'NONE', status: 'CLOSED' },
    })
    expect(() => assertWithinBounds(closed, '15000')).toThrow('PROVIDER_TEMPORARILY_UNAVAILABLE')
  })

  it('sans fournisseur configuré, l’écran de paiement ne propose aucun opérateur', async () => {
    // `tests/setup.ts` neutralise le jeton : la liste doit être vide, et surtout
    // ne pas lever — la carte bancaire reste proposée sur le même écran.
    const learner = await prisma.user.create({ data: { email: 'apprenant-fx@test.com', role: 'LEARNER' } })
    await expect(payableProvidersForUser(learner.id)).resolves.toEqual([])
  })

  it('formate le montant, et refuse ce qui n’est pas un montant', () => {
    expect(formatAmount(15_000, 'NONE')).toBe('15000')
    expect(formatAmount(15_000.4, 'NONE')).toBe('15000')
    expect(formatAmount(15_000.6, 'NONE')).toBe('15001')
    expect(formatAmount(24, 'TWO_PLACES')).toBe('24.00')
    expect(() => formatAmount(0, 'NONE')).toThrow('INVALID_AMOUNT')
    expect(() => formatAmount(-1, 'TWO_PLACES')).toThrow('INVALID_AMOUNT')
    // Arrondi à zéro : un montant qui disparaît ne doit pas partir chez le
    // fournisseur comme un « 0 » silencieux.
    expect(() => formatAmount(0.2, 'NONE')).toThrow('INVALID_AMOUNT')
  })
})
