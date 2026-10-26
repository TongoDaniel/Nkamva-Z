import type { Metadata } from "next";
import { listPublicHelp, loadHelpValues } from "@/lib/help-content";
import { getSettingNumber } from "@/lib/settings";
import { HelpCenter } from "./help-center";

// Le contenu vit en base et s'édite depuis /admin/aide ; ses marqueurs citent la
// grille d'abonnement en vigueur, qui est datée, et le délai du support, qui vit
// en base : cet écran ne peut pas être figé au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aide & FAQ",
  description:
    "Paiement mobile money, remboursement, compte, communautés, espace formateur : les réponses aux questions courantes sur NKAMVA.",
};

export default async function AidePage() {
  const values = await loadHelpValues();
  const [groups, responseHours] = await Promise.all([
    listPublicHelp(values),
    getSettingNumber("support.response_time_hours"),
  ]);

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <HelpCenter groups={groups} responseHours={responseHours} />
    </div>
  );
}
