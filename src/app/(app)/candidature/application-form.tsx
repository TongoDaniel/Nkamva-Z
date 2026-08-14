"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { isValidUrl, MIN_TRAINER_DESCRIPTION, URL_ERROR } from "@/lib/validation";
import { cn } from "@/lib/utils";

const DOMAINS = ["Développement", "Business", "Design", "Marketing", "Langues", "Métiers manuels"];

export interface ApplicationDraft {
  slogan: string;
  description: string;
  websiteUrl: string;
  domains: string[];
  experienceYears: string;
}

export const EMPTY_DRAFT: ApplicationDraft = {
  slogan: "",
  description: "",
  websiteUrl: "",
  domains: [],
  experienceYears: "",
};

// Seuil partagé avec le wizard « Devenir formateur » : deux valeurs
// différentes pour le même champ produiraient des refus incompréhensibles.
const MIN_DESCRIPTION = MIN_TRAINER_DESCRIPTION;

/** Étape 1 du parcours : la présentation du candidat. */
export function ApplicationForm({
  mode,
  initial,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: ApplicationDraft;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = React.useState<ApplicationDraft>(initial ?? EMPTY_DRAFT);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const save = useAction(
    async (payload: unknown) => {
      if (mode === "create") {
        await api.post("/api/trainer-applications", payload);
        return "create" as const;
      }
      await api.patch("/api/trainer-applications/me", payload);
      return "edit" as const;
    },
    {
      success: (kind) =>
        kind === "create"
          ? "Candidature créée. Déposez maintenant vos pièces."
          : "Présentation enregistrée.",
      // Les erreurs se posent sur les champs fautifs : pas de toast.
      error: null,
      onSuccess: () => onSaved?.(),
      onError: (err) => {
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
          setError("L'enregistrement a échoué. Réessayez.");
        }
      },
    },
  );

  const set = <K extends keyof ApplicationDraft>(key: K, value: ApplicationDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleDomain = (domain: string) =>
    setDraft((d) => ({
      ...d,
      domains: d.domains.includes(domain)
        ? d.domains.filter((x) => x !== domain)
        : [...d.domains, domain].slice(0, 5),
    }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const issues: Record<string, string> = {};
    if (draft.description.trim().length < MIN_DESCRIPTION) {
      issues.description = `Encore ${MIN_DESCRIPTION - draft.description.trim().length} caractères.`;
    }
    if (draft.domains.length === 0) issues.domains = "Choisissez au moins un domaine.";
    // Facultatif, mais s'il est rempli il doit être exploitable : sans ce
    // contrôle une adresse mal formée partait au serveur et revenait en 400.
    if (draft.websiteUrl.trim() && !isValidUrl(draft.websiteUrl)) {
      issues.websiteUrl = URL_ERROR;
    }
    if (Object.keys(issues).length) {
      setFieldErrors(issues);
      return;
    }
    setFieldErrors({});

    const years = Number.parseInt(draft.experienceYears, 10);
    void save.run({
      slogan: draft.slogan.trim() || undefined,
      description: draft.description.trim(),
      websiteUrl: draft.websiteUrl.trim() || undefined,
      domains: draft.domains,
      ...(Number.isFinite(years) ? { experienceYears: years } : {}),
    });
  }

  const remaining = MIN_DESCRIPTION - draft.description.trim().length;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormError>{error}</FormError>

      <Field
        label="Accroche"
        placeholder="Le back-end sans mystère"
        maxLength={120}
        hint="Une phrase qui résume ce que vous enseignez. Facultatif."
        value={draft.slogan}
        onChange={(e) => set("slogan", e.target.value)}
        error={fieldErrors.slogan}
      />

      <div className="mb-[18px]">
        <label htmlFor="app-description" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Votre expertise
        </label>
        <textarea
          id="app-description"
          rows={6}
          required
          maxLength={2000}
          placeholder="Décrivez votre parcours, ce que vous maîtrisez, et ce que vous voulez transmettre."
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          aria-describedby="app-description-hint"
          aria-invalid={fieldErrors.description ? true : undefined}
          className={cn(
            "w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition",
            "placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25",
            fieldErrors.description && "border-danger",
          )}
        />
        <p id="app-description-hint" className="mt-1.5 text-[13px] text-ink-3">
          {remaining > 0
            ? `Encore ${remaining} caractères avant le minimum requis.`
            : "C'est ce texte que l'équipe de modération lira en premier."}
        </p>
        {fieldErrors.description ? (
          <p className="mt-1.5 text-[13px] font-semibold text-danger">{fieldErrors.description}</p>
        ) : null}
      </div>

      <fieldset className="mb-[18px]">
        <legend className="mb-2.5 text-[13.5px] font-bold text-ink">Domaines enseignés</legend>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map((domain) => {
            const active = draft.domains.includes(domain);
            return (
              <label
                key={domain}
                className={cn(
                  "cursor-pointer rounded-full border-[1.5px] px-4 py-2 text-[13.5px] font-semibold transition",
                  active
                    ? "border-brand bg-brand-tint text-brand-dark"
                    : "border-line bg-card text-ink-2 hover:border-ink-3",
                )}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleDomain(domain)}
                  className="peer sr-only"
                />
                <span className="peer-focus-visible:underline">{domain}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">Cinq au maximum.</p>
        {fieldErrors.domains ? (
          <p className="mt-1.5 text-[13px] font-semibold text-danger">{fieldErrors.domains}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          label="Années d'expérience"
          type="number"
          inputMode="numeric"
          min={0}
          max={70}
          placeholder="12"
          value={draft.experienceYears}
          onChange={(e) => set("experienceYears", e.target.value)}
          error={fieldErrors.experienceYears}
        />
        <Field
          label="Site ou portfolio"
          type="url"
          placeholder="https://exemple.com"
          hint="Facultatif."
          value={draft.websiteUrl}
          onChange={(e) => set("websiteUrl", e.target.value)}
          error={fieldErrors.websiteUrl}
        />
      </div>

      <Btn type="submit" size="lg" block loading={save.pending} className="mt-2">
        {mode === "create" ? "Créer ma candidature" : "Enregistrer la présentation"}
      </Btn>
    </form>
  );
}
