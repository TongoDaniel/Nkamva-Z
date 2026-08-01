"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ShieldCheck, Smartphone } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Cover, formatLabel } from "@/components/nk/cover";
import { FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { fmtDuration, fmtFcfa } from "@/lib/format";
import type { InitiatePurchaseResult, PaymentProvider } from "@/lib/dto";
import { cn } from "@/lib/utils";

const PROVIDERS: Array<{
  value: PaymentProvider;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "CINETPAY",
    label: "Mobile money",
    detail: "Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa",
    icon: Smartphone,
  },
  {
    value: "STRIPE",
    label: "Carte bancaire",
    detail: "Visa, Mastercard",
    icon: CreditCard,
  },
];

export function CheckoutForm({
  courseId,
  title,
  category,
  format,
  priceFcfa,
  durationSeconds,
  trainerName,
}: {
  courseId: string;
  title: string;
  category: string;
  format: string;
  priceFcfa: number;
  durationSeconds: number | null;
  trainerName: string | null;
}) {
  const router = useRouter();
  const [provider, setProvider] = React.useState<PaymentProvider>("CINETPAY");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { data } = await api.post<InitiatePurchaseResult>("/api/purchases/initiate", {
        courseId,
        provider,
      });
      // Le provider fournit parfois une page de paiement hébergée (CinetPay) ;
      // sinon on part directement sur l'écran de confirmation, qui interroge
      // /reconcile jusqu'à ce que le webhook ait crédité l'achat.
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      router.push(`/achat/confirmation/${data.purchaseId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_PURCHASED") {
        router.push("/mes-ressources");
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "Le paiement n'a pas pu être lancé. Réessayez.",
      );
      setPending(false);
    }
  }

  const duration = fmtDuration(durationSeconds);

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
                <small className="block text-[12.5px] text-ink-2">{detail}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          Aucun accès n&apos;est ouvert avant la confirmation du paiement par l&apos;opérateur.
          Vous pourrez suivre l&apos;état de la transaction sur l&apos;écran suivant.
        </p>
      </fieldset>

      <aside
        aria-label="Récapitulatif de la commande"
        className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk lg:sticky lg:top-[88px]"
      >
        <Cover
          category={category}
          format={format}
          typeLabel={[formatLabel(format), duration].filter(Boolean).join(" · ").toUpperCase()}
        />
        <div className="p-6">
          <h2 className="text-[16.5px] font-bold leading-tight">{title}</h2>
          {trainerName ? (
            <p className="mt-1 text-[13px] font-medium text-ink-2">Par {trainerName}</p>
          ) : null}
          <dl className="my-5 grid gap-2.5 border-y border-line-2 py-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Prix</dt>
              <dd className="font-bold">{fmtFcfa(priceFcfa)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Accès</dt>
              <dd className="font-bold">À vie</dd>
            </div>
            <div className="flex justify-between gap-3 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-display text-[19px] font-extrabold">{fmtFcfa(priceFcfa)}</dd>
            </div>
          </dl>
          <Btn type="submit" size="lg" block loading={pending}>
            Payer {fmtFcfa(priceFcfa)}
          </Btn>
        </div>
      </aside>
    </form>
  );
}
