import { Users } from 'lucide-react'
import { BtnLink } from '@/components/nk/button-link'
import { EmptyState } from '@/components/nk/empty-state'
import { PageHead } from '@/components/nk/page-head'
import { CommunityBrowser } from '@/components/nk/community-browser'
import { getAuthContext } from '@/lib/api'
import { listPublicCommunities } from '@/lib/communities'
import { COMMUNITIES_PAGE_SIZE } from '@/lib/search-limits'
import { userAvatarSrc } from '@/lib/avatars'
import { routesOf, type Space } from '@/lib/spaces'

/**
 * L'annuaire des communautés, parcouru par pages.
 *
 * La première page est rendue **ici**, côté serveur, et passée au composant qui
 * la parcourt : cette page est indexable, et une liste qui n'apparaîtrait
 * qu'après le JavaScript l'aurait vidée aux yeux d'un robot. Le terme aussi est
 * lu ici, pour qu'un lien de recherche partagé arrive sur ses résultats.
 *
 * Aucune exclusion sur cette surface, même pour quelqu'un de connecté : il n'y
 * a rien au-dessus qui redirait ses communautés, donc les lui cacher n'aurait
 * servi personne. C'est `/mes-communautes` qui demande l'exclusion.
 */
export async function CommunitiesScreen({
  space,
  search = '',
}: {
  space: Space
  search?: string
}) {
  const routes = routesOf(space)
  const terme = search.trim()
  const [page, auth] = await Promise.all([
    listPublicCommunities({ search: terme || undefined, pageSize: COMMUNITIES_PAGE_SIZE }),
    getAuthContext(),
  ])
  // Proposer de devenir formateur à quelqu'un qui l'est déjà — et dont une
  // communauté figure peut-être dans la liste juste en dessous. Les deux pages
  // qui rendent cet écran sont `force-dynamic` : lire la session ici ne coûte
  // aucun rendu statique, et le visiteur sans session voit le bandeau.
  const isTrainer = Boolean(auth?.user.trainerId)

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
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

      <CommunityBrowser
        space={space}
        initialTerm={terme}
        initial={{
          items: page.items.map((community) => ({
            id: community.id,
            slug: community.slug,
            name: community.name,
            priceFcfa: community.priceFcfa,
            membersCount: community.membersCount,
            visibility: community.visibility,
            trainerName: community.trainer.fullName ?? 'Formateur NKAMVA',
            trainerAvatarUrl: userAvatarSrc({
              id: community.trainer.userId,
              avatarS3Key: community.trainer.avatarS3Key,
              avatarUrl: community.trainer.avatarUrl,
            }),
          })),
          total: page.total,
          page: page.page,
          pageSize: page.pageSize,
        }}
        empty={
          <EmptyState
            className="mt-6"
            icon={<Users />}
            title="Aucune communauté ouverte"
            description="Les formateurs n'ont pas encore ouvert leur communauté. Revenez bientôt."
            action={<BtnLink href={routes.catalog} variant="o">Parcourir le catalogue</BtnLink>}
          />
        }
      />
    </div>
  )
}
