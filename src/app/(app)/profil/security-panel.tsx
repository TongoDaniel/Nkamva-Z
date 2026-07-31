"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Btn } from "@/components/nk/button";
import { PasswordField } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import type { ProfileView } from "@/lib/profile";
import { SettingCard, SettingRow } from "./setting-card";

/** Miroir de la règle appliquée par POST /api/me/password. */
function localPasswordIssue(value: string): string | null {
  if (value.length < 8) return "Au moins 8 caractères.";
  if (!/[A-Z]/.test(value)) return "Au moins une majuscule.";
  if (!/\d/.test(value)) return "Au moins un chiffre.";
  return null;
}

export function SecurityPanel({ profile }: { profile: ProfileView }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const issue = localPasswordIssue(next);
    if (issue) {
      setFieldError(issue);
      return;
    }
    if (next !== confirm) {
      setFieldError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setFieldError(null);
    setPending(true);

    try {
      await api.post("/api/me/password", { currentPassword: current, newPassword: next });
      // Le changement invalide toutes les sessions, dont celle-ci : on sort
      // proprement plutôt que de laisser l'interface se heurter à des 401.
      await signOut({ callbackUrl: "/auth/connexion?password=1" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le changement a échoué. Réessayez.");
      setPending(false);
    }
  }

  return (
    <>
      <SettingCard
        title="Mot de passe"
        subtitle="Le changement déconnecte toutes vos sessions ouvertes, y compris celle-ci. Vous devrez vous reconnecter juste après."
        footer={
          <Btn type="submit" form="pwd-form" loading={pending} disabled={!current || !next || !confirm}>
            Modifier le mot de passe
          </Btn>
        }
      >
        <form id="pwd-form" onSubmit={onSubmit} noValidate>
          <FormError>{error}</FormError>
          <PasswordField
            label="Mot de passe actuel"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <PasswordField
              label="Nouveau mot de passe"
              autoComplete="new-password"
              required
              showStrength
              hint="Au moins 8 caractères, une majuscule et un chiffre."
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={fieldError}
            />
            <PasswordField
              label="Confirmer"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </form>
      </SettingCard>

      <SettingCard title="Connexion" subtitle="État de l'accès à votre compte.">
        <SettingRow
          title="Adresse e-mail"
          description={profile.email}
          action={
            <span className="text-[12.5px] font-semibold text-ink-3">
              Modification à venir
            </span>
          }
        />
        <SettingRow
          title="Vérification de l'adresse"
          description={
            profile.emailVerifiedAt
              ? "Votre adresse est vérifiée."
              : "Votre adresse n'est pas encore vérifiée."
          }
          action={
            profile.emailVerifiedAt ? (
              <span className="text-[12.5px] font-semibold text-brand-dark">Vérifiée</span>
            ) : (
              <Btn asChild variant="o" size="sm">
                <a href={`/auth/verifier-code?email=${encodeURIComponent(profile.email)}`}>
                  Vérifier maintenant
                </a>
              </Btn>
            )
          }
        />
      </SettingCard>
    </>
  );
}
