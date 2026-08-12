/**
 * Vérification du tarif de palier de stockage (arbitrage 69).
 *
 *   bun run dev                        # dans un autre terminal
 *   bun scripts/smoke-tarif-palier.ts
 *
 * Ce que ce script prouve, et qu'aucun test unitaire ne pouvait dire : le prix
 * d'un palier est **atteignable depuis l'administration**. Il l'était en base et
 * dans le service, mais la route n'acceptait pas `kind` — en production, aucun
 * prix n'aurait jamais pu être posé, et les paliers seraient restés gratuits en
 * silence.
 *
 * Le contrôle qui compte est le troisième : poser un prix de palier ne doit pas
 * borner le tarif d'abonnement en vigueur. Les deux natures partagent une table,
 * et une confusion y facturerait l'abonnement au prix d'un palier.
 *
 * Ce script écrit dans la base de développement. Tout ce qu'il pose est retiré
 * à la fin, y compris si un contrôle échoue.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'
import { getCurrentTariff } from '../src/lib/pricing'
import { getStorageTierTariff, getTrainerStorage } from '../src/lib/storage-tiers'
import { fmtFcfa } from '../src/lib/format'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const mail = (key: string) => `tongodanielfo+${key}@gmail.com`

/** Un montant improbable : s'il apparaît à l'écran, il vient bien d'ici. */
const PRIX_PALIER = 3_333

async function cookieFor(email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: {
      id: true, email: true, role: true, adminRole: true,
      sessionsValidAfter: true, trainerProfile: { select: { id: true } },
    },
  })
  const token = await encode({
    token: {
      userId: user.id,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
      sub: user.id,
      email: user.email,
    },
    secret: SECRET,
  })
  return `next-auth.session-token=${token}`
}

async function html(path: string, cookie?: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  })
  const body = await res.text()
  // Un 200 ne prouve rien : `error.tsx` absorbe les plantages de rendu.
  if (body.includes('Une erreur est survenue')) {
    throw new Error(`${path} a rendu la page d'erreur`)
  }
  return body.replaceAll('<!-- -->', '')
}

