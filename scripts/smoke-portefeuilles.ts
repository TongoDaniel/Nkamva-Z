/**
 * Vérification des réconciliations de portefeuille.
 *
 *   bun run dev                        # dans un autre terminal
 *   bun scripts/smoke-portefeuilles.ts
 *
 * Les deux routes existaient depuis le Lot 3, avec leur trace
 * `WalletReconciliation` et leur entrée au journal : rien ne les appelait. La
 * correction d'un solde n'était donc possible qu'en dehors de l'application.
 *
 * Un écart n'existant pas en base, ce script **en fabrique un** — il décale
 * `reservedBalance` d'un portefeuille — puis le corrige par la route. La
 * correction remet la valeur recalculée, c'est-à-dire la valeur d'origine : le
 * portefeuille est donc rendu tel quel. La ligne `WalletReconciliation` créée
 * est supprimée à la fin ; l'entrée au journal d'audit reste, le journal étant
 * en ajout seul.
 *
 * Ce qui est contrôlé :
 *
 *   1. l'écart fabriqué est détecté et affiché ;
 *   2. la correction l'applique, avec sa trace et son motif ;
 *   3. rejouer la correction ne corrige rien et le dit ;
 *   4. Finances **voit** sans pouvoir corriger, et la route la refuse ;
 *   5. l'alerte du job mène à un écran qui existe — le lien pointait
 *      `/admin/wallets`, qui n'a jamais existé.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'
import { reconcileAllWallets } from '../src/lib/wallet-reconciliation'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const mail = (key: string) => `tongodanielfo+${key}@gmail.com`
const REASON = 'Contrôle automatique — smoke-portefeuilles, écart fabriqué puis corrigé.'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function cookieFor(email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
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

const readable = (page: string) =>
  page.replaceAll('<!-- -->', '').replaceAll('&#x27;', "'").replaceAll('&amp;', '&')

async function main() {
  const startedAt = new Date()
  const wallet = await db.wallet.findFirst({
    select: { id: true, reservedBalance: true, trainerId: true },
    orderBy: { balance: 'desc' },
  })
  if (!wallet) {
    console.log('Aucun portefeuille en base — lancer le seed. Contrôle impossible.')
    process.exitCode = 1
    return
  }

  const superAdmin = await cookieFor(mail('admin'))
  const finances = await cookieFor(mail('finances'))
  const trueValue = wallet.reservedBalance
  const skewed = trueValue + 7_500
  let restored = false

  try {
    // ---- 0. L'écran s'ouvre aux deux sous-rôles ------------------------
    for (const [label, cookie] of [
      ['Super-admin', superAdmin],
      ['Finances', finances],
    ] as const) {
      const res = await fetch(`${BASE}/admin/portefeuilles`, { headers: { cookie }, redirect: 'manual' })
      const html = readable(await res.text())
      check(
        `/admin/portefeuilles s'ouvre pour ${label}`,
        res.status === 200 && !html.includes('Une erreur est survenue'),
        `reçu ${res.status}`,
      )
    }
    const moderation = await fetch(`${BASE}/admin/portefeuilles`, {
      headers: { cookie: await cookieFor(mail('moderation')) },
      redirect: 'manual',
    })
    check(
      'un admin Modération est renvoyé vers /admin',
      moderation.status === 307 || moderation.status === 302,
      `reçu ${moderation.status}`,
    )

    // ---- 1. Un écart fabriqué est détecté ------------------------------
    await db.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: skewed } })

    const withGap = readable(
      await (
        await fetch(`${BASE}/admin/portefeuilles`, { headers: { cookie: superAdmin } })
      ).text(),
    )
    check(
      "l'écart fabriqué est annoncé sur l'écran",
      withGap.includes('écart à instruire') || withGap.includes('écarts à instruire'),
      "l'écran ne signale aucun écart alors que la base en porte un",
    )
    check(
      "l'écran propose la correction au Super-admin",
      withGap.includes('Corriger'),
    )

    const financesView = readable(
      await (
        await fetch(`${BASE}/admin/portefeuilles`, { headers: { cookie: finances } })
      ).text(),
    )
    check(
      'Finances voit l’écart sans bouton de correction',
      (financesView.includes('écart à instruire') || financesView.includes('écarts à instruire')) &&
        !financesView.includes('>Corriger<') &&
        financesView.includes('réservée au Super-admin'),
    )

    // ---- 2. La correction s'applique, avec sa trace --------------------
    const reconcile = (cookie: string) =>
      fetch(`${BASE}/api/admin/wallets/${wallet.id}/reconcile-reserved-balance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ reason: REASON }),
      })

    const refused = await reconcile(finances)
    check(
      'la route refuse un admin Finances',
      refused.status === 403,
      `reçu ${refused.status} : Finances a pu corriger un solde`,
    )

    const done = await reconcile(superAdmin)
    const body = (await done.json()) as {
      data?: { corrected?: boolean; previousValue?: number; newValue?: number; delta?: number }
    }
    check(
      'la correction répond 200 et ramène la valeur recalculée',
      done.status === 200 &&
        body.data?.corrected === true &&
        body.data.previousValue === skewed &&
        body.data.newValue === trueValue &&
        body.data.delta === trueValue - skewed,
      `reçu ${done.status} ${JSON.stringify(body.data)}`,
    )

    const after = await db.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      select: { reservedBalance: true },
    })
    restored = after.reservedBalance === trueValue
    check('le solde stocké est revenu à sa valeur recalculée', restored, `${after.reservedBalance}`)

    const trace = await db.walletReconciliation.findFirst({
      where: { walletId: wallet.id, reason: REASON },
      select: { id: true, field: true, previousValue: true, newValue: true, delta: true },
    })
    check(
      'une ligne WalletReconciliation conserve le motif et les deux valeurs',
      trace?.field === 'reservedBalance' &&
        trace.previousValue === skewed &&
        trace.newValue === trueValue,
    )

    const journal = await db.auditLog.findFirst({
      where: { action: 'WALLET_RECONCILED', targetId: wallet.id },
      orderBy: { createdAt: 'desc' },
      select: { actorRole: true, meta: true },
    })
    check(
      'le journal d’audit porte WALLET_RECONCILED avec son motif',
      journal?.actorRole === 'SUPER_ADMIN' &&
        JSON.stringify(journal.meta ?? {}).includes('smoke-portefeuilles'),
    )

    const history = readable(
      await (
        await fetch(`${BASE}/admin/portefeuilles`, { headers: { cookie: superAdmin } })
      ).text(),
    )
    check(
      'la correction apparaît dans « Corrections passées », motif compris',
      history.includes('Corrections passées') && history.includes('smoke-portefeuilles'),
    )

    // ---- 3. Rejouer ne corrige rien, et le dit ------------------------
    const replay = await reconcile(superAdmin)
    const replayBody = (await replay.json()) as { data?: { corrected?: boolean; delta?: number } }
    check(
      'rejouer la correction ne corrige rien (corrected: false, delta: 0)',
      replay.status === 200 && replayBody.data?.corrected === false && replayBody.data.delta === 0,
      JSON.stringify(replayBody.data),
    )

    // ---- 4. L'alerte du job mène à un écran qui existe ----------------
    //
    // Le lien pointait `/admin/wallets`, qui n'a jamais existé : Finances
    // atterrissait sur un 404 en cliquant l'alerte qui la concernait.
    await db.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: skewed } })
    restored = false
    const before = new Date()
    await reconcileAllWallets()
    const alert = await db.notification.findFirst({
      where: { type: 'WALLET_BALANCE_MISMATCH', createdAt: { gte: before } },
      select: { id: true, link: true },
    })
    check(
      "l'alerte d'écart pointe /admin/portefeuilles",
      alert?.link === '/admin/portefeuilles',
      `lien reçu : ${alert?.link ?? '(aucune alerte)'}`,
    )
    if (alert?.link) {
      const target = await fetch(`${BASE}${alert.link}`, {
        headers: { cookie: finances },
        redirect: 'manual',
      })
      check(
        'ce lien répond 200 pour le destinataire de l’alerte',
        target.status === 200,
        `reçu ${target.status}`,
      )
    }
  } finally {
    // Remettre le portefeuille tel qu'il était, quoi qu'il soit arrivé : ce
    // script tourne sur la base de développement.
    if (!restored) {
      await db.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: trueValue } })
    }
    const traces = await db.walletReconciliation.deleteMany({ where: { reason: REASON } })
    // Bornée à cette exécution : supprimer toutes les alertes de ce type
    // effacerait celles qu'un vrai écart aurait produites avant.
    const alerts = await db.notification.deleteMany({
      where: { type: 'WALLET_BALANCE_MISMATCH', createdAt: { gte: startedAt } },
    })
    console.log(
      `\nPortefeuille remis à ${trueValue} · ${traces.count} trace(s) et ${alerts.count} alerte(s) de contrôle supprimées.`,
    )
  }

  console.log(
    failures ? `\n${failures} contrôle(s) en échec.` : '\nChaîne des réconciliations complète.',
  )
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
