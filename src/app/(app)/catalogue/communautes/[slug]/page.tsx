import type { Metadata } from 'next'
import { CommunityScreen } from '@/components/screens/community-screen'
import { getPublicCommunity } from '@/lib/communities'
import { getAuthContext } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const auth = await getAuthContext()
  const community = await getPublicCommunity(slug, auth?.user.id)
  if (!community) return { title: 'Communauté introuvable' }
  return {
    title: community.name,
    description: community.description ?? undefined,
    robots: { index: false },
  }
}

/** Fiche communauté côté connecté. Jumeau visiteur : `/communautes/…`. */
export default async function CommunauteConnectePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <CommunityScreen slug={slug} space="app" />
}
