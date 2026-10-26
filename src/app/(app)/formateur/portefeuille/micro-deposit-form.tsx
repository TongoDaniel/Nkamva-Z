"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { PAYOUT_METHOD_CARENCE_HOURS } from "@/lib/rules";

const MIN = 1;
const MAX = 99;

/**
 * Confirmation des deux micro-virements (comptes IBAN). L'ordre de saisie n'a
 * pas d'importance côté serveur : le dire évite un échec qui, lui, compte dans
 * les trois tentatives avant blocage.
 */
export function MicroDepositForm({
  payoutMethodId,
  reference,
}: {
  payoutMethodId: string;
  reference: string | null;
}) {
  const [amount1, setAmount1] = React.useState("");
  const [amount2, setAmount2] = React.useState("");
  // Erreur de saisie et erreur d'API partagent le même bandeau : le hook n'en
  // fait pas de toast (`error: null`) et `localError` couvre le contrôle local.
  const [localError, setLocalError] = React.useState<string | null>(null);

  const confirm = useAction(
    (a1: number, a2: number) =>
      api.post(`/api/trainer/payout-methods/${payoutMethodId}/micro-deposit/confirm`, {
        amount1: a1,
        amount2: a2,
      }),
    {
      success: `Compte confirmé. Le délai de sécurité de ${PAYOUT_METHOD_CARENCE_HOURS} h démarre.`,
      error: null,
    },
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const a1 = Number.parseInt(amount1, 10);
    const a2 = Number.parseInt(amount2, 10);
    if (![a1, a2].every((v) => Number.isFinite(v) && v >= MIN && v <= MAX)) {
      setLocalError(`Les deux montants sont des nombres entiers entre ${MIN} et ${MAX} FCFA.`);
      return;
    }

    void confirm.run(a1, a2);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 border-t border-line pt-4">
      <h3 className="mb-1.5 text-[14px] font-bold">Confirmez les deux micro-virements</h3>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
        Deux petits montants ont été envoyés sur votre compte
        {reference ? (
          <>
            {" "}
            avec la référence <b className="font-bold text-ink-2">{reference}</b>
          </>
        ) : null}
        . Saisissez-les pour prouver que le compte est bien le vôtre. L&apos;ordre
        n&apos;a pas d&apos;importance.
      </p>

      <FormError>{localError ?? confirm.error}</FormError>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          label="Premier montant"
          type="number"
          inputMode="numeric"
          required
          min={MIN}
          max={MAX}
          value={amount1}
          onChange={(e) => setAmount1(e.target.value)}
        />
        <Field
          label="Second montant"
          type="number"
          inputMode="numeric"
          required
          min={MIN}
          max={MAX}
          value={amount2}
          onChange={(e) => setAmount2(e.target.value)}
        />
      </div>

      <Btn type="submit" loading={confirm.pending}>
        Confirmer le compte
      </Btn>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
        Après trois saisies erronées, la vérification est suspendue et reprise par un
        responsable.
      </p>
    </form>
  );
}
