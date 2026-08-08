"use client";

// Saisie du compte mobile money — partagée par l'achat à l'unité et l'adhésion.
//
// PawaPay adresse un **numéro de téléphone**, pas un compte : sans ces deux
// champs, aucun dépôt ne peut être ouvert. C'est le changement d'UX qu'apporte
// la migration — là où CinetPay redirigeait vers une page hébergée, le paiement
// se déclenche ici et se confirme sur le téléphone de l'apprenant.
//
// La liste des opérateurs n'est plus une constante : elle vient du serveur, qui
// la tient de `/v2/active-conf` pour le pays de l'apprenant. Un opérateur
// affiché ici est donc, par construction, un opérateur que le compte marchand
// peut réellement encaisser.

import * as React from "react";
import { Field } from "@/components/nk/input";
import { phoneNumberError, type PayableProvider } from "@/lib/payment-input";
import { cn } from "@/lib/utils";

export interface MobileMoneyValue {
  phoneNumber: string;
  /** Code opérateur PawaPay — `MTN_MOMO_CMR`, `HALOTEL_TZA`. */
  provider: string;
}

export function MobileMoneyFields({
  providers,
  value,
  onChange,
  showErrors,
}: {
  providers: PayableProvider[];
  value: MobileMoneyValue;
  onChange: (next: MobileMoneyValue) => void;
  /** Les erreurs n'apparaissent qu'après une tentative d'envoi. */
  showErrors: boolean;
}) {
  const phoneError = showErrors ? phoneNumberError(value.phoneNumber) : null;

  // Aucun opérateur pour ce pays : le dire, plutôt que d'afficher une liste vide
  // sous un bouton de paiement qui ne peut pas aboutir.
  if (!providers.length) {
    return (
      <div className="mt-5 border-t border-line-2 pt-5">
        <p className="text-[13.5px] text-ink-2">
          Le paiement mobile n&apos;est pas encore disponible dans votre pays. Renseignez votre pays
          dans votre profil s&apos;il n&apos;y figure pas, ou réglez par carte bancaire.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-line-2 pt-5">
      <p className="mb-3 text-[13.5px] font-bold text-ink">Votre compte mobile money</p>

      <fieldset className="mb-[18px]">
        <legend className="mb-1.5 block text-[13.5px] font-bold text-ink">Opérateur</legend>
        <div className="grid grid-cols-2 gap-2">
          {providers.map((operator) => (
            <label
              key={operator.provider}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-nk border-[1.5px] px-3 py-2.5 text-[13.5px] font-semibold transition",
                value.provider === operator.provider
                  ? "border-brand bg-brand-tint"
                  : "border-line bg-card hover:border-ink-3",
              )}
            >
              <input
                type="radio"
                name="mobile-operator"
                value={operator.provider}
                checked={value.provider === operator.provider}
                onChange={() => onChange({ ...value, provider: operator.provider })}
                className="size-4 shrink-0 accent-brand"
              />
              {operator.displayName}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Numéro de téléphone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="6 70 00 00 00"
        value={value.phoneNumber}
        onChange={(e) => onChange({ ...value, phoneNumber: e.target.value })}
        error={phoneError}
        hint="Vous recevrez une demande de confirmation sur ce numéro. Tapez votre code secret pour valider le paiement."
        containerClassName="mb-0"
      />
    </div>
  );
}
