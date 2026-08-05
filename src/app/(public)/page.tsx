import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MiniCard } from "@/components/landing/mini-card";
import { BrowserFrame } from "@/components/nk/browser-frame";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { DemoNotice } from "@/components/nk/demo-notice";
import { Faq, ToFill } from "@/components/nk/faq";
import { PayBand, PayChips, PAY_COUNTRIES } from "@/components/nk/pay-band";
import { ResourceCard } from "@/components/nk/resource-card";
import { Reveal } from "@/components/nk/reveal";
import { ScrollCarousel } from "@/components/nk/scroll-carousel";
import { Kicker, SectionHead } from "@/components/nk/section-head";
import { featuredCourses } from "@/lib/featured";

// Le catalogue mis en avant reflète l'état réel de la base : rendu à la demande.
export const dynamic = "force-dynamic";

const LEARN_STEPS = [
  {
    lead: "Parcourez",
    rest: " le catalogue",
    body: "Développement, business, design, marketing — filtrez par catégorie, comparez les formats et les prix.",
  },
  {
    lead: "Payez à l'unité",
    rest: ", en FCFA",
    body: "Par mobile money — Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa — ou carte bancaire. Pas d'abonnement obligatoire.",
  },
  {
    lead: "Gardez l'accès à vie",
    rest: "",
    body: "La ressource rejoint votre espace personnel : progression conservée, consultation illimitée.",
  },
];

const TEACH_STEPS = [
  {
    lead: "Proposez",
    rest: " votre candidature",
    body: "Présentez votre expertise. Chaque profil est examiné avant publication sur la plateforme.",
  },
  {
    lead: "Publiez",
    rest: " vos ressources",
    body: "Guides PDF, cours vidéo, modèles réutilisables — vous fixez librement votre prix, en FCFA.",
  },
  {
    lead: "Encaissez",
    rest: " vos ventes",
    body: "Suivez vos revenus et demandez vos retraits par mobile money, depuis votre espace formateur.",
  },
];

const PRODUCT_ROWS = [
  {
    title: "Payez ",
    emphasis: "à l'unité",
    after: ", gardez l'accès à vie",
    body: "Chaque guide, cours ou modèle s'achète une fois, au prix fixé par son formateur. Pas d'abonnement caché.",
    cta: { href: "/ressources", label: "Parcourir le catalogue" },
    shot: "/shots/catalogue-new.png",
    alt: "Écran réel du catalogue NkamVa : recherche, catégories et cartes ressources",
    url: "nkamva.com/ressources",
    reversed: false,
  },
  {
    title: "Ce que vous achetez, ",
    emphasis: "sans surprise",
    after: "",
    body: "Contenu détaillé, format, nombre de pages ou durée : chaque fiche annonce exactement ce que contient la ressource, avant le paiement.",
    cta: null,
    shot: "/shots/fiche-new.png",
    alt: "Écran réel d'une fiche ressource : description, format et avis",
    url: "nkamva.com/ressource",
    reversed: true,
  },
  {
    title: "Reprenez ",
    emphasis: "où vous en étiez",
    after: "",
    body: "Vos achats restent dans votre espace : progression conservée et lecture reprise en un geste, sur mobile comme sur ordinateur.",
    cta: null,
    shot: "/shots/dashboard-new.png",
    alt: "Écran réel du tableau de bord apprenant : reprendre la lecture en cours",
    url: "nkamva.com/accueil",
    reversed: false,
  },
];

const TRAINER_POINTS = [
  [
    "Vous fixez vos prix",
    "Chaque ressource est vendue à l'unité, au tarif que vous décidez.",
  ],
  [
    "Formats libres",
    "PDF, vidéo, kits, modèles Notion ou tableurs — publiez ce qui sert vraiment vos apprenants.",
  ],
  [
    "Retraits par mobile money",
    "Suivez vos ventes et retirez vos revenus depuis votre espace formateur.",
  ],
];

