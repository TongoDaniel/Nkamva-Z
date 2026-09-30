import { describe, expect, it } from 'vitest'
import { operatorsLabel, type PayableProvider } from '@/lib/payment-input'

const op = (provider: string, displayName: string, countryCode: string): PayableProvider => ({
  provider,
  displayName,
  countryCode,
  prefix: '',
})

describe('operatorsLabel', () => {
  it('ne répète pas une marque présente dans plusieurs pays', () => {
    const label = operatorsLabel([
      op('MTN_MOMO_CMR', 'MTN', 'CM'),
      op('ORANGE_CMR', 'Orange', 'CM'),
      op('MTN_MOMO_BEN', 'MTN', 'BJ'),
      op('MOOV_BEN', 'Moov', 'BJ'),
      op('ORANGE_CIV', 'Orange', 'CI'),
    ])
    expect(label).toBe('MTN, Orange, Moov')
  })

  it("annonce l'absence plutôt qu'une ligne vide", () => {
    expect(operatorsLabel([])).toBe('Indisponible dans votre pays')
  })
})
