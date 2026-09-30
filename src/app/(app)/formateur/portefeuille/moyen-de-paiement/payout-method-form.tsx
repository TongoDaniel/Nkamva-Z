"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, User } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";
import { BUSINESS_DOC_MAX_SIZE_BYTES, sizeLimitLabel } from "@/lib/rules";
import { OPERATOR_LABELS } from "../payout-status";
import { DocumentField } from "./document-field";

type Nature = "INDIVIDUAL" | "BUSINESS";
type MethodType = "MOBILE_MONEY" | "BANK_IBAN";
type UploadedDoc = { s3Key: string; fileName: string } | null;

const NATURES: Array<{ value: Nature; icon: React.ReactNode; label: string; help: string }> = [
  {
    value: "INDIVIDUAL",
    icon: <User />,
    label: "Compte personnel",
    help: "Le compte est à votre nom, celui de votre pièce d'identité.",
  },
  {
    value: "BUSINESS",
    icon: <Building2 />,
    label: "Compte d'entreprise",
    help: "Le compte est au nom d'une société dont vous êtes le représentant légal.",
  },
];

/**
 * Deux codes d'erreur du domaine ne peuvent pas être montrés tels quels : ils
 * énoncent une cause interne, pas ce que le formateur doit faire. Les autres
 * messages de l'API sont déjà écrits pour lui et passent sans traduction.
 */
const ERROR_MESSAGES: Record<string, string> = {
  IDENTITY_NAME_MISSING:
    "Votre pièce d'identité n'a pas encore été validée par notre équipe. Tant qu'elle ne l'est pas, nous n'avons rien à quoi comparer le titulaire du compte. Votre candidature de formateur est en cours d'examen ; réessayez une fois qu'elle est approuvée.",
  PAYOUT_METHOD_BLOCKED:
    "Après trois refus, l'enregistrement d'un moyen de paiement est suspendu et confié à un responsable. Contactez le support pour faire réexaminer votre dossier.",
};

/**
 * Décision 29 — la nature du compte se choisit **avant** toute saisie, et elle
 * conditionne le formulaire. Ce n'est pas un champ de plus dans une liste :
 * c'est la question qui décide de ce qu'on demande ensuite, et elle est posée
 * après la règle, jamais avant.
 */
