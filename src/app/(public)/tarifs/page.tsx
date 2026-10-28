import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { Chip } from "@/components/nk/chip";
import { COMMISSION_LABEL, TRAINER_SHARE_LABEL } from "@/lib/commission";
import { fmtFcfa } from "@/lib/format";
import {
  CONSUMPTION_THRESHOLD_LABEL,
  DISPUTE_OPENING_WINDOW_DAYS,
  PAYOUT_METHOD_CARENCE_HOURS,
  PAYOUT_MIN_AMOUNT_FCFA,
} from "@/lib/rules";
import { publicPricingCopy, publicSubscriptionPlans, subscriptionAnnouncement } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// La grille d'abonnement est datée et modifiable depuis l'administration : la
// page tarifs ne peut pas être figée au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Payez à l'unité en FCFA, par mobile money. Compte apprenant gratuit, sans abonnement obligatoire.",
};

/**
 * Ce qui est annoncé ici engage : rien de ce qui est chiffré n'est écrit à la
 * main. Le prix de l'abonnement formateur vient de la grille en vigueur, la
 * commission de `lib/commission`. Une page tarifs qui contredit ce que la
 * facturation applique est pire qu'une page absente.
 */
export default async function TarifsPage() {
  const plans = await publicSubscriptionPlans();
  // Chapeau, prix et note sont dérivés des montants en vigueur : la page ne
  // peut plus dire « pas d'abonnement pour publier » au-dessus d'un tarif (M9).
  const copy = publicPricingCopy(plans, COMMISSION_LABEL);
  const subscriptionSentence = subscriptionAnnouncement(plans);

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
        `Contestation possible sous ${DISPUTE_OPENING_WINDOW_DAYS} jours`,
      ],
      cta: { href: "/auth/inscription", label: "Créer mon compte" },
      variant: "o" as const,
      featured: false,
    },
    {
      name: "Formateur",
      description: "Pour publier votre savoir et en vivre.",
      price: copy.trainerPrice,
      note: copy.trainerNote,
      features: [
        "Publication de ressources illimitée",
        "Vous fixez librement vos prix, en FCFA",
        `${TRAINER_SHARE_LABEL} de chaque vente vous reviennent`,
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
      a: `Pas pour apprendre : le compte apprenant est gratuit et chaque ressource s'achète à l'unité, au prix fixé par son formateur. ${subscriptionSentence}`,
    },
    {
      q: "Comment la commission est-elle calculée ?",
      a: `NKAMVA retient ${COMMISSION_LABEL} du prix de vente ; ${TRAINER_SHARE_LABEL} reviennent au formateur. La commission est prélevée à la vente, il n'y a pas de frais d'entrée. ${subscriptionSentence}`,
    },
    {
      q: "Quels moyens de paiement acceptez-vous ?",
      a: "Mobile money et carte bancaire. Les opérateurs proposés dépendent de votre pays ; la liste exacte s'affiche à l'écran de paiement. Les montants sont affichés en FCFA.",
    },
    {
      q: "Puis-je être remboursé ?",
      a: `Oui, dans les ${DISPUTE_OPENING_WINDOW_DAYS} jours suivant l'achat et si vous avez consulté moins de ${CONSUMPTION_THRESHOLD_LABEL} de la ressource. Un format téléchargeable, une fois récupéré, ne peut plus être remboursé : le fichier est chez vous.`,
    },
    {
      q: "Quand un formateur touche-t-il son argent ?",
      a: `Chaque vente confirmée crédite son solde. Dès ${fmtFcfa(PAYOUT_MIN_AMOUNT_FCFA)} retirables, il demande un retrait depuis son portefeuille, vers le compte mobile money ou bancaire qu'il y a enregistré. Un compte nouvellement enregistré ou modifié attend ${PAYOUT_METHOD_CARENCE_HOURS} h avant son premier retrait.`,
    },
  ];

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Tarifs" }]}
        title="Des tarifs pensés pour l'Afrique"
        lead={copy.lead}
      />

      <div className="mx-auto mt-6 grid max-w-[860px] gap-5 md:grid-cols-2">
        {PLANS.map((plan) => (
          <section
            key={plan.name}
            aria-label={plan.name}
            className={cn(
              "flex flex-col rounded-nk-lg border bg-card p-5 shadow-nk-sm sm:p-7",
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
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line bg-card text-brand"
                    aria-hidden="true"
                  >
                    <Check className="size-3" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <BtnLink href={plan.cta.href} variant={plan.variant} block className="mt-auto">
              {plan.cta.label}
            </BtnLink>
          </section>
        ))}
      </div>

      <section aria-labelledby="faq-tarifs" className="mx-auto mt-9 max-w-[760px] sm:mt-14">
        <h2 id="faq-tarifs" className="mb-6 text-center text-[clamp(22px,3vw,30px)] font-extrabold">
          Avant de vous lancer
        </h2>
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group mb-3 overflow-hidden rounded-nk border border-line bg-card open:border-brand-tint-2"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4.5 text-[15.5px] font-bold hover:text-brand">
              {item.q}
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-card text-ink-2 transition group-open:rotate-45 group-open:border-brand group-open:text-brand"
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
