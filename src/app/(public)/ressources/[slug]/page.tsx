import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Check, MessageSquare, Play, ShieldCheck, Users } from 'lucide-react'
import { Btn } from '@/components/nk/btn'
import { Chip } from '@/components/nk/chip'
import { Cover } from '@/components/nk/cover'
import { Price } from '@/components/nk/price'
import { ResourceCard } from '@/components/nk/resource-card'
import { PageHead } from '@/components/nk/page-head'
import { Curriculum } from './curriculum'
import { RESOURCES, coverLabel, resourceBySlug } from '@/features/demo/catalog-data'

export function generateStaticParams() {
  return RESOURCES.map(resource => ({ slug: resource.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const resource = resourceBySlug(slug)
  if (!resource) return { title: 'Ressource introuvable — NkamVa' }
  return { title: `${resource.title} — NkamVa`, description: resource.blurb }
}

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const resource = resourceBySlug(slug)
  if (!resource) notFound()

  const sameCategory = RESOURCES.filter(r => r.category.id === resource.category.id && r.slug !== resource.slug)
  const related = (sameCategory.length ? sameCategory : RESOURCES.filter(r => r.slug !== resource.slug)).slice(0, 3)
  const author = resource.author
  const isVideo = resource.format.id === 'video'

  return (
    <div className="wrap">
      <div className="grid items-start gap-9 lg:grid-cols-[1fr_360px]">
        <div>
          <PageHead
            crumbs={[
              { label: 'Ressources', href: '/ressources' },
              { label: resource.category.label, href: '/ressources' },
              { label: resource.title },
            ]}
            title={resource.title}
          >
            <Chip tone={resource.category.tone} className="order-first mb-3 mt-4 inline-flex">
              {resource.category.label}
            </Chip>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] font-medium text-ink3">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" />
                {resource.students.toLocaleString('fr-FR')} apprenants
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="size-4" />
                {resource.lang}
              </span>
              <span className="inline-flex items-center gap-1.5">
                ★ {resource.rating.toFixed(1)} · {resource.reviews} avis
              </span>
            </div>
          </PageHead>

          <div className="mt-6 overflow-hidden rounded-xl border border-line shadow-sm">
            <Cover
              category={resource.category.id}
              format={resource.format}
              glyphClassName="size-[82px] [&_svg]:size-9"
            >
              {isVideo ? (
                <>
                  <button
                    type="button"
                    aria-label="Aperçu vidéo"
                    className="absolute grid size-[74px] place-items-center rounded-full bg-brand text-white shadow-lg transition hover:scale-105 hover:bg-navy"
                  >
                    <Play className="size-7 fill-current" />
                  </button>
                  <span className="absolute bottom-3 left-3 rounded-full bg-ink/85 px-3 py-1.5 text-[11px] font-bold text-paper">
                    Aperçu gratuit · 2 min
                  </span>
                </>
              ) : (
                <span className="absolute bottom-3 left-3 rounded-full bg-ink/85 px-3 py-1.5 text-[11px] font-bold text-paper">
                  {resource.format.label} · {resource.meta}
                </span>
              )}
            </Cover>
          </div>

          <section className="mt-9">
            <h2 className="mb-3 text-[21px] font-extrabold">À propos de cette ressource</h2>
            <p className="mb-3 leading-[1.65] text-ink2">{resource.blurb}</p>
            <p className="leading-[1.65] text-ink2">
              Vous l&apos;achetez une seule fois, en FCFA, par mobile money ou carte bancaire. Elle rejoint ensuite
              votre espace « Mes achats » : accès à vie, progression conservée, sur mobile comme sur ordinateur.
            </p>
          </section>

          <section className="mt-9">
            <h2 className="mb-3 text-[21px] font-extrabold">Ce que vous apprendrez</h2>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {resource.learn.map(item => (
                <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-[1.5] text-ink2">
                  <span className="mt-0.5 grid size-5 flex-none place-items-center rounded-full bg-brand-t text-brand">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-9">
            <h2 className="mb-3 text-[21px] font-extrabold">{isVideo ? 'Programme' : 'Contenu'}</h2>
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] font-semibold text-ink3">
              <span>{resource.curriculum.length} modules</span>
              <span>
                {resource.lessonsTotal} {isVideo ? 'leçons' : 'sections'}
              </span>
              <span>{resource.meta}</span>
            </div>
            <Curriculum modules={resource.curriculum} isVideo={isVideo} />
          </section>

          <section className="mt-9">
            <h2 className="mb-3 text-[21px] font-extrabold">Votre formateur</h2>
            <div className="rounded-xl border border-line bg-card p-6">
              <div className="flex items-start gap-4">
                <span className="grid size-[58px] flex-none place-items-center rounded-2xl bg-gradient-to-br from-brand to-info font-display text-lg font-extrabold text-white">
                  {author.initials}
                </span>
                <div>
                  <h3 className="text-[18px] font-bold">
                    <Link href={`/formateurs/${author.id}`} className="text-ink hover:text-brand">
                      {author.name}
                    </Link>
                  </h3>
                  <p className="text-sm text-ink2">
                    {author.role} · {author.city}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-[13.5px] text-ink2">
                    <span>
                      <b className="font-bold text-ink">{author.students.toLocaleString('fr-FR')}</b> apprenants
                    </span>
                    <span>
                      <b className="font-bold text-ink">{author.resourceCount}</b> ressources
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-4 leading-[1.6] text-ink2">{author.bio}</p>
            </div>
          </section>

          <section className="mt-9">
            <h2 className="mb-3 text-[21px] font-extrabold">Avis des apprenants</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {resource.reviewList.map((review, i) => (
                <div key={`${review.name}-${i}`} className="rounded-xl border border-line bg-card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-brand-t2 text-[11px] font-bold text-brand-d">
                      {review.initials}
                    </span>
                    <div>
                      <b className="block text-sm font-bold">{review.name}</b>
                      <span className="text-xs text-gold">{'★'.repeat(review.stars)}</span>
                    </div>
                  </div>
                  <p className="text-[13.5px] leading-[1.55] text-ink2">{review.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Panneau d'achat */}
        <aside className="lg:sticky lg:top-[86px]">
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
            <Cover category={resource.category.id} format={resource.format} label={coverLabel(resource)} />

            <div className="p-5">
              <Price amount={resource.price} className="text-[28px]" />
              <p className="mt-1 text-[13px] text-ink3">Paiement à l&apos;unité · accès à vie</p>

              <Btn asChild size="lg" className="mt-4 w-full">
                <Link href={`/auth/connexion?callbackUrl=/ressources/${resource.slug}`}>Acheter maintenant</Link>
              </Btn>

              <div className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-ink2">
                <ShieldCheck className="size-4 text-brand" />
                Accès immédiat après paiement
              </div>

              <ul className="mt-4 grid gap-2 border-t border-line2 pt-4">
                {resource.includes.map(item => (
                  <li key={item} className="flex items-start gap-2 text-[13.5px] leading-[1.5] text-ink2">
                    <Check className="mt-0.5 size-4 flex-none text-brand" strokeWidth={3} />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line2 pt-4">
                <span className="flex h-9 items-center rounded-lg border border-black bg-black px-3">
                  <Image src="/pay/orange-money.svg" alt="Orange Money" width={70} height={18} className="h-[18px] w-auto" />
                </span>
                <span className="flex h-9 items-center rounded-lg border border-[#eec000] bg-[#ffcb05] px-3">
                  <Image src="/pay/mtn.svg" alt="MTN MoMo" width={54} height={16} className="h-4 w-auto" />
                </span>
                <span className="flex h-9 items-center rounded-lg border border-line bg-white px-3">
                  <Image src="/pay/wave.png" alt="Wave" width={54} height={18} className="h-[18px] w-auto" />
                </span>
                <span className="text-[13px] font-semibold text-ink3">+ carte bancaire</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-14">
        <h2 className="mb-5 text-[21px] font-extrabold">Dans la même catégorie</h2>
        <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item, index) => (
            <ResourceCard key={item.slug} resource={item} index={index} />
          ))}
        </div>
      </section>
    </div>
  )
}
