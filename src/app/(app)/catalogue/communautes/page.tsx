import type { Metadata } from 'next'
import { CommunitiesScreen } from '@/components/screens/communities-screen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Les communautés',
  description: "Rejoignez la communauté d'un formateur : forum, ressources partagées et lives.",
  robots: { index: false },
}

/** Liste des communautés côté connecté. Jumeau visiteur : `/communautes`. */
export default function CommunautesConnectePage() {
  return <CommunitiesScreen space="app" />
}
