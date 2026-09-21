import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell, AuthIllustration } from "@/components/layouts/auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Rejoignez la communauté des apprenants NKAMVA à travers l'Afrique.",
};

export default function InscriptionPage() {
  return (
    <AuthShell
      illustration={
        <AuthIllustration
          photo="/auth/inscription-formatrice.webp"
          focus="10%"
          quote="NKAMVA a structuré ma communauté de 2 000 étudiants."
          author="Aissatou Diallo · Formatrice"
        />
      }
    >
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
