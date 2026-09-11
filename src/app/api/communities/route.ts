// Recherche de communautés — le seul point d'entrée de la recherche à la frappe.
//
// Pourquoi une route et non un filtrage dans le navigateur : la bannière d'une
// communauté est servie par une **URL signée** qui expire en cinq minutes. Une
// liste préchargée puis filtrée sur place afficherait, au bout de cinq minutes,
// des vignettes mortes sans le moindre message. Chaque réponse re-signe ce
// qu'elle renvoie.
//
// Session **facultative** : la page du visiteur cherche la même chose, sans
// compte. Quand il y a une session, elle sert à retirer des résultats les
// communautés que la personne anime ou dont elle est déjà membre.
import { getAuthContext, success, error } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { hiddenCommunityIdsFor, listPublicCommunities } from '@/lib/communities'
import { SEARCH_MIN_LENGTH } from '@/lib/search-limits'
import { presignDownload } from '@/lib/s3'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const search = (url.searchParams.get('search') ?? '').trim()

  // Sous le seuil, on ne cherche pas : deux lettres suffisent à faire du bruit,
  // une seule le garantit. Réponse vide plutôt qu'une erreur — ce n'est pas une
  // faute de l'appelant, c'est une saisie en cours.
  if (search.length < SEARCH_MIN_LENGTH) return success([])

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

  const excludeIds = auth ? await hiddenCommunityIdsFor(auth.user.id, auth.user.trainerId) : []
  const communities = await listPublicCommunities(search, excludeIds)

  // Signer en parallèle, et seulement ce qui a une bannière déposée.
  const covers = new Map(
    await Promise.all(
      communities
        .filter((c) => c.coverS3Key)
        .map(async (c) => [c.id, await presignDownload(c.coverS3Key!)] as const),
    ),
  )

  // La forme est celle de `CommunityCardData` : la carte est la même que celle
  // des listes rendues par le serveur, et ne reçoit jamais une clé S3.
  return success(
    communities.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      priceFcfa: c.priceFcfa,
      membersCount: c.membersCount,
      includedCount: c.includedCount,
      trainerName: c.trainer.fullName ?? 'Formateur NkamVa',
      coverUrl: covers.get(c.id) ?? null,
    })),
  )
}