export function PayoutMethodForm({ replacing }: { replacing: boolean }) {
  const router = useRouter();
  const [nature, setNature] = React.useState<Nature | null>(null);
  const [type, setType] = React.useState<MethodType>("MOBILE_MONEY");
  const [holderName, setHolderName] = React.useState("");
  const [businessName, setBusinessName] = React.useState("");
  const [businessDoc, setBusinessDoc] = React.useState<UploadedDoc>(null);
  const [legalRepProof, setLegalRepProof] = React.useState<UploadedDoc>(null);
  const [iban, setIban] = React.useState("");
  const [bic, setBic] = React.useState("");
  const [operator, setOperator] = React.useState("MTN_MOMO");
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  // Second facteur, exigé pour pointer de l'argent vers un nouveau compte.
  // Il remplace l'alerte SMS qui prévenait après coup qu'un RIB avait changé :
  // celle-ci empêche au lieu de prévenir.
  const [twoFactorCode, setTwoFactorCode] = React.useState("");

  const save = useAction(
    () =>
      api.post("/api/trainer/payout-methods", {
        type,
        accountNature: nature,
        ...(nature === "INDIVIDUAL" ? { holderName: holderName.trim() } : {}),
        ...(nature === "BUSINESS"
          ? {
              businessName: businessName.trim(),
              businessDocS3Key: businessDoc!.s3Key,
              legalRepProofS3Key: legalRepProof!.s3Key,
            }
          : {}),
        ...(type === "BANK_IBAN"
          ? { iban: iban.replace(/\s+/g, ""), ...(bic.trim() ? { bic: bic.trim() } : {}) }
          : { mobileOperator: operator, mobilePhone: phone.trim() }),
        twoFactorCode: twoFactorCode.trim(),
      }),
    {
      success: "Compte enregistré. Sa vérification commence.",
      // Les erreurs se posent sur les champs fautifs : pas de toast.
      error: null,
      // Le retour au portefeuille est joué dans la transition : le bouton reste
      // occupé jusqu'à ce que l'écran rafraîchi soit affiché.
      onSuccess: () => router.push("/formateur/portefeuille"),
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
          setError(ERROR_MESSAGES[err.code] ?? err.message);
        } else {
          setError("L'enregistrement a échoué. Réessayez.");
        }
      },
    },
  );

  /**
   * Un document qui arrive doit effacer l'erreur qui le réclamait, sinon le
   * formulaire continue d'exiger ce qui est déjà là.
   */
  function attach(field: "businessDocS3Key" | "legalRepProofS3Key", value: UploadedDoc) {
    if (field === "businessDocS3Key") setBusinessDoc(value);
    else setLegalRepProof(value);
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nature) return;
    setError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (nature === "INDIVIDUAL" && holderName.trim().length < 2) {
      errors.holderName = "Saisissez le nom du titulaire, tel qu'il figure sur le compte.";
    }
    if (nature === "BUSINESS") {
      if (businessName.trim().length < 2) {
        errors.businessName = "Saisissez la dénomination sociale exacte.";
      }
      // Les deux documents sont exigés par le domaine : les réclamer ici évite
      // un aller-retour, mais c'est le serveur qui refuse un dossier partiel.
      if (!businessDoc) errors.businessDocS3Key = "Le document d'immatriculation est obligatoire.";
      if (!legalRepProof) {
        errors.legalRepProofS3Key = "La preuve de représentation légale est obligatoire.";
      }
    }
    if (type === "BANK_IBAN" && iban.replace(/\s+/g, "").length < 15) {
      errors.iban = "Un IBAN comporte au minimum 15 caractères.";
    }
    if (type === "MOBILE_MONEY" && phone.trim().length < 6) {
      errors.mobilePhone = "Saisissez le numéro associé au compte mobile money.";
    }
    if (twoFactorCode.trim().length < 6) {
      errors.twoFactorCode = "Saisissez le code de votre application d'authentification.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    void save.run();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="mb-7">
        <legend className="mb-1 text-[15px] font-extrabold text-ink">
          1. À qui appartient le compte ?
        </legend>
        <p className="mb-3.5 text-[13px] leading-relaxed text-ink-2">
          Ce choix détermine ce que nous vous demandons ensuite. Il n&apos;y a pas de
          troisième possibilité.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {NATURES.map((n) => (
            <button
              key={n.value}
              type="button"
              onClick={() => setNature(n.value)}
              aria-pressed={nature === n.value}
              className={cn(
                "cursor-pointer rounded-nk-lg border-[1.5px] p-4 text-left transition",
                nature === n.value
                  ? "border-brand bg-brand-tint"
                  : "border-line bg-card hover:border-brand/40",
              )}
            >
              <span
                className={cn(
                  "mb-2 grid size-9 place-items-center rounded-nk-sm [&_svg]:size-4",
                  nature === n.value ? "bg-brand text-white" : "bg-brand-tint text-brand",
                )}
                aria-hidden="true"
              >
                {n.icon}
              </span>
              <b className="block text-[14px] font-bold text-ink">{n.label}</b>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">
                {n.help}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {nature ? (
        <>
          <fieldset className="mb-7">
            <legend className="mb-3.5 text-[15px] font-extrabold text-ink">
              2. Comment voulez-vous être payé ?
            </legend>
            <div className="flex flex-wrap gap-2">
              {(["MOBILE_MONEY", "BANK_IBAN"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={cn(
                    "cursor-pointer rounded-full border-[1.5px] px-4 py-2 text-[13px] font-bold transition",
                    type === t
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-card text-ink-2 hover:border-brand/40",
                  )}
                >
                  {t === "MOBILE_MONEY" ? "Mobile money" : "Virement bancaire"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-2">
            <legend className="mb-3.5 text-[15px] font-extrabold text-ink">
              3. Les coordonnées du compte
            </legend>

            <FormError>{error}</FormError>

            {nature === "INDIVIDUAL" ? (
              <Field
                label="Nom du titulaire"
                required
                maxLength={200}
                placeholder="Tel qu'il apparaît sur le compte"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                error={fieldErrors.holderName}
                hint="Il doit correspondre à votre pièce d'identité vérifiée."
              />
            ) : (
              <>
                <Field
                  label="Dénomination sociale"
                  required
                  maxLength={200}
                  placeholder="Nom exact de l'entreprise"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  error={fieldErrors.businessName}
                  hint="Telle qu'elle figure sur le document d'immatriculation."
                />
                <DocumentField
                  kind="BUSINESS_DOC"
                  label="Document d'immatriculation"
                  hint={`RCCM ou équivalent. PDF, PNG, JPEG ou WebP, ${sizeLimitLabel(BUSINESS_DOC_MAX_SIZE_BYTES)} maximum.`}
                  value={businessDoc}
                  onChange={(v) => attach("businessDocS3Key", v)}
                  error={fieldErrors.businessDocS3Key}
                />
                <DocumentField
                  kind="LEGAL_REP_PROOF"
                  label="Preuve que vous en êtes le représentant légal"
                  hint="Statuts, procès-verbal de nomination ou tout document officiel vous désignant."
                  value={legalRepProof}
                  onChange={(v) => attach("legalRepProofS3Key", v)}
                  error={fieldErrors.legalRepProofS3Key}
                />
              </>
            )}

            {type === "BANK_IBAN" ? (
              <>
                <Field
                  label="IBAN"
                  required
                  maxLength={34}
                  autoComplete="off"
                  placeholder="CM21 1000 2000 3000 4000 5000 6"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  error={fieldErrors.iban}
                  hint="Deux micro-virements y seront envoyés pour vérifier que le compte est bien le vôtre."
                />
                <Field
                  label="BIC"
                  maxLength={11}
                  autoComplete="off"
                  placeholder="Facultatif"
                  value={bic}
                  onChange={(e) => setBic(e.target.value)}
                  error={fieldErrors.bic}
                />
              </>
            ) : (
              <>
                <div className="mb-[18px]">
                  <label
                    htmlFor="nk-operator"
                    className="mb-1.5 block text-[13.5px] font-bold text-ink"
                  >
                    Opérateur
                  </label>
                  <select
                    id="nk-operator"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
                  >
                    {Object.entries(OPERATOR_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  label="Numéro du compte mobile money"
                  required
                  maxLength={20}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="+237 6 00 00 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  error={fieldErrors.mobilePhone}
                  hint="Le compte sera vérifié manuellement par l'équipe Finances."
                />
              </>
            )}

            <div className="mt-2 rounded-nk border border-line-2 bg-paper p-4">
              <Field
                label="Code de votre application d'authentification"
                type="text"
                name="twoFactorCode"
                autoComplete="one-time-code"
                inputMode="text"
                required
                placeholder="123456"
                value={twoFactorCode}
                error={fieldErrors.twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
              />
              <p className="-mt-2 text-[13px] leading-relaxed text-ink-2">
                On ne pointe pas de l&apos;argent vers un nouveau compte sans preuve que vous êtes
                bien là. Un code de secours convient aussi. Si vous n&apos;avez pas encore activé
                la double authentification,{" "}
                <Link href="/profil" className="font-semibold text-brand hover:text-brand-dark">
                  faites-le d&apos;abord
                </Link>
                .
              </p>
            </div>

            <Btn type="submit" block size="lg" loading={save.pending} className="mt-2">
              {replacing ? "Remplacer mon compte" : "Enregistrer le compte"}
            </Btn>
          </fieldset>
        </>
      ) : null}
    </form>
  );
}
