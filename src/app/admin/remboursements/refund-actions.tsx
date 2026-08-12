"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";

/**
 * Exécution d'un remboursement chez l'opérateur.
 * Confirmer débite enfin le formateur ; annuler lui rend les fonds gelés sans
 * rien débiter — le remboursement n'ayant pas eu lieu.
 */
export function RefundActions({
  taskId,
  refundAmountFcfa,
  trainerDebitFcfa,
}: {
  taskId: string;
  refundAmountFcfa: number;
  trainerDebitFcfa: number;
}) {
  const [dialog, setDialog] = React.useState<null | "complete" | "cancel">(null);
  const [notes, setNotes] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");

  const action = useKeyedAction();

  function call(key: "complete" | "cancel", body: unknown, label: string) {
    void action.run(key, () => api.post(`/api/admin/manual-refund-tasks/${taskId}/${key}`, body), {
      success: label,
      error: "L'action a échoué.",
      onSuccess: () => {
        setDialog(null);
        setNotes("");
        setErrorMessage("");
      },
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" onClick={() => setDialog("complete")}>
          <Check aria-hidden="true" />
          Remboursement effectué
        </Btn>
        <Btn variant="danger" size="sm" onClick={() => setDialog("cancel")}>
          <X aria-hidden="true" />
          Échec
        </Btn>
      </div>

      <Modal
        open={dialog === "complete"}
        onOpenChange={(o) => setDialog(o ? "complete" : null)}
        title="Confirmer le remboursement ?"
        description={`Confirmez uniquement après avoir effectué le virement de ${fmtFcfa(refundAmountFcfa)} chez l'opérateur. Le solde du formateur sera débité de ${fmtFcfa(trainerDebitFcfa)}.`}
        footer={
          <>
            <Btn
              loading={action.isRunning("complete")}
              onClick={() => call("complete", { notes: notes.trim() || undefined }, "Remboursement enregistré.")}
            >
              Confirmer
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>Annuler</Btn>
          </>
        }
      >
        <label htmlFor={`notes-${taskId}`} className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Référence ou note (facultatif)
        </label>
        <textarea
          id={`notes-${taskId}`}
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Référence de la transaction chez l'opérateur."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>

      <Modal
        open={dialog === "cancel"}
        onOpenChange={(o) => setDialog(o ? "cancel" : null)}
        title="Le remboursement a échoué ?"
        description="Les fonds gelés sont rendus au formateur, sans débit. L'apprenant retrouve l'accès à la ressource : il a payé et n'a rien été remboursé."
        footer={
          <>
            <Btn
              variant="danger"
              loading={action.isRunning("cancel")}
              // Dix caractères, comme l'exige le schéma de la route : en dessous,
              // le bouton était actif et l'appel repartait en 400.
              disabled={errorMessage.trim().length < 10}
              onClick={() => call("cancel", { reason: errorMessage.trim() }, "Échec enregistré.")}
            >
              Enregistrer l&apos;échec
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>Annuler</Btn>
          </>
        }
      >
        <label htmlFor={`error-${taskId}`} className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Raison de l&apos;échec
        </label>
        <textarea
          id={`error-${taskId}`}
          rows={3}
          maxLength={1000}
          value={errorMessage}
          onChange={(e) => setErrorMessage(e.target.value)}
          placeholder="Numéro mobile money invalide, compte clôturé…"
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>
    </>
  );
}
