"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { AuthHeading, AuthBackLink, FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";

export function ForgotForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post("/api/auth/otp", {
        email: email.trim().toLowerCase(),
        purpose: "PASSWORD_RESET",
      });
      // L'API répond 200 même si l'adresse est inconnue (pas d'énumération) :
      // on avance donc toujours vers la saisie du code.
      const target = new URLSearchParams({
        email: email.trim().toLowerCase(),
        purpose: "PASSWORD_RESET",
      });
      router.push(`/auth/verifier-code?${target.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'envoi a échoué. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeading
        icon={<KeyRound aria-hidden="true" />}
        title="Mot de passe oublié ?"
        subtitle="Pas de panique. Indiquez l'e-mail de votre compte : nous vous enverrons un code à 6 chiffres pour le réinitialiser."
      />
      <FormError>{error}</FormError>
      <form onSubmit={onSubmit} noValidate>
        <Field
          label="Adresse e-mail"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="vous@exemple.com"
          hint="Le code est valable 10 minutes."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Btn type="submit" size="lg" block loading={pending}>
          Envoyer le code
        </Btn>
      </form>
      <AuthBackLink href="/auth/connexion">Retour à la connexion</AuthBackLink>
    </>
  );
}
