import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Btn } from '@/components/nk/button'
import { Chip } from '@/components/nk/chip'
import { Price } from '@/components/nk/resource-card'
import { ResourceCard } from '@/components/nk/resource-card'
import { PageHead } from '@/components/nk/page-head'
import { DemoNotice } from '@/components/nk/demo-notice'
import { resourcesByAuthor, toCourseListItem } from '@/features/demo/catalog-data'
import { TRAINERS, trainerById } from '@/features/demo/community-data'

export function generateStaticParams() {
  return TRAINERS.map(trainer => ({ trainerId: trainer.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ trainerId: string }> }): Promise<Metadata> {
  const { trainerId } = await params
  const trainer = trainerById(trainerId)
  if (!trainer) return { title: 'Formateur introuvable' }
  return { title: trainer.name, description: trainer.bio }
}

export default async function TrainerPage({ params }: { params: Promise<{ trainerId: string }> }) {
  const { trainerId } = await params
  const trainer = trainerById(trainerId)
  if (!trainer) notFound()

  const resources = resourcesByAuthor(trainer.id)

  return (
    <div className="nk-wrap">
      <PageHead
        crumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Formateurs', href: '/formateurs' },
          { label: trainer.name },
        ]}
        title={trainer.name}
      />
      <DemoNotice className="mt-2" />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-start gap-5 rounded-xl border border-line bg-card p-6">
            <span className="grid size-[76px] flex-none place-items-center rounded-[22px] bg-gradient-to-br from-brand to-info font-display text-2xl font-extrabold text-white">
              {trainer.initials}
            </span>
            <div className="min-w-[220px] flex-1">
              <Chip tone={trainer.category.tone}>{trainer.category.label}</Chip>
              <p className="mt-2 text-[15px] font-semibold text-ink">{trainer.role}</p>
              <p className="text-sm text-ink-2">
                {trainer.city} · formateur depuis {trainer.since}
              </p>
              <div className="mt-3 flex flex-wrap gap-5 text-sm text-ink-2">
                <span>
                  <b className="font-bold text-ink">{trainer.students.toLocaleString('fr-FR')}</b> apprenants
                </span>
                <span>
                  <b className="font-bold text-ink">{trainer.resourceCount}</b> ressources
                </span>
                <span className="text-gold">
                  ★ <b className="font-bold text-ink">{trainer.rating.toFixed(1)}</b>
                </span>
              </div>
            </div>
          </div>

          <p className="mt-5 leading-[1.7] text-ink-2">{trainer.bio}</p>

          <section className="mt-9">
            <h2 className="mb-5 text-[21px] font-extrabold">Ses ressources</h2>
            <div className="grid gap-[18px] sm:grid-cols-2">
              {resources.map((resource) => (
                <ResourceCard key={resource.slug} course={toCourseListItem(resource)} />
              ))}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-[86px]">
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
            <div className="h-[88px] bg-gradient-to-br from-navy to-info" />
            <div className="p-5">
              <Chip tone={trainer.community.category.tone}>Communauté</Chip>
              <h3 className="mt-2 text-[17px] font-bold">
                <Link href={`/communautes/${trainer.community.slug}`} className="text-ink hover:text-brand">
                  {trainer.community.name}
                </Link>
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-ink-2">{trainer.community.description}</p>
              <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-4">
                <span>
                  <Price amountFcfa={trainer.community.price} className="text-[17px]" />
                  <small className="ml-1 text-xs font-semibold text-ink-3">/ mois</small>
                </span>
                <Btn asChild size="sm">
                  <Link href={`/communautes/${trainer.community.slug}`}>Rejoindre</Link>
                </Btn>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
