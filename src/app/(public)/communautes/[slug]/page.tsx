import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { MessageSquare, PlayCircle, Users } from 'lucide-react'
import { Btn } from '@/components/nk/btn'
import { Chip } from '@/components/nk/chip'
import { Price } from '@/components/nk/price'
import { PageHead } from '@/components/nk/page-head'
import { DemoNotice } from '@/components/nk/demo-notice'
import { ResourceCard } from '@/components/nk/resource-card'
import { resourcesByAuthor, toCourseListItem } from '@/features/demo/catalog-data'
import { COMMUNITIES, SALONS, communityBySlug } from '@/features/demo/community-data'

export function generateStaticParams() {
  return COMMUNITIES.map(community => ({ slug: community.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const community = communityBySlug(slug)
  if (!community) return { title: 'Communauté introuvable — NkamVa' }
  return { title: `${community.name} — NkamVa`, description: community.description }
}

const SALON_ICONS = {
  forum: MessageSquare,
  res: Users,
  live: PlayCircle,
} as const

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const community = communityBySlug(slug)
  if (!community) notFound()

  const resources = resourcesByAuthor(community.author.id)

  return (
    <div className="wrap">
      <PageHead
        crumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Communautés', href: '/communautes' },
          { label: community.name },
        ]}
        title={community.name}
        lead={
          <Chip tone={community.category.tone} className="mt-3">
            {community.category.label}
          </Chip>
        }
      />
      <DemoNotice className="mt-4" />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="relative overflow-hidden rounded-xl border border-line bg-card">
            <div className="h-[140px] bg-gradient-to-br from-navy to-info" />
            <div className="px-6 pb-6">
              <span className="-mt-8 grid size-[64px] place-items-center rounded-[18px] border-[3px] border-card bg-navy2 font-display text-xl font-extrabold text-white">
                {community.author.initials}
              </span>
              <p className="mt-3 text-[15px] text-ink2">
                Animée par{' '}
                <Link href={`/formateurs/${community.author.id}`} className="font-bold text-ink hover:text-brand">
                  {community.author.name}
                </Link>{' '}
                · {community.author.role}
              </p>
              <p className="mt-3 leading-[1.65] text-ink2">{community.description}</p>

              <div className="mt-5 flex flex-wrap gap-6 border-t border-line2 pt-4 text-sm text-ink2">
                <span>
                  <b className="font-bold text-ink">{community.members.toLocaleString('fr-FR')}</b> membres
                </span>
                <span>
                  <b className="font-bold text-ink">{community.messages}</b> messages cette semaine
                </span>
                <span>
                  <b className="font-bold text-ink">{community.lives}</b> lives à venir
                </span>
              </div>
            </div>
          </div>

          <section className="mt-9">
            <h2 className="mb-4 text-[21px] font-extrabold">Ce que vous y trouverez</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {SALONS.map(salon => {
                const Icon = SALON_ICONS[salon.key]
                return (
                  <div key={salon.key} className="rounded-xl border border-line bg-card p-5">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-t text-brand">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-3 text-base font-bold">{salon.label}</h3>
                    <p className="mt-1 text-[13.5px] leading-[1.5] text-ink2">{salon.description}</p>
                  </div>
                )
              })}
            </div>
          </section>

          {resources.length > 0 && (
            <section className="mt-9">
              <h2 className="mb-5 text-[21px] font-extrabold">Les ressources de {community.author.name}</h2>
              <div className="grid gap-[18px] sm:grid-cols-2">
                {resources.map((resource) => (
                  <ResourceCard key={resource.slug} course={toCourseListItem(resource)} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-[86px]">
          <div className="rounded-xl border border-line bg-card p-5 shadow-sm">
            <span>
              <Price amount={community.price} className="text-[28px]" />
              <small className="ml-1 text-[13px] font-semibold text-ink3">/ mois</small>
            </span>
            <p className="mt-1 text-[13px] text-ink3">Résiliable à tout moment</p>

            <Btn asChild size="lg" className="mt-4 w-full">
              <Link href={`/auth/connexion?callbackUrl=/communautes/${community.slug}`}>Rejoindre la communauté</Link>
            </Btn>

            <ul className="mt-4 grid gap-2 border-t border-line2 pt-4 text-[13.5px] text-ink2">
              <li>Accès au forum et à l&apos;entraide entre membres</li>
              <li>Ressources partagées par l&apos;animateur</li>
              <li>Lives et rediffusions réservés aux membres</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
