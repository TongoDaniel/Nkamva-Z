"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Btn } from "@/components/nk/button";
import { Field, PasswordField } from "@/components/nk/input";
import { AuthHeading, FormError, FormNotice } from "@/components/layouts/auth-shell";
import { EMAIL_ERROR, isValidEmail } from "@/lib/validation";

/** Messages d'erreur renvoyés par NextAuth dans `?error=` ou par `signIn`. */
function loginErrorMessage(code?: string | null): string | null {
  if (!code) return null;
  if (code === "ACCOUNT_SUSPENDED") {
    return "Ce compte est suspendu. Contactez le support pour en connaître la raison.";
  }
  if (code === "TOO_MANY_ATTEMPTS") {
    return "Trop de tentatives de connexion. Patientez une minute avant de réessayer.";
  }
  if (code === "SESSION_ENDED") {
    return "Votre session n'est plus valide. Reconnectez-vous pour continuer.";
  }
  if (code === "CredentialsSignin") {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  if (code === "TWO_FACTOR_INVALID") {
    return "Code incorrect. Vérifiez l'heure de votre téléphone : un décalage suffit à le faire refuser.";
  }
  if (code === "TWO_FACTOR_ENROLLMENT_REQUIRED") {
    return "Votre rôle exige la double authentification. Contactez un autre administrateur pour qu'il vous en ouvre l'accès.";
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
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  // Seconde étape : le mot de passe était bon, il manque le code. Le formulaire
  // ne bascule qu'après que le serveur l'a demandé — il n'a aucune raison de
  // savoir d'avance qui a activé la double authentification, et le lui faire
  // dire en révélerait la liste.
  const [totpRequired, setTotpRequired] = React.useState(false);
  const [totp, setTotp] = React.useState("");

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

    // `noValidate` désactive le contrôle du navigateur : à refaire ici, sinon
    // une saisie sans arobase remonte comme « identifiants incorrects », ce qui
    // envoie chercher l'erreur au mauvais endroit.
    if (!email.trim()) {
      setEmailError("Renseignez votre adresse e-mail.");
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError(EMAIL_ERROR);
      return;
    }
    setEmailError(null);

    setPending(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        ...(totp.trim() ? { totp: totp.trim() } : {}),
        redirect: false,
        callbackUrl,
      });
      if (!res || res.error) {
        if (res?.error === "TWO_FACTOR_REQUIRED") {
          setTotpRequired(true);
          setError(null);
          return;
        }
        if (res?.error === "TWO_FACTOR_INVALID") setTotp("");
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
          inputMode="email"
          required
          placeholder="votreadresse@exemple.com"
          value={email}
          error={emailError}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
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
        {totpRequired ? (
          <div className="mb-4">
            <Field
              label="Code de vérification"
              type="text"
              name="totp"
              autoComplete="one-time-code"
              inputMode="text"
              required
              autoFocus
              placeholder="123456"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
            />
            <p className="-mt-2 text-[13px] leading-relaxed text-ink-2">
              Ouvrez votre application d&apos;authentification. Vous pouvez aussi saisir l&apos;un de
              vos codes de secours.
            </p>
          </div>
        ) : null}

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