async function postTariff(body: unknown, cookie: string) {
  const res = await fetch(`${BASE}/api/admin/pricing/tariffs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
  return { status: res.status, payload: (await res.json()) as { data?: { id?: string } } }
}

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const superAdmin = await cookieFor(mail('admin'))
  const posted: string[] = []

  // L'état d'avant, pour le restaurer et pour prouver qu'il n'a pas bougé.
  //
  // Les **deux** cadences d'abonnement y figurent, et pas seulement celle que
  // les contrôles relisent : poser un tarif borne le précédent, y compris pour
  // la cadence annuelle que le contrôle nº 2 emprunte. Supprimer la ligne posée
  // ne rend pas sa date de fin à celle qu'elle a bornée — la première version de
  // ce script laissait ainsi la gratuité annuelle expirer dans trente jours,
  // sans que rien ne le signale aujourd'hui.
  const abonnementAvant = await getCurrentTariff('MONTHLY')
  const abonnementAnnuelAvant = await getCurrentTariff('YEARLY')
  const palierAvant = await getStorageTierTariff('MONTHLY')

  try {
    // ---- 1. la route accepte enfin `kind` -------------------------------
    // `validFrom` à maintenant : `setTariff` tolère 60 s de retard, le tarif
    // est donc en vigueur immédiatement et le reste du script peut le relire.
    const now = new Date()
    const cree = await postTariff(
      {
        kind: 'STORAGE_TIER',
        cadence: 'MONTHLY',
        amountFcfa: PRIX_PALIER,
        validFrom: now.toISOString(),
        label: 'Smoke — palier 50 Go',
      },
      superAdmin,
    )
    if (cree.payload.data?.id) posted.push(cree.payload.data.id)
    check(
      'POST /api/admin/pricing/tariffs accepte kind=STORAGE_TIER',
      cree.status === 201,
      `reçu ${cree.status}`,
    )

    const palierApres = await getStorageTierTariff('MONTHLY')
    check(
      `le palier mensuel en vigueur vaut ${PRIX_PALIER} FCFA`,
      palierApres?.amountFcfa === PRIX_PALIER,
      `en base : ${palierApres?.amountFcfa ?? '(aucun)'}`,
    )

    // ---- 2. sans `kind`, rien ne change pour l'existant -------------------
    const parDefaut = await postTariff(
      {
        cadence: 'YEARLY',
        amountFcfa: 999_999,
        validFrom: new Date(Date.now() + 86_400_000 * 30).toISOString(),
        label: 'Smoke — défaut',
      },
      superAdmin,
    )
    if (parDefaut.payload.data?.id) posted.push(parDefaut.payload.data.id)
    const ligneDefaut = parDefaut.payload.data?.id
      ? await db.platformTariff.findUnique({
          where: { id: parDefaut.payload.data.id },
          select: { kind: true },
        })
      : null
    check(
      'un corps sans `kind` reste un tarif d’abonnement',
      parDefaut.status === 201 && ligneDefaut?.kind === 'SUBSCRIPTION',
      `reçu ${parDefaut.status}, kind=${ligneDefaut?.kind ?? '(aucun)'}`,
    )

    // ---- 3. le contrôle qui compte --------------------------------------
    const abonnementApres = await getCurrentTariff('MONTHLY')
    check(
      "poser un prix de palier ne borne pas l'abonnement en vigueur",
      abonnementApres?.id === abonnementAvant?.id &&
        abonnementApres?.validUntil?.getTime() === abonnementAvant?.validUntil?.getTime(),
      `avant ${abonnementAvant?.id} (fin ${abonnementAvant?.validUntil ?? 'null'}), ` +
        `après ${abonnementApres?.id} (fin ${abonnementApres?.validUntil ?? 'null'})`,
    )
    check(
      "le montant de l'abonnement mensuel n'a pas bougé",
      abonnementApres?.amountFcfa === abonnementAvant?.amountFcfa,
      `${abonnementAvant?.amountFcfa} → ${abonnementApres?.amountFcfa}`,
    )

    // ---- 4. l'écran admin relit ce qu'il vient de poser -------------------
    const params = await html('/admin/parametres', superAdmin)
    check(
      '/admin/parametres affiche le palier en vigueur',
      params.includes('Palier de stockage en vigueur') &&
        params.includes('Smoke — palier 50 Go'),
      'la carte ou le libellé manquent',
    )
    check(
      "/admin/parametres distingue les deux natures dans l'historique",
      params.includes('Palier stockage') && params.includes('Abonnement'),
    )

    // ---- 5. le formateur voit le prix, et ne paie rien aujourd'hui --------
    const formateur = await db.trainerProfile.findFirstOrThrow({
      where: { subscriptionCadence: 'MONTHLY' },
      select: { id: true, user: { select: { email: true } } },
    })
    const vue = await getTrainerStorage(formateur.id)
    check(
      `le portefeuille du formateur annonce ${PRIX_PALIER} FCFA par palier`,
      vue.tierPriceFcfa === PRIX_PALIER,
      `tierPriceFcfa = ${vue.tierPriceFcfa}`,
    )

    // `fmtNumber` sépare les milliers par une espace fine insécable (U+202F) :
    // écrire « 3 333 » à la main ici ferait échouer le contrôle sur une page
    // pourtant juste. Le motif se dérive donc du même formateur.
    const portefeuille = await html('/formateur/portefeuille', await cookieFor(formateur.user.email))
    check(
      "l'écran Stockage affiche le nouveau prix",
      portefeuille.includes(fmtFcfa(PRIX_PALIER)),
      'le montant posé ne remonte pas jusqu’à la page',
    )
  } finally {
    // Retirer ce qui a été posé, puis rendre à chaque ligne bornée sa date de
    // fin d'origine — le plus souvent `null`, c'est-à-dire « en cours ».
    if (posted.length > 0) {
      await db.platformTariff.deleteMany({ where: { id: { in: posted } } })
    }
    for (const ligne of [palierAvant, abonnementAvant, abonnementAnnuelAvant]) {
      if (!ligne) continue
      await db.platformTariff.update({
        where: { id: ligne.id },
        data: { validUntil: ligne.validUntil },
      })
    }
    console.log('\nGrille d’origine restaurée.')
  }

  console.log(
    failures ? `\n${failures} contrôle(s) en échec.` : '\nLe prix du palier est administrable.',
  )
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
