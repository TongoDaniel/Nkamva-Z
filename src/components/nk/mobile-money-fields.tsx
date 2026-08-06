"use client";

// Saisie du compte mobile money — partagée par l'achat à l'unité et l'adhésion.
//
// PawaPay adresse un **numéro de téléphone**, pas un compte : sans ces deux
// champs, aucun dépôt ne peut être ouvert. C'est le changement d'UX qu'apporte
// la migration — là où CinetPay redirigeait vers une page hébergée, le paiement
// se déclenche ici et se confirme sur le téléphone de l'apprenant.

import * as React from "react";
import { Field } from "@/components/nk/input";
import { OPERATOR_LABELS, PAYABLE_OPERATORS, phoneNumberError } from "@/lib/payment-input";
import { cn } from "@/lib/utils";

export type MobileMoneyOperatorValue = (typeof PAYABLE_OPERATORS)[number];

export interface MobileMoneyValue {
  phoneNumber: string;
  operator: MobileMoneyOperatorValue;
}

export function MobileMoneyFields({
  value,
  onChange,
  showErrors,
}: {
  value: MobileMoneyValue;
  onChange: (next: MobileMoneyValue) => void;
  /** Les erreurs n'apparaissent qu'après une tentative d'envoi. */
  showErrors: boolean;
}) {
  const phoneError = showErrors ? phoneNumberError(value.phoneNumber) : null;

  return (
    <div className="mt-5 border-t border-line-2 pt-5">
      <p className="mb-3 text-[13.5px] font-bold text-ink">Votre compte mobile money</p>

      <fieldset className="mb-[18px]">
        <legend className="mb-1.5 block text-[13.5px] font-bold text-ink">Opérateur</legend>
        <div className="grid grid-cols-2 gap-2">
          {PAYABLE_OPERATORS.map((operator) => (
            <label
              key={operator}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-nk border-[1.5px] px-3 py-2.5 text-[13.5px] font-semibold transition",
                value.operator === operator
                  ? "border-brand bg-brand-tint"
                  : "border-line bg-card hover:border-ink-3",
              )}
            >
              <input
                type="radio"
                name="mobile-operator"
                value={operator}
                checked={value.operator === operator}
                onChange={() => onChange({ ...value, operator })}
                className="size-4 shrink-0 accent-brand"
              />
              {OPERATOR_LABELS[operator]}
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
