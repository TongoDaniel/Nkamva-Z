import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { ResourceCard } from "@/components/nk/resource-card";
import { searchCourses } from "@/lib/catalog";
import type { CourseListItem } from "@/lib/dto";

// Le catalogue mis en avant reflète l'état réel de la base : rendu à la demande.
export const dynamic = "force-dynamic";

const PAYMENTS = [
  "Orange Money",
  "MTN MoMo",
  "Wave",
  "Airtel Money",
  "M-Pesa",
  "Carte bancaire",
];

const COUNTRIES =
  "Cameroun · Sénégal · Côte d'Ivoire · Bénin · Mali · Burkina Faso · Togo · Gabon · RDC · Kenya";

const LEARN_STEPS = [
  {
    title: "Parcourez le catalogue",
    body: "Développement, business, design, marketing — filtrez par catégorie, comparez les formats et les prix.",
  },
  {
    title: "Payez à l'unité, en FCFA",
    body: "Par mobile money — Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa — ou carte bancaire. Pas d'abonnement obligatoire.",
  },
  {
    title: "Gardez l'accès à vie",
    body: "La ressource rejoint votre espace personnel : progression conservée, consultation illimitée.",
  },
];

const TEACH_STEPS = [
  {
    title: "Proposez votre candidature",
    body: "Présentez votre expertise. Chaque profil est examiné avant publication sur la plateforme.",
  },
  {
    title: "Publiez vos ressources",
    body: "Guides PDF, cours vidéo, modèles réutilisables — vous fixez librement votre prix, en FCFA.",
  },
  {
    title: "Encaissez vos ventes",
    body: "Suivez vos revenus et demandez vos retraits par mobile money, depuis votre espace formateur.",
  },
];

const FAQ = [
  {
    q: "Dois-je payer un abonnement ?",
    a: "Non. Chaque ressource s'achète à l'unité, au prix fixé par son formateur. Vous ne payez que ce que vous choisissez.",
  },
  {
    q: "Comment puis-je payer ?",
    a: "Par mobile money (Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa) ou par carte bancaire. Les montants sont affichés en FCFA.",
  },
  {
    q: "Pendant combien de temps ai-je accès à une ressource ?",
    a: "À vie. Une ressource achetée reste dans votre espace, avec votre progression, sur mobile comme sur ordinateur.",
  },
  {
    q: "Puis-je vendre mes propres formations ?",
    a: "Oui. Déposez une candidature de formateur : chaque profil est examiné avant publication.",
  },
];

