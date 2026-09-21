"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowLeft, ArrowRight, CircleCheck, MailCheck } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Field, OtpInput, PasswordField } from "@/components/nk/input";
import { InfoBox } from "@/components/nk/info-box";
import { PasswordChecklist } from "@/components/nk/password-checklist";
import { PlanOptions, type PlanOption } from "@/components/nk/plan-option";
import { WizardCard, WizardSteps, type WizardStep } from "@/components/nk/wizard";
import { FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { COMMISSION_LABEL } from "@/lib/commission";
import { DOCUMENT_SLOTS } from "@/lib/trainer-document-slots";
import { cn } from "@/lib/utils";
import {
  EMAIL_ERROR,
  isValidEmail,
  isValidUrl,
  MIN_PASSWORD_LENGTH,
  MIN_TRAINER_DESCRIPTION,
  passwordError,
  URL_ERROR,
} from "@/lib/validation";
import { EMPTY_SLOTS, WizardDocuments, type SlotState } from "./wizard-documents";

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

// Même liste que `/candidature` : la modération compare des dossiers, elle ne
// doit pas découvrir deux vocabulaires selon la porte d'entrée du candidat.
const DOMAINS = ["Développement", "Business", "Design", "Marketing", "Langues", "Métiers manuels"];

/** Sous-états de l'étape 1, qui se joue en deux temps sur une même carte. */
type AccountPhase = "form" | "otp" | "done";

/**
 * Wizard « Devenir formateur » en 4 étapes — la porte visiteur du parcours de
 * candidature, dont `/candidature` est le jumeau connecté.
 *
 * Tout le back-end de candidature exige une session : c'est la contrainte qui
 * dessine cet écran. L'étape 1 crée donc réellement le compte, fait vérifier
 * l'adresse par le code reçu, puis ouvre la session sans quitter la page — le
 * mot de passe est encore en mémoire, il n'y a rien à redemander. Les étapes
 * suivantes tapent les mêmes routes que le parcours connecté :
 *
 *   2. `POST /api/trainer-applications` — le dossier naît en DRAFT ;
 *   3. presign / PUT / confirm, pièce par pièce ;
 *   4. `PATCH …/me` pour la cadence choisie, puis `POST …/me/submit`.
 *
 * Trois écarts avec le Lot 1 ont été tranchés en écrivant ceci :
 * - **le RIB a disparu** (décision 3) : aucune coordonnée bancaire n'est
 *   collectée à la candidature, elle ne sert qu'avant le premier retrait ;
 * - **diplôme et vidéo sont apparus** : `submitApplication` refuse un dossier
 *   auquel il manque l'un des trois `REQUIRED_DOCUMENT_TYPES` ;
 * - **la formule est enregistrée** sur `desiredCadence`, et honorée à
 *   l'approbation. Elle n'était jusqu'ici qu'un décor.
 *
 * Les formules ne sont pas écrites ici : elles descendent de la page serveur,
 * qui lit la grille en vigueur. Un tarif posé par l'administration ne doit pas
 * laisser cet écran annoncer l'ancien.
 */
export function TrainerSignupWizard({
  plans,
  signedInEmail,
  storageAvailable,
}: {
  plans: PlanOption[];
  /** Non nul quand la page a été ouverte avec une session : l'étape 1 saute. */
  signedInEmail: string | null;
  storageAvailable: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(signedInEmail ? 1 : 0);
  const [error, setError] = React.useState<string | null>(null);
  /** Erreurs rattachées à un champ précis, effacées à la saisie suivante. */
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  // Étape 1 — compte
  const [accountPhase, setAccountPhase] = React.useState<AccountPhase>(
    signedInEmail ? "done" : "form",
  );
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState(signedInEmail ?? "");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [otp, setOtp] = React.useState("");
  // Étape 2 — profil
  const [slogan, setSlogan] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [domains, setDomains] = React.useState<string[]>([]);
  const [experienceYears, setExperienceYears] = React.useState("");
  /** Posé dès que le dossier existe en base : l'étape 2 ne le recrée pas. */
  const [applicationCreated, setApplicationCreated] = React.useState(false);
  // Étape 3 — vérification
  const [slots, setSlots] = React.useState<Record<string, SlotState>>(EMPTY_SLOTS);
  // Étape 4 — formule
  const [plan, setPlan] = React.useState(plans[0]?.id ?? "MONTHLY");
  const [accept, setAccept] = React.useState(false);

  const headingRef = React.useRef<HTMLDivElement>(null);
  const remainingDescription = MIN_TRAINER_DESCRIPTION - description.trim().length;
  const missingDocuments = DOCUMENT_SLOTS.filter((slot) => !slots[slot.type]?.uploaded).length;

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

  /** Erreurs d'API rattachées aux champs quand la route les nomme. */
  function applyApiError(err: unknown, fallback: string) {
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
      return;
    }
    setError(fallback);
  }

  /**
   * Valide l'étape courante. Les erreurs sont rattachées au champ fautif quand
   * il en existe un ; le bandeau global ne sert qu'aux étapes sans champ de
   * saisie, où il n'y a rien à surligner.
   */
  function validateStep(): { fields: Record<string, string>; global: string | null } {
    const fields: Record<string, string> = {};
    let global: string | null = null;

    if (step === 0 && accountPhase === "form") {
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

    if (step === 0 && accountPhase === "otp" && otp.length !== 6) {
      global = "Saisissez les six chiffres du code reçu par e-mail.";
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

      if (domains.length === 0) fields.domains = "Choisissez au moins un domaine.";

      // Facultatif, mais s'il est rempli il doit être exploitable.
      if (websiteUrl.trim() && !isValidUrl(websiteUrl)) fields.websiteUrl = URL_ERROR;
    }

    if (step === 2) {
      const missing = DOCUMENT_SLOTS.filter((slot) => !slots[slot.type]?.uploaded);
      if (missing.length === DOCUMENT_SLOTS.length) {
        global = "Déposez vos trois pièces justificatives pour continuer.";
      } else if (missing.length > 0) {
        global = `Il manque encore : ${missing.map((slot) => slot.label.toLowerCase()).join(", ")}.`;
      }
    }

    return { fields, global };
  }

  /** Étape 1, premier temps : création du compte, puis attente du code. */
  async function createAccount() {
    setPending(true);
    try {
      await api.post("/api/auth/register", {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      setOtp("");
      setAccountPhase("otp");
      setError(null);
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (err) {
      applyApiError(err, "La création du compte a échoué. Réessayez dans un instant.");
    } finally {
      setPending(false);
    }
  }

  /**
   * Étape 1, second temps : le code valide l'adresse, puis la session s'ouvre
   * sans quitter la page. Sans elle, aucune des étapes suivantes ne passerait
   * les gardes du serveur.
   */
  async function verifyAndSignIn() {
    setPending(true);
    try {
      await api.post("/api/auth/verify-otp", { email: email.trim().toLowerCase(), code: otp });
    } catch (err) {
      applyApiError(err, "La vérification a échoué. Réessayez.");
      setPending(false);
      return;
    }

    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setPending(false);

    if (!res || res.error) {
      // L'adresse est vérifiée, le compte existe : c'est la session qui a
      // échoué. On envoie vers la connexion plutôt que de laisser le candidat
      // recommencer une inscription qui répondrait « email déjà utilisé ».
      setError(
        "Votre compte est créé et votre adresse vérifiée, mais la connexion n'a pas abouti. Connectez-vous, puis reprenez depuis « Ma candidature ».",
      );
      return;
    }

    setAccountPhase("done");
    goTo(1);
  }

  /** Étape 2 : le dossier naît en DRAFT, ou se corrige si l'on revient dessus. */
  async function saveProfile() {
    const years = Number.parseInt(experienceYears, 10);
    const payload = {
      slogan: slogan.trim() || undefined,
      description: description.trim(),
      websiteUrl: websiteUrl.trim() || undefined,
      domains,
      ...(Number.isFinite(years) ? { experienceYears: years } : {}),
    };

    setPending(true);
    try {
      if (applicationCreated) await api.patch("/api/trainer-applications/me", payload);
      else {
        await api.post("/api/trainer-applications", payload);
        setApplicationCreated(true);
      }
      goTo(2);
    } catch (err) {
      applyApiError(err, "L'enregistrement de votre présentation a échoué. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  /** Étape 4 : la cadence choisie, puis l'envoi du dossier à la modération. */
  async function submitApplication() {
    setPending(true);
    try {
      // Deux appels et non un : la cadence appartient au dossier, l'envoi est
      // une transition d'état. Les confondre ferait d'un choix de formule une
      // soumission irréversible en cas de reprise.
      await api.patch("/api/trainer-applications/me", { desiredCadence: plan });
      await api.post("/api/trainer-applications/me/submit");
      router.push("/candidature/statut");
    } catch (err) {
      applyApiError(err, "L'envoi de votre candidature a échoué. Réessayez.");
      setPending(false);
    }
    // Pas de `finally` : sur le chemin de la réussite le bouton reste occupé
    // jusqu'à ce que l'écran de suivi soit affiché.
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
    if (pending) return;

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
    setError(null);

    if (step === 0) {
      void (accountPhase === "otp" ? verifyAndSignIn() : createAccount());
      return;
    }

    if (step === 1) {
      void saveProfile();
      return;
    }

    if (step === 2) {
      goTo(3);
      return;
    }

    if (!accept) {
      setError("Vous devez accepter les CGU pour créer votre compte formateur.");
      return;
    }
    void submitApplication();
  }

  const toggleDomain = (domain: string) => {
    clearFieldError("domains");
    setDomains((current) =>
      current.includes(domain)
        ? current.filter((x) => x !== domain)
        : [...current, domain].slice(0, 5),
    );
  };

  const subtitle = [
    accountPhase === "otp"
      ? "Saisissez le code que nous venons de vous envoyer."
      : "Créez votre compte formateur sur NKAMVA.",
    "Parlez-nous de votre expertise.",
    "Trois pièces, visibles de la seule équipe de modération.",
    "Choisissez la formule qui vous convient.",
  ][step];

  const cta =
    step === 0
      ? accountPhase === "otp"
        ? "Vérifier mon adresse"
        : "Créer mon compte"
      : step === 3
        ? "Envoyer ma candidature"
        : "Continuer";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <WizardSteps steps={STEPS} current={step} label="Étapes de la candidature formateur" />

      <WizardCard
        title="Devenir formateur"
        // Page autonome, sans `PageHead` ni topbar : cette carte porte le seul
        // titre du document, donc le `h1`.
        titleAs="h1"
        subtitle={subtitle}
      >
        <div ref={headingRef} tabIndex={-1} className="outline-none">
          <FormError>{error}</FormError>

          {step === 0 && accountPhase === "form" ? (
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
                  placeholder={`Min. ${MIN_PASSWORD_LENGTH} caractères`}
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

          {step === 0 && accountPhase === "otp" ? (
            <>
              <p className="mb-5 flex items-start gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                <MailCheck className="mt-0.5 size-[18px] shrink-0 text-brand" aria-hidden="true" />
                <span>
                  Un code à six chiffres vient de partir vers <b>{email.trim().toLowerCase()}</b>.
                  Il vérifie votre adresse et ouvre votre session : la suite de la candidature
                  s&apos;enregistre au fur et à mesure.
                </span>
              </p>
              <div className="mb-[18px]">
                <OtpInput value={otp} onChange={setOtp} label="Code reçu par e-mail" />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Field
                label="Slogan / Titre"
                name="slogan"
                required
                maxLength={120}
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
                  maxLength={2000}
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
                    "mt-1.5 text-[13px]",
                    fieldErrors.description ? "font-semibold text-danger" : "text-ink-3",
                  )}
                >
                  {fieldErrors.description ??
                    (remainingDescription > 0
                      ? `Encore ${remainingDescription} caractère${remainingDescription > 1 ? "s" : ""} minimum.`
                      : "Longueur suffisante.")}
                </p>
              </div>

              <fieldset className="mb-4.5">
                <legend className="mb-2.5 text-[13.5px] font-bold text-ink">
                  Domaines enseignés
                </legend>
                <div className="flex flex-wrap gap-2">
                  {DOMAINS.map((domain) => {
                    const active = domains.includes(domain);
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
                  <p className="mt-1.5 text-[13px] font-semibold text-danger">
                    {fieldErrors.domains}
                  </p>
                ) : null}
              </fieldset>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field
                  label="Années d'expérience (optionnel)"
                  type="number"
                  name="experienceYears"
                  inputMode="numeric"
                  min={0}
                  max={70}
                  placeholder="12"
                  value={experienceYears}
                  error={fieldErrors.experienceYears}
                  onChange={(e) => {
                    setExperienceYears(e.target.value);
                    clearFieldError("experienceYears");
                  }}
                />
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
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <WizardDocuments
                slots={slots}
                storageAvailable={storageAvailable}
                onChange={(type, next) => {
                  setError(null);
                  setSlots((current) => ({ ...current, [type]: next }));
                }}
              />
              <InfoBox>
                Ces documents servent uniquement à vérifier votre identité et votre expertise avant
                validation de votre candidature — ils ne sont jamais visibles publiquement. Aucune
                coordonnée bancaire ne vous est demandée ici : elle ne servira qu&apos;au moment de
                votre premier retrait.
              </InfoBox>
              {missingDocuments > 0 ? (
                <p className="mb-1 text-right text-[13px] text-ink-3">
                  {missingDocuments} pièce{missingDocuments > 1 ? "s" : ""} encore attendue
                  {missingDocuments > 1 ? "s" : ""}.
                </p>
              ) : null}
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
                équipe. Aucun paiement ne vous est demandé aujourd&apos;hui, et cette formule reste
                modifiable jusque-là.
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
          {/* Une fois le compte créé, il n'y a plus de retour vers l'étape 1 :
              elle n'est plus rejouable, l'adresse est prise. Le candidat qui
              recule depuis l'étape 2 sortirait du parcours — on ne lui propose
              donc que la sortie explicite. */}
          {step === 0 || (step === 1 && accountPhase === "done") ? (
            <Link
              href={accountPhase === "done" ? "/accueil" : "/formateurs"}
              className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-ink-2 hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {accountPhase === "done" ? "Plus tard" : "Retour"}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              disabled={pending}
              className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-[14.5px] font-bold text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour
            </button>
          )}

          {/* Sur la dernière étape le bouton est neutralisé tant que les CGU ne
              sont pas acceptées, comme sur l'inscription apprenant. Le contrôle
              dans `handleSubmit` reste en place : il couvre la touche Entrée. */}
          <Btn type="submit" loading={pending} disabled={step === STEPS.length - 1 && !accept}>
            {cta}
            <ArrowRight aria-hidden="true" />
          </Btn>
        </div>
      </WizardCard>
    </form>
  );
}
