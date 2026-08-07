"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleCheck } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { FileDrop } from "@/components/nk/file-drop";
import { Field, PasswordField } from "@/components/nk/input";
import { InfoBox } from "@/components/nk/info-box";
import { PasswordChecklist } from "@/components/nk/password-checklist";
import { PlanOptions, type PlanOption } from "@/components/nk/plan-option";
import { WizardCard, WizardSteps, type WizardStep } from "@/components/nk/wizard";
import { FormError } from "@/components/layouts/auth-shell";
import { COMMISSION_LABEL } from "@/lib/commission";
import { cn } from "@/lib/utils";
import {
  EMAIL_ERROR,
  isValidEmail,
  isValidUrl,
  MIN_TRAINER_DESCRIPTION,
  passwordError,
  URL_ERROR,
} from "@/lib/validation";

const STEPS: WizardStep[] = [
  { id: "compte", label: "Compte" },
  { id: "profil", label: "Profil" },
  { id: "verification", label: "Vérification" },
  { id: "formule", label: "Formule" },
];

const PLAN_FEATURES = [
  "Publication de ressources en illimité",
  "Une communauté d'apprenants par abonnement mensuel",
  "Sessions live et replays",
  "Invitations d'apprenants par email",
  `Paiements CB et Mobile Money, retraits de gains (commission ${COMMISSION_LABEL})`,
];

/**
 * Wizard « Devenir formateur » en 4 étapes — port de `Devenir formateur.dc.html`.
 *
 * Le parcours est encore local : rien n'est envoyé au serveur tant que les
 * écarts relevés avec le Lot 1 ne sont pas arbitrés (voir le commentaire de
 * `handleSubmit`). Les étapes 1 et 2 correspondent en revanche déjà aux champs
 * de `POST /api/auth/register` et de `TrainerApplication`.
 *
 * Les formules, elles, ne sont plus écrites ici : elles descendent de la page
 * serveur, qui lit la grille en vigueur (`publicSubscriptionPlans`). Un tarif
 * posé par l'administration ne doit pas laisser cet écran annoncer l'ancien.
 */
