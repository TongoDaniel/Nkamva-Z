// Taux de change FCFA → devise d'encaissement.
//
// Finances et Super-admin : un taux décide de ce que paie réellement un
// apprenant hors zone franc, au même titre qu'une grille tarifaire. Un chiffre
// faux ici mésestime **toutes** les ventes du pays concerné, sans rien casser
// de visible — d'où la trace d'audit et le refus de toute valeur hors bornes.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { setFxRate } from '@/lib/fx'
import { auditStandalone } from '@/lib/audit'

const UpdateSchema = z.object({
  /**
   * Unités de la devise pour **un** FCFA. Les bornes ne sont pas décoratives :
   * 1 FCFA vaut environ 4,3 TZS et 0,0016 USD — quatre ordres de grandeur
   * séparent les extrêmes légitimes, et une virgule mal placée sort de cette
   * fenêtre bien avant de passer inaperçue.
   */
  unitsPerXaf: z.number().positive().min(0.000001).max(100000),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ currency: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { currency } = await params

  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed

  try {
    await setFxRate(currency, parsed.data.unitsPerXaf, ctx.user.id)
    await auditStandalone({
      actorId: ctx.user.id, actorRole: 'ADMIN',
      action: 'FX_RATE_UPDATED', targetType: 'FxRate', targetId: currency.toUpperCase(),
      meta: { currency: currency.toUpperCase(), unitsPerXaf: parsed.data.unitsPerXaf },
    })
    return success({ currency: currency.toUpperCase(), unitsPerXaf: parsed.data.unitsPerXaf })
  } catch (err) {
    return errorFromException(err)
  }
}
