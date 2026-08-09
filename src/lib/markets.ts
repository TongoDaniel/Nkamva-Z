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
import { payableCurrencies } from './fx'
// La table des noms vit dans `payment-input`, importable par le navigateur :
// ce module-ci traîne Prisma et ne peut pas franchir la frontière client.
import { countryName } from './payment-input'

export { countryName }



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
 *
 * ⚠️ Le `try` ne couvre que la lecture de la configuration. Il englobait aussi
 * la boucle des devises, si bien qu'une seule d'entre elles en échec vidait la
 * page entière : la bande de paiement et les sept pays de la zone franc ont
 * disparu de l'accueil parce que la devise congolaise, plus loin dans la
 * boucle, ne pouvait pas être lue. Une devise en échec ferme cette devise, et
 * elle seule.
 */
export async function payableMarkets(): Promise<PayableMarkets> {
  if (!isPawaPayConfigured()) return EMPTY

  let conf: Awaited<ReturnType<typeof activeConfiguration>>
  try {
    conf = await activeConfiguration()
  } catch {
    return EMPTY
  }

  // Une seule lecture des taux pour toute la boucle : la version précédente
  // interrogeait la base par devise et par pays, soit une trentaine de requêtes
  // au rendu de l'accueil.
  const payable = await payableCurrencies().catch(() => new Set<string>())

  const countries = new Map<string, string>()
  const brands = new Set<string>()

  for (const country of conf.countries ?? []) {
    const code = countryFromPawaPay(country.country)
    if (!code) continue
    for (const provider of country.providers ?? []) {
      for (const entry of provider.currencies ?? []) {
        if (!entry.operationTypes?.DEPOSIT) continue
        // Le filtre qui compte : sans taux, ce pays n'encaisse pas.
        if (!payable.has(entry.currency.toUpperCase())) continue
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
}
