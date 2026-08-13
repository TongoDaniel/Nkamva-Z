/**
 * Pose la grille tarifaire : les paliers de stockage (arbitrage 95) et, sur
 * demande, la fin de la gratuité de lancement (arbitrage 96).
 *
 *   bun scripts/tarifs.ts                                   # montre la grille, n'écrit rien
 *   bun scripts/tarifs.ts --ecrire                          # pose les deux paliers de stockage
 *   bun scripts/tarifs.ts --ecrire --abonnement 9000 90000  # ...et la bascule payante
 *   bun scripts/tarifs.ts --ecrire --abonnement 9000 90000 --a-partir-du 2027-01-01
 *
 * ── Pourquoi un script pour ce que l'écran sait déjà faire ──────────────────
 *
 * `/admin/parametres` pose un tarif à la fois, à la main, et exige une session
 * de Super-admin. Poser quatre lignes cohérentes — deux paliers, deux cadences
 * d'abonnement — en quatre clics séparés laisse la grille dans un état
 * intermédiaire entre chaque, et rien ne dit à l'écran ce qui manque encore.
 * Le script les pose ensemble et **dit d'abord ce qu'il ferait**.
 *
 * ── Le piège de la bascule : borner ne suffit pas ───────────────────────────
 *
 * L'arbitrage 96 dit « le tarif à 0 reçoit une borne ». Pris au pied de la
 * lettre, c'est sans effet : `getCurrentTariff` ne trouve alors plus rien, et
 * `quotePrice` retient 0 quand la grille est muette — l'abonnement reste
 * gratuit, simplement sans ligne pour l'expliquer. **La bascule n'existe que si
 * un tarif payant lui succède**, et c'est `setTariff` qui borne le précédent en
 * posant le suivant (décision 59, interdit de rétroactivité).
 *
 * D'où `--abonnement <mensuel> <annuel>` : le montant payant n'est arbitré
 * nulle part, il ne peut donc pas vivre en dur ici. Sans lui, le script pose
 * les paliers et **refuse** la bascule plutôt que de la simuler.
 */
import { db } from '../src/lib/db'
import { getCurrentTariffs, setTariff } from '../src/lib/pricing'
import { getCurrentStorageTierTariffs } from '../src/lib/storage-tiers'

/** Arbitrage 95 — 3 000 FCFA/mois, 30 000 FCFA/an la tranche de 50 Go. */
const PALIER = { MONTHLY: 3_000, YEARLY: 30_000 } as const

/** Arbitrage 96 — la gratuité de lancement s'arrête à cette date par défaut. */
const BASCULE_PAR_DEFAUT = '2027-01-01'

