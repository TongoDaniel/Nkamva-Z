import Link from 'next/link'
import { Users, Library } from 'lucide-react'
import { Btn } from '@/components/nk/button'
import { EmptyState } from '@/components/nk/empty-state'
import { PageHead } from '@/components/nk/page-head'
import { Price } from '@/components/nk/resource-card'
import { Avatar } from '@/components/nk/avatar'
import { listPublicCommunities } from '@/lib/communities'
import { fmtNumber } from '@/lib/format'
import { routesOf, type Space } from '@/lib/spaces'

/** Liste des communautés, rendue à l'identique dans les deux espaces. */
export async function CommunitiesScreen({ space }: { space: Space }) {
  const routes = routesOf(space)
  const communities = await listPublicCommunities()

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: 'Accueil', href: routes.home }, { label: 'Communautés' }]}
        title="Les communautés"
        lead="Chaque formateur anime une communauté : forum d'entraide, ressources partagées et sessions live. Abonnement mensuel, résiliable à tout moment."
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-xl bg-gradient-to-r from-navy to-navy-2 px-7 py-5 text-white">
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

      {communities.length === 0 ? (
        <EmptyState
          className="mt-9"
          icon={<Users />}
          title="Aucune communauté ouverte"
          description="Les formateurs n'ont pas encore ouvert leur communauté. Revenez bientôt."
          action={
            <Btn asChild variant="o">
              <Link href={routes.catalog}>Parcourir le catalogue</Link>
            </Btn>
          }
        />
      ) : (
        <div className="mt-9 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <article
              key={community.id}
              className="flex flex-col overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm transition duration-200 hover:-translate-y-1 hover:shadow-nk"
            >
              <div className="h-[104px] bg-gradient-to-br from-navy to-info" />
              <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-4">
                <h2 className="text-[17px] font-extrabold leading-tight">
                  <Link href={routes.community(community.slug)} className="text-ink hover:text-brand">
                    {community.name}
                  </Link>
                </h2>

                <div className="flex items-center gap-2">
                  <Avatar name={community.trainer.fullName ?? 'Formateur NkamVa'} size="sm" />
                  <span className="truncate text-[13px] font-semibold text-ink-2">
                    {community.trainer.fullName ?? 'Formateur NkamVa'}
                  </span>
                </div>

                {community.description ? (
                  <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">
                    {community.description}
                  </p>
                ) : null}

                <dl className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-4 text-[12.5px] text-ink-3">
                  <div className="flex items-center gap-3.5">
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" aria-hidden="true" />
                      {fmtNumber(community.membersCount)}
                    </span>
                    {community.includedCount > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <Library className="size-3.5" aria-hidden="true" />
                        {community.includedCount} incluse{community.includedCount > 1 ? 's' : ''}
                      </span>
                    ) : null}
                  </div>
                  <span>
                    <Price amountFcfa={community.priceFcfa} className="text-[16px]" />
                    <small className="ml-1 text-xs font-semibold text-ink-3">/ mois</small>
                  </span>
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
