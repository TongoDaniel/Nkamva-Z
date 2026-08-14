"use client";

import * as React from "react";
import { Banknote } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { Field } from "@/components/nk/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";

/**
 * Constat manuel du règlement. Aucun provider d'abonnement n'est branché : ce
 * geste est aujourd'hui le seul qui lève un impayé, exactement comme
 * « constater le versement » l'est pour un retrait.
 */
export function SettleAction({
  chargeId,
  amountFcfa,
  trainerName,
}: {
  chargeId: string;
  amountFcfa: number;
  trainerName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reference, setReference] = React.useState("");

  const settle = useAction(
    () =>
      api.post(`/api/admin/subscriptions/charges/${chargeId}/settle`, {
        reference: reference.trim() || undefined,
      }),
    {
      success: "Règlement constaté.",
      onSuccess: () => {
        setOpen(false);
        setReference("");
      },
    },
  );

  return (
    <>
      <Btn variant="o" size="sm" onClick={() => setOpen(true)}>
        <Banknote aria-hidden="true" />
        Constater
      </Btn>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Constater le règlement de ${fmtFcfa(amountFcfa)} ?`}
        description={`Pour ${trainerName}. À ne faire qu'une fois le paiement réellement reçu.`}
        footer={
          <>
            <Btn loading={settle.pending} onClick={() => void settle.run()}>
              Constater
            </Btn>
            <Btn variant="o" disabled={settle.pending} onClick={() => setOpen(false)}>
              Annuler
            </Btn>
          </>
        }
      >
        <Field
          label="Référence du paiement"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="VIR-2026-08-0117"
          hint="Facultative, mais c'est elle qui permet de retrouver l'opération en cas de contestation."
        />
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          S&apos;il reste une période impayée plus ancienne, le formateur ne redevient pas actif :
          régler la dernière ne solde pas un arriéré.
        </p>
      </Modal>
    </>
  );
}