function echouer(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

function fcfa(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${n.toLocaleString('fr-FR')} FCFA`
}

function argSuivant(drapeau: string, combien: number): string[] {
  const i = process.argv.indexOf(drapeau)
  if (i === -1) return []
  const valeurs = process.argv.slice(i + 1, i + 1 + combien)
  if (valeurs.length < combien || valeurs.some((v) => v.startsWith('--'))) {
    echouer(`${drapeau} attend ${combien} valeur(s).`)
  }
  return valeurs
}

function montant(brut: string): number {
  const n = Number(brut.replace(/[\s_]/g, ''))
  if (!Number.isInteger(n) || n < 0) echouer(`Montant invalide : « ${brut} ». Un entier de FCFA.`)
  return n
}

/**
 * Le Super-admin au nom duquel la grille est posée. Le journal d'audit exige un
 * auteur, et un tarif est une action de Super-admin (décision 60) : le script
 * ne s'invente pas d'identité, il emprunte celle du plus ancien.
 */
async function auteur(): Promise<{ id: string; email: string }> {
  const admin = await db.user.findFirst({
    where: { role: 'ADMIN', adminRole: 'SUPER_ADMIN', suspendedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  })
  if (!admin) echouer('Aucun super-administrateur actif. Lancez d\'abord bootstrap-super-admin.')
  return admin
}

async function main() {
  const ecrire = process.argv.includes('--ecrire')
  const [mensuelBrut, annuelBrut] = argSuivant('--abonnement', 2)
  const [dateBrute] = argSuivant('--a-partir-du', 1)

  const bascule = new Date(`${dateBrute ?? BASCULE_PAR_DEFAUT}T00:00:00.000Z`)
  if (Number.isNaN(bascule.getTime())) echouer(`Date invalide : « ${dateBrute} ». Format AAAA-MM-JJ.`)
  if (bascule.getTime() < Date.now()) {
    echouer(
      `La bascule est datée du ${bascule.toISOString().slice(0, 10)}, dans le passé. ` +
        'Un tarif ne s\'applique jamais rétroactivement (décision 59).',
    )
  }

  const [abonnement, paliers] = await Promise.all([getCurrentTariffs(), getCurrentStorageTierTariffs()])

  console.log('\nGrille en vigueur\n')
  console.log(`  Abonnement mensuel   ${fcfa(abonnement.MONTHLY?.amountFcfa ?? 0).padEnd(16)} ${abonnement.MONTHLY ? '' : '(aucune ligne — gratuit par défaut)'}`)
  console.log(`  Abonnement annuel    ${fcfa(abonnement.YEARLY?.amountFcfa ?? 0).padEnd(16)} ${abonnement.YEARLY ? '' : '(aucune ligne — gratuit par défaut)'}`)
  console.log(`  Palier 50 Go /mois   ${fcfa(paliers.MONTHLY?.amountFcfa ?? 0).padEnd(16)} ${paliers.MONTHLY ? '' : '(aucune ligne — extension gratuite)'}`)
  console.log(`  Palier 50 Go /an     ${fcfa(paliers.YEARLY?.amountFcfa ?? 0).padEnd(16)} ${paliers.YEARLY ? '' : '(aucune ligne — extension gratuite)'}`)

  const aFaire: { quoi: string; action: () => Promise<unknown> }[] = []
  const actorId = ecrire ? (await auteur()).id : ''

  for (const cadence of ['MONTHLY', 'YEARLY'] as const) {
    if (paliers[cadence]?.amountFcfa === PALIER[cadence]) continue
    aFaire.push({
      quoi: `Palier 50 Go ${cadence === 'MONTHLY' ? 'mensuel' : 'annuel'} → ${fcfa(PALIER[cadence])} (dès maintenant)`,
      action: () =>
        setTariff({
          kind: 'STORAGE_TIER',
          cadence,
          amountFcfa: PALIER[cadence],
          validFrom: new Date(),
          label: 'Extension de stockage — 50 Go',
          actorId,
        }),
    })
  }

  if (mensuelBrut && annuelBrut) {
    const montants = { MONTHLY: montant(mensuelBrut), YEARLY: montant(annuelBrut) }
    for (const cadence of ['MONTHLY', 'YEARLY'] as const) {
      aFaire.push({
        quoi:
          `Abonnement ${cadence === 'MONTHLY' ? 'mensuel' : 'annuel'} → ${fcfa(montants[cadence])} ` +
          `au ${bascule.toISOString().slice(0, 10)} (borne la gratuité)`,
        action: () =>
          setTariff({
            kind: 'SUBSCRIPTION',
            cadence,
            amountFcfa: montants[cadence],
            validFrom: bascule,
            label: 'Fin de la gratuité de lancement',
            actorId,
          }),
      })
    }
  } else if (abonnement.MONTHLY === null || abonnement.MONTHLY.amountFcfa === 0) {
    console.log(
      '\n⚠ Gratuité de lancement toujours sans terme (arbitrage 96).' +
        '\n  Borner le tarif à 0 sans lui donner de successeur ne changerait rien :' +
        '\n  sans ligne en vigueur, la facturation retient 0. Passez' +
        '\n  --abonnement <mensuel> <annuel> pour poser la bascule.' +
        '\n  Le montant payant n\'est arbitré nulle part — c\'est une décision, pas un défaut.',
    )
  }

  if (aFaire.length === 0) {
    console.log('\n✓ Rien à poser : la grille est déjà celle des arbitrages 95 et 96.\n')
    return
  }

  console.log(`\n${ecrire ? 'À poser' : 'Serait posé'}\n`)
  for (const { quoi } of aFaire) console.log(`  · ${quoi}`)

  if (!ecrire) {
    console.log('\nAucune écriture. Ajoutez --ecrire.\n')
    return
  }

  // Une ligne à la fois : `setTariff` borne la précédente dans sa propre
  // transaction, et une bascule d'abonnement notifie les formateurs concernés.
  // Les paralléliser ferait courir deux bornages sur la même cadence.
  for (const { quoi, action } of aFaire) {
    await action()
    console.log(`  ✓ ${quoi}`)
  }
  console.log(`\n✓ ${aFaire.length} ligne(s) posée(s).\n`)
}

main()
  .catch((err) => echouer(err instanceof Error ? err.message : String(err)))
  .finally(() => process.exit(0))
