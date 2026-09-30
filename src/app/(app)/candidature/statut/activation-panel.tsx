"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ShieldCheck, Smartphone } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { FormError } from "@/components/layouts/auth-shell";
import { MobileMoneyFields, type MobileMoneyValue } from "@/components/nk/mobile-money-fields";
import { api, ApiError } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";
import {
  operatorsLabel,
  paymentFailureMessage,
  phoneNumberError,
  type PayableProvider,
} from "@/lib/payment-input";
import type { ActivationState } from "@/lib/trainer-activation";
import type { PaymentProvider } from "@/lib/dto";
import { cn } from "@/lib/utils";

const PROVIDERS: Array<{
  value: PaymentProvider;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "PAWAPAY", label: "Mobile money", detail: "", icon: Smartphone },
  { value: "STRIPE", label: "Carte bancaire", detail: "Visa, Mastercard", icon: CreditCard },
];

/** Intervalle d'interrogation pendant qu'on attend la confirmation de l'opérateur. */
const POLL_MS = 4000;

/**
 * Le règlement du premier abonnement, sur l'écran de suivi de candidature.
 *
 * C'est la dernière marche avant le métier de formateur : le dossier est
 * validé, l'espace n'existe pas encore, et il n'existera qu'au retour du
 * fournisseur de paiement. L'écran ne prétend donc rien : il n'annonce aucune
 * ouverture qu'il n'a pas constatée côté serveur.
 *
 * Deux sorties selon le moyen choisi, comme au tunnel d'achat. La carte quitte
 * le site vers Stripe et revient ici. Le mobile money reste sur place et pousse
 * une demande sur le téléphone : on interroge alors le serveur jusqu'à ce que
 * l'espace soit ouvert, plutôt que de demander au candidat de rafraîchir.
 */
