import type { Metadata } from "next";
import { HelpCenter } from "./help-center";

export const metadata: Metadata = {
  title: "Aide & FAQ",
  description:
    "Paiement mobile money, remboursement, compte, communautés, espace formateur : les réponses aux questions courantes sur NkamVa.",
};

export default function AidePage() {
  return (
    <div className="nk-wrap pb-16">
      <HelpCenter />
    </div>
  );
}
