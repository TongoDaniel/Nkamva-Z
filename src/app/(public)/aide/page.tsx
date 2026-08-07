import type { Metadata } from "next";
import { publicSubscriptionPlans, subscriptionAnnouncement } from "@/lib/pricing";
import { HelpCenter } from "./help-center";

// Les réponses citent la grille d'abonnement en vigueur, qui est datée : cet
// écran ne peut pas être figé au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aide & FAQ",
  description:
    "Paiement mobile money, remboursement, compte, communautés, espace formateur : les réponses aux questions courantes sur NkamVa.",
};

export default async function AidePage() {
  const subscription = subscriptionAnnouncement(await publicSubscriptionPlans());

  return (
    <div className="nk-wrap pb-16">
      <HelpCenter subscription={subscription} />
    </div>
  );
}
