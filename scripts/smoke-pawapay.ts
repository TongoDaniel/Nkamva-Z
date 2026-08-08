/**
 * Smoke bout-en-bout de l'adaptateur mobile money, contre le vrai bac à sable.
 *
 *   bun scripts/smoke-pawapay.ts
 *
 * `probe-integrations.ts` répond à « le jeton est-il accepté ? ». Ce script
 * répond à la question suivante, qui n'est pas la même : **l'argent circule-t-il
 * vraiment ?** Il encaisse, rembourse et verse pour de bon, puis attend les
 * statuts finaux. Un contrat mal formé — montant en nombre plutôt qu'en chaîne,
 * MSISDN avec un `+`, `customerMessage` trop long — passe toutes les sondes et
 * échoue ici, ce qui est exactement le point.
 *
 * ⚠️ **Bac à sable uniquement.** Le script refuse de démarrer si la
 * configuration pointe vers la production : les mêmes appels y déplaceraient de
 * l'argent réel, et l'`assertOperational` d'un smoke test ne vaut pas
 * autorisation de virer 500 XAF à un inconnu.
 *
 * Ce qu'il ne peut pas prouver seul : la **réception** d'un callback signé.
 * Elle exige un hôte public déclaré dans le tableau de bord PawaPay. Le script
 * vérifie donc les deux bords accessibles depuis ici — le refus d'un callback
 * non signé (l'invariant anti-fail-open), et, sur demande, le renvoi du callback
 * du dépôt qu'il vient de créer :
 *
 *   CALLBACK_BASE=https://staging.nkamva.com RESEND_CALLBACK=1 bun scripts/smoke-pawapay.ts
 *
 * Numéros de test : docs.pawapay.io/v2/docs/test_numbers, relevés le 8 août 2026.
 */
import {
  activeConfiguration, assertOperational, pawapayConfig,
  requestDeposit, checkDeposit,
  requestRefund, checkRefund,
  requestPayout, checkPayout,
} from '../src/lib/pawapay'

/** MSISDN de test du bac à sable — ils ne correspondent à aucun abonné réel. */
const PROVIDER = 'MTN_MOMO_CMR'
const MSISDN_COMPLETED = '237653456789'
const MSISDN_PAYER_LIMIT = '237653456019'

/** Petit, mais au-dessus du minimum annoncé par tous les opérateurs (1 XAF). */
const AMOUNT = 500

/** Le bac à sable conclut en quelques secondes ; la borne n'est là que pour ne pas pendre. */
const POLL_INTERVAL_MS = 2_000
const POLL_ATTEMPTS = 15

const CALLBACK_BASE = process.env.CALLBACK_BASE || 'http://localhost:3000'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Snapshot {
  status: string
  failureReason?: { failureCode: string; failureMessage?: string }
}

/**
 * Attend un état final. `NOT_FOUND` n'est pas une erreur pendant les premières
 * secondes : PawaPay accuse réception avant que la transaction soit consultable.
 */
async function waitForFinalStatus<T extends Snapshot>(
  label: string,
  lookup: () => Promise<T | null>,
): Promise<T | null> {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)
    const snapshot = await lookup()
    if (!snapshot) continue
    if (snapshot.status === 'COMPLETED' || snapshot.status === 'FAILED') {
      const reason = snapshot.failureReason ? ` (${snapshot.failureReason.failureCode})` : ''
      console.log(`  ${label} → ${snapshot.status}${reason} après ${attempt * POLL_INTERVAL_MS / 1000} s`)
      return snapshot
    }
  }
  console.log(`  ${label} → toujours pas d'état final après ${POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000} s`)
  return null
}

/**
 * Garde-fou d'environnement. Il lit la configuration effective plutôt que la
 * seule variable `PAWAPAY_ENVIRONMENT` : c'est `PAWAPAY_BASE_URL` qui l'emporte
 * quand elle est posée, et se fier à l'autre laisserait passer exactement le cas
 * où quelqu'un a surchargé l'URL vers la production.
 */
