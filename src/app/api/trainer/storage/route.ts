// Stockage du formateur — état, et achat ou libération de paliers de 50 Go.
import { z } from 'zod'
import { success, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { getTrainerStorage, setTrainerStorageTiers } from '@/lib/storage-tiers'

// Un plafond volontairement bas : passer de 0 à 40 paliers d'un clic engagerait
// deux téraoctets et une facture à l'avenant. Au-delà, c'est une conversation.
const TiersSchema = z.object({ tiers: z.number().int().min(0).max(20) }).strict()

export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  try {
    return success(await getTrainerStorage(ctx.user.trainerId!))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function PATCH(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, TiersSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(
      await setTrainerStorageTiers(ctx.user.trainerId!, ctx.user.id, parsed.data.tiers),
    )
  } catch (err) {
    return errorFromException(err)
  }
}
