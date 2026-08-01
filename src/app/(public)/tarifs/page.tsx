import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Payez à l'unité en FCFA, par mobile money. Compte apprenant gratuit, sans abonnement obligatoire.",
};

const PLANS = [
  {
    name: "Apprenant",
    description: "Un compte gratuit, des ressources à l'unité.",
    price: "Gratuit",
    note: "Aucun abonnement, aucune carte à enregistrer.",
    features: [
      "Compte gratuit, sans abonnement",
      "Chaque ressource s'achète à l'unité, en FCFA",
      "Accès à vie à ce que vous avez acheté",
      "Paiement mobile money ou carte bancaire",
      "Contestation possible sous 14 jours",
    ],
    cta: { href: "/auth/inscription", label: "Créer mon compte" },
    variant: "o" as const,
    featured: false,
  },
  {
    name: "Formateur",
    description: "Pour publier votre savoir et en vivre.",
    price: "15 % de commission",
    note: "Prélevés sur chaque vente. Rien à payer d'avance.",
    features: [
      "Publication de ressources illimitée",
      "Vous fixez librement vos prix, en FCFA",
      "85 % de chaque vente vous reviennent",
      "Tableau de bord des ventes et des revenus",
      "Retraits par mobile money",
    ],
    cta: { href: "/devenir-formateur", label: "Devenir formateur" },
    variant: "p" as const,
    featured: true,
  },
];

const FAQ = [
  {
    q: "Y a-t-il un abonnement obligatoire ?",
    a: "Non. Le compte apprenant est gratuit et chaque ressource s'achète à l'unité, au prix fixé par son formateur. Vous ne payez que ce que vous choisissez.",
  },
  {
    q: "Comment la commission est-elle calculée ?",
    a: "NkamVa retient 15 % du prix de vente ; 85 % reviennent au formateur. La commission est prélevée à la vente, il n'y a pas de frais d'entrée ni d'abonnement pour publier.",
  },
  {
    q: "Quels moyens de paiement acceptez-vous ?",
    a: "Mobile money — Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa — et carte bancaire. Les montants sont affichés en FCFA.",
  },
  {
    q: "Puis-je être remboursé ?",
    a: "Oui, dans les 14 jours suivant l'achat et si vous avez consulté moins de 30 % de la ressource. Un format téléchargeable, une fois récupéré, ne peut plus être remboursé : le fichier est chez vous.",
  },
  {
    q: "Quand un formateur touche-t-il son argent ?",
    a: "Chaque vente confirmée crédite son solde. Les retraits vers mobile money ouvriront avec le parcours de vérification d'identité, actuellement en construction.",
  },
];

export default function TarifsPage() {
  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Tarifs" }]}
        title="Des tarifs pensés pour l'Afrique"
        lead="Payez en FCFA, par mobile money. Pas d'abonnement obligatoire, ni pour apprendre, ni pour publier."
      />

      <div className="mx-auto mt-6 grid max-w-[860px] gap-5 md:grid-cols-2">
        {PLANS.map((plan) => (
          <section
            key={plan.name}
            aria-label={plan.name}
            className={cn(
              "flex flex-col rounded-nk-lg border bg-card p-7 shadow-nk-sm",
              plan.featured ? "border-brand shadow-nk" : "border-line",
            )}
          >
            {plan.featured ? <Chip className="mb-3 self-start">Pour publier</Chip> : null}
            <h2 className="text-[21px] font-extrabold">{plan.name}</h2>
            <p className="mt-1 text-[14px] text-ink-2">{plan.description}</p>

            <p className="mt-5 font-display text-[30px] font-extrabold tracking-[-0.02em]">
              {plan.price}
            </p>
            <p className="mb-6 mt-1 text-[13px] text-ink-3">{plan.note}</p>

            <ul className="mb-7 grid gap-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-[14.5px] leading-snug">
                  <span
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-tint text-brand"
                    aria-hidden="true"
                  >
                    <Check className="size-3" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <Btn asChild variant={plan.variant} block className="mt-auto">
              <Link href={plan.cta.href}>{plan.cta.label}</Link>
            </Btn>
          </section>
        ))}
      </div>

      <section aria-labelledby="faq-tarifs" className="mx-auto mt-14 max-w-[760px]">
        <h2 id="faq-tarifs" className="mb-6 text-center text-[clamp(22px,3vw,30px)] font-extrabold">
          Questions sur les tarifs
        </h2>
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group mb-3 overflow-hidden rounded-nk border border-line bg-card open:border-brand-tint-2"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4.5 text-[15.5px] font-bold hover:text-brand">
              {item.q}
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full bg-line-2 text-ink-2 transition group-open:rotate-45 group-open:bg-brand-tint group-open:text-brand"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-3.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </summary>
            <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-ink-2">{item.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
