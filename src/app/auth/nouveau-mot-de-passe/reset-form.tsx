"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { PasswordField } from "@/components/nk/input";
import { PasswordChecklist } from "@/components/nk/password-checklist";
import { AuthHeading, AuthBackLink, FormError } from "@/components/layouts/auth-shell";
import { RESET_CODE_KEY } from "../verifier-code/verify-form";
import { api, ApiError } from "@/lib/client";
import { passwordError } from "@/lib/validation";

export function ResetForm() {
  const router = useRouter();
  const [ticket, setTicket] = React.useState<{ email: string; code: string } | null>(null);
  const [ready, setReady] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESET_CODE_KEY);
      if (raw) setTicket(JSON.parse(raw));
    } catch {
      // Stockage indisponible ou corrompu : on retombe sur l'écran de demande.
    }
    setReady(true);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!password) {
      setFieldError("Choisissez un mot de passe.");
      return;
    }
    const issue = passwordError(password);
    if (issue) {
      setFieldError(issue);
      return;
    }
    if (password !== confirm) {
      setFieldError("Ce mot de passe ne correspond pas au précédent.");
      return;
    }
    setFieldError(null);
    if (!ticket) return;

    setPending(true);
    try {
      await api.post("/api/auth/reset-password", {
        email: ticket.email,
        code: ticket.code,
        password,
      });
      sessionStorage.removeItem(RESET_CODE_KEY);
      router.push("/auth/connexion?reset=1");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "La réinitialisation a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <div className="h-96" aria-hidden="true" />;

  if (!ticket) {
    return (
      <>
        <AuthHeading
          title="Code introuvable"
          subtitle="Votre code de réinitialisation n'est plus disponible dans cet onglet. Demandez-en un nouveau."
        />
        <Btn asChild size="lg" block>
          <a href="/auth/mot-de-passe-oublie">Recevoir un code</a>
        </Btn>
        <AuthBackLink href="/auth/connexion">Retour à la connexion</AuthBackLink>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Nouveau mot de passe"
        subtitle={
          <>
            Choisissez un mot de passe sécurisé pour <b className="text-ink">{ticket.email}</b>.
          </>
        }
      />
      <FormError>{error}</FormError>
      <form onSubmit={onSubmit} noValidate>
        <PasswordField
          label="Nouveau mot de passe"
          name="password"
          autoComplete="new-password"
          required
          showStrength
          placeholder="••••••••"
          value={password}
          containerClassName="mb-2"
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldError(null);
          }}
          error={fieldError}
        />
        <PasswordChecklist value={password} className="mb-[18px]" />
        <PasswordField
          label="Confirmer le mot de passe"
          name="passwordConfirm"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setFieldError(null);
          }}
        />
        <p className="mb-4 rounded-xl bg-brand-tint px-4 py-3 text-[13px] leading-relaxed text-brand-dark">
          Toutes vos sessions ouvertes seront déconnectées après ce changement.
        </p>
        <Btn type="submit" size="lg" block loading={pending}>
          Réinitialiser le mot de passe
        </Btn>
      </form>
      <AuthBackLink href="/auth/connexion">Retour à la connexion</AuthBackLink>
    </>
  );
}
