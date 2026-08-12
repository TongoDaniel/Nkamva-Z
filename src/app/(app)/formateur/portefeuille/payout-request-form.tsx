"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";

/**
 * Demande de retrait. Le serveur reste seul juge : il revérifie le solde, le
 * moyen de paiement, la carence et le retrait déjà en vol. Ce formulaire ne
 * fait qu'éviter au formateur un aller-retour pour les deux cas qu'il peut
 * constater lui-même — montant sous le minimum, montant au-dessus du solde.
 */
export function PayoutRequestForm({
  withdrawableFcfa,
  minimumFcfa,
}: {
  withdrawableFcfa: number;
  minimumFcfa: number;
}) {
  const [amount, setAmount] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  // L'échec s'affiche en tête du formulaire, pas en pastille : `error: null`
  // neutralise le toast, `request.error` porte le message.
  const request = useAction(
    (value: number) => api.post("/api/trainer/payouts", { amountFcfa: value }),
    {
      success: "Demande enregistrée. Vous serez notifié de la décision.",
      error: null,
      onSuccess: () => setAmount(""),
    },
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    const value = Number.parseInt(amount, 10);
    if (!Number.isFinite(value) || value < minimumFcfa) {
      setFieldError(`Le retrait minimum est de ${fmtFcfa(minimumFcfa)}.`);
      return;
    }
    if (value > withdrawableFcfa) {
      setFieldError(`Votre montant retirable est de ${fmtFcfa(withdrawableFcfa)}.`);
      return;
    }

    void request.run(value);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormError>{request.error}</FormError>

      <Field
        label="Montant à retirer (FCFA)"
        type="number"
        inputMode="numeric"
        required
        min={minimumFcfa}
        max={withdrawableFcfa}
        step={100}
        placeholder={String(minimumFcfa)}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={fieldError ?? undefined}
        hint={`Minimum ${fmtFcfa(minimumFcfa)} · disponible ${fmtFcfa(withdrawableFcfa)}.`}
      />

      <Btn type="submit" block loading={request.pending}>
        Demander le retrait
      </Btn>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
        Le montant est immobilisé dès la demande, mais votre solde n&apos;est débité
        qu&apos;au versement effectif. Une seule demande à la fois.
      </p>
    </form>
  );
}
