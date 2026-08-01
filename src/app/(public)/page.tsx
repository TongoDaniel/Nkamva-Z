import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Btn } from '@/components/nk/btn'
import { Chip } from '@/components/nk/chip'
import { Faq } from '@/components/nk/faq'
import { MiniCard } from '@/components/nk/mini-card'
import { PayBand } from '@/components/nk/pay-band'
import { ResourceCard } from '@/components/nk/resource-card'
import { Kicker, SectionHead } from '@/components/nk/page-head'
import { RESOURCES } from '@/features/demo/catalog-data'

const BAND = RESOURCES.slice(0, 8)
const CAROUSEL = RESOURCES.slice(0, 8)

const LANES = [
  {
    tone: 'brand' as const,
    chip: 'Pour apprendre',
    title: 'Trouvez, payez, apprenez',
    steps: [
      {
        lead: 'Parcourez',
        rest: ' le catalogue',
        body: 'Développement, business, design, marketing — filtrez par catégorie, comparez les formats et les prix.',
      },
      {
        lead: "Payez à l'unité",
        rest: ', en FCFA',
        body: "Par mobile money — Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa — ou carte bancaire. Pas d'abonnement obligatoire.",
      },
      {
        lead: "Gardez l'accès à vie",
        rest: '',
        body: 'La ressource rejoint votre espace personnel : progression conservée, consultation illimitée.',
      },
    ],
    link: { href: '/ressources', label: 'Explorer les ressources →' },
  },
  {
    tone: 'clay' as const,
    chip: 'Pour former',
    title: 'Publiez et encaissez',
    steps: [
      {
        lead: 'Proposez',
        rest: ' votre candidature',
        body: 'Présentez votre expertise. Chaque profil est examiné avant publication sur la plateforme.',
      },
      {
        lead: 'Publiez',
        rest: ' vos ressources',
        body: 'Guides PDF, cours vidéo, modèles réutilisables — vous fixez librement votre prix, en FCFA.',
      },
      {
        lead: 'Encaissez',
        rest: ' vos ventes',
        body: 'Suivez vos revenus et demandez vos retraits par mobile money, depuis votre espace formateur.',
      },
    ],
    link: { href: '/devenir-formateur', label: 'Devenir formateur →' },
  },
]

const SHOTS = [
  {
    title: (
      <>
        Payez <em className="not-italic text-brand">à l&apos;unité</em>, gardez l&apos;accès à vie
      </>
    ),
    body: "Chaque guide, cours ou modèle s'achète une fois, au prix fixé par son formateur. Pas d'abonnement caché.",
    more: { href: '/ressources', label: 'Parcourir le catalogue' },
    url: 'nkamva.com/ressources',
    src: '/shots/catalogue-new.png',
    alt: 'Écran du catalogue NkamVa : recherche, catégories et cartes ressources',
    reverse: false,
  },
  {
    title: (
      <>
        Ce que vous achetez, <em className="not-italic text-brand">sans surprise</em>
      </>
    ),
    body: 'Contenu détaillé, format, nombre de pages ou durée : chaque fiche annonce exactement ce que contient la ressource, avant le paiement.',
    url: 'nkamva.com/ressource',
    src: '/shots/fiche-new.png',
    alt: "Écran d'une fiche ressource : description, format et avis",
    reverse: true,
  },
  {
    title: (
      <>
        Reprenez <em className="not-italic text-brand">où vous en étiez</em>
      </>
    ),
    body: 'Vos achats restent dans votre espace : progression conservée et lecture reprise en un geste, sur mobile comme sur ordinateur.',
    url: 'nkamva.com/accueil',
    src: '/shots/dashboard-new.png',
    alt: 'Écran du tableau de bord apprenant : reprendre la lecture en cours',
    reverse: false,
  },
]

const TRAINER_POINTS = [
  { title: 'Vous fixez vos prix', body: "Chaque ressource est vendue à l'unité, au tarif que vous décidez." },
  {
    title: 'Formats libres',
    body: 'PDF, vidéo, kits, modèles Notion ou tableurs — publiez ce qui sert vraiment vos apprenants.',
  },
  {
    title: 'Retraits par mobile money',
    body: 'Suivez vos ventes et retirez vos revenus depuis votre espace formateur.',
  },
]

