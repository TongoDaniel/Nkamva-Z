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
 * C'est donc la seule liste indexable — voir `CommunitySearch`, qui garde cette
 * liste rendue par le serveur derrière son champ.
 */
export default function CommunitiesPage() {
  return <CommunitiesScreen space="public" />
}