export function TrainerSignupWizard({ plans }: { plans: PlanOption[] }) {
  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  /** Erreurs rattachées à un champ précis, effacées à la saisie suivante. */
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Étape 1 — compte
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  // Étape 2 — profil
  const [slogan, setSlogan] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  // Étape 3 — vérification
  const [idDoc, setIdDoc] = React.useState<File | null>(null);
  const [ribDoc, setRibDoc] = React.useState<File | null>(null);
  // Étape 4 — formule
  const [plan, setPlan] = React.useState(plans[0]?.id ?? "MONTHLY");
  const [accept, setAccept] = React.useState(false);

  const headingRef = React.useRef<HTMLDivElement>(null);
  const remainingDescription = MIN_TRAINER_DESCRIPTION - description.trim().length;

  function goTo(next: number) {
    setError(null);
    setFieldErrors({});
    setStep(next);
    // Le contenu change sans changer d'URL : on ramène le focus en tête de
    // carte pour que la navigation clavier ne reparte pas du bas de page.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  /** Efface l'erreur d'un champ dès que l'utilisateur le corrige. */
  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  /**
   * Valide l'étape courante. Les erreurs sont rattachées au champ fautif quand
   * il en existe un ; le bandeau global ne sert qu'aux étapes sans champ de
   * saisie, où il n'y a rien à surligner.
   */
  function validateStep(): { fields: Record<string, string>; global: string | null } {
    const fields: Record<string, string> = {};
    let global: string | null = null;

    if (step === 0) {
      if (!fullName.trim()) fields.fullName = "Renseignez votre nom complet.";

      if (!email.trim()) fields.email = "Renseignez votre email professionnel.";
      else if (!isValidEmail(email)) fields.email = EMAIL_ERROR;

      if (!password) fields.password = "Choisissez un mot de passe.";
      else {
        const issue = passwordError(password);
        if (issue) fields.password = issue;
      }

      if (!fields.password) {
        if (!confirm) fields.confirm = "Confirmez votre mot de passe.";
        else if (password !== confirm) {
          fields.confirm = "Ce mot de passe ne correspond pas au précédent.";
        }
      }
    }

    if (step === 1) {
      // La maquette marque « Site web (optionnel) » et pas le slogan : celui-ci
      // est donc attendu. C'est aussi l'accroche affichée sur la fiche publique.
      if (!slogan.trim()) {
        fields.slogan = "Renseignez un slogan : c'est l'accroche de votre fiche publique.";
      }

      const length = description.trim().length;
      if (length === 0) {
        fields.description = "Présentez votre expertise : c'est ce que l'équipe examine.";
      } else if (length < MIN_TRAINER_DESCRIPTION) {
        fields.description = `Encore ${MIN_TRAINER_DESCRIPTION - length} caractère${
          MIN_TRAINER_DESCRIPTION - length > 1 ? "s" : ""
        }.`;
      }

      // Facultatif, mais s'il est rempli il doit être exploitable.
      if (websiteUrl.trim() && !isValidUrl(websiteUrl)) fields.websiteUrl = URL_ERROR;
    }

    if (step === 2) {
      if (!idDoc && !ribDoc) {
        global = "Déposez votre pièce d'identité et votre RIB pour continuer.";
      } else if (!idDoc) {
        global = "Il manque votre pièce d'identité.";
      } else if (!ribDoc) {
        global = "Il manque votre RIB ou une capture mobile money.";
      }
    }

    return { fields, global };
  }

  /**
   * Un seul point d'entrée pour la soumission du formulaire : avancer d'une
   * étape, ou finaliser sur la dernière. Deux raisons de ne pas séparer un
   * bouton « Continuer » d'un bouton « Soumettre » :
   * - la touche Entrée dans un champ soumet le formulaire, et doit donc faire
   *   avancer l'étape plutôt que tenter la création du compte ;
   * - React réutilise le même nœud DOM d'une étape à l'autre ; basculer son
   *   `type` de "button" à "submit" pendant le clic faisait exécuter au
   *   navigateur la soumission juste après le passage à l'étape suivante.
   */
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const { fields, global } = validateStep();
    if (Object.keys(fields).length > 0 || global) {
      setFieldErrors(fields);
      setError(
        global ??
          (Object.keys(fields).length > 1
            ? "Plusieurs champs demandent une correction."
            : null),
      );
      return;
    }

    if (step < STEPS.length - 1) {
      goTo(step + 1);
      return;
    }

    if (!accept) {
      setError("Vous devez accepter les CGU pour créer votre compte formateur.");
      return;
    }
    // Volontairement non branché : trois écarts avec le Lot 1 restent à
    // arbitrer avant d'écrire quoi que ce soit en base — le RIB collecté ici
    // alors que l'arbitrage 3 l'a retiré de la candidature, l'absence de
    // diplôme et de vidéo qu'attend `TrainerDocumentType`, et des formules
    // Mensuelle/Annuelle qui ne correspondent pas à `TrainerPlan`.
    setError(
      "Parcours non encore branché : la création du compte formateur attend l'arbitrage des écarts avec le Lot 1.",
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <WizardSteps steps={STEPS} current={step} label="Étapes de la candidature formateur" />

      <WizardCard
        title="Devenir formateur"
        // Page autonome, sans `PageHead` ni topbar : cette carte porte le seul
        // titre du document, donc le `h1`.
        titleAs="h1"
        subtitle={
          [
            "Créez votre compte formateur sur NkamVa.",
            "Parlez-nous de votre expertise.",
            "Vérifiez votre identité et vos coordonnées de paiement.",
            "Choisissez la formule qui vous convient.",
          ][step]
        }
      >
        <div ref={headingRef} tabIndex={-1} className="outline-none">
          <FormError>{error}</FormError>

          {step === 0 ? (
            <>
              <Field
                label="Nom complet"
                name="fullName"
                autoComplete="name"
                required
                placeholder="Votre nom complet"
                value={fullName}
                error={fieldErrors.fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearFieldError("fullName");
                }}
              />
              <Field
                label="Email professionnel"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="vous@entreprise.fr"
                value={email}
                error={fieldErrors.email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError("email");
                }}
              />
              <div className="grid gap-3.5 sm:grid-cols-2">
                <PasswordField
                  label="Mot de passe"
                  name="password"
                  autoComplete="new-password"
                  required
                  showStrength
                  placeholder="Min. 8 caractères"
                  value={password}
                  error={fieldErrors.password}
                  containerClassName="mb-2"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                />
                <PasswordField
                  label="Confirmer"
                  name="passwordConfirm"
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  value={confirm}
                  error={fieldErrors.confirm}
                  containerClassName="mb-2"
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    clearFieldError("confirm");
                  }}
                />
              </div>
              <PasswordChecklist value={password} className="mb-[18px]" />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Field
                label="Slogan / Titre"
                name="slogan"
                required
                placeholder="Ex : Le code, un art de vivre"
                value={slogan}
                error={fieldErrors.slogan}
                onChange={(e) => {
                  setSlogan(e.target.value);
                  clearFieldError("slogan");
                }}
              />
              <div className="mb-4.5">
                <label
                  htmlFor="trainer-description"
                  className="mb-1.5 block text-[13.5px] font-bold text-ink"
                >
                  Description
                </label>
                <textarea
                  id="trainer-description"
                  name="description"
                  rows={4}
                  required
                  placeholder="Décrivez votre expertise et votre approche pédagogique…"
                  value={description}
                  aria-invalid={fieldErrors.description ? true : undefined}
                  aria-describedby="trainer-description-hint"
                  onChange={(e) => {
                    setDescription(e.target.value);
                    clearFieldError("description");
                  }}
                  className={cn(
                    "w-full resize-y rounded-xl border-[1.5px] bg-card px-3.5 py-3 text-[15px] font-medium text-ink",
                    "placeholder:text-ink-3 focus:shadow-[0_0_0_3px_var(--brand-shadow)] focus:outline-none",
                    fieldErrors.description
                      ? "border-danger focus:border-danger"
                      : "border-line focus:border-brand",
                  )}
                />
                {/* Compteur vivant : le minimum se voit pendant la saisie, il
                    n'est pas découvert au moment du refus. */}
                <p
                  id="trainer-description-hint"
                  className={cn(
                    "mt-1.5 text-[12.5px]",
                    fieldErrors.description ? "font-semibold text-danger" : "text-ink-3",
                  )}
                >
                  {fieldErrors.description ??
                    (remainingDescription > 0
                      ? `Encore ${remainingDescription} caractère${remainingDescription > 1 ? "s" : ""} minimum.`
                      : "Longueur suffisante.")}
                </p>
              </div>
              <Field
                label="Site web (optionnel)"
                type="url"
                name="websiteUrl"
                inputMode="url"
                placeholder="https://votre-site.fr"
                value={websiteUrl}
                error={fieldErrors.websiteUrl}
                onChange={(e) => {
                  setWebsiteUrl(e.target.value);
                  clearFieldError("websiteUrl");
                }}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <FileDrop
                id="trainer-id-doc"
                label="Pièce d'identité (CNI, passeport)"
                hint="JPG, PNG ou PDF · 10 Mo max"
                onFileChange={setIdDoc}
              />
              <FileDrop
                id="trainer-rib-doc"
                label="RIB / compte mobile money"
                hint="Relevé RIB ou capture mobile money · 10 Mo max"
                tone="info"
                onFileChange={setRibDoc}
              />
              <InfoBox>
                Ces documents servent uniquement à vérifier votre identité avant validation de votre
                candidature — ils ne sont jamais visibles publiquement. Une fois vérifiée, votre
                pièce d&apos;identité ne pourra plus être modifiée ; vous pourrez en revanche mettre
                à jour votre RIB à tout moment depuis <b>Profil &amp; paramètres</b>.
              </InfoBox>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <PlanOptions
                name="trainer-plan"
                legend="Formule d'abonnement formateur"
                options={plans}
                value={plan}
                onChange={setPlan}
              />
              <ul className="my-4 grid gap-2.5">
                {PLAN_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-2">
                    <CircleCheck
                      className="mt-px size-[17px] flex-none text-brand"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <InfoBox>
                L&apos;abonnement se règle <b>après validation de votre candidature</b> par notre
                équipe, depuis votre espace formateur (rubrique Abonnement). Aucun paiement ne vous
                est demandé aujourd&apos;hui.
              </InfoBox>
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
            </>
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between gap-4">
          {step === 0 ? (
            <Link
              href="/formateurs"
              className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-ink-2 hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-[14.5px] font-bold text-ink-2 hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour
            </button>
          )}

          {/* Sur la dernière étape le bouton est neutralisé tant que les CGU ne
              sont pas acceptées, comme sur l'inscription apprenant. Le contrôle
              dans `handleSubmit` reste en place : il couvre la touche Entrée. */}
          <Btn type="submit" disabled={step === STEPS.length - 1 && !accept}>
            {step < STEPS.length - 1 ? "Continuer" : "Créer mon compte formateur"}
            <ArrowRight aria-hidden="true" />
          </Btn>
        </div>
      </WizardCard>
    </form>
  );
}
