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
          // Un témoignage nominatif chiffré (« 2 000 étudiants ») ne s'affiche
          // que s'il est réel et consenti. Même registre que les autres écrans
          // d'accès : une phrase de la plateforme, signée comme telle.
          quote="Apprenez à l'unité, ou publiez votre savoir et vivez-en."
          author="NKAMVA"
        />
      }
    >
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
