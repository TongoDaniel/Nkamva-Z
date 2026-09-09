// ==========================================================================
// La photo d'un groupe, à une adresse stable
// ==========================================================================
// Jumelle de `api/media/users/[userId]/avatar` — mêmes raisons, même forme.
//
// Qui la voit : tout le monde si la communauté est publique et ouverte, ses
// membres et son formateur sinon. C'est la visibilité de la communauté
// elle-même, pas une règle de plus : une photo n'est pas plus secrète que le
// nom qu'elle accompagne.
// ==========================================================================

import { getAuthContext } from '@/lib/api'
import { db } from '@/lib/db'
import { presignDownload, isS3Configured, SIGNED_URL_TTL } from '@/lib/s3'

const REDIRECT_MAX_AGE = Math.floor(SIGNED_URL_TTL / 2)
const notFound = () => new Response(null, { status: 404 })

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const { communityId } = await params

  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { avatarS3Key: true, status: true, visibility: true, trainerId: true },
  })
  if (!community?.avatarS3Key) return notFound()
  if (community.status !== 'active') return notFound()

  if (community.visibility !== 'PUBLIC') {
    const auth = await getAuthContext()
    if (!auth) return notFound()
    const admis =
      auth.user.trainerId === community.trainerId ||
      (await db.communitySubscription.findFirst({
        where: { communityId, learnerId: auth.user.id },
        select: { id: true },
      })) !== null
    if (!admis) return notFound()
  }

  if (!isS3Configured()) return notFound()

  return new Response(null, {
    status: 302,
    headers: {
      Location: await presignDownload(community.avatarS3Key),
      'Cache-Control': `private, max-age=${REDIRECT_MAX_AGE}`,
    },
  })
}
