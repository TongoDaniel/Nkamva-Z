"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Field, CheckOption } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { COMMISSION_LABEL, TRAINER_SHARE_LABEL } from "@/lib/commission";
import { cn } from "@/lib/utils";

export const COMMUNITY_MIN_PRICE_FCFA = 500;

/** Les cinq salons, dans l'ordre où le membre les rencontre. */
const SALONS = [
  {
    key: "broadcastEnabled",
    label: "Annonces",
    hint: "Vous seul y publiez. C'est ce qui prévient les membres d'une séance ou d'une nouveauté.",
  },
  {
    key: "forumEnabled",
    label: "Fil de discussion",
    hint: "Les membres y ouvrent des sujets et se répondent entre eux.",
  },
  {
    key: "messagingEnabled",
    label: "Messages directs",
    hint: "Chaque membre peut vous écrire en privé. Un fil par membre, qui survit à son adhésion.",
  },
  {
    key: "resourcesEnabled",
    label: "Ressources incluses",
    hint: "Les ressources que vous liez au salon deviennent gratuites pour les membres, et ne se vendent plus à l'unité.",
  },
  {
    key: "eventsEnabled",
    label: "Sessions en direct",
    hint: "Vous pouvez programmer des séances et laisser un replay derrière vous.",
  },
] as const;

export interface CommunityFormValues {
  name: string;
  description: string;
  rules: string;
  priceFcfa: string;
  forumEnabled: boolean;
  broadcastEnabled: boolean;
  messagingEnabled: boolean;
  resourcesEnabled: boolean;
  eventsEnabled: boolean;
}

export const EMPTY_COMMUNITY: CommunityFormValues = {
  name: "",
  description: "",
  rules: "",
  priceFcfa: "",
  forumEnabled: true,
  broadcastEnabled: true,
  messagingEnabled: true,
  resourcesEnabled: true,
  eventsEnabled: true,
};

