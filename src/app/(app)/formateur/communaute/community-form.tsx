"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { Hint, HintedHeading } from "@/components/nk/hint";
import { Field, CheckOption } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { COMMISSION_LABEL, TRAINER_SHARE_LABEL } from "@/lib/commission";
import { cn } from "@/lib/utils";

export const COMMUNITY_MIN_PRICE_FCFA = 500;

/** Les quatre fonctionnalités, dans l'ordre où le membre les rencontre. */
const SALONS = [
  {
    key: "forumEnabled",
    label: "Groupe de discussion",
    hint: "Le fil collectif de la communauté, dans la messagerie de chacun. Vous y publiez aussi vos annonces.",
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
  messagingEnabled: true,
  resourcesEnabled: true,
  eventsEnabled: true,
};

function TextArea({
  label,
  labelHint,
  hint,
  rows = 4,
  value,
  onChange,
  ...props
}: {
  label: string;
  /** Le ⓘ du libellé — même partage que le `Field` du socle (arbitrage 138). */
  labelHint?: React.ReactNode;
  hint?: string;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const id = React.useId();
  return (
    <div className="mb-[18px]">
      <div className="mb-1.5 flex items-center gap-1">
        <label htmlFor={id} className="block text-[13.5px] font-bold text-ink">
          {label}
        </label>
        {labelHint}
      </div>
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
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Les deux moitiés du formulaire, devenues séparables.
 *
 * `identity` est ce qu'un visiteur lit avant de payer ; `salons` est la manière
 * dont la communauté fonctionne une fois qu'on y est. À l'ouverture d'une
 * communauté les deux se remplissent d'un coup — il n'y a rien à consulter, on
 * décrit ce qu'on crée. Une fois ouverte, l'écran les range dans deux onglets
 * distincts, et chacun s'enregistre seul : `PATCH` accepte les envois partiels,
 * comme la bascule de visibilité le fait déjà.
 */
export type CommunitySection = "identity" | "salons";

export function CommunityForm({
  mode,
  communityId,
  slug,
  initial,
  sections = ["identity", "salons"],
  heading,
}: {
  mode: "create" | "edit";
  communityId?: string;
  /** Slug actuel — sert à prévenir qu'un changement de nom change l'adresse. */
  slug?: string;
  initial?: CommunityFormValues;
  /** Quelles moitiés rendre — et donc quels champs seront envoyés. */
  sections?: CommunitySection[];
  /** Titre du bloc, quand il ne se suffit plus à lui-même dans un onglet. */
  heading?: { title: string; lead: string };
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<CommunityFormValues>(initial ?? EMPTY_COMMUNITY);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const save = useAction(
    (payload: unknown) =>
      mode === "create"
        ? api.post("/api/trainer/communities", payload)
        : api.patch(`/api/trainer/communities/${communityId}`, payload),
    {
      success:
        mode === "create"
          ? "Votre communauté est ouverte. Elle apparaît dès maintenant dans l'annuaire."
          : "Communauté mise à jour.",
      // Les erreurs se posent sur les champs fautifs : pas de toast.
      error: null,
      // Le retour à la liste est joué dans la transition, donc le bouton reste
      // occupé jusqu'à ce que la liste rafraîchie soit à l'écran.
      onSuccess: () => router.push("/formateur/communaute"),
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
          setError("L'enregistrement a échoué. Réessayez dans un instant.");
        }
      },
    },
  );

  const set = <K extends keyof CommunityFormValues>(key: K, value: CommunityFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const shows = (section: CommunitySection) => sections.includes(section);
  const renamed =
    shows("identity") && mode === "edit" && initial != null && values.name.trim() !== initial.name;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // `noValidate` sur le formulaire : les contrôles sont refaits ici, comme
    // partout ailleurs dans le produit. On ne contrôle que ce qui est rendu :
    // un formulaire de salons n'a pas de nom à valider, et le refuser pour un
    // prix qu'il n'affiche pas bloquerait sur un champ invisible.
    const issues: Record<string, string> = {};
    const price = Number.parseInt(values.priceFcfa, 10);
    if (shows("identity")) {
      if (values.name.trim().length < 3) issues.name = "Donnez un nom d'au moins 3 caractères.";
      if (!Number.isFinite(price) || price < COMMUNITY_MIN_PRICE_FCFA) {
        issues.priceFcfa = `Le prix d'adhésion minimum est de ${COMMUNITY_MIN_PRICE_FCFA} FCFA.`;
      }
    }
    if (Object.keys(issues).length) {
      setFieldErrors(issues);
      return;
    }

    const payload = {
      ...(shows("identity")
        ? {
            name: values.name.trim(),
            description: values.description.trim() || null,
            rules: values.rules.trim() || null,
            priceFcfa: price,
          }
        : {}),
      ...(shows("salons")
        ? {
            forumEnabled: values.forumEnabled,
            messagingEnabled: values.messagingEnabled,
            resourcesEnabled: values.resourcesEnabled,
            eventsEnabled: values.eventsEnabled,
          }
        : {}),
    };

    void save.run(payload);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-6 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8"
    >
      {heading ? (
        <HintedHeading
          className="mb-5"
          hintLabel={`À propos de « ${heading.title} »`}
          hint={heading.lead}
        >
          {heading.title}
        </HintedHeading>
      ) : null}

      <FormError>{error}</FormError>

      {shows("identity") ? (
        <>
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
              <code className="font-mono">/communautes/{slug}</code> cessera de fonctionner, y
              compris dans les messages où vos membres l&apos;ont déjà recopié.
            </p>
          ) : null}

          <TextArea
            label="Présentation"
            value={values.description}
            onChange={(v) => set("description", v)}
            rows={5}
            maxLength={2000}
            placeholder="À qui s'adresse ce salon, ce qu'on y fait, à quel rythme."
            labelHint={
              <Hint label="À quoi sert la présentation">
                C&apos;est ce que lit un visiteur avant de payer. Dites ce qui s&apos;y passe
                vraiment, pas ce qu&apos;on y trouvera peut-être.
              </Hint>
            }
          />

          <TextArea
            label="Règles du salon"
            value={values.rules}
            onChange={(v) => set("rules", v)}
            rows={4}
            maxLength={2000}
            placeholder="Ce qui est attendu, ce qui ne passe pas."
            labelHint={
              <Hint label="Où les règles s'affichent, et à quoi elles servent">
                Affichées sur la fiche publique. Elles vous servent le jour où vous devez bannir
                quelqu&apos;un.
              </Hint>
            }
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
            /* La commission reste écrite : c'est un montant, il entre dans la
               décision au moment où l'on fixe le prix. Ce que devient un prix
               déjà fixé est une règle rassurante, pas un avertissement : elle
               passe derrière le ⓘ. */
            hint={
              mode === "edit"
                ? undefined
                : `NKAMVA prélève ${COMMISSION_LABEL} sur chaque adhésion ; ${TRAINER_SHARE_LABEL} vous reviennent.`
            }
            labelHint={
              mode === "edit" ? (
                <Hint label="Ce que devient un changement de prix">
                  Un nouveau prix ne s&apos;applique qu&apos;aux adhésions et renouvellements à
                  venir. Personne n&apos;est débité de la différence en cours de mois.
                </Hint>
              ) : null
            }
            required
          />
        </>
      ) : null}

      {shows("salons") ? (
        <fieldset
          className={cn("mb-[18px]", shows("identity") && "border-t border-line-2 pt-5")}
        >
          {/* La légende porte le ⓘ du fieldset, et chaque case le sien. Quatre
              interrupteurs accompagnés de quatre paragraphes occupaient un
              écran entier de téléphone. */}
          <legend className="mb-3 flex items-center gap-1">
            <span className="text-[13.5px] font-bold text-ink">Ce qui est ouvert</span>
            <Hint label="Ce que fermer une rubrique fait">
              Fermer une rubrique la retire aux membres sans rien effacer : les messages déjà
              écrits restent, ils cessent seulement d&apos;être alimentés.
            </Hint>
          </legend>
          <ul className="grid gap-0.5">
            {SALONS.map((salon) => (
              <li
                key={salon.key}
                className="flex items-center gap-1 border-b border-line-2 py-1.5 last:border-b-0"
              >
                {/* Le ⓘ vit à côté de `CheckOption`, jamais dedans : le composant
                    est un `<label>` entier, et un bouton posé à l'intérieur
                    basculerait la case au moindre clic. */}
                <CheckOption
                  checked={values[salon.key]}
                  onCheckedChange={(next) => set(salon.key, next)}
                  label={salon.label}
                />
                <Hint label={`Ce que « ${salon.label} » ouvre`}>{salon.hint}</Hint>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line-2 pt-5">
        <Btn type="submit" loading={save.pending}>
          {mode === "create" ? "Ouvrir ma communauté" : "Enregistrer les modifications"}
        </Btn>
        {mode === "edit" && slug && shows("identity") ? (
          <BtnLink href={`/communautes/${slug}`} variant="o">
              Voir la fiche publique
              <ExternalLink className="size-4" aria-hidden="true" />
          </BtnLink>
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
  const isPublic = visibility === "PUBLIC";

  // Le nombre de liens révoqués n'est connu qu'au retour : l'appel le rend
  // pour que le message de réussite puisse le citer.
  const toggle = useAction(
    async () => {
      const next = isPublic ? "PRIVATE" : "PUBLIC";
      const { data } = await api.patch<{ revokedShareLinks: number }>(
        `/api/trainer/communities/${communityId}`,
        { visibility: next },
      );
      return { next, revoked: data.revokedShareLinks };
    },
    {
      success: ({ next, revoked }) =>
        next === "PRIVATE"
          ? revoked > 0
            ? `Salon fermé. ${revoked} lien${revoked > 1 ? "s" : ""} de parrainage révoqué${revoked > 1 ? "s" : ""}.`
            : "Salon fermé. Il sort de l'annuaire et de la recherche."
          : "Salon ouvert. Il réapparaît dans l'annuaire et la recherche.",
      error: "La bascule a échoué.",
    },
  );

  return (
    <section className="mt-6 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[52ch]">
          {/* Le titre dit l'état, le ⓘ dit ce que cet état entraîne. Ce qui reste
              écrit est la seule phrase qui avertit d'une perte : les liens de
              parrainage révoqués. */}
          <div className="flex items-center gap-1.5">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              {isPublic ? (
                <Eye className="size-4 text-brand" aria-hidden="true" />
              ) : (
                <EyeOff className="size-4 text-ink-3" aria-hidden="true" />
              )}
              {isPublic ? "Salon public" : "Salon fermé"}
            </h2>
            <Hint label="Ce que cet état change">
              {isPublic
                ? "Votre communauté apparaît dans l'annuaire, dans la recherche et sur votre fiche formateur. N'importe qui peut la rejoindre en payant."
                : "Votre communauté est retirée de l'annuaire, de la recherche et de votre fiche formateur. On n'y entre plus que sur invitation nominative."}
            </Hint>
          </div>
          {isPublic ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
              La fermer révoquera vos liens de parrainage en circulation : ils cesseront de
              fonctionner, définitivement.
            </p>
          ) : null}
        </div>
        <Btn variant="o" onClick={() => void toggle.run()} loading={toggle.pending}>
          {isPublic ? "Fermer le salon" : "Rouvrir le salon"}
        </Btn>
      </div>
    </section>
  );
}
