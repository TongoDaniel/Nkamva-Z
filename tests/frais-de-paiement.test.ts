// Modèle économique v1.1, section « Frais de paiement » : l'exemple chiffré du
// document doit sortir du calcul au franc près.
import { describe, expect, it } from 'vitest'
import { quoteBuyerFees, cheapestMobileFee } from '@/lib/payment-fees'
import { PLATFORM_COMMISSION_RATE, PRO_COMMISSION_RATE } from '@/lib/commission'

const MTN_TRAINER = { kind: 'MOBILE_MONEY' as const, operator: 'MTN_MOMO' }

describe('frais payés par l’acheteur (modèle v1.1)', () => {
  it('plan de base, produit à 20 000 FCFA : MTN ~20 595, Orange ~20 599, carte ~21 506', () => {
    const base = { priceFcfa: 20_000, commissionRate: PLATFORM_COMMISSION_RATE, payoutTarget: MTN_TRAINER }
    const mtn = quoteBuyerFees({ ...base, method: { kind: 'MOBILE_MONEY', provider: 'MTN_MOMO_CMR' } })
    const orange = quoteBuyerFees({ ...base, method: { kind: 'MOBILE_MONEY', provider: 'ORANGE_CMR' } })
    const card = quoteBuyerFees({ ...base, method: { kind: 'CARD' } })

    expect(mtn.trainerNetFcfa).toBe(18_000)
    expect(mtn.commissionFcfa).toBe(2_000)
    expect(mtn.totalFcfa).toBe(20_595)
    expect(orange.totalFcfa).toBe(20_599)
    expect(card.totalFcfa).toBe(21_506)
    expect(mtn.buyerFeeFcfa).toBe(595)
    expect(mtn.payoutFeeFcfa + mtn.collectionFeeFcfa).toBe(mtn.buyerFeeFcfa)
  })

  it('plan Pro : le formateur reçoit 19 400 FCFA, l’acheteur MTN paie ~20 613', () => {
    const pro = quoteBuyerFees({
      priceFcfa: 20_000, commissionRate: PRO_COMMISSION_RATE, payoutTarget: MTN_TRAINER,
      method: { kind: 'MOBILE_MONEY', provider: 'MTN_MOMO_CMR' },
    })
    expect(pro.trainerNetFcfa).toBe(19_400)
    expect(pro.commissionFcfa).toBe(600)
    // Le modèle arrondit à ~20 613 ; l'arrondi vers le haut donne au plus 1 franc de plus.
    expect(pro.totalFcfa - 20_613).toBeGreaterThanOrEqual(0)
    expect(pro.totalFcfa - 20_613).toBeLessThanOrEqual(1)
  })

  it('les frais couvrent toujours l’encaissement et le retrait (aucune perte pour NKAMVA)', () => {
    for (const price of [500, 999, 5_000, 12_345, 250_000]) {
      for (const provider of ['MTN_MOMO_CMR', 'ORANGE_CMR', 'INCONNU_XYZ']) {
        const q = quoteBuyerFees({
          priceFcfa: price, commissionRate: PLATFORM_COMMISSION_RATE, payoutTarget: null,
          method: { kind: 'MOBILE_MONEY', provider },
        })
        const rate = provider === 'MTN_MOMO_CMR' ? 0.0175 : provider === 'ORANGE_CMR' ? 0.0177 : 0.045
        const keptAfterCollection = q.totalFcfa * (1 - rate)
        expect(keptAfterCollection).toBeGreaterThanOrEqual(price + q.payoutFeeFcfa - 1e-6)
        expect(q.payoutFeeFcfa).toBeGreaterThanOrEqual(q.trainerNetFcfa * 0.013 - 1e-6)
      }
    }
  })

  it('un prix nul ne porte aucun frais', () => {
    const q = quoteBuyerFees({
      priceFcfa: 0, commissionRate: PLATFORM_COMMISSION_RATE, payoutTarget: null,
      method: { kind: 'CARD' },
    })
    expect(q.totalFcfa).toBe(0)
    expect(q.buyerFeeFcfa).toBe(0)
  })

  it('l’annonce de la page produit retient le moyen mobile le moins cher', () => {
    const q = cheapestMobileFee({ priceFcfa: 20_000, commissionRate: PLATFORM_COMMISSION_RATE, payoutTarget: MTN_TRAINER })
    expect(q.totalFcfa).toBe(20_595)
  })
})
