// Super-admin — l'annuaire des administrateurs, et la création d'un nouveau
//
// Aucune route ne créait de compte d'administration : le tout premier
// Super-admin naît d'une insertion manuelle en base, et c'est resté vrai à
// dessein (`src/lib/admins.ts`). Cette console gère ceux qui viennent après.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { listAdmins, createAdmin } from '@/lib/admins'

const CreateAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(254),
  fullName: z.string().trim().min(2, 'Nom requis').max(120),
  adminRole: z.enum(['SUPER_ADMIN', 'FINANCES', 'MODERATION']),
})

export async function GET() {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  return success(await listAdmins())
}

export async function POST(request: Request) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, CreateAdminSchema)
  if (parsed instanceof Response) return parsed

  try {
    const admin = await createAdmin({ ...parsed.data, actorId: ctx.user.id })
    return success(admin, {}, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
