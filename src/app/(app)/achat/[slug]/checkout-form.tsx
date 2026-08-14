"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ShieldCheck, Smartphone } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Cover, coverImageUrl, formatLabel } from "@/components/nk/cover";
import { FormError } from "@/components/layouts/auth-shell";
import { MobileMoneyFields, type MobileMoneyValue } from "@/components/nk/mobile-money-fields";
import { phoneNumberError, type PayableProvider } from "@/lib/payment-input";
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
    value: "PAWAPAY",
    label: "Mobile money",
    // Remplacé à l'affichage par les opérateurs réels du pays : cette liste
    // écrite en dur annonçait quatre marques identiques à tout le monde, du
    // Cameroun à la Tanzanie.
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

/** « MTN, Orange, Airtel » — ou le motif de l'absence, plutôt qu'une ligne vide. */
export function operatorsLabel(providers: PayableProvider[]): string {
  if (!providers.length) return "Indisponible dans votre pays";
  return providers.map((p) => p.displayName).join(", ");
}

export function CheckoutForm({
  courseId,
  title,
  category,
  format,
  coverS3Key,
  priceFcfa,
  durationSeconds,
  trainerName,
  providers,
}: {
  courseId: string;
  title: string;
  category: string;
  format: string;
  /** Sert la couverture déposée : l'acheteur doit reconnaître ce qu'il paie. */
  coverS3Key: string | null;
  priceFcfa: number;
  durationSeconds: number | null;
  trainerName: string | null;
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Contrôle local avant l'aller-retour : un numéro vide ferait un 400 dont
    // le message serait moins précis que celui affiché sous le champ.
    if (provider === "PAWAPAY") {
      setShowPayerErrors(true);
      if (phoneNumberError(payer.phoneNumber)) return;
      if (!payer.provider) {
        setError("Choisissez l'opérateur qui recevra la demande de paiement.");
        return;
      }
    }

    setPending(true);
    try {
      const { data } = await api.post<InitiatePurchaseResult>("/api/purchases/initiate", {
        courseId,
        provider,
        ...(provider === "PAWAPAY" ? { payer } : {}),
      });
      // Deux sorties, selon le moyen choisi. La carte quitte le site :
      // `window.location` et non `router.push`, qui ne sait naviguer que dans
      // l'application. Le mobile money, lui, pousse la demande sur le téléphone
      // et reste ici — l'écran de confirmation interroge `/reconcile` jusqu'à ce
      // que le callback ait crédité l'achat.
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
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

        {/* Le texte suivait le mobile money seul et parlait de « l'opérateur »
            même carte sélectionnée. Chaque moyen annonce désormais ce qui va
            réellement se passer — la carte quitte le site, c'est à dire. */}
        <p className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          {provider === "PAWAPAY" ? (
            <>
              Aucun accès n&apos;est ouvert avant la confirmation du paiement par
              l&apos;opérateur. Vous pourrez suivre l&apos;état de la transaction sur
              l&apos;écran suivant.
            </>
          ) : (
            <>
              Vous allez être dirigé vers Stripe pour régler par carte. Votre numéro
              n&apos;est jamais saisi sur NkamVa, et aucun accès n&apos;est ouvert avant
              la confirmation du paiement.
            </>
          )}
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
          imageUrl={coverImageUrl({ id: courseId, coverS3Key })}
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
