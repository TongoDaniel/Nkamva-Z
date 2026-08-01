"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Btn } from "@/components/nk/button";
import { Field, PasswordField } from "@/components/nk/input";
import { AuthHeading, FormError, FormNotice } from "@/components/layouts/auth-shell";

/** Messages d'erreur renvoyés par NextAuth dans `?error=` ou par `signIn`. */
function loginErrorMessage(code?: string | null): string | null {
  if (!code) return null;
  if (code === "ACCOUNT_SUSPENDED") {
    return "Ce compte est suspendu. Contactez le support pour en connaître la raison.";
  }
  if (code === "CredentialsSignin") {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  return "La connexion a échoué. Réessayez dans un instant.";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/accueil";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(loginErrorMessage(params.get("error")));
  const [pending, setPending] = React.useState(false);

  const notice = params.get("verified")
    ? "Votre adresse e-mail est confirmée. Vous pouvez vous connecter."
    : params.get("reset")
      ? "Votre mot de passe a été réinitialisé. Connectez-vous avec le nouveau."
      : params.get("password")
        ? "Votre mot de passe a été modifié. Toutes vos sessions ont été déconnectées."
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl,
      });
      if (!res || res.error) {
        setError(loginErrorMessage(res?.error ?? "CredentialsSignin"));
        return;
      }
      router.push(res.url ?? callbackUrl);
      router.refresh();
    } catch {
      setError("La connexion a échoué. Vérifiez votre connexion réseau.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeading title="Bon retour" subtitle="Connectez-vous pour reprendre votre apprentissage." />
      <FormNotice>{notice}</FormNotice>
      <FormError>{error}</FormError>
      <form onSubmit={onSubmit} noValidate>
        <Field
          label="Adresse e-mail"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="votreadresse@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Mot de passe"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="mb-5 mt-0.5 flex items-center justify-end text-[13.5px]">
          <Link href="/auth/mot-de-passe-oublie" className="font-semibold text-brand hover:text-brand-dark">
            Mot de passe oublié ?
          </Link>
        </div>
        <Btn type="submit" size="lg" block loading={pending}>
          Se connecter
        </Btn>
      </form>
      <p className="mt-5 text-center text-sm text-ink-2">
        Pas encore de compte ?{" "}
        <Link href="/auth/inscription" className="font-bold text-brand hover:text-brand-dark">
          Créer un compte
        </Link>
      </p>
    </>
  );
}
