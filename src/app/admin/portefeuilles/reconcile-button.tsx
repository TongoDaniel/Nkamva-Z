"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";

/** Le champ décide de la route : deux endpoints, un par invariant surveillé. */
const ROUTE: Record<string, string> = {
  reservedBalance: "reconcile-reserved-balance",
  pendingPayoutBalance: "reconcile-pending-payout-balance",
};

const FIELD_LABELS: Record<string, string> = {
  reservedBalance: "Solde réservé",
  pendingPayoutBalance: "Retraits en cours",
};

/** Miroir du `.min(10)` des deux routes : refuser ici évite un aller-retour. */
const MIN_REASON = 10;

/**
 * Correction d'un écart de solde — le point d'entrée qui manquait.
 *
 * Les deux routes existaient depuis le Lot 3, avec leur trace
 * `WalletReconciliation` et leur entrée au journal : rien ne les appelait. La
 * correction n'était donc possible qu'en dehors de l'application, c'est-à-dire
 * sans les garde-fous de l'écran — et sans motif lisible par le suivant.
 *
 * Le motif n'est pas une formalité : c'est la seule chose qui explique, six mois
 * plus tard, pourquoi un solde a bougé sans vente ni retrait. La route l'exige,
 * cet écran le demande donc avant d'agir.
 */
export function ReconcileButton({
  walletId,
  trainerName,
  field,
  storedValue,
  expectedValue,
  delta,
}: {
  walletId: string;
  trainerName: string;
  field: string;
  storedValue: number;
  expectedValue: number;
  delta: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const route = ROUTE[field];

  const reconcile = useAction(
    async (text: string) => {
      const { data } = await api.post<{ corrected: boolean; delta: number }>(
        `/api/admin/wallets/${walletId}/${route}`,
        { reason: text },
      );
      return data;
    },
    {
      // `corrected: false` n'est pas un échec : l'écart s'est résorbé entre
      // l'affichage et le clic — une vente, un retrait approuvé. Le dire évite
      // de chercher une correction qui n'a pas eu lieu.
      success: (data) =>
        data.corrected
          ? `Solde corrigé de ${fmtFcfa(data.delta)}.`
          : "Plus d'écart à corriger : le solde concordait déjà.",
      error: "La correction a échoué.",
      onSuccess: () => {
        setOpen(false);
        setReason("");
      },
    },
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = reason.trim();
    // Contrôle local : la route exige le même minimum, mais l'aller-retour
    // n'apprendrait rien de plus à qui vient d'écrire trois mots.
    if (text.length < MIN_REASON) {
      toast.error(`Le motif demande au moins ${MIN_REASON} caractères.`);
      return;
    }
    void reconcile.run(text);
  }

  if (!route) return null;

  return (
    <>
      <Btn size="sm" variant="o" onClick={() => setOpen(true)}>
        Corriger
      </Btn>

      <Modal
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Corriger un écart de solde"
        description={`${trainerName} — ${FIELD_LABELS[field] ?? field}`}
      >
        <form onSubmit={submit}>
          <dl className="mb-5 flex flex-col gap-2.5 rounded-[14px] bg-paper px-4 py-3.5 text-[13.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Valeur stockée</dt>
              <dd className="font-bold">{fmtFcfa(storedValue)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Valeur recalculée</dt>
              <dd className="font-bold">{fmtFcfa(expectedValue)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line-2 pt-2.5">
              <dt className="text-ink-2">Écart appliqué</dt>
              <dd className="font-extrabold text-danger">
                {delta > 0 ? "+" : ""}
                {fmtFcfa(delta)}
              </dd>
            </div>
          </dl>

          <p className="mb-4 rounded-xl border border-line bg-card border-l-4 border-l-gold px-4 py-3 text-[13px] leading-relaxed text-gold-ink rounded-l-sm">
            La correction remplace la valeur stockée par la valeur recalculée. Elle ne crée ni
            vente ni retrait : elle ne fait qu&apos;aligner le solde sur ce que les
            réservations et les versements en cours établissent déjà.
          </p>

          <label
            htmlFor="reconcile-reason"
            className="mb-1.5 block text-[13.5px] font-bold text-ink"
          >
            Motif de la correction
          </label>
          <textarea
            id="reconcile-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ce qui explique l'écart, et ce qui a été vérifié avant de corriger."
            aria-describedby="reconcile-reason-hint"
            className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          />
          <p id="reconcile-reason-hint" className="mb-4 mt-1.5 text-[13px] text-ink-3">
            {reason.trim().length < MIN_REASON
              ? `Encore ${MIN_REASON - reason.trim().length} caractères.`
              : "Il est conservé avec votre identité et reste lisible dans le journal d'audit."}
          </p>

          <div className="flex flex-col gap-2.5">
            <Btn
              type="submit"
              block
              loading={reconcile.pending}
              disabled={reason.trim().length < MIN_REASON}
            >
              Appliquer la correction
            </Btn>
            <Btn
              type="button"
              variant="t"
              block
              disabled={reconcile.pending}
              onClick={() => setOpen(false)}
            >
              Annuler
            </Btn>
          </div>
        </form>
      </Modal>
    </>
  );
}
