import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Btn } from '@/components/nk/button'
import { Chip } from '@/components/nk/chip'
import { Avatar } from '@/components/nk/avatar'
import { Price, ResourceCard } from '@/components/nk/resource-card'
import { PageHead } from '@/components/nk/page-head'
import { EmptyState } from '@/components/nk/empty-state'
import { getPublicTrainer } from '@/lib/trainers'
import { fmtNumber } from '@/lib/format'
import type { CourseListItem } from '@/lib/dto'
import { Library } from 'lucide-react'

// Rendu à la demande : la liste des formateurs publics change à chaque
// approbation et à chaque publication. L'ancienne version pré-générait les
// pages depuis un jeu de données de démonstration, ce qui rendait toute fiche
// réelle introuvable.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trainerId: string }>
}): Promise<Metadata> {
  const { trainerId } = await params
  const trainer = await getPublicTrainer(trainerId)
  if (!trainer) return { title: 'Formateur introuvable' }

  const name = trainer.fullName ?? 'Formateur NkamVa'
  return {
    title: name,
    description: trainer.slogan ?? trainer.description ?? `Les ressources de ${name} sur NkamVa.`,
  }
}

export default async function TrainerPage({ params }: { params: Promise<{ trainerId: string }> }) {
  const { trainerId } = await params
  const trainer = await getPublicTrainer(trainerId)
  if (!trainer) notFound()

  const name = trainer.fullName ?? 'Formateur NkamVa'

  // Les cartes de ressources sont celles du catalogue : le formateur y est
  // rappelé sur chaque carte, on le reconstruit depuis la fiche courante plutôt
  // que de le redemander à la base pour chaque cours.
  const trainerSummary = {
    id: trainer.id,
    user: { fullName: trainer.fullName },
    ratingAverage: trainer.ratingAverage,
    ratingCount: trainer.ratingCount,
    studentsCount: trainer.studentsCount,
    slogan: trainer.slogan,
  }

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Formateurs', href: '/formateurs' },
          { label: name },
        ]}
        title={name}
      />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-start gap-5 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
            <Avatar name={name} size="lg" />
            <div className="min-w-[220px] flex-1">
              {trainer.domains.length > 0 ? (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {trainer.domains.slice(0, 3).map((domain) => (
                    <li key={domain}>
                      <Chip>{domain}</Chip>
                    </li>
                  ))}
                </ul>
              ) : null}
              {trainer.slogan ? (
                <p className="text-[15px] font-semibold text-ink">{trainer.slogan}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-5 text-sm text-ink-2">
                <span>
                  <b className="font-bold text-ink">{trainer.publishedCount}</b> ressource
                  {trainer.publishedCount > 1 ? 's' : ''}
                </span>
                {trainer.studentsCount > 0 ? (
                  <span>
                    <b className="font-bold text-ink">{fmtNumber(trainer.studentsCount)}</b> apprenants
                  </span>
                ) : null}
                {trainer.experienceYears ? (
                  <span>
                    <b className="font-bold text-ink">{trainer.experienceYears}</b> ans d&apos;expérience
                  </span>
                ) : null}
                {/* La note ne s'affiche qu'une fois notée : « 0,0 ★ » sur une
                    fiche neuve dessert un formateur qui n'a encore aucun avis. */}
                {trainer.ratingCount > 0 ? (
                  <span className="text-gold-ink">
                    ★ <b className="font-bold text-ink">{trainer.ratingAverage.toFixed(1)}</b>{' '}
                    <small>({trainer.ratingCount})</small>
                  </span>
                ) : null}
              </div>

              {trainer.websiteUrl ? (
                <a
                  href={trainer.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 inline-block text-[13.5px] font-bold text-brand hover:text-brand-dark"
                >
                  Site web
                </a>
              ) : null}
            </div>
          </div>

          {trainer.description ? (
            <p className="mt-5 whitespace-pre-line leading-[1.7] text-ink-2">{trainer.description}</p>
          ) : null}

          <section className="mt-9">
            <h2 className="mb-5 text-[21px] font-extrabold">Ses ressources</h2>
            {trainer.courses.length === 0 ? (
              <EmptyState
                icon={<Library />}
                title="Aucune ressource publiée"
                description="Ce formateur n'a pas encore de ressource au catalogue."
              />
            ) : (
              <div className="grid gap-[18px] sm:grid-cols-2">
                {trainer.courses.map((course) => (
                  <ResourceCard
                    key={course.id}
                    course={{ ...course, trainerProfile: trainerSummary } as CourseListItem}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Le panneau ne s'affiche que si le formateur anime réellement une
            communauté active : la maquette en montrait une pour tout le monde. */}
        {trainer.community ? (
          <aside className="lg:sticky lg:top-[86px]">
            <div className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm">
              <div className="h-[88px] bg-gradient-to-br from-navy to-info" />
              <div className="p-5">
                <Chip>Communauté</Chip>
                <h3 className="mt-2 text-[17px] font-bold">
                  <Link
                    href={`/communautes/${trainer.community.slug}`}
                    className="text-ink hover:text-brand"
                  >
                    {trainer.community.name}
                  </Link>
                </h3>
                {trainer.community.description ? (
                  <p className="mt-1.5 line-clamp-4 text-[13.5px] leading-[1.55] text-ink-2">
                    {trainer.community.description}
                  </p>
                ) : null}
                {trainer.community.membersCount > 0 ? (
                  <p className="mt-2 text-[12.5px] text-ink-3">
                    {fmtNumber(trainer.community.membersCount)} membre
                    {trainer.community.membersCount > 1 ? 's' : ''}
                  </p>
                ) : null}
                <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-4">
                  <span>
                    <Price amountFcfa={trainer.community.priceFcfa} className="text-[17px]" />
                    <small className="ml-1 text-xs font-semibold text-ink-3">/ mois</small>
                  </span>
                  <Btn asChild size="sm">
                    <Link href={`/communautes/${trainer.community.slug}`}>Rejoindre</Link>
                  </Btn>
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