function assertSandbox(): void {
  const config = pawapayConfig()
  if (!config) {
    console.error('PAWAPAY_API_TOKEN absent : rien à tester.')
    process.exit(1)
  }
  if (!config.baseUrl.includes('sandbox')) {
    console.error(`REFUS : ${config.baseUrl} n'est pas le bac à sable. Ce script déplace de l'argent.`)
    process.exit(1)
  }
  console.log(`Bac à sable confirmé : ${config.baseUrl}\n`)
}

async function main() {
  assertSandbox()

  // ---- 1. Ce que le compte peut faire ------------------------------------
  console.log('— Configuration active ——————————————————————————')
  const conf = await activeConfiguration(true)
  check('le jeton est accepté par /v2/active-conf', true, `compte « ${conf.companyName ?? '?'} »`)
  // Sans callbacks signés, `readSignedCallback` refuse tout : un encaissement
  // réussirait chez PawaPay sans jamais créditer l'achat ici.
  check(
    'les callbacks signés sont activés côté PawaPay',
    Boolean(conf.signatureConfiguration?.signedCallbacks),
    conf.signatureConfiguration?.signedCallbacks ? 'activés' : 'DÉSACTIVÉS : tous les callbacks seront refusés en 401',
  )
  // Le code ne signe pas ses requêtes sortantes. Si le compte l'exige, tout part
  // en 401 — et le message d'erreur ne le dit pas.
  check(
    "le compte n'exige pas de requêtes signées",
    !conf.signatureConfiguration?.signedRequestsOnly,
    conf.signatureConfiguration?.signedRequestsOnly ? 'EXIGÉES : les initiations échoueront' : 'non exigées',
  )

  const capability = await assertOperational(PROVIDER, 'DEPOSIT', AMOUNT)
  check(
    `${PROVIDER} encaisse ${AMOUNT} XAF`,
    capability.operation.status === 'OPERATIONAL',
    `${capability.operation.minAmount}–${capability.operation.maxAmount} ${capability.currency}, statut ${capability.operation.status}`,
  )

  // ---- 2. Encaisser -------------------------------------------------------
  console.log('\n— Dépôt —————————————————————————————————————————')
  const depositId = crypto.randomUUID()
  const initiation = await requestDeposit({
    depositId,
    phoneNumber: MSISDN_COMPLETED,
    provider: PROVIDER,
    amountFcfa: AMOUNT,
    // Volontairement plus long que les 22 caractères admis : on vérifie du même
    // coup que `customerMessage()` tronque au lieu de faire rejeter l'appel.
    customerMessage: 'NkamVa — smoke test de bout en bout',
    clientReferenceId: `smoke-${Date.now()}`,
    metadata: { source: 'smoke-pawapay' },
  })
  check('le dépôt est accepté', initiation.status === 'ACCEPTED', `statut ${initiation.status}`)

  const deposit = await waitForFinalStatus('dépôt', () => checkDeposit(depositId))
  check('le dépôt atteint COMPLETED', deposit?.status === 'COMPLETED', deposit?.status ?? 'aucun état final')

  // Rejouer le même identifiant ne doit pas encaisser deux fois : `depositId`
  // est la clé d'idempotence, et c'est ce qui protège d'un réessai réseau.
  const replay = await requestDeposit({
    depositId,
    phoneNumber: MSISDN_COMPLETED,
    provider: PROVIDER,
    amountFcfa: AMOUNT,
    customerMessage: 'NkamVa test',
  })
  check(
    'le même depositId rejoué est ignoré',
    replay.status === 'DUPLICATE_IGNORED',
    `statut ${replay.status}`,
  )

  // ---- 3. Un échec doit se présenter comme un échec -----------------------
  console.log('\n— Dépôt refusé par l’opérateur ———————————————————')
  const refusedId = crypto.randomUUID()
  await requestDeposit({
    depositId: refusedId,
    phoneNumber: MSISDN_PAYER_LIMIT,
    provider: PROVIDER,
    amountFcfa: AMOUNT,
    customerMessage: 'NkamVa test',
  })
  const refused = await waitForFinalStatus('dépôt refusé', () => checkDeposit(refusedId))
  check(
    'un dépôt refusé remonte FAILED avec son motif',
    refused?.status === 'FAILED' && Boolean(refused.failureReason?.failureCode),
    refused?.failureReason?.failureCode ?? refused?.status ?? 'aucun état final',
  )

  // ---- 4. Rembourser et verser -------------------------------------------
  if (deposit?.status === 'COMPLETED') {
    console.log('\n— Remboursement —————————————————————————————————')
    const refundId = crypto.randomUUID()
    const refundInit = await requestRefund({ refundId, depositId, amountFcfa: AMOUNT })
    check('le remboursement est accepté', refundInit.status === 'ACCEPTED', `statut ${refundInit.status}`)
    const refund = await waitForFinalStatus('remboursement', () => checkRefund(refundId))
    check('le remboursement atteint COMPLETED', refund?.status === 'COMPLETED', refund?.status ?? 'aucun état final')
  }

  console.log('\n— Versement —————————————————————————————————————')
  const payoutId = crypto.randomUUID()
  const payoutInit = await requestPayout({
    payoutId,
    phoneNumber: MSISDN_COMPLETED,
    provider: PROVIDER,
    amountFcfa: AMOUNT,
    customerMessage: 'NkamVa versement',
  })
  check('le versement est accepté', payoutInit.status === 'ACCEPTED', `statut ${payoutInit.status}`)
  const payout = await waitForFinalStatus('versement', () => checkPayout(payoutId))
  check('le versement atteint COMPLETED', payout?.status === 'COMPLETED', payout?.status ?? 'aucun état final')

  // ---- 5. La porte des callbacks -----------------------------------------
  //
  // On ne peut pas fabriquer une signature valide — c'est tout l'intérêt. Ce
  // qu'on vérifie ici est l'invariant inverse, et c'est celui qui a déjà cédé
  // une fois avec CinetPay : un POST anonyme ne doit RIEN créditer.
  console.log('\n— Callbacks —————————————————————————————————————')
  for (const kind of ['deposits', 'payouts', 'refunds'] as const) {
    const url = `${CALLBACK_BASE}/api/webhooks/pawapay/${kind}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED', depositId: crypto.randomUUID() }),
        signal: AbortSignal.timeout(15_000),
      })
      // 503 = jeton absent sur cet hôte : le callback légitime sera rejeté lui
      // aussi, et l'achat restera en attente pour toujours. À ne pas confondre
      // avec un refus de signature, qui est le bon comportement.
      check(
        `${kind} refuse un callback non signé`,
        res.status === 401,
        res.status === 503
          ? `503 : PAWAPAY_API_TOKEN absent sur ${CALLBACK_BASE}`
          : `reçu ${res.status}`,
      )
    } catch (error) {
      check(`${kind} refuse un callback non signé`, false, `injoignable : ${String(error).slice(0, 60)}`)
    }
  }

  // Renvoi du callback réel — utile seulement si CALLBACK_BASE est l'hôte
  // public déclaré dans le tableau de bord. PawaPay accuse réception de la
  // demande ; la preuve de livraison se lit dans les journaux de cet hôte.
  if (process.env.RESEND_CALLBACK === '1' && deposit?.status === 'COMPLETED') {
    const { baseUrl, token } = pawapayConfig()!
    const res = await fetch(`${baseUrl}/v2/deposits/resend-callback/${depositId}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    })
    const body = await res.text()
    check('PawaPay accepte de renvoyer le callback du dépôt', res.ok, `HTTP ${res.status} ${body.slice(0, 120)}`)
    console.log(`  À vérifier côté ${CALLBACK_BASE} : un 200 sur /api/webhooks/pawapay/deposits pour ${depositId}`)
  }

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nTous les contrôles passent.')
  if (failures) process.exitCode = 1
}

main()
