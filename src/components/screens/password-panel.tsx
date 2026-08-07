"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Btn } from "@/components/nk/button";
import { PasswordField } from "@/components/nk/input";
import { PasswordChecklist } from "@/components/nk/password-checklist";
import { SettingCard } from "@/components/nk/setting-card";
import { FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { passwordError } from "@/lib/validation";

/**
 * Changement de mot de passe, partagé par les deux coquilles.
 *
 * Il vivait dans `(app)/profil/security-panel.tsx`, hors de portée des
 * administrateurs — que le cloisonnement écarte de `/profil`. Le duplicer pour
 * `/admin/mon-compte` aurait donné deux formulaires à faire évoluer ensemble,
 * dont un qui gouverne les comptes les plus puissants de la plateforme.
 *
 * `callbackUrl` est un paramètre : après déconnexion, un administrateur doit
 * revenir dans son espace, pas dans celui d'un apprenant.
 */
export function PasswordPanel({ callbackUrl = "/auth/connexion?password=1" }: { callbackUrl?: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!next) {
      setFieldError("Choisissez un nouveau mot de passe.");
      return;
    }
    const issue = passwordError(next);
    if (issue) {
      setFieldError(issue);
      return;
    }
    if (next !== confirm) {
      setFieldError("Ce mot de passe ne correspond pas au précédent.");
      return;
    }
    setFieldError(null);
    setPending(true);

    try {
      await api.post("/api/me/password", { currentPassword: current, newPassword: next });
      // Le changement invalide toutes les sessions, dont celle-ci : on sort
      // proprement plutôt que de laisser l'interface se heurter à des 401.
      await signOut({ callbackUrl });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le changement a échoué. Réessayez.");
      setPending(false);
    }
  }

  return (
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
            value={next}
            containerClassName="mb-2"
            onChange={(e) => {
              setNext(e.target.value);
              setFieldError(null);
            }}
            error={fieldError}
          />
          <PasswordField
            label="Confirmer"
            autoComplete="new-password"
            required
            value={confirm}
            containerClassName="mb-2"
            onChange={(e) => {
              setConfirm(e.target.value);
              setFieldError(null);
            }}
          />
        </div>
        <PasswordChecklist value={next} className="mb-[18px]" />
      </form>
    </SettingCard>
  );
}
