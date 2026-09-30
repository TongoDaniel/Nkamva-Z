"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Library, ShieldCheck, Smartphone, Users } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { FormError } from "@/components/layouts/auth-shell";
import { MobileMoneyFields, type MobileMoneyValue } from "@/components/nk/mobile-money-fields";
import { operatorsLabel, phoneNumberError, type PayableProvider } from "@/lib/payment-input";
import { api, ApiError } from "@/lib/client";
import { fmtFcfa, fmtNumber } from "@/lib/format";
import type { PaymentProvider } from "@/lib/dto";
import { cn } from "@/lib/utils";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");


const PROVIDERS: Array<{
  value: PaymentProvider;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "PAWAPAY",
    label: "Mobile money",
    // Remplacé à l'affichage par les opérateurs réels (`operatorsLabel`) : la
    // liste écrite en dur annonçait les mêmes marques à tout le monde.
    detail: "",
    icon: Smartphone,
  },
  {
    value: "STRIPE",
    label: "Carte bancaire",
    detail: "Visa, Mastercard",
    icon: CreditCard,
  },
];

interface MembershipIntent {
  purchaseId: string;
  /** Stripe : page de paiement hébergée. Absent pour le mobile money. */
  redirectUrl?: string;
}

export function AdhesionForm({
  slug,
  name,
  priceFcfa,
  membersCount,
  includedCount,
  trainerName,
  dueAmountFcfa,
  invitation,
  providers,
}: {
  slug: string;
  name: string;
  priceFcfa: number;
  membersCount: number;
  includedCount: number;
  trainerName: string | null;
  dueAmountFcfa: number | null;
  /**
   * Jeton d'invitation payante, quand le tunnel est entré depuis un lien. Il
   * est seulement transmis : c'est le webhook qui le consommera, à la
   * confirmation du paiement (arbitrage 78). Un tunnel abandonné laisse donc
   * l'invitation utilisable.
   */
  invitation?: string | null;
  /** Opérateurs distribués dans le pays de l'apprenant, établis côté serveur. */
  providers: PayableProvider[];
}) {
  const router = useRouter();
  const [provider, setProvider] = React.useState<PaymentProvider>("PAWAPAY");
  const [payer, setPayer] = React.useState<MobileMoneyValue>({
    phoneNumber: "",
    provider: providers[0]?.provider ?? "",
  });
  const [showPayerErrors, setShowPayerErrors] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Le montant dû prime sur le prix affiché : une échéance ouverte porte le
  // tarif figé à son ouverture, que la communauté ait changé de prix depuis ou
  // non.
  const amount = dueAmountFcfa ?? priceFcfa;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Contrôle local avant l'aller-retour : un numéro vide ferait un 400 dont
    // le message serait moins précis que celui affiché sous le champ.
    if (provider === "PAWAPAY") {
      setShowPayerErrors(true);
      if (phoneNumberError(payer.phoneNumber)) return;
    }

    setPending(true);
    try {
      const { data } = await api.post<MembershipIntent>(
        `/api/communities/${encodeURIComponent(slug)}/adhesion`,
        {
          provider,
          ...(invitation ? { invitation } : {}),
          ...(provider === "PAWAPAY" ? { payer } : {}),
        },
      );
      // La carte quitte le site pour la page hébergée de Stripe ; le mobile
      // money reste ici et se confirme sur le téléphone du membre, l'écran de
      // confirmation attendant le callback.
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      router.push(`/achat/confirmation/${data.purchaseId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_MEMBER") {
        router.push(routes.community(slug));
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "Le paiement n'a pas pu être lancé. Réessayez.",
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-8 pt-4 lg:grid-cols-[1fr_360px]">
      <fieldset className="min-w-0 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
        <legend className="px-1 text-[17px] font-extrabold">Moyen de paiement</legend>
        <FormError>{error}</FormError>
        <div className="mt-4 grid gap-3">
          {PROVIDERS.map(({ value, label, detail, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-4 rounded-nk border-[1.5px] p-4 transition",
                provider === value
                  ? "border-brand bg-brand-tint"
                  : "border-line bg-card hover:border-ink-3",
              )}
            >
              <input
                type="radio"
                name="provider"
                value={value}
                checked={provider === value}
                onChange={() => setProvider(value)}
                className="size-4.5 shrink-0 accent-brand"
              />
              <Icon className="size-5 shrink-0 text-brand" aria-hidden="true" />
              <span className="min-w-0">
                <b className="block text-[15px]">{label}</b>
                <small className="block text-[13px] text-ink-2">
                  {value === "PAWAPAY" ? operatorsLabel(providers) : detail}
                </small>
              </span>
            </label>
          ))}
        </div>

        {provider === "PAWAPAY" ? (
          <MobileMoneyFields
            providers={providers}
            value={payer}
            onChange={setPayer}
            showErrors={showPayerErrors}
          />
        ) : null}

        <p className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          Votre place n&apos;est ouverte qu&apos;une fois le paiement confirmé par
          l&apos;opérateur. Le mois suivant vous sera présenté à l&apos;échéance : rien
          n&apos;est prélevé automatiquement.
        </p>
      </fieldset>

      <aside
        aria-label="Récapitulatif de l'adhésion"
        className="rounded-nk-lg border border-line bg-card p-6 shadow-nk lg:sticky lg:top-[88px]"
      >
        <h2 className="text-[16.5px] font-bold leading-tight">{name}</h2>
        {trainerName ? (
          <p className="mt-1 text-[13px] font-medium text-ink-2">Animée par {trainerName}</p>
        ) : null}

        <ul className="mt-4 grid gap-2 text-[13.5px] text-ink-2">
          <li className="flex items-center gap-2">
            <Users className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
            {fmtNumber(membersCount)} membres
          </li>
          {includedCount > 0 ? (
            <li className="flex items-center gap-2">
              <Library className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
              {includedCount} ressource{includedCount > 1 ? "s" : ""} incluse
              {includedCount > 1 ? "s" : ""}
            </li>
          ) : null}
        </ul>

        <dl className="my-5 grid gap-2.5 border-y border-line-2 py-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Abonnement</dt>
            <dd className="font-bold">Mensuel</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Engagement</dt>
            <dd className="font-bold">Aucun</dd>
          </div>
          <div className="flex justify-between gap-3 text-base">
            <dt className="font-bold">{dueAmountFcfa ? "Montant dû" : "Total"}</dt>
            <dd className="font-display text-[19px] font-extrabold">{fmtFcfa(amount)}</dd>
          </div>
        </dl>

        <Btn type="submit" size="lg" block loading={pending}>
          {dueAmountFcfa ? `Régler ${fmtFcfa(amount)}` : `Payer ${fmtFcfa(amount)}`}
        </Btn>
      </aside>
    </form>
  );
}