const FAQ_ITEMS = [
  {
    question: 'Quels moyens de paiement sont acceptés ?',
    answer: (
      <>
        <p>
          Le mobile money — Orange Money, MTN MoMo, Wave, Airtel Money et M-Pesa — ainsi que la carte bancaire. Les
          opérateurs disponibles dépendent de votre pays.
        </p>
        <p>
          NkamVa est disponible au Cameroun, Sénégal, Côte d&apos;Ivoire, Bénin, Mali, Burkina Faso, Togo, Gabon, RDC et
          Kenya.
        </p>
      </>
    ),
  },
  {
    question: "L'accès est-il vraiment à vie ?",
    answer: (
      <p>
        Oui. Chaque ressource s&apos;achète une seule fois et reste dans votre espace « Mes achats » : vous pouvez la
        consulter autant de fois que vous voulez, votre progression est conservée.
      </p>
    ),
  },
  {
    question: 'Quelle commission pour les formateurs ?',
    answer: (
      <p>
        Vous fixez votre prix en FCFA ; NkamVa prélève une commission de 15 % sur chaque vente. Le solde est disponible
        en retrait mobile money depuis votre espace formateur.
      </p>
    ),
  },
  {
    question: 'Puis-je être remboursé ?',
    answer: (
      <p>
        Vous pouvez ouvrir un litige dans les 14 jours suivant l&apos;achat, tant que vous avez consulté moins de 30 %
        de la ressource. Chaque demande est arbitrée par notre équipe.
      </p>
    ),
  },
]

