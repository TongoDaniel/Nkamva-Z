"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Smartphone } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { FormError } from "@/components/layouts/auth-shell";
import { MobileMoneyFields, type MobileMoneyValue } from "@/components/nk/mobile-money-fields";
import { api, ApiError } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";
import { paymentFailureMessage, phoneNumberError, type PayableProvider } from "@/lib/payment-input";
import type { PaymentProvider } from "@/lib/dto";
import { cn } from "@/lib/utils";

/** Intervalle d'interrogation pendant qu'on attend la confirmation de l'opérateur. */
const POLL_MS = 4000;

const PROVIDERS: Array<{
  value: PaymentProvider;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "PAWAPAY", label: "Mobile money", detail: "", icon: Smartphone },
  { value: "STRIPE", label: "Carte bancaire", detail: "Visa, Mastercard", icon: CreditCard },
];

/**
 * Régler son échéance — arbitrage 11.
 *
 * Le formateur recevait « votre abonnement est à régler » et n'avait aucun
 * bouton pour le régler : le seul geste qui levait un impayé était le
 * « Constater » d'un administrateur.
 *
 * Deux sorties selon le moyen choisi, comme au tunnel d'achat. La carte quitte
 * le site vers Stripe et revient ici ; le mobile money reste sur place et pousse
 * une demande sur le téléphone.
 */
export function PaymentPanel({
  amountFcfa,
  pending: alreadyPending,
  lastFailureCode,
  ended,
  withdrawableFcfa,
  autoRenew,
  graceDays,
  providers,
}: {
  amountFcfa: number;
  pending: boolean;
  lastFailureCode: string | null;
  /** Espace au terme : régler ici, c'est le rouvrir (arbitrage 7). */
  ended: boolean;
  withdrawableFcfa: number;
  autoRenew: boolean;
  graceDays: number;
  /** Opérateurs distribués dans le pays du formateur, établis côté serveur. */
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
  const [busy, setBusy] = React.useState(false);
  const [awaiting, setAwaiting] = React.useState(alreadyPending);

  // Le webhook est la voie nominale, mais il n'atteint jamais `localhost` en
  // développement et peut se perdre en production : on relit l'état plutôt que
  // de laisser l'écran sur une attente sans issue.
  React.useEffect(() => {
    if (!awaiting) return;
    let stopped = false;
    const timer = setInterval(() => {
      if (!stopped) router.refresh();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [awaiting, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (provider === "PAWAPAY") {
      setShowPayerErrors(true);
      if (phoneNumberError(payer.phoneNumber)) return;
      if (!payer.provider) {
        setError("Choisissez l'opérateur qui recevra la demande de paiement.");
        return;
      }
    }

    setBusy(true);
    try {
      const { data } = await api.post<{ redirectUrl?: string; nextStep: string }>(
        "/api/trainer/subscription/payment",
        { provider, ...(provider === "PAWAPAY" ? { payer } : {}) },
      );

      // La carte quitte le site : `window.location` et non `router.push`, qui
      // ne sait naviguer que dans l'application.
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      if (data.nextStep === "ALREADY_SETTLED") {
        router.refresh();
        setBusy(false);
        return;
      }
      setAwaiting(true);
      setBusy(false);
    } catch (err) {
      // Réglée entre-temps — un prélèvement a pu passer dans la nuit. Ce n'est
      // pas un échec, l'écran n'a qu'à se relire.
      if (err instanceof ApiError && err.code === "NOTHING_TO_PAY") {
        router.refresh();
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "Le paiement n'a pas pu être lancé. Réessayez.",
      );
      setBusy(false);
    }
  }

  if (amountFcfa === 0 && !ended) {
    return (
      <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
        <h2 className="mb-3 text-[16.5px] font-extrabold">Rien à régler</h2>
        <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-ink-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Votre abonnement est à jour. La prochaine échéance vous sera annoncée à son ouverture.
        </p>
      </section>
    );
  }

  if (awaiting) {
    const byCard = provider === "STRIPE";
    return (
      <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
        <h2 className="text-[16.5px] font-extrabold">
          {byCard ? "Nous confirmons votre paiement" : "Confirmez sur votre téléphone"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          {byCard
            ? "Votre règlement est parti. Cet écran se met à jour dès que le fournisseur nous le confirme."
            : "Une demande de paiement vient d'être envoyée à votre numéro. Validez-la, cet écran se mettra à jour tout seul."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
      <h2 className="text-[16.5px] font-extrabold">
        {ended ? "Rouvrir mon espace" : "Régler mon échéance"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        {ended
          ? "Vous ne repassez pas par une candidature : votre dossier reste validé. Vos pièces d'identité et votre moyen de paiement repasseront en vérification."
          : autoRenew
            ? `Le prélèvement sur votre solde (${fmtFcfa(withdrawableFcfa)} disponibles) est retenté chaque nuit. Vous pouvez aussi régler tout de suite.`
            : `Sans règlement sous ${graceDays} jours, vos ressources sortiront du catalogue.`}
      </p>

      {amountFcfa > 0 ? (
        <p className="mt-4 font-display text-[26px] font-extrabold leading-none text-ink">
          {fmtFcfa(amountFcfa)}
        </p>
      ) : null}

      {lastFailureCode ? (
        <p className="mt-3 rounded-xl bg-danger/5 px-4 py-3 text-[12.5px] leading-relaxed text-ink">
          <b className="font-bold">Dernière tentative refusée.</b>{" "}
          {paymentFailureMessage(lastFailureCode)}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-5">
        <fieldset className="mb-4">
          <legend className="sr-only">Moyen de paiement</legend>
          <div className="grid gap-2">
            {PROVIDERS.map((option) => {
              const selected = option.value === provider;
              const Icon = option.icon;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-nk-lg border px-4 py-3 transition",
                    selected ? "border-brand bg-brand-tint" : "border-line hover:border-line-2",
                  )}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={option.value}
                    checked={selected}
                    onChange={() => setProvider(option.value)}
                    className="sr-only"
                  />
                  <Icon className="size-5 text-ink-2" aria-hidden="true" />
                  <span className="min-w-0">
                    <b className="block text-[14px]">{option.label}</b>
                    {option.detail ? (
                      <small className="text-[12px] text-ink-3">{option.detail}</small>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {provider === "PAWAPAY" ? (
          <MobileMoneyFields
            value={payer}
            onChange={setPayer}
            providers={providers}
            showErrors={showPayerErrors}
          />
        ) : null}

        {error ? <FormError>{error}</FormError> : null}

        <Btn type="submit" block loading={busy} className="mt-4">
          {ended ? "Payer et rouvrir mon espace" : "Régler maintenant"}
        </Btn>
      </form>
    </section>
  );
}
