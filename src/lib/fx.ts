// ==========================================================================
// Change — du FCFA vers la devise d'encaissement
// ==========================================================================
// Les prix sont saisis, stockés et comptabilisés en FCFA (`amountFcfa`, wallet,
// commission, factures). PawaPay, lui, encaisse dans la devise du pays du
// payeur : un apprenant tanzanien paie en TZS, un kenyan en KES. Ce module est
// le seul endroit qui franchit cette frontière.
//
// **Aucun repli.** Une devise sans taux administré fait échouer l'achat avec
// `FX_RATE_MISSING`, elle ne prend pas un taux par défaut. C'est la règle du
// dépôt (voir `lib/pricing`, `lib/commission`) et l'inverse du patron qui a
// coûté cher ici : se dégrader en silence sur une configuration absente.
//
// **Aucun appel externe.** Un flux de taux dans le chemin critique du paiement,
// c'est une panne de plus entre l'apprenant et son achat. Les taux sont des
// valeurs administrées, au même titre que le prix d'un palier de stockage.
// ==========================================================================

import { db } from './db'
import {
  activeConfiguration, countryFromPawaPay, formatAmount, isPawaPayConfigured,
  providersForCountry, PLATFORM_CURRENCY, type ResolvedProvider,
} from './pawapay'
import type { PayableProvider } from './payment-input'

/**
 * Le franc CFA d'Afrique centrale (XAF) et celui de l'Ouest (XOF) sont à
 * **parité fixe** : 1 XAF = 1 XOF, par définition, depuis 1945. Ce n'est pas un
 * taux de change — il n'y a rien à administrer, rien à rafraîchir, et un taux
 * saisi à la main ne pourrait qu'introduire une erreur.
 */
const PAR_WITH_PLATFORM = new Set([PLATFORM_CURRENCY, 'XOF'])


export interface ConvertedAmount {
  /** Prêt à partir chez le fournisseur : déjà arrondi aux décimales admises. */
  amount: string
  currency: string
  /**
   * Unités de `currency` pour **un** FCFA. Vaut 1 en zone franc. Conservé avec
   * la transaction : sans lui, un remboursement ou un rapprochement ne peut pas
   * refaire le chemin inverse.
   */
  rate: number
}

export function isParWithPlatform(currency: string): boolean {
  return PAR_WITH_PLATFORM.has(currency.toUpperCase())
}

/**
 * Devises encaissables, en **une** requête.
 *
 * Les écrans qui listent parcourent tous les opérateurs de tous les pays : les
 * interroger devise par devise faisait une trentaine d'allers-retours en base
 * au rendu de la page d'accueil, pour lire au plus une dizaine de lignes.
 *
 * Un taux illisible n'entre pas dans l'ensemble : la devise est simplement
 * fermée. C'est délibérément plus tolérant que `fxRate`, qui lève — au moment
 * de payer, une saisie fautive doit se voir ; en vitrine, elle ne doit pas
 * emporter les autres pays avec elle.
 */
export async function payableCurrencies(): Promise<ReadonlySet<string>> {
  const rows = await db.fxRate.findMany({ select: { currency: true, unitsPerXaf: true } })
  const payable = new Set<string>(PAR_WITH_PLATFORM)
  for (const row of rows) {
    const rate = Number(row.unitsPerXaf)
    if (Number.isFinite(rate) && rate > 0) payable.add(row.currency.toUpperCase())
  }
  return payable
}

/**
 * Taux administré, ou `null`. Lit le réglage à chaque appel : un taux de change
 * est exactement le genre de valeur qu'on corrige en urgence, et un cache le
 * rendrait effectif « dans dix minutes ».
 */
