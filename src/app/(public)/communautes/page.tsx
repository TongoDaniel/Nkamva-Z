import type { Metadata } from 'next'
import { CommunitiesScreen } from '@/components/screens/communities-screen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Les communautés',
  description: "Rejoignez la communauté d'un formateur : forum, ressources partagées et lives.",
}

/** Liste des communautés côté visiteur. Jumeau connecté : `/catalogue/communautes`. */
export default function CommunitiesPage() {
  return <CommunitiesScreen space="public" />
}
