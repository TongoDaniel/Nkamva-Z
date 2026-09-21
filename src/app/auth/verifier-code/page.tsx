import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell, AuthIllustration } from "@/components/layouts/auth-shell";
import { VerifyCodeForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Vérifier le code",
  description: "Saisissez le code à 6 chiffres reçu par e-mail.",
};

export default function VerifierCodePage() {
  return (
    <AuthShell
      illustration={
        <AuthIllustration
          photo="/auth/verifier-code.webp"
          focus="36%"
          quote="La double vérification protège votre compte à chaque connexion."
          author="Sécurité NKAMVA"
        />
      }
    >
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <VerifyCodeForm />
      </Suspense>
    </AuthShell>
  );
}
