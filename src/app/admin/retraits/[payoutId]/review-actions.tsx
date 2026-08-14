"use client";

import * as React from "react";
import { BadgeCheck, Banknote, RotateCcw, ThumbsDown, TriangleAlert } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { Field } from "@/components/nk/input";
import { useKeyedAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";

type Dialog = "approve" | "reject" | "paid" | "failed" | "reopen";

/**
 * Décisions sur une demande de retrait. `expectedUpdatedAt` accompagne
 * l'approbation et le rejet : si un pair a tranché entre l'affichage et le
 * clic, l'API répond 409 et l'écran demande une relecture.
 *
 * `mark-paid` et `mark-failed` ne le portent pas — ce sont des constats, et le
 * domaine les rend idempotents (rejouer « versé » sur un retrait déjà versé
 * renvoie le retrait sans re-débiter).
 */
export function ReviewActions({
  payoutId,
  status,
  amountFcfa,
  updatedAt,
  isSuperAdmin,
  withdrawableFcfa,
  minimumFcfa,
}: {
  payoutId: string;
  status: string;
  amountFcfa: number;
  updatedAt: string;
  isSuperAdmin: boolean;
  withdrawableFcfa: number;
  minimumFcfa: number;
}) {
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [failureReason, setFailureReason] = React.useState("");
  const [reference, setReference] = React.useState("");

  const action = useKeyedAction();

  const instructible = status === "IN_REVIEW";
  const wireable = status === "APPROVED" || status === "AUTO_APPROVED";
  const failed = status === "FAILED";

  function call(path: string, body: unknown, label: string, after?: () => void) {
    void action.run(path, () => api.post(`/api/admin/payouts/${payoutId}/${path}`, body), {
      success: label,
      onSuccess: () => {
        setDialog(null);
        after?.();
      },
      // Un pair a tranché entre l'affichage et le clic : l'écran ment tant
      // qu'il n'est pas relu, et le bouton reste occupé le temps de la relecture.
      refreshOnError: (err) => err instanceof ApiError && err.code === "STALE_PAYOUT",
    });
  }

  if (!instructible && !wireable && !failed) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-2">
        Cette demande est close. Elle reste consultable pour l&apos;audit.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-2.5">
        {instructible ? (
          <>
            <Btn block onClick={() => setDialog("approve")}>
              <BadgeCheck aria-hidden="true" />
              Approuver
            </Btn>
            <Btn block variant="danger" onClick={() => setDialog("reject")}>
              <ThumbsDown aria-hidden="true" />
              Rejeter
            </Btn>
          </>
        ) : null}

        {wireable ? (
          <>
            <Btn block onClick={() => setDialog("paid")}>
              <Banknote aria-hidden="true" />
              Constater le versement
            </Btn>
            <Btn block variant="o" onClick={() => setDialog("failed")}>
              <TriangleAlert aria-hidden="true" />
              Le virement a échoué
            </Btn>
          </>
        ) : null}

        {failed && isSuperAdmin ? (
          <Btn block onClick={() => setDialog("reopen")}>
            <RotateCcw aria-hidden="true" />
            Reprendre la demande
          </Btn>
        ) : null}
      </div>

      {wireable ? (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
          Le formateur n&apos;est <b className="font-bold text-ink-2">pas encore débité</b> : le
          montant est immobilisé, et il ne quitte son solde qu&apos;au constat du versement.
        </p>
      ) : null}

      {failed && !isSuperAdmin ? (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
          L&apos;engagement est retombé et le solde du formateur est intact. Seul un Super-admin
          peut remettre cette demande en instruction.
        </p>
      ) : null}

      {/* P4 — approbation */}
      <Modal
        open={dialog === "approve"}
        onOpenChange={(open) => setDialog(open ? "approve" : null)}
        title={`Approuver ce retrait de ${fmtFcfa(amountFcfa)} ?`}
        description="Le solde et le moyen de paiement sont re-vérifiés au moment de la décision. Le formateur n'est pas débité maintenant : il le sera au constat du versement."
        footer={
          <>
            <Btn
              loading={action.isRunning("approve")}
              onClick={() =>
                call(
                  "approve",
                  { expectedUpdatedAt: updatedAt, note: note.trim() || undefined },
                  "Retrait approuvé.",
                  () => setNote(""),
                )
              }
            >
              Approuver
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        {withdrawableFcfa < amountFcfa ? (
          <p className="mb-4 rounded-xl bg-danger/5 px-4 py-3 text-[13px] leading-relaxed text-ink">
            <b className="font-extrabold">Le solde retirable ne couvre plus ce montant</b> —{" "}
            {fmtFcfa(withdrawableFcfa)} disponible contre {fmtFcfa(amountFcfa)} demandés.
            L&apos;API refusera l&apos;approbation.
          </p>
        ) : null}
        <label htmlFor="approve-note" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Note interne (facultative, conservée à l&apos;audit)
        </label>
        <textarea
          id="approve-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Moyen de paiement vérifié le 2 août, aucun litige en cours."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>

      {/* P5 — rejet */}
      <Modal
        open={dialog === "reject"}
        onOpenChange={(open) => setDialog(open ? "reject" : null)}
        title="Rejeter cette demande ?"
        description="Le montant immobilisé est libéré et le solde du formateur reste intact. Il pourra redemander."
        footer={
          <>
            <Btn
              variant="danger"
              loading={action.isRunning("reject")}
              disabled={reason.trim().length < 10}
              onClick={() =>
                call(
                  "reject",
                  { reason: reason.trim(), expectedUpdatedAt: updatedAt },
                  "Retrait rejeté.",
                  () => setReason(""),
                )
              }
            >
              Rejeter
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor="reject-reason" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motif transmis au formateur
        </label>
        <textarea
          id="reject-reason"
          rows={4}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Un litige ouvert sur une vente récente immobilise une partie de votre solde."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>

      {/* P6 — versement constaté */}
      <Modal
        open={dialog === "paid"}
        onOpenChange={(open) => setDialog(open ? "paid" : null)}
        title={`Constater le versement de ${fmtFcfa(amountFcfa)} ?`}
        description="À ne faire qu'une fois le virement réellement parti. C'est ce constat, et lui seul, qui débite le solde du formateur."
        footer={
          <>
            <Btn
              loading={action.isRunning("mark-paid")}
              onClick={() =>
                call(
                  "mark-paid",
                  { providerReference: reference.trim() || undefined },
                  "Versement constaté.",
                  () => setReference(""),
                )
              }
            >
              Constater
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <Field
          label="Référence du virement"
          hint="Celle de votre banque ou de l'opérateur. Facultative, mais c'est elle qui permet de retrouver l'opération en cas de contestation."
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="VIR-2026-08-0042"
        />
      </Modal>

      {/* P7 — échec du virement */}
      <Modal
        open={dialog === "failed"}
        onOpenChange={(open) => setDialog(open ? "failed" : null)}
        title="Le virement a échoué ?"
        description="L'engagement retombe et le solde du formateur reste intact : il n'a rien perdu. Le motif lui est communiqué."
        footer={
          <>
            <Btn
              variant="danger"
              loading={action.isRunning("mark-failed")}
              disabled={failureReason.trim().length < 10}
              onClick={() =>
                call(
                  "mark-failed",
                  { reason: failureReason.trim() },
                  "Échec enregistré.",
                  () => setFailureReason(""),
                )
              }
            >
              Enregistrer l&apos;échec
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor="failure-reason" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motif communiqué au formateur
        </label>
        <textarea
          id="failure-reason"
          rows={4}
          maxLength={1000}
          value={failureReason}
          onChange={(e) => setFailureReason(e.target.value)}
          placeholder="Le compte a été rejeté par la banque du bénéficiaire : coordonnées à vérifier."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          Écrivez-le pour le formateur, pas pour un dossier bancaire : c&apos;est lui qui devra
          agir.
        </p>
      </Modal>

      {/* P8 — reprise après échec */}
      <Modal
        open={dialog === "reopen"}
        onOpenChange={(open) => setDialog(open ? "reopen" : null)}
        title="Reprendre cette demande ?"
        description="Elle repart en instruction et le montant est de nouveau immobilisé. À faire une fois la cause de l'échec levée — coordonnées corrigées, compte débloqué."
        footer={
          <>
            <Btn
              loading={action.isRunning("reopen")}
              onClick={() => call("reopen", {}, "Demande reprise.")}
            >
              Reprendre
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-2">
          Le minimum de retrait est de {fmtFcfa(minimumFcfa)} et le solde retirable du formateur
          est actuellement de <b className="font-bold text-ink">{fmtFcfa(withdrawableFcfa)}</b>.
        </p>
      </Modal>
    </>
  );
}
