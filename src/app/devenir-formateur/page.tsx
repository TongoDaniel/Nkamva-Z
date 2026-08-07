import type { Metadata } from "next";
import { Logo } from "@/components/nk/logo";
import type { PlanOption } from "@/components/nk/plan-option";
import { publicSubscriptionPlans } from "@/lib/pricing";
import { TrainerSignupWizard } from "./trainer-signup-wizard";

// La grille tarifaire est datée et modifiable depuis l'administration : cette
// page ne peut pas être figée au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Devenir formateur",
  description:
    "Créez votre compte formateur sur NkamVa : profil, vérification d'identité et choix de la formule.",
};

/**
 * Page autonome — port de `.authpage.centered`. Elle vit hors du groupe
 * `(public)` : la maquette la présente sans topbar ni footer, pour ne pas
 * offrir de sortie latérale au milieu d'une candidature.
 */
export default async function DevenirFormateurPage() {
  const plans = await publicSubscriptionPlans();

  const options: PlanOption[] = plans.map((plan) => ({
    // L'identifiant reste la cadence : c'est ce que `TrainerProfile`
    // (`subscriptionCadence`) attend le jour où le parcours sera branché.
    id: plan.cadence,
    name: plan.name,
    amountFcfa: plan.amountFcfa,
    period: plan.period,
    description: plan.free
      ? (plan.tariffLabel ?? "Aucun abonnement à régler pour le moment")
      : plan.cadence === "MONTHLY"
        ? "Sans engagement, résiliable à tout moment"
        : "Facturé une fois par an",
    badge: plan.savingPercent ? `-${plan.savingPercent} %` : undefined,
  }));

  return (
    <main className="min-h-screen bg-paper px-5 pb-[70px] pt-14">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-[26px] flex justify-center">
          <Logo />
        </div>
        <TrainerSignupWizard plans={options} />
      </div>
    </main>
  );
}
