// Formateur — les membres de son salon, et leur droit à la parole
//
// `bannedAt` était lu partout et écrit nulle part : `resolveViewer` en tirait
// le silence dans le fil, `blockerFor` le refus d'une invitation, et aucun
// formateur ne pouvait poser la sanction que tout le produit sait interpréter.

import { z } from 'zod'
import { success, error, requireTrainer, parseBody } from '@/lib/api'
import { listCommunityMembers, banCommunityMember, unbanCommunityMember } from '@/lib/communities'

const ModerateSchema = z
  .object({
    learnerId: z.string().uuid(),
    action: z.enum(['BAN', 'UNBAN']),
    // Obligatoire pour bannir : le motif est montré au membre et sert de trace
    // le jour où la décision est contestée.
    reason: z.string().trim().min(10).max(1000).optional(),
  })
  .strict()

export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  try {
    return success(await listCommunityMembers(communityId, ctx.user.trainerId!))
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    if (code === 'COMMUNITY_NOT_FOUND') return error(code, 'Communauté introuvable.', 404)
    if (code === 'NOT_OWNER') return error(code, 'Cette communauté n’est pas la vôtre.', 403)
    return error('INTERNAL_ERROR', 'La liste n’a pas pu être chargée.', 500)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  const parsed = await parseBody(request, ModerateSchema)
  if (parsed instanceof Response) return parsed
  const { learnerId, action, reason } = parsed.data

  try {
    if (action === 'BAN') {
      if (!reason) return error('REASON_REQUIRED', 'Motivez la décision : elle est montrée au membre.', 400)
      return success(
        await banCommunityMember(communityId, learnerId, ctx.user.trainerId!, ctx.user.id, reason),
      )
    }
    return success(await unbanCommunityMember(communityId, learnerId, ctx.user.trainerId!, ctx.user.id))
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    const messages: Record<string, [string, number]> = {
      COMMUNITY_NOT_FOUND: ['Communauté introuvable.', 404],
      NOT_OWNER: ['Cette communauté n’est pas la vôtre.', 403],
      MEMBER_NOT_FOUND: ['Cette personne n’est pas membre de votre salon.', 404],
      MEMBER_NOT_BANNED: ['Cette personne n’est pas bannie.', 409],
      ALREADY_BANNED: ['Cette personne est déjà bannie.', 409],
      REASON_REQUIRED: ['Motivez la décision : elle est montrée au membre.', 400],
    }
    const [message, status] = messages[code] ?? ['L’action n’a pas pu être appliquée.', 500]
    return error(code, message, status)
  }
}
