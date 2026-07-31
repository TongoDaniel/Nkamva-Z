import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell, AuthAside } from "@/components/layouts/auth-shell";
import { VerifyCodeForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Vérifier le code",
  description: "Saisissez le code à 6 chiffres reçu par e-mail.",
};

export default function VerifierCodePage() {
  return (
    <AuthShell
      aside={
        <AuthAside
          title="Récupération sécurisée"
          points={[
            "Code à usage unique envoyé par e-mail.",
            "Valable 10 minutes, 5 tentatives maximum.",
            "Le support répond en moins de 24 h.",
          ]}
          quote="La double vérification protège votre compte à chaque connexion."
          author="Sécurité NkamVa"
        />
      }
    >
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <VerifyCodeForm />
      </Suspense>
    </AuthShell>
  );
}
