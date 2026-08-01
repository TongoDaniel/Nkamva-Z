import type { Metadata } from "next";
import { AuthShell, AuthAside } from "@/components/layouts/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Choisissez un nouveau mot de passe pour votre compte NkamVa.",
};

export default function NouveauMotDePassePage() {
  return (
    <AuthShell
      aside={
        <AuthAside
          quote="Sécurisez votre compte en quelques secondes."
          author="Sécurité NkamVa"
        />
      }
    >
      <ResetForm />
    </AuthShell>
  );
}