async function featuredCourses(): Promise<CourseListItem[]> {
  try {
    const result = await searchCourses({ sort: "newest", page: 1, pageSize: 8 });
    return result.items as unknown as CourseListItem[];
  } catch {
    // Une base injoignable ne doit pas faire tomber la page d'accueil.
    return [];
  }
}

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
  steps: Array<{ title: string; body: string }>;
  cta: { href: string; label: string };
}) {
  return (
    <div className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
      <Chip tone={chipTone}>{chip}</Chip>
      <h3 className="mb-6 mt-3 text-[22px] font-extrabold">{title}</h3>
      <ol className="grid gap-5">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span
              className="font-display text-[15px] font-extrabold text-ink-3"
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h4 className="mb-1 text-[15.5px] font-bold">{step.title}</h4>
              <p className="text-sm leading-relaxed text-ink-2">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link
        href={cta.href}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:text-brand-dark"
      >
        {cta.label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export default async function LandingPage() {
  const courses = await featuredCourses();

  return (
    <>
      {/* Hero */}
      <section className="nk-wrap pb-4 pt-12 text-center md:pt-20">
        <p className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-brand">
          Formation en ligne · paiement mobile money
        </p>
        <h1 className="mx-auto max-w-[16ch] text-[clamp(34px,6vw,64px)] font-extrabold leading-[1.04] text-balance">
          Le savoir africain, à l&apos;unité et <em className="not-italic text-brand">en FCFA</em>
        </h1>
        <p className="mx-auto mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-2 text-pretty">
          Cours vidéo, guides et modèles créés par des formateurs africains. Achetez une fois par
          mobile money ou carte bancaire — la ressource reste à vous, à vie.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Btn asChild size="lg">
            <Link href="/ressources">Explorer les ressources</Link>
          </Btn>
          <Btn asChild variant="o" size="lg">
            <Link href="/devenir-formateur">Devenir formateur</Link>
          </Btn>
        </div>
      </section>

      {/* Bandeau paiements */}
      <section className="nk-wrap py-12" aria-labelledby="paiements">
        <h2 id="paiements" className="mb-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-ink-3">
          Paiements acceptés
        </h2>
        <ul className="flex flex-wrap justify-center gap-2.5">
          {PAYMENTS.map((p) => (
            <li
              key={p}
              className="rounded-[13px] border border-line bg-card px-5 py-3 text-[13.5px] font-bold text-ink-2"
            >
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-center text-[13.5px] text-ink-2">
          <b className="text-ink">Disponible :</b> {COUNTRIES}
        </p>
      </section>

      {/* Comment ça marche */}
      <section className="nk-wrap py-12" aria-labelledby="comment">
        <p className="text-center text-[13px] font-bold uppercase tracking-[0.12em] text-brand">
          Comment ça marche
        </p>
        <h2 id="comment" className="mb-10 mt-2 text-center text-[clamp(26px,3.4vw,38px)] font-extrabold">
          Simple des deux côtés du <em className="not-italic text-brand">savoir</em>
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <StepLane
            chip="Pour apprendre"
            chipTone="brand"
            title="Trouvez, payez, apprenez"
            steps={LEARN_STEPS}
            cta={{ href: "/ressources", label: "Explorer les ressources" }}
          />
          <StepLane
            chip="Pour former"
            chipTone="clay"
            title="Publiez et encaissez"
            steps={TEACH_STEPS}
            cta={{ href: "/devenir-formateur", label: "Devenir formateur" }}
          />
        </div>
      </section>

      {/* Catalogue en avant */}
      {courses.length > 0 ? (
        <section className="nk-wrap py-12" aria-labelledby="catalogue">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand">Catalogue</p>
              <h2 id="catalogue" className="mt-2 text-[clamp(26px,3.4vw,38px)] font-extrabold">
                Des ressources <em className="not-italic text-brand">concrètes</em>
              </h2>
            </div>
            <Btn asChild variant="o">
              <Link href="/ressources">Voir tout le catalogue</Link>
            </Btn>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {courses.map((course) => (
              <ResourceCard key={course.id} course={course} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Formateurs */}
      <section className="nk-wrap py-12" aria-labelledby="formateurs">
        <div className="rounded-nk-lg border border-line bg-card p-7 shadow-nk-sm sm:p-12">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand">Formateurs</p>
          <h2 id="formateurs" className="mb-4 mt-2 max-w-[22ch] text-[clamp(26px,3.4vw,38px)] font-extrabold">
            Votre expertise a de la valeur. <em className="not-italic text-brand">Vendez-la.</em>
          </h2>
          <p className="mb-8 max-w-[60ch] text-ink-2">
            Vous maîtrisez un sujet ? Transformez-le en guides, cours vidéo ou modèles, et
            vendez-les à votre prix, en FCFA.
          </p>
          <dl className="mb-8 grid gap-5 sm:grid-cols-3">
            {[
              ["Vous fixez vos prix", "Chaque ressource est vendue à l'unité, au tarif que vous décidez."],
              ["Formats libres", "PDF, vidéo, kits, modèles Notion ou tableurs."],
              ["Retraits par mobile money", "Suivez vos ventes et retirez vos revenus depuis votre espace."],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="mb-1 font-bold">{title}</dt>
                <dd className="text-sm leading-relaxed text-ink-2">{body}</dd>
              </div>
            ))}
          </dl>
          <Btn asChild>
            <Link href="/devenir-formateur">Devenir formateur</Link>
          </Btn>
          <p className="mt-3 text-[13px] text-ink-3">
            Chaque candidature est examinée avant publication.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="nk-wrap py-12" aria-labelledby="faq">
        <p className="text-center text-[13px] font-bold uppercase tracking-[0.12em] text-brand">
          Questions fréquentes
        </p>
        <h2 id="faq" className="mb-8 mt-2 text-center text-[clamp(26px,3.4vw,38px)] font-extrabold">
          Avant de vous <em className="not-italic text-brand">lancer</em>
        </h2>
        <div className="mx-auto max-w-[760px]">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group mb-3 overflow-hidden rounded-nk border border-line bg-card open:border-brand-tint-2"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-base font-bold hover:text-brand">
                {item.q}
                <span
                  className="grid size-[30px] shrink-0 place-items-center rounded-full bg-line-2 text-ink-2 transition group-open:rotate-45 group-open:bg-brand-tint group-open:text-brand"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-[15px]">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
