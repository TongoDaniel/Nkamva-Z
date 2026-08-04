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
import { fmtNumber } from '@/lib/format'

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
  const community = await getPublicCommunity(slug)
  if (!community) return { title: 'Communauté introuvable' }
  return { title: community.name, description: community.description ?? undefined }
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const community = await getPublicCommunity(slug)
  if (!community) notFound()

  const trainerName = community.trainer.fullName ?? 'Formateur NkamVa'

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

            {/* L'adhésion payante n'existe pas encore : aucune route, aucun
                service. Annoncer un bouton « Rejoindre » qui renvoie vers la
                connexion et n'y revient jamais serait pire que de le dire. */}
            <p className="mt-4 rounded-nk-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              L&apos;adhésion en ligne n&apos;est pas encore ouverte. Contactez{' '}
              <Link href="/contact" className="font-bold text-brand">
                le support
              </Link>{' '}
              pour rejoindre cette communauté.
            </p>

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
