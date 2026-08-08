// ==========================================================================
// Marchés servis — ce que la plateforme peut réellement encaisser
// ==========================================================================
// La page d'accueil annonçait « Cameroun · Sénégal · Côte d'Ivoire · Bénin ·
// Mali · Burkina Faso · Togo · Gabon · RDC · Kenya » et cinq marques dont Wave.
// C'était une liste écrite à la main, jamais confrontée au fournisseur : le Mali
// et le Togo ne figurent nulle part dans la configuration du compte, le Kenya
// n'y a que M-Pesa, Wave n'est pas distribué par PawaPay, et la Tanzanie, le
// Malawi, la Zambie, le Ghana, le Rwanda, l'Ouganda et le Mozambique — qui, eux,
// y sont — n'étaient pas annoncés.
//
// Un pays n'est annoncé que s'il est **payable aujourd'hui** : distribué par le
// compte, et doté d'une devise dont le taux est administré (ou à parité fixe
// avec le FCFA). Annoncer un pays qu'un `FX_RATE_MISSING` bloquerait au moment
// de payer serait la même faute, déplacée d'un cran.
// ==========================================================================

import { activeConfiguration, countryFromPawaPay, isPawaPayConfigured } from './pawapay'
import { fxRate } from './fx'

/** Noms français des pays que PawaPay peut servir. Pure traduction de codes. */
const COUNTRY_NAMES: Record<string, string> = {
  BJ: 'Bénin',
  BF: 'Burkina Faso',
  CM: 'Cameroun',
  CI: "Côte d'Ivoire",
  CD: 'RDC',
  CG: 'Congo',
  GA: 'Gabon',
  GH: 'Ghana',
  KE: 'Kenya',
  ML: 'Mali',
  MW: 'Malawi',
  MZ: 'Mozambique',
  NG: 'Nigeria',
  RW: 'Rwanda',
  SN: 'Sénégal',
  SL: 'Sierra Leone',
  TZ: 'Tanzanie',
  TG: 'Togo',
  UG: 'Ouganda',
  ZM: 'Zambie',
}

export function countryName(alpha2: string): string {
  return COUNTRY_NAMES[alpha2.toUpperCase()] ?? alpha2.toUpperCase()
}

export interface PayableMarkets {
  /** Codes alpha-2, dans l'ordre alphabétique de leur nom français. */
  countries: { code: string; name: string }[]
  /** Marques commerciales distinctes, telles que PawaPay les nomme. */
  brands: string[]
}

const EMPTY: PayableMarkets = { countries: [], brands: [] }

/**
 * Ne lève jamais : la page d'accueil est publique et doit s'afficher même si le
 * fournisseur est injoignable. Dans ce cas elle n'annonce **rien** plutôt qu'une
 * liste périmée — c'est le seul repli honnête.
 */
export async function payableMarkets(): Promise<PayableMarkets> {
  if (!isPawaPayConfigured()) return EMPTY

  try {
    const conf = await activeConfiguration()
    const countries = new Map<string, string>()
    const brands = new Set<string>()

    for (const country of conf.countries ?? []) {
      const code = countryFromPawaPay(country.country)
      if (!code) continue
      for (const provider of country.providers ?? []) {
        for (const entry of provider.currencies ?? []) {
          if (!entry.operationTypes?.DEPOSIT) continue
          // Le filtre qui compte : sans taux, ce pays n'encaisse pas.
          if ((await fxRate(entry.currency)) === null) continue
          countries.set(code, countryName(code))
          brands.add(provider.displayName ?? provider.provider)
        }
      }
    }

    return {
      countries: [...countries]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      brands: [...brands].sort((a, b) => a.localeCompare(b, 'fr')),
    }
  } catch {
    return EMPTY
  }
}