export function ActivationPanel({
  state,
  providers,
}: {
  state: ActivationState;
  /** Opérateurs distribués dans le pays du candidat, établis côté serveur. */
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
  // Vrai tant qu'un paiement est parti sans réponse finale : on n'attend plus
  // un clic mais le fournisseur.
  const [awaiting, setAwaiting] = React.useState(state.pending);
  // Le moyen réellement employé par la tentative en cours, qui n'est pas
  // forcément celui coché dans le formulaire : au retour de Stripe, le
  // composant se remonte avec `provider` à sa valeur par défaut.
  const [awaitingProvider, setAwaitingProvider] = React.useState<PaymentProvider | null>(
    state.pendingProvider,
  );

  // Tant qu'un paiement est en vol, on relit l'état côté serveur — et cette
  // lecture réconcilie, c'est-à-dire qu'elle redemande au fournisseur ce qu'il
  // est advenu. La première a lieu immédiatement : quelqu'un qui revient de
  // Stripe a déjà payé, il ne doit pas contempler un écran d'attente le temps
  // d'un intervalle.
  React.useEffect(() => {
    if (!awaiting) return;
    let stopped = false;

    async function look() {
      try {
        const { data } = await api.get<{ pending: boolean }>(
          "/api/trainer-applications/me/activation",
        );
        // Le paiement a échoué : on rend la main au formulaire, qui affichera
        // le motif plutôt que de laisser tourner une attente sans objet.
        if (!stopped && !data.pending) {
          stopped = true;
          setAwaiting(false);
          router.refresh();
        }
      } catch (err) {
        // 404 « rien à régler » : le règlement est passé et l'espace est ouvert.
        if (!stopped && err instanceof ApiError && err.code === "NOTHING_TO_PAY") {
          stopped = true;
          router.push("/formateur");
        }
      }
    }

    void look();
    const timer = setInterval(() => {
      if (!stopped) void look();
    }, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [awaiting, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Contrôle local avant l'aller-retour : un numéro vide ferait un 422 dont
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
      const { data } = await api.post<{ redirectUrl?: string; nextStep: string }>(
        "/api/trainer-applications/me/activation",
        { provider, ...(provider === "PAWAPAY" ? { payer } : {}) },
      );

      // La carte quitte le site : `window.location` et non `router.push`, qui
      // ne sait naviguer que dans l'application.
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      // Réglé sans fournisseur (raccourci de développement) : l'espace est déjà
      // ouvert, on y va.
      if (data.nextStep === "ALREADY_SETTLED") {
        router.push("/formateur");
        return;
      }
      setAwaitingProvider(provider);
      setAwaiting(true);
      setPending(false);
    } catch (err) {
      // L'espace vient de s'ouvrir sans rien encaisser — la grille est passée à
      // zéro entre-temps. Ce n'est pas un échec.
      if (err instanceof ApiError && (err.code === "NOTHING_TO_PAY" || err.code === "ALREADY_TRAINER")) {
        router.push("/formateur");
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "Le paiement n'a pas pu être lancé. Réessayez.",
      );
      setPending(false);
    }
  }

  const lastFailure = paymentFailureMessage(state.lastFailureCode);

  if (awaiting) {
    // Deux attentes très différentes, et le libellé doit le dire. Le mobile
    // money demande une action — valider sur le téléphone. La carte, elle, est
    // déjà réglée : il ne reste qu'une confirmation à recevoir. Annoncer
    // « confirmez sur votre téléphone » à quelqu'un qui vient de payer par
    // carte l'envoie chercher une demande qui n'existe pas.
    const byCard = awaitingProvider === "STRIPE";
    return (
      <section className="mt-5 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
        <h2 className="text-[17px] font-extrabold">
          {byCard ? "Nous confirmons votre paiement" : "Confirmez le paiement sur votre téléphone"}
        </h2>
        <p className="mt-2 max-w-[52ch] leading-relaxed text-ink-2">
          {byCard ? (
            <>
              Votre paiement de {fmtFcfa(state.amountFcfa)} est en cours de confirmation par notre
              prestataire bancaire. Laissez cette page ouverte : votre espace formateur
              s&apos;ouvre dès que nous avons la confirmation, en général en quelques secondes.
            </>
          ) : (
            <>
              Une demande de {fmtFcfa(state.amountFcfa)} vient de partir vers votre opérateur.
              Validez-la, puis laissez cette page ouverte : votre espace formateur s&apos;ouvre dès
              que le paiement nous est confirmé.
            </>
          )}
        </p>
        <p className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          {byCard ? (
            <>
              Rien n&apos;est ouvert avant la confirmation du paiement. Si elle n&apos;arrive pas,
              vous pourrez relancer une tentative depuis cet écran — vous ne serez pas débité deux
              fois.
            </>
          ) : (
            <>
              Rien n&apos;est ouvert avant la confirmation de l&apos;opérateur. Si la demande
              expire, vous pourrez en relancer une depuis cet écran.
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-5 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8"
    >
      <h2 className="text-[17px] font-extrabold">Réglez votre abonnement</h2>
      {/* Pas de « votre abonnement {cadence} » : les libellés de cadence sont
          au féminin (« Mensuelle », accordé sur « formule ») et donnaient
          « votre abonnement mensuelle ». La formule est nommée dans le
          récapitulatif juste dessous, où l'accord tombe juste. */}
      <p className="mt-2 max-w-[52ch] leading-relaxed text-ink-2">
        Votre dossier est validé. Il reste le règlement de votre abonnement pour ouvrir votre
        espace formateur.
      </p>

      <dl className="my-5 grid gap-2.5 border-y border-line-2 py-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">Formule {state.cadenceLabel.toLowerCase()}</dt>
          <dd className="font-bold">{fmtFcfa(state.listPriceFcfa)}</dd>
        </div>
        {state.discountFcfa > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">{state.discountLabel ?? "Réduction"}</dt>
            <dd className="font-bold text-brand">−{fmtFcfa(state.discountFcfa)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 text-base">
          <dt className="font-bold">À régler aujourd&apos;hui</dt>
          <dd className="font-display text-[19px] font-extrabold">{fmtFcfa(state.amountFcfa)}</dd>
        </div>
      </dl>

      <FormError>{error}</FormError>
      {!error && lastFailure ? (
        <p className="mb-4 rounded-nk bg-gold-tint px-4 py-3 text-[13px] leading-relaxed text-gold-ink">
          <b>Votre dernière tentative a échoué.</b> {lastFailure}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-3 text-[14px] font-bold text-ink">Moyen de paiement</legend>
        <div className="grid gap-3">
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
                name="activation-provider"
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
      </fieldset>

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
        {provider === "PAWAPAY" ? (
          <>
            Votre espace formateur s&apos;ouvre à la confirmation du paiement par
            l&apos;opérateur, pas avant.
          </>
        ) : (
          <>
            Vous allez être dirigé vers Stripe pour régler par carte. Votre numéro n&apos;est
            jamais saisi sur NKAMVA, et votre espace s&apos;ouvre à la confirmation du paiement.
          </>
        )}
      </p>

      <Btn type="submit" size="lg" block loading={pending} className="mt-6">
        Payer {fmtFcfa(state.amountFcfa)}
      </Btn>
    </form>
  );
}
