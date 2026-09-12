import type { Metadata } from "next";
import { publicSubscriptionPlans, subscriptionAnnouncement } from "@/lib/pricing";
import { getSettingNumber } from "@/lib/settings";
import { HelpCenter } from "./help-center";

// Les réponses citent la grille d'abonnement en vigueur, qui est datée, et le
// délai de réponse du support, qui vit en base : cet écran ne peut pas être
// figé au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aide & FAQ",
  description:
    "Paiement mobile money, remboursement, compte, communautés, espace formateur : les réponses aux questions courantes sur NkamVa.",
};

export default async function AidePage() {
  const [plans, responseHours] = await Promise.all([
    publicSubscriptionPlans(),
    getSettingNumber("support.response_time_hours"),
  ]);

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <HelpCenter
        subscription={subscriptionAnnouncement(plans)}
        responseHours={responseHours}
      />
    </div>
  );
}
