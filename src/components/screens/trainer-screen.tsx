import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Library } from 'lucide-react'
import { BtnLink } from '@/components/nk/button-link'
import { Chip } from '@/components/nk/chip'
import { Avatar } from '@/components/nk/avatar'
import { Price, ResourceCard } from '@/components/nk/resource-card'
import { PageHead } from '@/components/nk/page-head'
import { EmptyState } from '@/components/nk/empty-state'
import { ReportButton } from '@/components/nk/report-button'
import { getAuthContext } from '@/lib/api'
import { getPublicTrainer } from '@/lib/trainers'
import { fmtNumber } from '@/lib/format'
import { routesOf, type Space } from '@/lib/spaces'
import type { CourseListItem } from '@/lib/dto'

/** Fiche formateur, rendue à l'identique dans les deux espaces. */
export async function TrainerScreen({ trainerId, space }: { trainerId: string; space: Space }) {
  const routes = routesOf(space)
  const [trainer, auth] = await Promise.all([getPublicTrainer(trainerId), getAuthContext()])
  if (!trainer) notFound()

  const name = trainer.fullName ?? 'Formateur NkamVa'
  const isSelf = auth?.user.id === trainer.userId

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
          { label: 'Accueil', href: routes.home },
          { label: 'Formateurs', href: routes.trainers },
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
              /* Un formateur peut être visible par sa seule communauté : sa
                 fiche s'ouvre alors sur une section vide, ce qui ressemble à
                 une page cassée si on ne dit pas ce qu'il y a à la place. Le
                 renvoi vers la communauté n'apparaît que s'il en anime une —
                 sinon l'état vide se contente de constater. */
              <EmptyState
                icon={<Library />}
                title="Aucune ressource publiée"
                description={
                  trainer.community
                    ? "Ce formateur anime une communauté ; ses ressources arriveront au catalogue."
                    : "Ce formateur n'a pas encore de ressource au catalogue."
                }
                action={
                  trainer.community ? (
                    <BtnLink href={routes.community(trainer.community.slug)} variant="o">
                      Voir sa communauté
                    </BtnLink>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-[18px] sm:grid-cols-2">
                {trainer.courses.map((course) => (
                  <ResourceCard
                    key={course.id}
                    space={space}
                    course={{ ...course, trainerProfile: trainerSummary } as CourseListItem}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="grid gap-5 lg:sticky lg:top-[86px]">
          {/* Le panneau ne s'affiche que si le formateur anime réellement une
              communauté active : la maquette en montrait une pour tout le monde. */}
          {trainer.community ? (
            <div className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm">
              <div className="h-[88px] bg-gradient-to-br from-navy to-info" />
              <div className="p-5">
                <Chip>Communauté</Chip>
                <h3 className="mt-2 text-[17px] font-bold">
                  <Link
                    href={routes.community(trainer.community.slug)}
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
                  <BtnLink href={routes.community(trainer.community.slug)} size="sm">
                    Rejoindre
                  </BtnLink>
                </div>
              </div>
            </div>
          ) : null}

          {/* Une issue, pas une proposition : discret, en bas de colonne. Rien
              à signaler chez soi. Le visiteur non connecté le voit quand
              même — la modale le renverra vers la connexion, ce qui vaut
              mieux qu'un recours invisible tant qu'on n'a pas de compte. */}
          {isSelf ? null : (
            <div className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
              <ReportButton targetType="USER" targetId={trainer.userId} name={name} />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
