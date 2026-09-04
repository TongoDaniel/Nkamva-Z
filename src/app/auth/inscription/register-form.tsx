"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { Field, PasswordField } from "@/components/nk/input";
import { PasswordChecklist } from "@/components/nk/password-checklist";
import { AuthHeading, FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { withCallbackUrl } from "@/lib/callback-url";
import { EMAIL_ERROR, isValidEmail, passwordError } from "@/lib/validation";

export function RegisterForm() {
  const router = useRouter();
  // La destination de reprise traverse l'inscription (F1.6) : on la reçoit du
  // lien qui a mené ici, on la repasse à la vérification par code, et le lien
  // vers la connexion la porte aussi — quelqu'un qui se découvre déjà inscrit
  // ne doit pas perdre son achat en changeant d'écran.
  const callbackUrl = useSearchParams().get("callbackUrl");
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [accept, setAccept] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  /** Efface l'erreur d'un champ dès que l'utilisateur le corrige. */
  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Le formulaire pose `noValidate` : toutes les règles sont revérifiées ici,
    // et signalées d'un coup plutôt qu'une par une.
    const issues: Record<string, string> = {};
    if (!fullName.trim()) issues.fullName = "Renseignez votre nom complet.";
    if (!email.trim()) issues.email = "Renseignez votre adresse e-mail.";
    else if (!isValidEmail(email)) issues.email = EMAIL_ERROR;
    if (!password) issues.password = "Choisissez un mot de passe.";
    else {
      const pwdIssue = passwordError(password);
      if (pwdIssue) issues.password = pwdIssue;
    }

    if (Object.keys(issues).length > 0) {
      setFieldErrors(issues);
      if (Object.keys(issues).length > 1) {
        setError("Plusieurs champs demandent une correction.");
      }
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
      router.push(withCallbackUrl(`/auth/verifier-code?${target.toString()}`, callbackUrl));
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
          onChange={(e) => {
            setFullName(e.target.value);
            clearFieldError("fullName");
          }}
          error={fieldErrors.fullName}
        />
        <Field
          label="Adresse e-mail"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="votreadresse@exemple.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError("email");
          }}
          error={fieldErrors.email}
        />
        <PasswordField
          label="Mot de passe"
          name="password"
          autoComplete="new-password"
          required
          showStrength
          placeholder="••••••••"
          value={password}
          containerClassName="mb-2"
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError("password");
          }}
          error={fieldErrors.password}
        />
        <PasswordChecklist value={password} className="mb-[18px]" />
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
        <Link
          href={withCallbackUrl("/auth/connexion", callbackUrl)}
          className="font-bold text-brand hover:text-brand-dark"
        >
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
