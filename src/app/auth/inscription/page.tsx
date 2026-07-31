import type { Metadata } from "next";
import { AuthShell, AuthAside } from "@/components/layouts/auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Rejoignez la communauté des apprenants NkamVa à travers l'Afrique.",
};

export default function InscriptionPage() {
  return (
    <AuthShell
      aside={
        <AuthAside
          title="Ce que vous obtenez"
          points={[
            "Un paiement à l'unité, en FCFA, sans abonnement obligatoire.",
            "Un accès à vie à chaque ressource achetée.",
            "Votre progression conservée, sur mobile comme sur ordinateur.",
          ]}
          quote="NkamVa a structuré ma communauté de 2 000 étudiants."
          author="Une formatrice NkamVa"
        />
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
