import Link from 'next/link'
import { Users, Library } from 'lucide-react'
import { BtnLink } from '@/components/nk/button-link'
import { EmptyState } from '@/components/nk/empty-state'
import { PageHead } from '@/components/nk/page-head'
import { Price } from '@/components/nk/resource-card'
import { Avatar } from '@/components/nk/avatar'
import { getAuthContext } from '@/lib/api'
import { listPublicCommunities } from '@/lib/communities'
import { presignDownload } from '@/lib/s3'
import { fmtNumber } from '@/lib/format'
import { routesOf, type Space } from '@/lib/spaces'

/** Liste des communautés, rendue à l'identique dans les deux espaces. */
export async function CommunitiesScreen({ space }: { space: Space }) {
  const routes = routesOf(space)
  const [communities, auth] = await Promise.all([listPublicCommunities(), getAuthContext()])
  // Une URL signée par bannière déposée — produites en parallèle, elles
  // expirent en cinq minutes et ne survivent donc pas à ce rendu.
  const covers = new Map(
    await Promise.all(
      communities
        .filter((c) => c.coverS3Key)
        .map(async (c) => [c.id, await presignDownload(c.coverS3Key!)] as const),
    ),
  )
  // Proposer de devenir formateur à quelqu'un qui l'est déjà — et dont une
  // communauté figure peut-être dans la liste juste en dessous. Les deux pages
  // qui rendent cet écran sont `force-dynamic` : lire la session ici ne coûte
  // aucun rendu statique, et le visiteur sans session voit le bandeau.
  const isTrainer = Boolean(auth?.user.trainerId)

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[routes.communitiesParent, { label: 'Les communautés' }]}
        title="Les communautés"
        lead="Chaque formateur anime une communauté : forum d'entraide, ressources partagées et sessions live. Abonnement mensuel, résiliable à tout moment."
      />

      {isTrainer ? null : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-xl bg-gradient-to-r from-navy to-navy-2 px-7 py-5 text-white">
          <div>
            <b className="text-[17px] font-extrabold">Vous formez déjà ?</b>
            <p className="mt-0.5 text-sm text-[#b9c9dd]">
              Ouvrez votre communauté et fidélisez vos apprenants au-delà de la vente à l&apos;unité.
            </p>
          </div>
          <BtnLink href="/devenir-formateur" variant="light">Devenir formateur</BtnLink>
        </div>
      )}

      {communities.length === 0 ? (
        <EmptyState
          className="mt-9"
          icon={<Users />}
          title="Aucune communauté ouverte"
          description="Les formateurs n'ont pas encore ouvert leur communauté. Revenez bientôt."
          action={
            <BtnLink href={routes.catalog} variant="o">Parcourir le catalogue</BtnLink>
          }
        />
      ) : (
        <div className="mt-9 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <article
              key={community.id}
              className="group relative flex flex-col overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm transition duration-200 hover:-translate-y-1 hover:shadow-nk focus-within:-translate-y-1 focus-within:shadow-nk"
            >
              {covers.get(community.id) ? (
                // `img` et non `next/image` : l'URL signée expire, le cache
                // d'images la garderait sous une clé qui lui survivrait.
                <img
                  src={covers.get(community.id)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-[104px] w-full object-cover"
                />
              ) : (
                <div className="h-[104px] bg-gradient-to-br from-navy to-info" />
              )}
              <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-4">
                <h2 className="text-[17px] font-extrabold leading-tight">
                  {/* Le lien couvre toute la carte : une seule cible cliquable, un seul
                      élément dans l'ordre de tabulation. */}
                  <Link
                    href={routes.community(community.slug)}
                    className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
                  >
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