export async function fxRate(currency: string): Promise<number | null> {
  const code = currency.toUpperCase()
  if (isParWithPlatform(code)) return 1

  const row = await db.fxRate.findUnique({
    where: { currency: code },
    select: { unitsPerXaf: true },
  })
  if (!row) return null

  const rate = Number(row.unitsPerXaf)
  // Un taux illisible ou nul n'est pas « pas de taux » : c'est une erreur de
  // saisie, et la traiter comme une absence la rendrait invisible — le pays
  // paraîtrait simplement fermé.
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('FX_RATE_INVALID')
  return rate
}

/**
 * Convertit un montant FCFA vers la devise d'encaissement.
 *
 * `decimals` vient de l'opérateur (`decimalsInAmount` dans `/v2/active-conf`) :
 * c'est lui qui dit si la devise admet des centimes, pas nous.
 */
export async function convertFromFcfa(
  amountFcfa: number,
  currency: string,
  decimals: 'NONE' | 'TWO_PLACES',
): Promise<ConvertedAmount> {
  if (!Number.isInteger(amountFcfa) || amountFcfa <= 0) throw new Error('INVALID_AMOUNT')

  const code = currency.toUpperCase()
  const rate = await fxRate(code)
  if (rate === null) throw new Error('FX_RATE_MISSING')

  return { amount: formatAmount(amountFcfa * rate, decimals), currency: code, rate }
}

/**
 * Choisit la devise de règlement parmi celles qu'un opérateur accepte, et
 * convertit.
 *
 * Certains opérateurs en annoncent deux — Airtel et Orange en RDC encaissent en
 * CDF **et** en USD. On retient la première pour laquelle un taux est
 * administré : c'est ce qui permet d'ouvrir un pays en ne renseignant qu'une
 * devise, sans avoir à choisir dans le code laquelle est « la bonne ».
 */
export async function settleAmount(
  candidates: ResolvedProvider[],
  amountFcfa: number,
): Promise<{ provider: ResolvedProvider; converted: ConvertedAmount }> {
  if (!candidates.length) throw new Error('PROVIDER_NOT_SUPPORTED')

  for (const provider of candidates) {
    const rate = await fxRate(provider.currency)
    if (rate === null) continue
    const converted = await convertFromFcfa(
      amountFcfa,
      provider.currency,
      provider.operation.decimalsInAmount,
    )
    return { provider, converted }
  }
  throw new Error('FX_RATE_MISSING')
}

/**
 * **Tous** les opérateurs encaissables, quel que soit le pays — ceux que le
 * compte marchand distribue et dont la devise a un taux administré.
 *
 * ⚠️ Cette liste ne se restreint **pas** au pays du profil, et c'est délibéré.
 * On paie avec un numéro, pas avec une adresse : un apprenant installé en France
 * règle très normalement avec son MTN camerounais. La version précédente
 * n'affichait que les opérateurs du `countryCode` du profil — avec un repli sur
 * le Cameroun quand il était vide — et rendait ce cas infaisable, alors même que
 * `openPawaPayDeposit` l'acceptait déjà : le code opérateur porte son pays, et
 * c'est lui qui fait autorité au moment du dépôt.
 *
 * Le pays du profil ne sert donc plus qu'à **ordonner** : ses opérateurs
 * d'abord, parce que c'est le cas courant.
 *
 * Le filtre sur la devise, lui, reste : proposer un opérateur sans taux mènerait
 * à un `FX_RATE_MISSING` après la saisie du numéro. Mieux vaut ne pas l'afficher.
 *
 * Ne lève jamais : une panne de `/v2/active-conf` doit dégrader l'écran de
 * paiement, pas le faire planter — la carte bancaire reste proposée.
 */
