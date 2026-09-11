"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";
import {
  COURSE_FORMATS,
  COURSE_LEVELS,
  MIN_PRICE_FCFA,
  SUGGESTED_CATEGORIES,
} from "./course-status";
import { COURSE_CIRCUITS, type CourseCircuitValue } from "@/lib/course-rules";

export interface CourseFormValues {
  title: string;
  blurb: string;
  description: string;
  category: string;
  format: string;
  level: string;
  priceFcfa: string;
  learnPoints: string[];
  includes: string[];
  /**
   * Où va la ressource. Écrite dès la création (arbitrage 47 : les deux
   * circuits sont exclusifs), et modifiable tant que le brouillon n'a rien
   * engagé — c'est le serveur qui en juge, et qui refuse en `CIRCUIT_LOCKED`.
   */
  circuit: CourseCircuitValue;
}

export const EMPTY_COURSE: CourseFormValues = {
  title: "",
  blurb: "",
  description: "",
  category: "",
  format: "video",
  level: "",
  priceFcfa: "",
  learnPoints: [""],
  includes: [""],
  circuit: "MARKETPLACE",
};

/** Champ répétable pour les listes de chaînes (learnPoints, includes). */
function ListField({
  legend,
  hint,
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  legend: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <fieldset className="mb-[18px]">
      <legend className="mb-1.5 text-[13.5px] font-bold text-ink">{legend}</legend>
      {hint ? <p className="mb-2.5 text-[13px] text-ink-3">{hint}</p> : null}
      <ul className="grid gap-2.5">
        {values.map((value, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              value={value}
              placeholder={placeholder}
              aria-label={`${legend} — ligne ${i + 1}`}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              disabled={values.length === 1}
              aria-label={`Retirer la ligne ${i + 1} de ${legend}`}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-card text-ink-2 hover:border-danger hover:text-danger disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <Btn variant="t" size="sm" className="mt-2" onClick={() => onChange([...values, ""])}>
        <Plus aria-hidden="true" />
        {addLabel}
      </Btn>
    </fieldset>
  );
}

function TextArea({
  label,
  hint,
  error,
  rows = 4,
  value,
  onChange,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string | null;
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
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition",
          "placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25",
          error && "border-danger",
        )}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-[13px] font-semibold text-danger">{error}</p> : null}
    </div>
  );
}

/** Construit le corps attendu par POST/PATCH /api/trainer/courses. */
function toPayload(values: CourseFormValues) {
  return {
    title: values.title.trim(),
    blurb: values.blurb.trim(),
    description: values.description.trim(),
    category: values.category.trim(),
    format: values.format,
    circuit: values.circuit,
    // Une ressource incluse dans une communauté ne se vend pas à l'unité : son
    // prix n'est pas demandé, et vaut 0. Envoyer le champ vide donnerait un
    // `NaN` que le schéma refuserait sans dire pourquoi.
    priceFcfa:
      values.circuit === "COMMUNITY" ? 0 : Number.parseInt(values.priceFcfa, 10),
    ...(values.level ? { level: values.level } : {}),
    learnPoints: values.learnPoints.map((p) => p.trim()).filter(Boolean),
    includes: values.includes.map((p) => p.trim()).filter(Boolean),
  };
}

export function CourseForm({
  mode,
  courseId,
  initial,
  aside,
  community,
  circuitLocked,
}: {
  mode: "create" | "edit";
  courseId?: string;
  initial?: CourseFormValues;
  /** Panneaux propres à l'édition, empilés au-dessus de « Classement et prix ». */
  aside?: React.ReactNode;
  /**
   * La communauté du formateur, telle qu'elle décide de l'option « incluse ».
   * `null` quand il n'en anime aucune d'ouverte : l'option existe alors, mais
   * désactivée et expliquée — la masquer laisserait croire qu'il n'y a qu'une
   * destination possible.
   */
  community?: { name: string; resourcesEnabled: boolean } | null;
  /**
   * Vrai quand la destination ne peut plus changer : ressource publiée, ou
   * déjà achetée (arbitrage 137). Le serveur refuse de toute façon, mais un
   * champ qu'on peut changer pour se voir opposer un refus n'est pas un champ.
   */
  circuitLocked?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<CourseFormValues>(initial ?? EMPTY_COURSE);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const save = useAction(
    async () => {
      const payload = toPayload(values);
      if (mode === "create") {
        const { data } = await api.post<{ id: string }>("/api/trainer/courses", payload);
        return data.id;
      }
      await api.patch(`/api/trainer/courses/${courseId}`, payload);
      return null;
    },
    {
      success: (id) =>
        id
          ? "Ressource créée. Elle reste en brouillon jusqu'à publication."
          : "Modifications enregistrées.",
      // Les erreurs se posent sur les champs fautifs : pas de toast.
      error: null,
      // Ouvrir la fiche est joué dans la transition : le bouton reste occupé
      // jusqu'à ce qu'elle soit à l'écran. En édition, seul le rafraîchissement
      // joue, et il suffit.
      onSuccess: (id) => {
        if (id) router.push(`/formateur/ressources/${id}`);
      },
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

  const set = <K extends keyof CourseFormValues>(key: K, value: CourseFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Le plancher ne vaut que pour ce qui se vend. Même règle que le serveur,
    // et la même constante : les deux ont vécu séparées, avec un `500` en dur
    // de l'autre côté.
    if (values.circuit === "MARKETPLACE") {
      const price = Number.parseInt(values.priceFcfa, 10);
      if (!Number.isFinite(price) || price < MIN_PRICE_FCFA) {
        setFieldErrors({ priceFcfa: `Le prix minimum est de ${MIN_PRICE_FCFA} FCFA.` });
        return;
      }
    }

    void save.run();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
      <div className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
        <FormError>{error}</FormError>

        <Field
          label="Titre"
          required
          maxLength={200}
          placeholder="Architecture logicielle — masterclass Patterns & DDD"
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          error={fieldErrors.title}
        />

        <TextArea
          label="Accroche"
          rows={2}
          maxLength={500}
          placeholder="Concevez des systèmes qui survivent à leurs auteurs."
          value={values.blurb}
          onChange={(v) => set("blurb", v)}
          error={fieldErrors.blurb}
        />

        <TextArea
          label="Description"
          rows={8}
          maxLength={5000}
          placeholder="Décrivez le contenu, le public visé et ce qui rend la ressource utile."
          value={values.description}
          onChange={(v) => set("description", v)}
          error={fieldErrors.description}
          hint="10 à 5000 caractères. Une ligne vide crée un nouveau paragraphe sur la fiche."
        />

        <ListField
          legend="Ce que l'on apprendra"
          hint="Une compétence concrète par ligne."
          values={values.learnPoints}
          onChange={(next) => set("learnPoints", next)}
          placeholder="Découper un domaine en contextes bornés"
          addLabel="Ajouter un point"
        />

        <ListField
          legend="Ce qui est inclus"
          hint="Ce que l'acheteur reçoit : durée, nombre de pages, fichiers annexes."
          values={values.includes}
          onChange={(next) => set("includes", next)}
          placeholder="4 h 20 de vidéo"
          addLabel="Ajouter un élément"
        />
      </div>

      {/* `self-stretch` : sans lui, `lg:items-start` réduirait cette colonne à la
          hauteur de son contenu, et le bloc collant n'aurait plus de course. */}
      <div className="grid content-start gap-6 lg:self-stretch">
        {/*
          La destination, en premier, parce qu'elle décide de ce que le reste du
          formulaire demande : un prix, ou rien.

          Arbitrage 47 — les deux circuits sont **exclusifs**. Une ressource
          incluse dans une communauté n'est pas vendable à l'unité : l'achat la
          refuse (`COURSE_NOT_FOR_SALE`). Elle était jusqu'ici toujours créée
          pour le catalogue, et ne basculait qu'après coup, depuis l'écran de la
          communauté — ce qui se voyait mal et s'oubliait facilement.

          L'option « incluse » reste **affichée même quand elle est
          indisponible**, avec sa raison. La masquer laisserait croire qu'il n'y
          a qu'une destination possible.
        */}
        <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
          <h2 className="mb-1 text-[16.5px] font-extrabold">Destination</h2>
          <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
            {circuitLocked
              ? "Elle ne change plus : cette ressource est publiée ou déjà achetée."
              : "Vendue au catalogue, ou incluse dans votre communauté — jamais les deux."}
          </p>

          <fieldset className="grid gap-2.5" disabled={circuitLocked}>
            <legend className="sr-only">Destination de la ressource</legend>
            {COURSE_CIRCUITS.map((option) => {
              const unavailable =
                option.value === "COMMUNITY" && !community?.resourcesEnabled;
              const checked = values.circuit === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border-[1.5px] p-3.5 transition",
                    checked ? "border-brand bg-brand-tint/40" : "border-line bg-card",
                    (unavailable || circuitLocked) &&
                      "cursor-not-allowed opacity-60 hover:border-line",
                  )}
                >
                  <input
                    type="radio"
                    name="nk-circuit"
                    value={option.value}
                    checked={checked}
                    disabled={unavailable || circuitLocked}
                    onChange={() => set("circuit", option.value)}
                    className="mt-0.5 size-4 shrink-0 accent-brand"
                  />
                  <span>
                    <b className="block text-[14.5px] font-bold text-ink">{option.label}</b>
                    <small className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">
                      {option.hint}
                    </small>
                    {unavailable ? (
                      <small className="mt-1.5 block text-[13px] leading-relaxed text-ink-3">
                        {community
                          ? `Le rayon des ressources incluses est éteint sur « ${community.name} ». Rallumez-le dans les réglages de votre communauté.`
                          : "Vous n'animez aucune communauté ouverte pour l'instant."}
                      </small>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </section>

        {aside}
        <aside className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm lg:sticky lg:top-[88px]">
          <h2 className="mb-4 text-[16.5px] font-extrabold">Classement et prix</h2>

          <Field
            label="Catégorie"
            required
            list="nk-categories"
            placeholder="Développement"
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
            error={fieldErrors.category}
            hint="Choisissez une catégorie existante ou saisissez la vôtre."
          />
          <datalist id="nk-categories">
            {SUGGESTED_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <div className="mb-[18px]">
            <label htmlFor="nk-format" className="mb-1.5 block text-[13.5px] font-bold text-ink">
              Format
            </label>
            <select
              id="nk-format"
              value={values.format}
              onChange={(e) => set("format", e.target.value)}
              aria-describedby="nk-format-hint"
              className="w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
            >
              {COURSE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <p id="nk-format-hint" className="mt-1.5 text-[13px] text-ink-3">
              La vidéo est lue en ligne avec suivi de progression ; les autres formats sont
              téléchargés.
            </p>
          </div>

          <div className="mb-[18px]">
            <label htmlFor="nk-level" className="mb-1.5 block text-[13.5px] font-bold text-ink">
              Niveau
            </label>
            <select
              id="nk-level"
              value={values.level}
              onChange={(e) => set("level", e.target.value)}
              className="w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
            >
              {COURSE_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Pas de prix pour ce qui ne se vend pas à l'unité. Le champ n'est
              pas seulement masqué : le montant envoyé vaut 0, et le plancher
              ne s'applique pas — sinon la création serait refusée pour un
              chiffre que personne n'a à saisir. */}
          {values.circuit === "COMMUNITY" ? (
            <p className="mb-[18px] rounded-nk border border-line-2 bg-paper px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
              Pas de prix à fixer : elle est <b className="font-semibold text-ink">incluse dans
              l&apos;abonnement</b> de votre communauté, et ne se vend pas à l&apos;unité.
            </p>
          ) : (
            <Field
              label="Prix (FCFA)"
              type="number"
              inputMode="numeric"
              required
              min={MIN_PRICE_FCFA}
              step={100}
              placeholder="49000"
              value={values.priceFcfa}
              onChange={(e) => set("priceFcfa", e.target.value)}
              error={fieldErrors.priceFcfa}
              hint={`Minimum ${MIN_PRICE_FCFA} FCFA. Vous fixez librement ce montant.`}
            />
          )}

          {/*
            Ni durée ni nombre de leçons (F3.8). La durée d'une vidéo se lit sur
            le fichier au dépôt : un chiffre saisi à la main n'engageait rien, et
            il alimentait pourtant la progression de l'apprenant *et* le seuil de
            consommation qui décide d'un litige. Le nombre de sessions, lui, n'a
            plus d'objet — une ressource est un fichier unique.

            L'encart qui l'annonçait à l'écran a été retiré : la mesure a lieu, elle
            n'est simplement plus expliquée ici.
          */}

          <Btn type="submit" block size="lg" loading={save.pending} className="mt-2">
            {mode === "create" ? "Créer le brouillon" : "Enregistrer"}
          </Btn>
          {mode === "create" ? (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
              {values.circuit === "COMMUNITY"
                ? "La ressource est créée en brouillon et rattachée à votre communauté : vos membres ne la verront qu'à la publication."
                : "La ressource est créée en brouillon : rien n'apparaît au catalogue avant que vous ne la publiiez."}
            </p>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
