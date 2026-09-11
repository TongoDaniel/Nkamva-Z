// Les communautés qu'on peut découvrir — parcourues par page, affinées à la frappe.
//
// Pourquoi une route et non un filtrage dans le navigateur : la bannière d'une
// communauté est servie par une **URL signée** qui expire en cinq minutes. Une
// liste préchargée puis filtrée sur place afficherait, au bout de cinq minutes,
// des vignettes mortes sans le moindre message. Chaque réponse re-signe ce
// qu'elle renvoie — et une page suivante n'existe de toute façon pas côté client.
//
// Session **facultative** : la page du visiteur parcourt les mêmes communautés,
// sans compte.
import { getAuthContext, success, error } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { hiddenCommunityIdsFor, listPublicCommunities } from '@/lib/communities'
import { COMMUNITIES_PAGE_SIZE, SEARCH_MIN_LENGTH } from '@/lib/search-limits'
import { presignDownload } from '@/lib/s3'

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

  // Signer en parallèle, et seulement ce qui a une bannière déposée.
  const covers = new Map(
    await Promise.all(
      result.items
        .filter((c) => c.coverS3Key)
        .map(async (c) => [c.id, await presignDownload(c.coverS3Key!)] as const),
    ),
  )

  // La forme est celle de `CommunityCardData` : la carte est la même que celle
  // des listes rendues par le serveur, et ne reçoit jamais une clé S3.
  return success(
    result.items.map((c) => ({
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
    { total: result.total, page: result.page, pageSize: result.pageSize },
  )
}
