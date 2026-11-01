import { success, error, getAuthContext } from '@/lib/api'
import { getPublicCommunity } from '@/lib/communities'

/**
 * Fiche publique d'une communauté, pour l'application mobile : ce que montre
 * déjà la page `/communautes/[slug]` du site, sans compte. Un visiteur doit
 * pouvoir juger de ce qu'on propose avant qu'on lui demande de s'inscrire
 * (règle 5.1.1(v) de l'App Store). Une communauté privée reste invisible à qui
 * n'en est pas membre.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getAuthContext()
  const community = await getPublicCommunity(slug, ctx?.user.id ?? null)
  if (!community) return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable.', 404)
  return success(community)
}
