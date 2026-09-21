// Les communautés qu'on peut découvrir — parcourues par page, affinées à la frappe.
//
// Pourquoi une route et non un filtrage dans le navigateur : **la page suivante
// n'existe pas côté client**. Précharger tout pour filtrer sur place voudrait
// dire charger toutes les communautés du produit pour n'en montrer douze.
//
// L'argument tenait aussi, avant, à la bannière : son URL était signée et
// expirait en cinq minutes, donc une liste déjà peinte pourrissait sur place.
// Les cartes portent désormais la photo du formateur, servie par une route à
// adresse stable — cette raison-là a disparu, la première suffit.
//
// Session **facultative** : la page du visiteur parcourt les mêmes communautés,
// sans compte.
import { getAuthContext, success, error } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { hiddenCommunityIdsFor, listPublicCommunities } from '@/lib/communities'
import { COMMUNITIES_PAGE_SIZE, SEARCH_MIN_LENGTH } from '@/lib/search-limits'
import { userAvatarSrc } from '@/lib/avatars'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = (url.searchParams.get('search') ?? '').trim()

  // Sous le seuil, le terme est **ignoré** — il ne vide pas la réponse. Deux
  // lettres suffisent à faire du bruit, une seule le garantit ; mais cette
  // route ne sert plus seulement une recherche, elle sert aussi le premier
  // écran d'une liste qu'on parcourt. Rendre vide reviendrait à faire
  // disparaître la liste entre la première et la deuxième lettre tapée.
  const search = raw.length >= SEARCH_MIN_LENGTH ? raw : undefined

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)

  const auth = await getAuthContext()
  const identifier = getRateLimitIdentifier(auth?.user ?? null, request)
  const limit = checkRateLimit(
    identifier,
    'COMMUNITY_SEARCH',
    RATE_LIMITS.COMMUNITY_SEARCH.max,
    RATE_LIMITS.COMMUNITY_SEARCH.windowMs,
  )
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de recherches. Réessayez dans ${limit.retryAfter} secondes.`, 429)
  }

  // L'exclusion est **demandée**, pas déduite de la présence d'une session.
  //
  // C'est l'écran qui sait si elle a un sens : sur `/mes-communautes`, les
  // siennes sont déjà en haut de page et les répéter dessous afficherait deux
  // fois la même carte. Sur l'annuaire du visiteur, il n'y a rien au-dessus —
  // y cacher sa propre communauté à quelqu'un de connecté n'aurait servi
  // personne, et c'est pourtant ce que faisait la déduction automatique.
  //
  // **Quelles** communautés exclure reste dérivé du serveur : une liste
  // d'identifiants venue du navigateur se trafique.
  const excludeIds =
    url.searchParams.get('exclude') === 'mine' && auth
      ? await hiddenCommunityIdsFor(auth.user.id, auth.user.trainerId)
      : []

  const result = await listPublicCommunities({
    search,
    excludeIds,
    page,
    pageSize: COMMUNITIES_PAGE_SIZE,
  })

  // La forme est celle de `CommunityCardData` : la carte est la même que celle
  // des listes rendues par le serveur, et ne reçoit jamais une clé S3.
  return success(
    result.items.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      priceFcfa: c.priceFcfa,
      membersCount: c.membersCount,
      visibility: c.visibility,
      trainerName: c.trainer.fullName ?? 'Formateur NKAMVA',
      trainerAvatarUrl: userAvatarSrc({
        id: c.trainer.userId,
        avatarS3Key: c.trainer.avatarS3Key,
        avatarUrl: c.trainer.avatarUrl,
      }),
    })),
    { total: result.total, page: result.page, pageSize: result.pageSize },
  )
}
