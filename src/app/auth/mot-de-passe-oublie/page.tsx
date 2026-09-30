import type { Metadata } from "next";
import { AuthShell, AuthIllustration } from "@/components/layouts/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Recevez un code à 6 chiffres pour réinitialiser votre mot de passe NKAMVA.",
};

export default function MotDePasseOubliePage() {
  return (
    <AuthShell
      illustration={
        <AuthIllustration
          photo="/auth/mot-de-passe-oublie-apprenant.webp"
          focus="11%"
          quote="On reprend là où on s'était arrêté, en deux minutes."
          author="Support NKAMVA"
        />
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
