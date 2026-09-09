// ==========================================================================
// La photo d'une personne, à une adresse stable
// ==========================================================================
// Pourquoi une route plutôt qu'une URL signée posée dans les données, comme le
// fait la bannière d'une communauté : la même raison que la couverture d'une
// ressource, et elle est écrite en détail dans
// `api/media/courses/[courseId]/cover/route.ts`. Une signature expire en cinq
// minutes ; cette photo-ci voyage dans le JSON de la liste des conversations,
// qu'un écran garde ouverte bien plus longtemps que cela.
//
// Qui a le droit de la voir — arbitrage rendu ici :
//
//   · **Une session connectée**, quelle qu'elle soit. La photo se croise déjà
//     dans un groupe, dans la liste des membres d'une communauté, en tête d'un
//     fil : restreindre la route aux seules personnes qui partagent quelque
//     chose avec celle-ci demanderait, à chaque vignette, la requête
//     d'appartenance que l'écran vient de faire. Les identifiants sont des
//     UUID : on ne parcourt pas l'annuaire avec.
//   · **Un visiteur** ne voit que celle d'un formateur déjà public, au sens de
//     `PUBLIC_TRAINER_WHERE` — la règle de l'annuaire, jamais recopiée ici.
//
// 404 et non 403 partout : un code distinct dirait qu'un compte existe à cet
// identifiant.
// ==========================================================================

import { getAuthContext } from '@/lib/api'
import { db } from '@/lib/db'
import { PUBLIC_TRAINER_WHERE } from '@/lib/trainers'
import { presignDownload, isS3Configured, SIGNED_URL_TTL } from '@/lib/s3'

/**
 * Le cache du navigateur doit expirer **avant** la signature, sans quoi il
 * rejouerait une redirection vers une URL que R2 refuse déjà.
 */
const REDIRECT_MAX_AGE = Math.floor(SIGNED_URL_TTL / 2)

/** Rien à montrer : l'appelant retombe sur les initiales. */
const notFound = () => new Response(null, { status: 404 })

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { avatarS3Key: true, suspendedAt: true },
  })
  if (!user?.avatarS3Key) return notFound()

  // Un compte suspendu ne montre plus son visage : sa photo est du contenu
  // qu'il a posé, comme le reste.
  if (user.suspendedAt) return notFound()

  const auth = await getAuthContext()
  if (!auth) {
    const publicTrainer = await db.trainerProfile.findFirst({
      where: { userId, ...PUBLIC_TRAINER_WHERE },
      select: { id: true },
    })
    if (!publicTrainer) return notFound()
  }

  // Sans stockage configuré, `presignDownload` renvoie une URL factice
  // `data:placeholder-download/…`. Rediriger dessus afficherait une image
  // cassée ; un 404 laisse les initiales reprendre leur place.
  if (!isS3Configured()) return notFound()

  return new Response(null, {
    status: 302,
    headers: {
      Location: await presignDownload(user.avatarS3Key),
      'Cache-Control': `private, max-age=${REDIRECT_MAX_AGE}`,
    },
  })
}