export default function LandingPage() {
  return (
    <>
      {/* Hero centré + bande défilante */}
      <section className="pb-2 pt-10 text-center sm:pt-[58px]">
        <div className="wrap">
          <Kicker>Formation en ligne · paiement mobile money</Kicker>
          <h1 className="nk-reveal mx-auto text-balance text-[clamp(34px,4.6vw,54px)] font-extrabold leading-[1.04]">
            Le savoir africain, à l&apos;unité et{' '}
            <em className="not-italic text-brand">en FCFA</em>
          </h1>
          <p
            className="nk-reveal mx-auto mt-6 max-w-[54ch] text-pretty text-[15.5px] leading-[1.6] text-ink2 sm:text-[17px]"
            style={{ '--i': 2 } as React.CSSProperties}
          >
            Cours vidéo, guides et modèles créés par des formateurs africains. Achetez une fois par mobile money ou
            carte bancaire — la ressource reste à vous, à vie.
          </p>
          <div
            className="nk-reveal mt-7 flex flex-wrap justify-center gap-3"
            style={{ '--i': 3 } as React.CSSProperties}
          >
            <Btn asChild size="lg">
              <Link href="/ressources">Explorer les ressources</Link>
            </Btn>
            <Btn asChild size="lg" variant="outline">
              <Link href="/devenir-formateur">Devenir formateur</Link>
            </Btn>
          </div>
        </div>

        <div
          className="nk-marquee-wrap nk-marquee-mask mt-11 overflow-hidden"
          aria-label="Aperçu du catalogue — données de démonstration"
        >
          <div className="nk-marquee gap-4 pb-5 pt-3.5">
            {BAND.map(resource => (
              <MiniCard key={resource.slug} resource={resource} />
            ))}
            {BAND.map(resource => (
              <MiniCard key={`${resource.slug}-dup`} resource={resource} decorative />
            ))}
          </div>
        </div>
      </section>

      <PayBand />

      {/* Comment ça marche */}
      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <SectionHead
            centered
            kicker="Comment ça marche"
            title={
              <>
                Simple des deux côtés du <em className="not-italic text-brand">savoir</em>
              </>
            }
          />

          <div className="grid gap-[26px] lg:grid-cols-2">
            {LANES.map(lane => (
              <div key={lane.chip} className="rounded-xl border border-line bg-card px-6 pb-3 pt-[30px] sm:px-8">
                <Chip tone={lane.tone}>{lane.chip}</Chip>
                <h3 className="mb-[18px] mt-1.5 text-[21px] font-extrabold">{lane.title}</h3>

                {lane.steps.map((step, i) => (
                  <div key={step.lead} className="grid grid-cols-[52px_1fr] items-start gap-3.5 border-t border-line2 py-4">
                    <span className="font-display text-[30px] font-extrabold leading-[1.1] text-brand opacity-30">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h4 className="mb-1 text-base font-bold">
                        <b className="text-brand">{step.lead}</b>
                        {step.rest}
                      </h4>
                      <p className="text-sm leading-[1.55] text-ink2">{step.body}</p>
                    </div>
                  </div>
                ))}

                <p className="border-t border-line2 py-3.5 text-[13.5px] text-ink3">
                  <Link href={lane.link.href} className="font-bold">
                    {lane.link.label}
                  </Link>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Le produit */}
      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <SectionHead
            kicker="Le produit"
            title={
              <>
                Ce que vous verrez, <em className="not-italic text-brand">vraiment</em>
              </>
            }
          >
            Pas de promesses en l&apos;air : voici des écrans réels de la plateforme.
          </SectionHead>

          {SHOTS.map(shot => (
            <div
              key={shot.url}
              className="grid items-center gap-6 py-7 lg:grid-cols-[.85fr_1.15fr] lg:gap-[52px] lg:py-[30px]"
            >
              <div className={shot.reverse ? 'lg:order-2' : undefined}>
                <h3 className="mb-2.5 text-[23px] font-extrabold leading-[1.15]">{shot.title}</h3>
                <p className="mb-3.5 text-pretty text-[15.5px] leading-[1.62] text-ink2">{shot.body}</p>
                {shot.more && (
                  <Link href={shot.more.href} className="group inline-flex items-center gap-1 text-[14.5px] font-bold">
                    {shot.more.label}
                    <ArrowRight className="size-[15px] transition-transform group-hover:translate-x-[3px]" />
                  </Link>
                )}
              </div>

              <div
                className={`overflow-hidden rounded-lg border border-line bg-card shadow-md ${shot.reverse ? 'lg:order-1' : ''}`}
              >
                <div className="flex items-center gap-1.5 border-b border-line2 bg-[#fbfaf5] px-3 py-2.5">
                  <i className="size-[9px] rounded-full bg-line" />
                  <i className="size-[9px] rounded-full bg-line" />
                  <i className="size-[9px] rounded-full bg-line" />
                  <span className="ml-2.5 rounded-full border border-line2 bg-paper px-3 py-[3px] font-sans text-[11px] font-semibold text-ink3">
                    {shot.url}
                  </span>
                </div>
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  width={909}
                  height={540}
                  className="block h-auto w-full"
                  sizes="(max-width: 1024px) 100vw, 640px"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Aperçu du catalogue */}
      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <SectionHead
            kicker="Catalogue"
            title={
              <>
                Des ressources <em className="not-italic text-brand">concrètes</em>
              </>
            }
          >
            Aperçu du catalogue de démonstration — payables à l&apos;unité, en FCFA.
          </SectionHead>

          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {CAROUSEL.map((resource, index) => (
              <ResourceCard key={resource.slug} resource={resource} index={index} />
            ))}
          </div>

          <div className="mt-[26px] flex justify-center">
            <Btn asChild variant="outline">
              <Link href="/ressources">Voir tout le catalogue</Link>
            </Btn>
          </div>
        </div>
      </section>

      {/* Devenir formateur */}
      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <div className="grid overflow-hidden rounded-[28px] border border-line bg-card shadow-sm lg:grid-cols-[.98fr_1.02fr]">
            <div className="relative aspect-[16/10.5] lg:aspect-auto lg:min-h-[460px]">
              <Image
                src="/formateurs.webp"
                alt="Formateurs en atelier autour d'un ordinateur"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 560px"
              />
            </div>

            <div className="px-6 pb-[30px] pt-[26px] sm:px-12 sm:py-11">
              <Kicker className="mb-2.5">Formateurs</Kicker>
              <h2 className="mb-3 text-balance text-[clamp(25px,2.8vw,33px)] font-extrabold leading-[1.12]">
                Votre expertise a de la valeur. <em className="not-italic text-brand">Vendez-la.</em>
              </h2>
              <p className="mb-1.5 text-[15.5px] leading-[1.6] text-ink2">
                Vous maîtrisez un sujet ? Transformez-le en guides, cours vidéo ou modèles, et vendez-les à votre prix,
                en FCFA.
              </p>

              <div className="mt-[18px]">
                {TRAINER_POINTS.map(point => (
                  <div key={point.title} className="grid border-t border-line2 py-3">
                    <b className="text-[15px] font-bold">{point.title}</b>
                    <span className="mt-0.5 text-sm leading-[1.5] text-ink2">{point.body}</span>
                  </div>
                ))}
              </div>

              <div className="mt-[22px] flex flex-wrap gap-3">
                <Btn asChild>
                  <Link href="/devenir-formateur">Devenir formateur</Link>
                </Btn>
              </div>
              <p className="mt-3.5 text-[13px] text-ink3">Chaque candidature est examinée avant publication.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <SectionHead
            centered
            kicker="Questions fréquentes"
            title={
              <>
                Avant de vous <em className="not-italic text-brand">lancer</em>
              </>
            }
          />
          <Faq items={FAQ_ITEMS} />
        </div>
      </section>

      {/* CTA finale */}
      <section className="relative mt-[84px] overflow-hidden bg-navy">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(760px 340px at 50% -60px, rgba(46,124,246,.28), transparent 65%)',
          }}
        />
        <div className="relative mx-auto max-w-[860px] px-5 pb-16 pt-[78px] text-center">
          <h2 className="mb-3 text-balance text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.1] text-white">
            Prêt à apprendre — ou à transmettre ?
          </h2>
          <p className="mx-auto mb-7 max-w-[52ch] text-[16.5px] leading-[1.6] text-[#b9c9dd]">
            Créez votre compte, explorez le catalogue à votre rythme, ou proposez votre première ressource.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Btn asChild size="lg" variant="light">
              <Link href="/auth/inscription">Créer un compte</Link>
            </Btn>
            <Btn asChild size="lg" variant="ghostOnDark">
              <Link href="/devenir-formateur">Devenir formateur</Link>
            </Btn>
          </div>
          <p className="mt-4 text-[12.5px] font-semibold text-[#8ba3c0]">
            Cameroun · Sénégal · Côte d&apos;Ivoire · Bénin · Mali · Burkina Faso · Togo · Gabon · RDC · Kenya
          </p>
        </div>
      </section>
    </>
  )
}
