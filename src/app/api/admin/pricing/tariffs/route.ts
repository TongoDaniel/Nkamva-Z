// Super-admin : poser un tarif d'abonnement plateforme (décision 59)
// Le tarif est daté et jamais rétroactif ; le précédent est borné, pas réécrit.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { setTariff } from '@/lib/pricing'

const SetSchema = z.object({
  cadence: z.enum(['MONTHLY', 'YEARLY']),
  // Zéro est une valeur légitime : c'est la gratuité de lancement (décision 56).
  amountFcfa: z.number().int().min(0),
  validFrom: z.string(),
  label: z.string().max(200).optional(),
})

export async function POST(request: Request) {
  // Décision 60 — la grille et la bascule appartiennent au Super-admin seul.
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, SetSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(
      await setTariff({
        cadence: parsed.data.cadence,
        amountFcfa: parsed.data.amountFcfa,
        validFrom: new Date(parsed.data.validFrom),
        label: parsed.data.label,
        actorId: ctx.user.id,
      }),
      undefined,
      201,
    )
  } catch (err) {
    return errorFromException(err)
  }
}
