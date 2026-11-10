// Plan d'action 3.2 : le Pilotage saisit la dépense de marketing payant du mois.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException, error } from '@/lib/api'
import { auditStandalone } from '@/lib/audit'
import { saveMarketingSpend } from '@/lib/pilotage'

const Schema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amountFcfa: z.number().int().min(0).max(1_000_000_000),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: Request) {
  const ctx = await requireAdminSubRole('PILOTAGE')
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, Schema)
  if (parsed instanceof Response) return parsed
  try {
    const row = await saveMarketingSpend({ ...parsed.data, actorId: ctx.user.id })
    await auditStandalone({
      actorId: ctx.user.id, actorRole: 'ADMIN',
      action: 'MARKETING_SPEND_SAVED', targetType: 'Platform', targetId: parsed.data.month,
      meta: { amountFcfa: parsed.data.amountFcfa },
    })
    return success(row)
  } catch (err) {
    if (err instanceof Error && (err.message === 'INVALID_MONTH' || err.message === 'INVALID_AMOUNT')) {
      return error(err.message, 'Mois ou montant invalide.', 422)
    }
    return errorFromException(err)
  }
}
