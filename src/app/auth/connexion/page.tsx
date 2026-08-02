import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell, AuthAside } from "@/components/layouts/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous pour reprendre votre apprentissage sur NkamVa.",
};

export default function ConnexionPage() {
  return (
    <AuthShell
      aside={
        <AuthAside
          photoBrief="apprenant souriant, mobile en main"
          quote="Une plateforme simple, rapide et efficace."
          author="Un apprenant NkamVa"
        />
      }
    >
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
