import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell, AuthIllustration } from "@/components/layouts/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous pour reprendre votre apprentissage sur NKAMVA.",
};

export default function ConnexionPage() {
  return (
    <AuthShell
      illustration={
        <AuthIllustration
          photo="/auth/connexion-apprenante.webp"
          focus="11%"
          quote="Une plateforme simple, rapide et efficace."
          author="Un apprenant NKAMVA"
        />
      }
    >
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
