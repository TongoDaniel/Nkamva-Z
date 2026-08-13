// ==========================================================================
// La couverture d'une ressource, à une adresse stable
// ==========================================================================
// `coverS3Key` entrait bien en base — le bouton passait à « Remplacer la
// couverture » — mais **aucune surface ne lisait la colonne** : cartes du
// catalogue, fiche et panneau du formateur rendaient tous la couverture
// *générée* à partir de la catégorie et du format. Un formateur déposait son
// image, voyait le message de succès, et rien ne changeait nulle part.
//
// Pourquoi une route plutôt qu'une URL signée posée dans les données, comme le
// fait la bannière de communauté :
//
//   · Une signature expire en cinq minutes. La bannière est rendue par une page
//     serveur, à chaque visite — la carte du catalogue, elle, traverse le DTO
//     `CourseListItem` et vit dans du JSON qu'un écran garde ouvert. L'image se
//     serait brisée toute seule au bout de cinq minutes.
//   · Signer chaque vignette d'une page de catalogue tiendrait autant de
//     signatures que de cartes, toutes renouvelées à chaque rendu, jamais
//     mises en cache par le navigateur.
//
// La route redirige vers l'objet signé plutôt que d'en relayer les octets : le
// serveur Next ne sert pas de tuyau à des images qui se comptent en mégaoctets.
// ==========================================================================

import { getAuthContext } from '@/lib/api'
import { db } from '@/lib/db'
import { presignDownload, isS3Configured, SIGNED_URL_TTL } from '@/lib/s3'

/**
 * Le cache du navigateur doit expirer **avant** la signature, sans quoi il
 * rejouerait une redirection vers une URL que R2 refuse déjà. La moitié du TTL
 * laisse la marge nécessaire.
 */
const REDIRECT_MAX_AGE = Math.floor(SIGNED_URL_TTL / 2)

/** Rien à montrer : l'appelant retombe sur la couverture générée. */
const notFound = () => new Response(null, { status: 404 })

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { status: true, trainerId: true, coverS3Key: true },
  })
  if (!course?.coverS3Key) return notFound()

  // Une couverture est publique dès que la ressource l'est. Tant qu'elle ne
  // l'est pas — brouillon, archivée, ou sortie du catalogue pour impayé —, elle
  // n'est visible que de son auteur, qui en a besoin dans son écran d'édition.
  // 404 et non 403 : un code distinct dirait qu'un brouillon existe à cet
  // identifiant, ce qui suffirait à cartographier les ressources non publiées.
  if (course.status !== 'published') {
    const auth = await getAuthContext()
    if (!auth?.user.trainerId || auth.user.trainerId !== course.trainerId) return notFound()
  }

  // Sans stockage configuré, `presignDownload` renvoie une URL factice
  // `data:placeholder-download/…`. Rediriger dessus afficherait une image
  // cassée ; un 404 laisse la couverture générée reprendre sa place.
  if (!isS3Configured()) return notFound()

  return new Response(null, {
    status: 302,
    headers: {
      Location: await presignDownload(course.coverS3Key),
      'Cache-Control': `private, max-age=${REDIRECT_MAX_AGE}`,
    },
  })
}
