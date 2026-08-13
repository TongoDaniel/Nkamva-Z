import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/nk/logo";
import type { PlanOption } from "@/components/nk/plan-option";
import { getAuthContext } from "@/lib/api";
import { publicSubscriptionPlans } from "@/lib/pricing";
import { isS3Configured } from "@/lib/s3";
import { getMyApplication } from "@/lib/trainer-applications";
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
 *
 * Elle est publique, mais pas réservée aux déconnectés : quelqu'un qui arrive
 * ici avec une session saute simplement la première étape. Un dossier déjà
 * ouvert, en revanche, se poursuit dans l'espace connecté — le reprendre ici
 * en ferait une seconde saisie du même dossier.
 */
export default async function DevenirFormateurPage() {
  const auth = await getAuthContext();
  if (auth?.user.trainerId) redirect("/formateur");
  if (auth) {
    const existing = await getMyApplication(auth.user.id);
    // Un dossier rejeté n'interdit pas d'en rouvrir un : `createApplication`
    // l'accepte, et c'est bien ici que ce nouveau départ se prend.
    if (existing && existing.status !== "REJECTED") redirect("/candidature");
  }

  const plans = await publicSubscriptionPlans();

  const options: PlanOption[] = plans.map((plan) => ({
    // L'identifiant reste la cadence : c'est ce que porte `desiredCadence` sur
    // la candidature, puis `TrainerProfile.subscriptionCadence` à l'approbation.
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
    <main className="min-h-dvh bg-paper px-5 pb-[70px] pt-14">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-[26px] flex justify-center">
          <Logo />
        </div>
        <TrainerSignupWizard
          plans={options}
          signedInEmail={auth?.user.email ?? null}
          storageAvailable={isS3Configured()}
        />
      </div>
    </main>
  );
}
