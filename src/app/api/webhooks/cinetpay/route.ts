// Lot 0 §5.2 — Webhook CinetPay : vérification par rappel API "check" (pas de HMAC)
//
// Approximation : le payload exact envoyé par CinetPay à notify_url n'est pas
// repris dans la spec fournie. On expose ici un contrat JSON minimal
// { transactionId } cohérent avec le reste de l'API (zod, JSON) ; à ajuster si
// le format réel du POST CinetPay diffère (ils postent historiquement en
// x-www-form-urlencoded avec un champ cpm_trans_id).
import { z } from 'zod'
import { db } from '@/lib/db'
import { creditWalletOnPurchase } from '@/lib/wallet'
import { auditStandalone } from '@/lib/audit'

const CinetPayNotifySchema = z.object({ transactionId: z.string().min(1) })

async function checkCinetPayTransaction(transactionId: string): Promise<'ACCEPTED' | 'REFUSED'> {
  if (!process.env.CINETPAY_API_KEY) {
    // Dev sans clé API : impossible d'appeler le "check" réel. Ce chemin n'est
    // emprunté que par la simulation dev de initiatePurchase.
    return 'ACCEPTED'
  }

  const res = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
    }),
  })
  if (!res.ok) return 'REFUSED'
  const data = await res.json().catch(() => null)
  return data?.data?.status === 'ACCEPTED' ? 'ACCEPTED' : 'REFUSED'
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('Invalid payload', { status: 400 })
  }

  const parsed = CinetPayNotifySchema.safeParse(body)
  if (!parsed.success) return new Response('Invalid payload', { status: 400 })

  const status = await checkCinetPayTransaction(parsed.data.transactionId)

  if (status === 'ACCEPTED') {
    await db.$transaction(async (tx) => {
      await creditWalletOnPurchase(tx, parsed.data.transactionId, 'CINETPAY')
    })
  } else {
    await auditStandalone({
      action: 'CINETPAY_WEBHOOK_REFUSED',
      meta: { transactionId: parsed.data.transactionId },
    })
  }

  return new Response(null, { status: 200 })
}
