"use client";

// Saisie du compte mobile money — partagée par l'achat à l'unité et l'adhésion.
//
// PawaPay adresse un **numéro de téléphone**, pas un compte : sans ces deux
// champs, aucun dépôt ne peut être ouvert. C'est le changement d'UX qu'apporte
// la migration — là où CinetPay redirigeait vers une page hébergée, le paiement
// se déclenche ici et se confirme sur le téléphone de l'apprenant.
//
// La liste des opérateurs n'est plus une constante : elle vient du serveur, qui
// la tient de `/v2/active-conf`. Un opérateur affiché ici est donc, par
// construction, un opérateur que le compte marchand peut réellement encaisser.
//
// Elle couvre **tous** les pays encaissables, pas seulement celui du profil. On
// paie avec un numéro, pas avec une adresse : un apprenant installé en France
// règle normalement avec son MTN camerounais. D'où le sélecteur de pays — sans
// lui, la liste mêlerait treize opérateurs de sept pays dont plusieurs portent
// le même nom commercial (Orange au Sénégal, au Cameroun et en Côte d'Ivoire).

import * as React from "react";
import { Field } from "@/components/nk/input";
import { countryName, phoneNumberError, type PayableProvider } from "@/lib/payment-input";
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

  // Les pays dans l'ordre où le serveur les a rangés : celui du profil d'abord.
  const countries = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of providers) if (!seen.has(p.countryCode)) seen.set(p.countryCode, p.prefix);
    return [...seen].map(([code, prefix]) => ({ code, prefix }));
  }, [providers]);

  const selected = providers.find((p) => p.provider === value.provider) ?? null;
  const [country, setCountry] = React.useState(
    () => selected?.countryCode ?? countries[0]?.code ?? "",
  );
  // L'opérateur choisi fait foi sur le pays affiché : le formulaire parent peut
  // le réinitialiser, et le sélecteur doit suivre plutôt que mentir.
  const shownCountry = selected?.countryCode ?? country;
  const shown = providers.filter((p) => p.countryCode === shownCountry);
  const prefix = countries.find((c) => c.code === shownCountry)?.prefix ?? "";

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

      {countries.length > 1 ? (
        <div className="mb-[18px]">
          <label
            htmlFor="mobile-country"
            className="mb-1.5 block text-[13.5px] font-bold text-ink"
          >
            Pays du numéro
          </label>
          <select
            id="mobile-country"
            value={shownCountry}
            onChange={(e) => {
              setCountry(e.target.value);
              // Changer de pays invalide l'opérateur choisi : on prend le
              // premier du nouveau pays plutôt que de laisser un couple
              // incohérent que le serveur refuserait.
              const first = providers.find((p) => p.countryCode === e.target.value);
              onChange({ ...value, provider: first?.provider ?? "" });
            }}
            className="w-full rounded-nk border-[1.5px] border-line bg-card px-3 py-2.5 text-[13.5px] font-semibold text-ink"
          >
            {countries.map(({ code, prefix: dial }) => (
              <option key={code} value={code}>
                {countryName(code)} (+{dial})
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            Le pays de votre numéro, pas celui où vous vivez.
          </p>
        </div>
      ) : null}

      <fieldset className="mb-[18px]">
        <legend className="mb-1.5 block text-[13.5px] font-bold text-ink">Opérateur</legend>
        <div className="grid grid-cols-2 gap-2">
          {shown.map((operator) => (
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

      {/* Le placeholder était un numéro camerounais en dur, y compris pour un
          opérateur sénégalais. L'indicatif du pays choisi est la seule indication
          honnête — le reste du format varie d'un pays à l'autre, et `toMsisdn`
          l'ajoute de toute façon si l'apprenant ne le saisit pas. */}
      <Field
        label="Numéro de téléphone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={prefix ? `+${prefix} …` : "Numéro de téléphone"}
        value={value.phoneNumber}
        onChange={(e) => onChange({ ...value, phoneNumber: e.target.value })}
        error={phoneError}
        hint={`Le numéro ${prefix ? `(+${prefix}) ` : ""}qui recevra la demande de confirmation. Tapez votre code secret pour valider le paiement.`}
        containerClassName="mb-0"
      />
    </div>
  );
}
