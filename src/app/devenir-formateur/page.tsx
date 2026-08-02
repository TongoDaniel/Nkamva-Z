import type { Metadata } from "next";
import { Logo } from "@/components/nk/logo";
import { TrainerSignupWizard } from "./trainer-signup-wizard";

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
export default function DevenirFormateurPage() {
  return (
    <main className="min-h-screen bg-paper px-5 pb-[70px] pt-14">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-[26px] flex justify-center">
          <Logo />
        </div>
        <TrainerSignupWizard />
      </div>
    </main>
  );
}