export async function payableProvidersForUser(userId: string): Promise<PayableProvider[]> {
  if (!isPawaPayConfigured()) return []

  const user = await db.user.findUnique({ where: { id: userId }, select: { countryCode: true } })
  const home = user?.countryCode ?? null

  try {
    const [conf, payable] = await Promise.all([activeConfiguration(), payableCurrencies()])
    const out: PayableProvider[] = []
    const seen = new Set<string>()

    for (const country of conf.countries ?? []) {
      const alpha2 = countryFromPawaPay(country.country)
      if (!alpha2) continue
      for (const provider of country.providers ?? []) {
        for (const entry of provider.currencies ?? []) {
          if (!entry.operationTypes?.DEPOSIT) continue
          if (!payable.has(entry.currency.toUpperCase())) continue
          // Un opérateur qui accepte deux devises (CDF et USD en RDC) ne doit
          // apparaître qu'une fois dans la liste.
          if (seen.has(provider.provider)) break
          seen.add(provider.provider)
          out.push({
            provider: provider.provider,
            displayName: provider.displayName ?? provider.provider,
            countryCode: alpha2,
            prefix: country.prefix,
          })
          break
        }
      }
    }

    // Le pays déclaré remonte en tête ; le reste garde l'ordre de PawaPay.
    return home ? out.sort((a, b) => Number(b.countryCode === home) - Number(a.countryCode === home)) : out
  } catch {
    return []
  }
}

/**
 * Ce qu'il faudrait renseigner pour ouvrir chaque pays : une ligne par devise
 * que le compte marchand peut encaisser, avec son taux s'il existe et les pays
 * qu'elle dessert.
 *
 * Les devises à parité fixe n'y figurent pas — elles n'ont rien à administrer.
 */
export async function fxCoverage(): Promise<
  { currency: string; countries: string[]; unitsPerXaf: string | null; updatedAt: Date | null }[]
> {
  const [conf, rates] = await Promise.all([
    activeConfiguration().catch(() => null),
    db.fxRate.findMany({ select: { currency: true, unitsPerXaf: true, updatedAt: true } }),
  ])
  const byCurrency = new Map(rates.map((r) => [r.currency, r]))
  const countriesOf = new Map<string, Set<string>>()

  for (const country of conf?.countries ?? []) {
    for (const provider of country.providers ?? []) {
      for (const entry of provider.currencies ?? []) {
        if (!entry.operationTypes?.DEPOSIT) continue
        if (isParWithPlatform(entry.currency)) continue
        const set = countriesOf.get(entry.currency) ?? new Set<string>()
        set.add(country.country)
        countriesOf.set(entry.currency, set)
      }
    }
  }

  return [...countriesOf]
    .map(([currency, countries]) => {
      const rate = byCurrency.get(currency)
      return {
        currency,
        countries: [...countries].sort(),
        unitsPerXaf: rate ? rate.unitsPerXaf.toString() : null,
        updatedAt: rate?.updatedAt ?? null,
      }
    })
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

/** Devises pour lesquelles un taux est administré — pour les écrans d'admin. */
export async function configuredFxRates(): Promise<
  { currency: string; unitsPerXaf: string; updatedAt: Date }[]
> {
  const rows = await db.fxRate.findMany({
    select: { currency: true, unitsPerXaf: true, updatedAt: true },
    orderBy: { currency: 'asc' },
  })
  return rows.map((r) => ({
    currency: r.currency,
    unitsPerXaf: r.unitsPerXaf.toString(),
    updatedAt: r.updatedAt,
  }))
}

/**
 * Pose ou corrige un taux. Passe par ici, et non par un `update` direct : le
 * contrôle de plage et la trace de l'auteur sont ce qui distingue un taux
 * administré d'une valeur qui apparaît un jour sans que personne sache d'où.
 */
export async function setFxRate(
  currency: string,
  unitsPerXaf: number,
  updatedById: string | null,
): Promise<void> {
  const code = currency.toUpperCase()
  if (isParWithPlatform(code)) throw new Error('FX_RATE_NOT_APPLICABLE')
  if (!Number.isFinite(unitsPerXaf) || unitsPerXaf <= 0) throw new Error('FX_RATE_INVALID')

  await db.fxRate.upsert({
    where: { currency: code },
    create: { currency: code, unitsPerXaf, updatedById },
    update: { unitsPerXaf, updatedById },
  })
}
