import type { Metadata } from 'next'
import { CommunityScreen } from '@/components/screens/community-screen'
import { getPublicCommunity } from '@/lib/communities'
import { getAuthContext } from '@/lib/api'

// Rendu à la demande : le nombre de membres et les ressources incluses bougent
// à chaque adhésion et à chaque liaison.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  // Le lecteur compte jusque dans les métadonnées : sans lui, le membre d'une
  // communauté privée verrait « Communauté introuvable » dans son onglet, sur
  // une page qui s'affiche parfaitement.
  const auth = await getAuthContext()
  const community = await getPublicCommunity(slug, auth?.user.id)
  if (!community) return { title: 'Communauté introuvable' }
  return { title: community.name, description: community.description ?? undefined }
}

/** Fiche communauté côté visiteur — l'URL partageable et indexable. */
export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <CommunityScreen slug={slug} space="public" />
}