function TextArea({
  label,
  hint,
  rows = 4,
  value,
  onChange,
  ...props
}: {
  label: string;
  hint?: string;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const id = React.useId();
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className="mb-1.5 block text-[13.5px] font-bold text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition",
          "placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25",
        )}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function CommunityForm({
  mode,
  communityId,
  slug,
  initial,
}: {
  mode: "create" | "edit";
  communityId?: string;
  /** Slug actuel — sert à prévenir qu'un changement de nom change l'adresse. */
  slug?: string;
  initial?: CommunityFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<CommunityFormValues>(initial ?? EMPTY_COMMUNITY);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const set = <K extends keyof CommunityFormValues>(key: K, value: CommunityFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const renamed = mode === "edit" && initial != null && values.name.trim() !== initial.name;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // `noValidate` sur le formulaire : les contrôles sont refaits ici, comme
    // partout ailleurs dans le produit.
    const issues: Record<string, string> = {};
    if (values.name.trim().length < 3) issues.name = "Donnez un nom d'au moins 3 caractères.";
    const price = Number.parseInt(values.priceFcfa, 10);
    if (!Number.isFinite(price) || price < COMMUNITY_MIN_PRICE_FCFA) {
      issues.priceFcfa = `Le prix d'adhésion minimum est de ${COMMUNITY_MIN_PRICE_FCFA} FCFA.`;
    }
    if (Object.keys(issues).length) {
      setFieldErrors(issues);
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      rules: values.rules.trim() || null,
      priceFcfa: price,
      forumEnabled: values.forumEnabled,
      broadcastEnabled: values.broadcastEnabled,
      messagingEnabled: values.messagingEnabled,
      resourcesEnabled: values.resourcesEnabled,
      eventsEnabled: values.eventsEnabled,
    };

    setPending(true);
    try {
      if (mode === "create") {
        await api.post("/api/trainer/communities", payload);
        toast.success("Votre communauté est ouverte. Elle apparaît dès maintenant dans l'annuaire.");
      } else {
        await api.patch(`/api/trainer/communities/${communityId}`, payload);
        toast.success("Communauté mise à jour.");
      }
      router.push("/formateur/communaute");
      router.refresh();
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
        setError("L'enregistrement a échoué. Réessayez dans un instant.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-6 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8"
    >
      <FormError>{error}</FormError>

      <Field
        label="Nom de la communauté"
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Ex : L'Atelier du code"
        error={fieldErrors.name}
        maxLength={80}
        required
      />

      {renamed && slug ? (
        <p className="mb-[18px] rounded-xl bg-gold-tint px-4 py-3 text-[13px] leading-relaxed text-gold-ink">
          Renommer change aussi l&apos;adresse publique du salon. Le lien{" "}
          <code className="font-mono">/communautes/{slug}</code> cessera de fonctionner, y compris
          dans les messages où vos membres l&apos;ont déjà recopié.
        </p>
      ) : null}

      <TextArea
        label="Présentation"
        value={values.description}
        onChange={(v) => set("description", v)}
        rows={5}
        maxLength={2000}
        placeholder="À qui s'adresse ce salon, ce qu'on y fait, à quel rythme."
        hint="C'est ce que lit un visiteur avant de payer. Dites ce qui s'y passe vraiment, pas ce qu'on y trouvera peut-être."
      />

      <TextArea
        label="Règles du salon"
        value={values.rules}
        onChange={(v) => set("rules", v)}
        rows={4}
        maxLength={2000}
        placeholder="Ce qui est attendu, ce qui ne passe pas."
        hint="Affichées sur la fiche publique. Elles vous servent le jour où vous devez bannir quelqu'un."
      />

      <Field
        label="Prix d'adhésion mensuel (FCFA)"
        type="number"
        inputMode="numeric"
        min={COMMUNITY_MIN_PRICE_FCFA}
        step={500}
        value={values.priceFcfa}
        onChange={(e) => set("priceFcfa", e.target.value)}
        placeholder="5000"
        error={fieldErrors.priceFcfa}
        hint={
          mode === "edit"
            ? "Un nouveau prix ne s'applique qu'aux adhésions et renouvellements à venir. Personne n'est débité de la différence en cours de mois."
            : `NkamVa prélève ${COMMISSION_LABEL} sur chaque adhésion ; ${TRAINER_SHARE_LABEL} vous reviennent.`
        }
        required
      />

      <fieldset className="mb-[18px] border-t border-line-2 pt-5">
        <legend className="mb-1.5 text-[13.5px] font-bold text-ink">Salons ouverts</legend>
        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">
          Fermer un salon le retire aux membres sans rien effacer : les messages déjà écrits
          restent, ils cessent seulement d&apos;être alimentés.
        </p>
        <ul className="grid gap-1">
          {SALONS.map((salon) => (
            <li key={salon.key} className="border-b border-line-2 py-2 last:border-b-0">
              <CheckOption
                checked={values[salon.key]}
                onCheckedChange={(next) => set(salon.key, next)}
                label={salon.label}
              />
              <p className="ml-[30px] text-[12.5px] leading-relaxed text-ink-3">{salon.hint}</p>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line-2 pt-5">
        <Btn type="submit" disabled={pending}>
          {pending
            ? "Enregistrement…"
            : mode === "create"
              ? "Ouvrir ma communauté"
              : "Enregistrer les modifications"}
        </Btn>
        {mode === "edit" && slug ? (
          <Btn asChild variant="o">
            <Link href={`/communautes/${slug}`}>
              Voir la fiche publique
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          </Btn>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Bascule publique / privée.
 *
 * Séparée du formulaire principal : ce n'est pas un réglage parmi d'autres.
 * Fermer un salon **révoque les liens de parrainage en circulation**
 * (arbitrage 81), et c'est irréversible — les rouvrir demande d'en émettre de
 * nouveaux. Un bouton qu'on actionne sciemment, pas une case qu'on coche en
 * passant.
 */
export function VisibilityToggle({
  communityId,
  visibility,
}: {
  communityId: string;
  visibility: "PUBLIC" | "PRIVATE";
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const isPublic = visibility === "PUBLIC";

  async function toggle() {
    const next = isPublic ? "PRIVATE" : "PUBLIC";
    setPending(true);
    try {
      const { data } = await api.patch<{ revokedShareLinks: number }>(
        `/api/trainer/communities/${communityId}`,
        { visibility: next },
      );
      toast.success(
        next === "PRIVATE"
          ? data.revokedShareLinks > 0
            ? `Salon fermé. ${data.revokedShareLinks} lien${data.revokedShareLinks > 1 ? "s" : ""} de parrainage révoqué${data.revokedShareLinks > 1 ? "s" : ""}.`
            : "Salon fermé. Il sort de l'annuaire et de la recherche."
          : "Salon ouvert. Il réapparaît dans l'annuaire et la recherche.",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "La bascule a échoué.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-6 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[52ch]">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            {isPublic ? (
              <Eye className="size-4 text-brand" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4 text-ink-3" aria-hidden="true" />
            )}
            {isPublic ? "Salon public" : "Salon fermé"}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            {isPublic
              ? "Votre communauté apparaît dans l'annuaire, dans la recherche et sur votre fiche formateur. N'importe qui peut la rejoindre en payant."
              : "Votre communauté est retirée de l'annuaire, de la recherche et de votre fiche formateur. On n'y entre plus que sur invitation nominative."}
          </p>
          {isPublic ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              La fermer révoquera vos liens de parrainage en circulation : ils cesseront de
              fonctionner, définitivement.
            </p>
          ) : null}
        </div>
        <Btn variant="o" onClick={toggle} disabled={pending}>
          {pending ? "…" : isPublic ? "Fermer le salon" : "Rouvrir le salon"}
        </Btn>
      </div>
    </section>
  );
}
