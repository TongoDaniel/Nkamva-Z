import Link from 'next/link'
import type { Metadata } from 'next'
import { Btn } from '@/components/nk/btn'
import { CommunityCard } from '@/components/nk/community-card'
import { DemoNotice } from '@/components/nk/demo-notice'
import { PageHead } from '@/components/nk/page-head'
import { COMMUNITIES } from '@/features/demo/community-data'

export const metadata: Metadata = {
  title: 'Les communautés — NkamVa',
  description: "Rejoignez la communauté d'un formateur : forum, ressources partagées et lives.",
}

export default function CommunitiesPage() {
  return (
    <div className="wrap">
      <PageHead
        crumbs={[{ label: 'Accueil', href: '/' }, { label: 'Communautés' }]}
        title="Les communautés"
        lead="Chaque formateur anime une communauté : forum d'entraide, ressources partagées et sessions live. Abonnement mensuel, résiliable à tout moment."
      />
      <DemoNotice className="mt-4" />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-xl bg-gradient-to-r from-navy to-navy2 px-7 py-5 text-white">
        <div>
          <b className="text-[17px] font-extrabold">Vous formez déjà ?</b>
          <p className="mt-0.5 text-sm text-[#b9c9dd]">
            Ouvrez votre communauté et fidélisez vos apprenants au-delà de la vente à l&apos;unité.
          </p>
        </div>
        <Btn asChild variant="light">
          <Link href="/devenir-formateur">Devenir formateur</Link>
        </Btn>
      </div>

      <div className="mt-8 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {COMMUNITIES.map((community, index) => (
          <CommunityCard key={community.slug} community={community} index={index} />
        ))}
      </div>
    </div>
  )
}
