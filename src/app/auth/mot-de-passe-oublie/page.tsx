import type { Metadata } from "next";
import { AuthShell, AuthAside } from "@/components/layouts/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Recevez un code à 6 chiffres pour réinitialiser votre mot de passe NkamVa.",
};

export default function MotDePasseOubliePage() {
  return (
    <AuthShell
      aside={
        <AuthAside
          photo="/auth/mot-de-passe-oublie-apprenant.webp"
          photoBrief="apprenant concentré devant son ordinateur"
          quote="On reprend là où on s'était arrêté, en deux minutes."
          author="Support NkamVa · disponible 6j/7"
        />
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
