/**
 * Propose — et, sur demande explicite, écrit — les taux de `fx_rates`.
 *
 *   bun scripts/taux-de-change.ts                      # compare, n'écrit rien
 *   bun scripts/taux-de-change.ts --ecrire             # rafraîchit les taux existants
 *   bun scripts/taux-de-change.ts --ecrire --ouvrir    # ...et ouvre les marchés sans taux
 *
 * ── Pourquoi un script, alors que `lib/fx` interdit tout appel externe ──────
 *
 * L'interdiction porte sur le **chemin de paiement** : un flux de cotation
 * injoignable au moment où quelqu'un achète, c'est une panne de plus entre
 * l'apprenant et sa ressource (voir l'en-tête de `src/lib/fx.ts`).
 *
 * Ici, on est hors de ce chemin. Le script est lancé à la main, il propose des
 * valeurs, et c'est la table `fx_rates` — administrée, relue à chaque paiement —
 * qui reste la seule source au moment d'encaisser. Un flux muet ne fait donc rien
 * de pire que : pas de proposition aujourd'hui.
 *
 * ── Deux sources, et un refus en cas de désaccord ───────────────────────────
 *
 * Les devises africaines peu liquides sont mal cotées par les agrégateurs. Le
 * script en interroge deux et **refuse** toute devise dont les cours s'écartent
 * de plus de `ECART_MAX`. Une devise refusée n'est pas approximée : elle est
 * laissée telle quelle, quitte à ce que le pays reste fermé. C'est la règle du
 * dépôt — pas de repli silencieux.
 *
 * ── La marge n'est pas une marge commerciale ────────────────────────────────
 *
 * Elle ne couvre **pas** le spread de change de PawaPay : c'est mathématiquement
 * impossible depuis ce réglage, parce que le même taux sert à encaisser
 * (`purchases.ts`) *et* à reverser (`payouts.ts`) — majorer les deux ne protège
 * que les 15 % de commission. Le spread se neutralise en se faisant régler en
 * devise locale, pas ici.
 *
 * Ce que la marge couvre, c'est la **dérive entre deux passages** : le taux est
 * figé jusqu'à la prochaine exécution, la devise, non. Elle est donc calibrée sur
 * la volatilité de chaque devise et sur une revue mensuelle. Passez le script
 * plus souvent, et vous pouvez la baisser.
 */
import { fxCoverage, isParWithPlatform, setFxRate } from '../src/lib/fx'

/** Parité fixe du FCFA à l'euro depuis 1999 : le pivot de toute la conversion. */
const XAF_PAR_EUR = 655.957

/** Au-delà, les deux sources ne parlent pas de la même devise. On s'abstient. */
const ECART_MAX = 0.02

/**
 * Marge de dérive, par devise, pour une revue mensuelle. Ce sont des jugements
 * de volatilité, pas des mesures : à réviser quand le rapprochement comptable
 * dira ce que la dérive a réellement coûté.
 */
const MARGE: Record<string, number> = {
  // Quasi-arrimées ou activement gérées.
  USD: 0.02, KES: 0.02, MZN: 0.02,
  // Dépréciation régulière et modérée.
  GHS: 0.04, RWF: 0.04, TZS: 0.04, UGX: 0.04,
  // Dépréciation forte, avec risque de dévaluation par palier.
  CDF: 0.07, MWK: 0.07, ZMW: 0.07, SLE: 0.07,
}

/** Marge appliquée à une devise que `MARGE` ne connaît pas encore. */
const MARGE_PAR_DEFAUT = 0.07

type Cotation = { code: string; unitesParXaf: number }