const FAQ_ITEMS = [
  {
    question: "Quels moyens de paiement sont acceptés ?",
    answer: (
      <>
        <p>
          Le mobile money — Orange Money, MTN MoMo, Wave, Airtel Money et M-Pesa — ainsi que la carte
          bancaire. Les opérateurs disponibles dépendent de votre pays.
        </p>
        <p>NkamVa est disponible au {PAY_COUNTRIES.replaceAll(" · ", ", ")}.</p>
      </>
    ),
  },
  {
    question: "L'accès est-il vraiment à vie ?",
    answer: (
      <p>
        Oui. Chaque ressource s&apos;achète une seule fois et reste dans votre espace « Mes achats » :
        vous pouvez la consulter autant de fois que vous voulez, votre progression est conservée.
      </p>
    ),
  },
  {
    question: "Quelle commission pour les formateurs ?",
    answer: (
      <p>
        Vous fixez votre prix en FCFA ; NkamVa prélève une commission de 15 % sur chaque vente — le
        formateur est crédité de 85 % du prix payé. Le solde est disponible en retrait mobile money
        depuis votre espace formateur.
      </p>
    ),
  },
  {
    question: "Puis-je être remboursé ?",
    answer: (
      <p>
        Une demande de remboursement est recevable jusqu&apos;au 14<sup>e</sup> jour suivant
        l&apos;achat. Pour une vidéo, elle est traitée automatiquement si moins de 30 % du contenu a
        été consulté ; pour un contenu téléchargeable, elle passe en décision du support. Le détail
        de la procédure est décrit dans les{" "}
        <Link href="/legal/conditions">conditions d&apos;utilisation</Link>{" "}
        <ToFill>[à confirmer : libellé exact publié]</ToFill>.
      </p>
    ),
  },
];

