import type { Metadata } from 'next'
import { CommunitiesScreen } from '@/components/screens/communities-screen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Les communautés',
  description: "Rejoignez la communauté d'un formateur : forum, ressources partagées et lives.",
}

/**
 * L'annuaire des communautés. Il n'a plus de jumeau connecté : côté connecté,
 * chercher une communauté se fait sur `/mes-communautes`, sous les siennes.
 * C'est donc la seule liste indexable : sa première page est rendue par le
 * serveur et passée à `CommunityBrowser`, qui la pagine et l'affine ensuite.
 */
export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  // Le terme est lu par la page, pas par le composant client : la première page
  // de résultats doit être rendue par le serveur pour rester indexable, et un
  // lien de recherche partagé doit arriver sur ses résultats.
  const { q } = await searchParams
  return <CommunitiesScreen space="public" search={q ?? ''} />
}
