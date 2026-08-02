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
          photoBrief="formatrice au travail, ambiance chaleureuse"
          quote="NkamVa a structuré ma communauté de 2 000 étudiants."
          author="Aissatou Diallo · Formatrice"
        />
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
