"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { Field, PasswordField } from "@/components/nk/input";
import { AuthHeading, FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";

/** Miroir exact de la règle appliquée par POST /api/auth/register. */
function localPasswordIssue(value: string): string | null {
  if (value.length < 8) return "Au moins 8 caractères.";
  if (!/[A-Z]/.test(value)) return "Au moins une majuscule.";
  if (!/\d/.test(value)) return "Au moins un chiffre.";
  return null;
}

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [accept, setAccept] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const pwdIssue = localPasswordIssue(password);
    if (pwdIssue) {
      setFieldErrors({ password: pwdIssue });
      return;
    }
    setFieldErrors({});
    setPending(true);

    try {
      await api.post("/api/auth/register", {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        acceptTerms: true,
      });
      const target = new URLSearchParams({
        email: email.trim().toLowerCase(),
        purpose: "EMAIL_VERIFICATION",
      });
      router.push(`/auth/verifier-code?${target.toString()}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          setFieldErrors(
            Object.fromEntries(
              err.details
                .filter((d) => d.field && d.reason)
                .map((d) => [d.field as string, d.reason as string]),
            ),
          );
        }
        setError(err.message);
      } else {
        setError("La création du compte a échoué. Réessayez dans un instant.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeading
        title="Créer votre compte"
        subtitle="Rejoignez la communauté des apprenants à travers l'Afrique."
      />
      <FormError>{error}</FormError>
      <form onSubmit={onSubmit} noValidate>
        <Field
          label="Nom complet"
          name="fullName"
          autoComplete="name"
          required
          placeholder="Aminata Diallo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.fullName}
        />
        <Field
          label="Adresse e-mail"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="votreadresse@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <PasswordField
          label="Mot de passe"
          name="password"
          autoComplete="new-password"
          required
          showStrength
          placeholder="••••••••"
          hint="Au moins 8 caractères, une majuscule et un chiffre."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <label className="mb-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <input
            type="checkbox"
            required
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-brand"
          />
          <span>
            J&apos;accepte les{" "}
            <Link href="/legal/conditions" className="font-semibold text-brand">
              CGU
            </Link>{" "}
            et la{" "}
            <Link href="/legal/confidentialite" className="font-semibold text-brand">
              Politique de confidentialité
            </Link>
            .<br />
            En créant un compte, vous confirmez avoir 16 ans ou plus.
          </span>
        </label>
        <Btn type="submit" size="lg" block loading={pending} disabled={!accept}>
          Créer mon compte
        </Btn>
      </form>
      <p className="mt-5 text-center text-sm text-ink-2">
        Déjà un compte ?{" "}
        <Link href="/auth/connexion" className="font-bold text-brand hover:text-brand-dark">
          Se connecter
        </Link>
      </p>
      <p className="mt-2.5 text-center text-[13px] text-ink-2">
        Vous êtes formateur ?{" "}
        <Link href="/devenir-formateur" className="font-bold text-brand hover:text-brand-dark">
          Postulez pour enseigner sur NkamVa →
        </Link>
      </p>
    </>
  );
}
