import type { Metadata } from "next";
import { AuthShell, AuthIllustration } from "@/components/layouts/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Choisissez un nouveau mot de passe pour votre compte NkamVa.",
};

export default function NouveauMotDePassePage() {
  return (
    <AuthShell
      illustration={
        <AuthIllustration
          photo="/auth/nouveau-mot-de-passe.webp"
          focus="25%"
          quote="Sécurisez votre compte en quelques secondes."
          author="Sécurité NkamVa"
        />
      }
    >
      <ResetForm />
    </AuthShell>
  );
}
