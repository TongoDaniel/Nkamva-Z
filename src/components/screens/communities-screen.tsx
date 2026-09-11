import { Users } from 'lucide-react'
import { BtnLink } from '@/components/nk/button-link'
import { EmptyState } from '@/components/nk/empty-state'
import { PageHead } from '@/components/nk/page-head'
import { CommunityCard } from '@/components/nk/community-card'
import { CommunitySearch } from '@/components/nk/community-search'
import { getAuthContext } from '@/lib/api'
import { listPublicCommunities } from '@/lib/communities'
import { presignDownload } from '@/lib/s3'
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

      {/*
        Le champ de recherche, et la liste derrière lui. La liste reste rendue
        par le serveur et passée en `children` : cette page est indexable, et un
        champ qui aurait tout remplacé au montage l'aurait vidée aux yeux d'un
        robot. Il ne prend la place de la liste que lorsqu'une recherche court.
      */}
      <CommunitySearch space={space}>
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
            {communities.map((community, index) => (
              <CommunityCard
                key={community.id}
                community={{
                  id: community.id,
                  slug: community.slug,
                  name: community.name,
                  description: community.description,
                  priceFcfa: community.priceFcfa,
                  membersCount: community.membersCount,
                  includedCount: community.includedCount,
                  trainerName: community.trainer.fullName ?? 'Formateur NkamVa',
                  coverUrl: covers.get(community.id) ?? null,
                }}
                href={routes.community(community.slug)}
                eager={index === 0}
              />
            ))}
          </div>
        )}
      </CommunitySearch>
    </div>
  )
}
