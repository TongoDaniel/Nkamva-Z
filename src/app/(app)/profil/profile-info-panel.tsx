"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { Avatar } from "@/components/nk/avatar";
import { useAction } from "@/hooks/use-action";
import { FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { ProfileView } from "@/lib/profile";
import { SettingCard } from "@/components/nk/setting-card";

interface Draft {
  fullName: string;
  preferredName: string;
  phone: string;
  countryCode: string;
  bio: string;
}

function toDraft(profile: ProfileView): Draft {
  return {
    fullName: profile.fullName ?? "",
    preferredName: profile.preferredName ?? "",
    phone: profile.phone ?? "",
    countryCode: profile.countryCode ?? "",
    bio: profile.bio ?? "",
  };
}

export function ProfileInfoPanel({ profile }: { profile: ProfileView }) {
  const initial = React.useMemo(() => toDraft(profile), [profile]);
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const dirty = (Object.keys(initial) as Array<keyof Draft>).some((k) => draft[k] !== initial[k]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useAction(
    () =>
      api.patch("/api/me/profile", {
        fullName: draft.fullName.trim(),
        preferredName: draft.preferredName.trim() || null,
        phone: draft.phone.trim() || null,
        countryCode: draft.countryCode.trim().toUpperCase() || null,
        bio: draft.bio.trim() || null,
      }),
    {
      success: "Profil mis à jour.",
      // Les erreurs se posent sur les champs fautifs : pas de toast.
      error: null,
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    void save.run();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingCard
        title="Informations du profil"
        subtitle="Votre nom apparaît sur votre profil public et auprès des formateurs dont vous achetez les ressources."
        footer={
          <>
            <Btn variant="o" disabled={!dirty || save.pending} onClick={() => setDraft(initial)}>
              Annuler
            </Btn>
            <Btn type="submit" loading={save.pending} disabled={!dirty}>
              Enregistrer
            </Btn>
          </>
        }
      >
        <FormError>{error}</FormError>

        <div className="mb-6 flex items-center gap-4">
          <Avatar name={draft.fullName || profile.email} size="lg" alt="Votre avatar" />
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            Votre avatar est généré à partir de vos initiales.
            <br />
            L&apos;envoi d&apos;une photo arrivera avec le stockage de fichiers.
          </p>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            label="Nom complet"
            required
            autoComplete="name"
            placeholder="Aminata Diallo"
            value={draft.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            error={fieldErrors.fullName}
          />
          <Field
            label="Nom d'usage"
            autoComplete="nickname"
            placeholder="Aminata"
            hint="Utilisé pour vous saluer dans l'application."
            value={draft.preferredName}
            onChange={(e) => set("preferredName", e.target.value)}
            error={fieldErrors.preferredName}
          />
          <Field
            label="Téléphone (mobile money)"
            type="tel"
            autoComplete="tel"
            placeholder="+225 07 00 00 00 00"
            hint="Format international."
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={fieldErrors.phone}
          />
          <Field
            label="Pays"
            autoComplete="country"
            maxLength={2}
            placeholder="CI"
            hint="Code à deux lettres : CI, CM, SN…"
            value={draft.countryCode}
            onChange={(e) => set("countryCode", e.target.value.toUpperCase())}
            error={fieldErrors.countryCode}
          />
        </div>

        <div className="mb-[18px]">
          <label htmlFor="pf-bio" className="mb-1.5 block text-[13.5px] font-bold text-ink">
            Bio
          </label>
          <textarea
            id="pf-bio"
            rows={3}
            maxLength={1000}
            placeholder="Quelques mots sur vous."
            value={draft.bio}
            onChange={(e) => set("bio", e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          />
          {fieldErrors.bio ? (
            <p className="mt-1.5 text-[12.5px] font-semibold text-danger">{fieldErrors.bio}</p>
          ) : null}
        </div>
      </SettingCard>

      <SettingCard title="Compte" subtitle="Informations non modifiables depuis cet écran.">
        <dl className="grid gap-3 text-sm">
          <div className="flex flex-wrap justify-between gap-3 border-b border-line-2 pb-3">
            <dt className="text-ink-2">Adresse e-mail</dt>
            <dd className="font-bold">{profile.email}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-line-2 pb-3">
            <dt className="text-ink-2">Adresse vérifiée</dt>
            <dd className="font-bold">
              {profile.emailVerifiedAt ? `Le ${fmtDate(profile.emailVerifiedAt)}` : "Non vérifiée"}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <dt className="text-ink-2">Compte créé</dt>
            <dd className="font-bold">{fmtDate(profile.createdAt)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          Le changement d&apos;adresse e-mail suppose une vérification de la nouvelle adresse : il
          arrivera avec cette étape.
        </p>
      </SettingCard>
    </form>
  );
}
