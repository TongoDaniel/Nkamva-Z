import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { MessageSquare, PlayCircle, Users, Library } from 'lucide-react'
import { Btn } from '@/components/nk/button'
import { Chip } from '@/components/nk/chip'
import { Price, ResourceCard } from '@/components/nk/resource-card'
import { PageHead } from '@/components/nk/page-head'
import { Avatar } from '@/components/nk/avatar'
import { getPublicCommunity } from '@/lib/communities'
import { getMembership } from '@/lib/memberships'
import { getAuthContext } from '@/lib/api'
import { fmtNumber } from '@/lib/format'
import { MembershipPanel } from './membership-panel'

// Rendu à la demande : le nombre de membres et les ressources incluses bougent
// à chaque adhésion et à chaque liaison. L'ancienne version pré-générait les
// pages depuis un jeu de données de démonstration.
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

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // La fiche reste publique : un visiteur non connecté la voit entièrement, et
  // le pavé d'adhésion l'emmène se connecter au moment de payer, pas avant.
  // Une communauté **privée**, elle, répond 404 à qui n'en est ni membre ni
  // l'animateur (arbitrage 81) — d'où la lecture de session avant la requête.
  const auth = await getAuthContext()
  const community = await getPublicCommunity(slug, auth?.user.id)
  if (!community) notFound()

  const trainerName = community.trainer.fullName ?? 'Formateur NkamVa'

  const membership = auth ? await getMembership(community.id, auth.user.id) : null
  const isOwner = auth?.user.trainerId === community.trainer.id

  // Les salons annoncés suivent ce que la communauté a réellement activé.
  const salons = [
    community.forumEnabled && { icon: MessageSquare, label: 'Forum d\'entraide' },
    community.resourcesEnabled && { icon: Library, label: 'Ressources partagées' },
    community.eventsEnabled && { icon: PlayCircle, label: 'Sessions live' },
  ].filter(Boolean) as { icon: typeof MessageSquare; label: string }[]

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Communautés', href: '/communautes' },
          { label: community.name },
        ]}
        title={community.name}
      />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm">
            <div className="h-[140px] bg-gradient-to-br from-navy to-info" />
            <div className="px-6 pb-6">
              <div className="-mt-8">
                <Avatar name={trainerName} size="lg" />
              </div>
              {/* Le nom mène à la fiche formateur, qui sert de vraies données. */}
              <p className="mt-3 text-[15px] text-ink-2">
                Animée par{' '}
                <Link
                  href={`/formateurs/${community.trainer.id}`}
                  className="font-bold text-ink hover:text-brand"
                >
                  {trainerName}
                </Link>
                {community.trainer.slogan ? ` · ${community.trainer.slogan}` : ''}
              </p>

              {community.description ? (
                <p className="mt-3 whitespace-pre-line leading-[1.65] text-ink-2">
                  {community.description}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-6 border-t border-line-2 pt-4 text-sm text-ink-2">
                <span>
                  <b className="font-bold text-ink">{fmtNumber(community.membersCount)}</b> membres
                </span>
                {community.includedCount > 0 ? (
                  <span>
                    <b className="font-bold text-ink">{community.includedCount}</b> ressource
                    {community.includedCount > 1 ? 's' : ''} incluse
                    {community.includedCount > 1 ? 's' : ''}
                  </span>
                ) : null}
                {community.messagesPerDay > 0 ? (
                  <span>
                    <b className="font-bold text-ink">{community.messagesPerDay}</b> messages / jour
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {salons.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-4 text-[19px] font-extrabold">Ce que vous y trouvez</h2>
              <ul className="grid gap-3 sm:grid-cols-3">
                {salons.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="flex items-center gap-2.5 rounded-nk border border-line bg-card px-4 py-3 text-[14px] font-semibold text-ink"
                  >
                    <Icon className="size-4 text-brand" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {community.rules ? (
            <section className="mt-8">
              <h2 className="mb-3 text-[19px] font-extrabold">Règles du salon</h2>
              <p className="whitespace-pre-line leading-[1.65] text-ink-2">{community.rules}</p>
            </section>
          ) : null}

          {community.courses.length > 0 ? (
            <section className="mt-9">
              <div className="mb-5 flex items-baseline gap-2">
                <h2 className="text-[19px] font-extrabold">Ressources incluses</h2>
                <Chip tone="muted" className="font-display">
                  {community.courses.length}
                </Chip>
              </div>
              {/* Arbitrage 47 — ces ressources ne sont pas vendues à l'unité :
                  elles s'obtiennent par l'abonnement, et leur prix n'a pas
                  d'objet ici. */}
              <div className="grid gap-[18px] sm:grid-cols-2">
                {community.courses.map((course) => (
                  <ResourceCard key={course.id} course={course} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-[86px]">
          <div className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
            <span>
              <Price amountFcfa={community.priceFcfa} className="text-[26px]" />
              <small className="ml-1 text-[13px] font-semibold text-ink-3">/ mois</small>
            </span>
            <p className="mt-1 text-[13px] text-ink-3">Résiliable à tout moment</p>

            <MembershipPanel
              slug={slug}
              priceFcfa={community.priceFcfa}
              isOwner={isOwner}
              membership={
                membership
                  ? {
                      status: membership.status,
                      periodEnd: membership.periodEnd.toISOString(),
                      canceledAt: membership.canceledAt?.toISOString() ?? null,
                      dueAmountFcfa: membership.dueAmountFcfa,
                      gracePeriodEndsAt: membership.gracePeriodEndsAt?.toISOString() ?? null,
                    }
                  : null
              }
            />

            <ul className="mt-4 grid gap-2 border-t border-line-2 pt-4 text-[13.5px] text-ink-2">
              <li className="flex items-center gap-2">
                <Users className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                {fmtNumber(community.membersCount)} membres
              </li>
              {community.includedCount > 0 ? (
                <li className="flex items-center gap-2">
                  <Library className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                  {community.includedCount} ressource{community.includedCount > 1 ? 's' : ''} incluse
                  {community.includedCount > 1 ? 's' : ''}
                </li>
              ) : null}
            </ul>

            <Btn asChild variant="o" className="mt-4 w-full">
              <Link href={`/formateurs/${community.trainer.id}`}>Voir le formateur</Link>
            </Btn>
          </div>
        </aside>
      </div>
    </div>
  )
}
