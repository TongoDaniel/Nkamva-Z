import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { Chip } from "@/components/nk/chip";
import { COMMISSION_LABEL, PRO_COMMISSION_LABEL, TRAINER_SHARE_LABEL } from "@/lib/commission";
import { PRO_BREAK_EVEN_FCFA, PRO_MONTHLY_PRICE_FCFA, PRO_OPEN_TO_ALL_AT } from "@/lib/trainer-plans";
import { fmtDate } from "@/lib/format";
import { COMMUNITY_GRID_AT } from "@/lib/community-plans";
import { fmtFcfa } from "@/lib/format";
import {
  CONSUMPTION_THRESHOLD_LABEL,
  DISPUTE_OPENING_WINDOW_DAYS,
  PAYOUT_METHOD_CARENCE_HOURS,
  PAYOUT_MIN_AMOUNT_FCFA,
} from "@/lib/rules";
import { getCurrentTariff, publicPricingCopy, publicSubscriptionPlans } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// La grille d'abonnement est datée et modifiable depuis l'administration : la
// page tarifs ne peut pas être figée au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Payez à l'unité en FCFA, par mobile money. Formateurs : 0 FCFA par mois et 10 % seulement quand vous vendez, ou le plan Pro.",
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
  // Modèle v1.1 : le prix du Pro vient de la grille en vigueur.
  const proPrice = (await getCurrentTariff("MONTHLY", new Date(), "PRO_SUBSCRIPTION"))?.amountFcfa ?? PRO_MONTHLY_PRICE_FCFA;

  // Modèle économique v1.1 : le mot « gratuit » est retiré du vocabulaire ;
  // le plan de base s'appelle « Vous ne payez que quand vous vendez ».
  const PLANS = [
    {
      name: "Apprenant",
      description: "Des ressources à l'unité, sans abonnement.",
      price: "0 FCFA",
      note: "Vous ne payez que ce que vous achetez, frais de paiement en plus.",
      features: [
        "Aucun abonnement pour apprendre",
        "Chaque ressource s'achète à l'unité, en FCFA",
        "Accès à vie à ce que vous avez acheté",
        "Frais de paiement calculés selon votre moyen, affichés avant de payer",
        `Remboursement intégral si la faute n'est pas la vôtre, demande sous ${DISPUTE_OPENING_WINDOW_DAYS} jours`,
      ],
      cta: { href: "/auth/inscription", label: "Créer mon compte" },
      variant: "o" as const,
      featured: false,
      chip: null as string | null,
    },
    {
      name: "Vous ne payez que quand vous vendez",
      description: "Le plan de chaque formateur, dès son inscription.",
      price: "0 FCFA par mois",
      note: `${COMMISSION_LABEL} sur vos ventes, rien d'autre.`,
      features: [
        "Publication de ressources illimitée",
        "Vous fixez librement vos prix, en FCFA",
        `${TRAINER_SHARE_LABEL} du prix vous reviennent : les frais de paiement sont payés par l'acheteur`,
        "5 Go de stockage, plus 1 Go par tranche de 50 000 FCFA vendus",
        "Retraits par mobile money",
      ],
      cta: { href: "/devenir-formateur", label: "Devenir formateur" },
      variant: "p" as const,
      featured: true,
      chip: "Pour publier",
    },
    {
      name: "Pro",
      description: "Pour les formateurs qui vendent beaucoup.",
      price: `${fmtFcfa(proPrice)} par mois`,
      note: `Plus ${PRO_COMMISSION_LABEL} sur vos ventes. Ouvert aux formateurs fondateurs, à tous le ${fmtDate(PRO_OPEN_TO_ALL_AT)}.`,
      features: [
        `${PRO_COMMISSION_LABEL} de commission au lieu de ${COMMISSION_LABEL}`,
        "100 Go de stockage",
        `Plus avantageux au-delà d'environ ${fmtFcfa(PRO_BREAK_EVEN_FCFA)} de ventes par mois`,
        "Retour au plan de base quand vous voulez, sans pénalité",
      ],
      cta: { href: "/devenir-formateur", label: "Devenir formateur" },
      variant: "o" as const,
      featured: false,
      chip: null as string | null,
    },
  ];

  const FAQ = [
    {
      q: "Y a-t-il un abonnement obligatoire ?",
      a: `Non. Pour apprendre, chaque ressource s'achète à l'unité, au prix fixé par son formateur. Pour publier, le plan « Vous ne payez que quand vous vendez » coûte 0 FCFA par mois : seule une commission de ${COMMISSION_LABEL} est retenue sur les ventes. Le plan Pro (${fmtFcfa(proPrice)} par mois + ${PRO_COMMISSION_LABEL}) est un choix, jamais une obligation.`,
    },
    {
      q: "Comment la commission est-elle calculée ?",
      a: `Sur le plan de base, NKAMVA retient ${COMMISSION_LABEL} du prix fixé par le formateur ; ${TRAINER_SHARE_LABEL} lui reviennent. En Pro, la commission est de ${PRO_COMMISSION_LABEL}. Les frais de paiement sont payés par l'acheteur, en plus du prix, et calculés selon son pays et son moyen de paiement : le formateur reçoit exactement ce qui est annoncé.`,
    },
    {
      q: "Quels moyens de paiement acceptez-vous ?",
      a: "Mobile money et carte bancaire. Les opérateurs proposés dépendent de votre pays ; la liste exacte s'affiche à l'écran de paiement. Les montants sont affichés en FCFA.",
    },
    {
      q: "Puis-je être remboursé ?",
      a: `Oui, intégralement, frais compris, quand la faute n'est pas la vôtre : accès non reçu, double paiement, live annulé, contenu différent de sa description. La demande se fait sous ${DISPUTE_OPENING_WINDOW_DAYS} jours, et la décision tombe sous 72 h ouvrées. Un simple changement d'avis n'est plus remboursable après l'accès au contenu (plus de ${CONSUMPTION_THRESHOLD_LABEL} consultés, ou fichier téléchargé).`,
    },
    {
      // Modèle v1.1 : la grille Community s'annonce aux formateurs avec un
      // préavis de 30 jours (plan d'action 2.2) ; ses prix ne s'écrivent pas
      // ici avant cette annonce.
      q: "Ouvrir une communauté coûte-t-il quelque chose ?",
      a: `Pas jusqu'au ${fmtDate(COMMUNITY_GRID_AT)} : chaque communauté peut tenir jusqu'à 3 lives par semaine, de 2 h au plus, avec des replays en audio. À partir de cette date, une petite communauté (jusqu'à 20 membres) reste à 0 FCFA, et les plus grandes passent à un plan mensuel selon leur nombre de membres. La grille sera annoncée aux formateurs au moins 30 jours avant.`,
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

      <div className="mx-auto mt-6 grid max-w-[1180px] gap-5 md:grid-cols-3">
        {PLANS.map((plan) => (
          <section
            key={plan.name}
            aria-label={plan.name}
            className={cn(
              "flex flex-col rounded-nk-lg border bg-card p-5 shadow-nk-sm sm:p-7",
              plan.featured ? "border-brand shadow-nk" : "border-line",
            )}
          >
            {plan.chip ? <Chip className="mb-3 self-start">{plan.chip}</Chip> : null}
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