function echouer(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

async function json(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

/** exchangerate-api : cote en base EUR, ramenée au FCFA par la parité fixe. */
async function sourceEur(): Promise<Cotation[]> {
  const data = (await json('https://open.er-api.com/v6/latest/EUR')) as {
    rates?: Record<string, number>
  }
  const rates = data.rates ?? {}
  return Object.entries(rates).map(([code, parEur]) => ({
    code,
    unitesParXaf: parEur / XAF_PAR_EUR,
  }))
}

/** currency-api : cote directement en base XAF. */
async function sourceXaf(): Promise<Cotation[]> {
  const data = (await json(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xaf.json',
  )) as { xaf?: Record<string, number> }
  const rates = data.xaf ?? {}
  return Object.entries(rates).map(([code, unitesParXaf]) => ({
    code: code.toUpperCase(),
    unitesParXaf,
  }))
}

function indexer(cotations: Cotation[]): Map<string, number> {
  return new Map(cotations.map((c) => [c.code, c.unitesParXaf]))
}

/** Deux chiffres significatifs de plus que le taux lui-même — jamais moins. */
function arrondir(valeur: number): number {
  const magnitude = Math.floor(Math.log10(valeur))
  const decimales = Math.min(8, Math.max(0, 4 - magnitude))
  return Number(valeur.toFixed(decimales))
}

async function main() {
  const ecrire = process.argv.includes('--ecrire')
  // Rafraîchir un taux et **ouvrir** un pays ne sont pas le même geste : le
  // second rend un marché achetable. Il demande donc son propre drapeau, et le
  // script dit à voix haute ce qu'il n'a pas fait sans lui.
  const ouvrir = process.argv.includes('--ouvrir')

  const [parEur, parXaf] = await Promise.all([sourceEur(), sourceXaf()]).catch((err) =>
    echouer(`Cotations injoignables : ${err instanceof Error ? err.message : err}`),
  )
  const a = indexer(parEur)
  const b = indexer(parXaf)

  // Les devises à couvrir se lisent sur `/v2/active-conf`, comme partout
  // ailleurs : c'est ce que **ce** compte marchand encaisse. Une liste écrite
  // ici dériverait, et une liste tirée de `fx_rates` ne verrait jamais qu'un
  // pays déjà ouvert — un premier remplissage n'aurait alors rien à proposer.
  const couverture = await fxCoverage()
  if (!couverture.length) {
    echouer(
      'Aucune devise à couvrir : /v2/active-conf n’a pas pu être lu. ' +
        'Vérifiez les identifiants PawaPay avant de conclure au tout-zone-franc.',
    )
  }
  const codes = couverture.map((c) => c.currency)
  const actuel = new Map(
    couverture
      .filter((c) => c.unitsPerXaf !== null)
      .map((c) => [c.currency, Number(c.unitsPerXaf)]),
  )

  const retenus: { code: string; taux: number; avant: number | undefined }[] = []
  const refuses: string[] = []

  for (const code of codes.sort()) {
    if (isParWithPlatform(code)) continue

    const x = a.get(code)
    const y = b.get(code)
    if (!x || !y) {
      refuses.push(`${code} — absente d'au moins une source`)
      continue
    }

    const ecart = Math.abs(x - y) / Math.min(x, y)
    if (ecart > ECART_MAX) {
      refuses.push(
        `${code} — sources en désaccord de ${(ecart * 100).toFixed(1)} % ` +
          `(${x.toPrecision(6)} vs ${y.toPrecision(6)})`,
      )
      continue
    }

    const marche = (x + y) / 2
    const marge = MARGE[code] ?? MARGE_PAR_DEFAUT
    retenus.push({ code, taux: arrondir(marche * (1 + marge)), avant: actuel.get(code) })
  }

  console.log(`\nTaux proposés — marché du ${new Date().toISOString().slice(0, 10)}\n`)
  for (const { code, taux, avant } of retenus) {
    const delta =
      avant === undefined
        ? 'nouveau'
        : `${avant} → ${((taux / avant - 1) * 100).toFixed(1).replace('-', '−')} %`
    console.log(
      `  ${code.padEnd(4)} ${String(taux).padEnd(14)} ` +
        `(15 000 FCFA → ${Math.round(15_000 * taux).toLocaleString('fr-FR')} ${code})`.padEnd(34) +
        `  ${delta}`,
    )
  }

  if (refuses.length) {
    console.log('\nNon proposés — laissés en l’état :\n')
    for (const ligne of refuses) console.log(`  ${ligne}`)
  }

  const nouveaux = retenus.filter((r) => r.avant === undefined)
  if (nouveaux.length && !ouvrir) {
    console.log(
      `\n⚠ ${nouveaux.length} devise(s) sans taux : ${nouveaux.map((n) => n.code).join(', ')}.` +
        '\n  Les écrire ouvre ces marchés à l’achat. Ajoutez --ouvrir pour le faire.',
    )
  }

  const aEcrire = ouvrir ? retenus : retenus.filter((r) => r.avant !== undefined)

  if (!ecrire) {
    console.log(`\nAucune écriture (${aEcrire.length} le seraient). Ajoutez --ecrire.\n`)
    return
  }

  // `updatedById` reste nul : aucun administrateur n'a cliqué. Le journal doit
  // pouvoir distinguer une saisie humaine d'un rafraîchissement automatique.
  for (const { code, taux } of aEcrire) await setFxRate(code, taux, null)
  console.log(`\n✓ ${aEcrire.length} taux écrits sur ${retenus.length} proposés.\n`)
}

main()
  .catch((err) => echouer(err instanceof Error ? err.message : String(err)))
  .finally(() => process.exit(0))