export default async function LandingPage() {
  const { courses, isDemo } = await featuredCourses(8);

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="pb-2 pt-[58px] text-center max-[640px]:pt-10">
        <div className="nk-wrap">
          <Reveal>
            <Kicker className="mb-3.5">Formation en ligne · paiement mobile money</Kicker>
          </Reveal>
          <Reveal delay={0.8}>
            <h1 className="mx-auto mb-4 text-[clamp(34px,4.6vw,54px)] font-extrabold leading-[1.04] text-balance">
              Le savoir africain, à l&apos;unité et{" "}
              <em className="not-italic text-brand">en FCFA</em>
            </h1>
          </Reveal>
          <Reveal delay={1.6}>
            <p className="mx-auto mb-[26px] max-w-[54ch] text-[17px] leading-relaxed text-ink-2 text-pretty max-[640px]:text-[15.5px]">
              Cours vidéo, guides et modèles créés par des formateurs africains. Achetez une fois par
              mobile money ou carte bancaire — la ressource reste à vous, à vie.
            </p>
          </Reveal>
          <Reveal delay={2.4}>
            <div className="flex flex-wrap justify-center gap-3">
              <Btn asChild size="lg">
                <Link href="/ressources">Explorer les ressources</Link>
              </Btn>
              <Btn asChild variant="o" size="lg">
                <Link href="/devenir-formateur">Devenir formateur</Link>
              </Btn>
            </div>
          </Reveal>
        </div>

        {/* Bande défilante : aperçu du catalogue, purement illustratif. */}
        <Reveal delay={3.2} className="mt-11">
          <div
            className="nk-fade-x nk-marquee-pause overflow-hidden"
            aria-label="Aperçu du catalogue"
          >
            <div className="nk-marquee gap-4 pb-5 pt-3.5">
              {courses.map((course) => (
                <MiniCard key={course.id} course={course} />
              ))}
              {courses.map((course) => (
                <MiniCard key={`${course.id}-loop`} course={course} decorative />
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      <PayBand />

      {/* ---- Comment ça marche ---- */}
      <section className="pt-[76px] max-[640px]:pt-14">
        <div className="nk-wrap">
          <Reveal>
            <SectionHead
              centered
              kicker="Comment ça marche"
              title="Simple des deux côtés du "
              emphasis="savoir"
              id="comment-ca-marche"
            />
          </Reveal>
          <div className="grid gap-[26px] lg:grid-cols-2">
            <Reveal delay={0}>
              <StepLane
                chip="Pour apprendre"
                chipTone="brand"
                title="Trouvez, payez, apprenez"
                steps={LEARN_STEPS}
                cta={{ href: "/ressources", label: "Explorer les ressources" }}
              />
            </Reveal>
            <Reveal delay={1}>
              <StepLane
                chip="Pour former"
                chipTone="clay"
                title="Publiez et encaissez"
                steps={TEACH_STEPS}
                cta={{ href: "/devenir-formateur", label: "Devenir formateur" }}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- Le produit ---- */}
      <section className="pt-[76px] max-[640px]:pt-14">
        <div className="nk-wrap">
          <Reveal>
            <SectionHead
              kicker="Le produit"
              title="Ce que vous verrez, "
              emphasis="vraiment"
              lead="Pas de promesses en l'air : voici des écrans réels de la plateforme."
              id="le-produit"
            />
          </Reveal>
          {PRODUCT_ROWS.map((row, index) => (
            <Reveal key={row.shot}>
              <div className="grid items-center gap-[22px] py-[26px] lg:grid-cols-[0.85fr_1.15fr] lg:gap-[52px] lg:py-[30px]">
                <div className={row.reversed ? "lg:order-2" : undefined}>
                  <h3 className="mb-2.5 text-[23px] font-extrabold leading-[1.15]">
                    {row.title}
                    <em className="not-italic text-brand">{row.emphasis}</em>
                    {row.after}
                  </h3>
                  <p className="mb-3.5 text-[15.5px] leading-[1.62] text-ink-2 text-pretty">
                    {row.body}
                  </p>
                  {row.cta ? (
                    <Link
                      href={row.cta.href}
                      className="nk-tap group relative inline-flex items-center gap-1.5 text-[14.5px] font-bold"
                    >
                      {row.cta.label}
                      <ArrowRight
                        className="size-[15px] transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : null}
                </div>
                <BrowserFrame
                  src={row.shot}
                  alt={row.alt}
                  url={row.url}
                  priority={index === 0}
                  className={row.reversed ? "lg:order-1" : undefined}
                />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- Carrousel catalogue ---- */}
      <section className="pt-[76px] max-[640px]:pt-14">
        <div className="nk-wrap">
          {isDemo ? (
            <DemoNotice className="mb-6">
              Catalogue de démonstration : aucune ressource publiée n&apos;a encore été trouvée en
              base.
            </DemoNotice>
          ) : null}
          <ScrollCarousel
            label="Ressources populaires"
            head={
              <SectionHead
                className="mb-0"
                kicker="Catalogue"
                title="Des ressources "
                emphasis="concrètes"
                lead={
                  isDemo
                    ? "Aperçu du catalogue de démonstration — payables à l'unité, en FCFA."
                    : "Payables à l'unité, en FCFA."
                }
                id="catalogue"
              />
            }
          >
            {courses.map((course) => (
              <ResourceCard
                key={course.id}
                course={course}
                favoritable
                className="w-[296px] flex-none snap-start max-[640px]:w-[262px]"
              />
            ))}
          </ScrollCarousel>
          <div className="mt-[26px] flex justify-center">
            <Btn asChild variant="o">
              <Link href="/ressources">Voir tout le catalogue</Link>
            </Btn>
          </div>
        </div>
      </section>

      {/* ---- Devenir formateur ---- */}
      <section className="pt-[76px] max-[640px]:pt-14">
        <div className="nk-wrap">
          <Reveal>
            <div className="grid items-stretch overflow-hidden rounded-[28px] border border-line bg-card shadow-nk-sm lg:grid-cols-[0.98fr_1.02fr]">
              <div className="relative aspect-[16/10.5] lg:aspect-auto lg:min-h-[460px]">
                <Image
                  src="/formateurs.webp"
                  alt="Formateurs en atelier autour d'un ordinateur"
                  fill
                  sizes="(min-width: 1020px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="px-6 pb-[30px] pt-[26px] lg:px-12 lg:py-11">
                <Kicker className="mb-2.5">Formateurs</Kicker>
                <h2
                  id="formateurs"
                  className="mb-3 text-[clamp(25px,2.8vw,33px)] font-extrabold leading-[1.12] text-balance"
                >
                  Votre expertise a de la valeur.{" "}
                  <em className="not-italic text-brand">Vendez-la.</em>
                </h2>
                <p className="mb-1.5 text-[15.5px] leading-relaxed text-ink-2">
                  Vous maîtrisez un sujet ? Transformez-le en guides, cours vidéo ou modèles, et
                  vendez-les à votre prix, en FCFA.
                </p>
                <dl className="mt-[18px]">
                  {TRAINER_POINTS.map(([title, body]) => (
                    <div key={title} className="border-t border-line-2 py-[13px]">
                      <dt className="text-[15px] font-bold">{title}</dt>
                      <dd className="mt-0.5 text-sm leading-[1.5] text-ink-2">{body}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-[22px] flex flex-wrap gap-3">
                  <Btn asChild className="max-[640px]:flex-1">
                    <Link href="/devenir-formateur">Devenir formateur</Link>
                  </Btn>
                </div>
                <p className="mt-3.5 text-[13px] text-ink-3">
                  Chaque candidature est examinée avant publication.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section className="pt-[76px] max-[640px]:pt-14">
        <div className="nk-wrap">
          <Reveal>
            <SectionHead
              centered
              kicker="Questions fréquentes"
              title="Avant de vous "
              emphasis="lancer"
              id="faq"
            />
          </Reveal>
          <Reveal>
            <Faq items={FAQ_ITEMS} />
          </Reveal>
        </div>
      </section>

      {/* ---- CTA finale ---- */}
      <section className="relative mt-[84px] overflow-hidden bg-navy">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(760px_340px_at_50%_-60px,rgba(46,124,246,.28),transparent_65%)]"
        />
        <div className="relative mx-auto max-w-[860px] px-5 pb-[50px] pt-[60px] text-center md:px-7 md:pb-16 md:pt-[78px]">
          <h2 className="mb-3 text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.1] text-white text-balance">
            Prêt à apprendre — ou à transmettre ?
          </h2>
          <p className="mx-auto mb-[30px] max-w-[52ch] text-[16.5px] leading-relaxed text-[#b9c9dd]">
            Créez votre compte, explorez le catalogue à votre rythme, ou proposez votre première
            ressource.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Btn asChild variant="light" size="lg">
              <Link href="/auth/inscription">Créer un compte</Link>
            </Btn>
            <Btn asChild variant="gh" size="lg">
              <Link href="/devenir-formateur">Devenir formateur</Link>
            </Btn>
          </div>
          <PayChips size="lg" className="mt-[34px] justify-center" />
          <p className="mt-4 text-[12.5px] font-semibold text-[#8ba3c0]">{PAY_COUNTRIES}</p>
        </div>
      </section>
    </>
  );
}

/** Voie « pour apprendre » / « pour former » — port de `.lane` + `.step`. */
function StepLane({
  chip,
  chipTone,
  title,
  steps,
  cta,
}: {
  chip: string;
  chipTone: "brand" | "clay";
  title: string;
  steps: Array<{ lead: string; rest: string; body: string }>;
  cta: { href: string; label: string };
}) {
  return (
    <div className="h-full rounded-nk-lg border border-line bg-card px-5 pb-2 pt-[22px] lg:px-8 lg:pt-[30px]">
      <Chip tone={chipTone}>{chip}</Chip>
      <h3 className="mb-[18px] mt-1.5 text-[21px] font-extrabold">{title}</h3>
      <ol>
        {steps.map((step, i) => (
          <li
            key={step.lead}
            className="grid grid-cols-[52px_1fr] items-start gap-3.5 border-t border-line-2 py-[17px]"
          >
            <span
              className="font-display text-[30px] font-extrabold leading-[1.1] text-brand opacity-30"
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h4 className="mb-1 mt-px text-base font-bold">
                <b className="text-brand">{step.lead}</b>
                {step.rest}
              </h4>
              <p className="text-sm leading-[1.55] text-ink-2">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="border-t border-line-2 pb-[18px] pt-3.5 text-[13.5px]">
        <Link href={cta.href} className="font-bold">
          {cta.label} →
        </Link>
      </p>
    </div>
  );
}
