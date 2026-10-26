"use client";

import * as React from "react";
import { HelpCircle, MessageSquare, Scale, ThumbsDown } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { Field } from "@/components/nk/input";
import { useKeyedAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { fmtFcfa } from "@/lib/format";
import { CONSUMPTION_THRESHOLD_LABEL, DISPUTE_OPENING_WINDOW_DAYS } from "@/lib/rules";
import { cn } from "@/lib/utils";

type Dialog = "message" | "ask" | "refund" | "reject";

/**
 * Décisions d'arbitrage. Chaque appel porte `expectedUpdatedAt` : deux
 * modérateurs sur le même dossier ne peuvent pas trancher chacun de leur côté.
 */
export function DisputeActions({
  disputeId,
  status,
  updatedAt,
  disputedAmountFcfa,
  withinPolicy,
  isSuperAdmin,
  providerDisputeActive,
}: {
  disputeId: string;
  status: string;
  updatedAt: string;
  disputedAmountFcfa: number;
  /** Le dossier respecte-t-il le barème 14 jours / 30 % tel que figé à l'ouverture ? */
  withinPolicy: boolean;
  isSuperAdmin: boolean;
  providerDisputeActive: boolean;
}) {
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const action = useKeyedAction();

  const [message, setMessage] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [note, setNote] = React.useState("");
  const [partial, setPartial] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [override, setOverride] = React.useState("");

  const openable = ["OPEN", "IN_REVIEW", "WAITING_LEARNER"].includes(status);
  const askable = ["OPEN", "IN_REVIEW"].includes(status);
  // Hors barème, seul un super-administrateur peut rembourser, et il doit motiver.
  const overrideNeeded = !withinPolicy;
  const canRefund = openable && !providerDisputeActive && (!overrideNeeded || isSuperAdmin);

  function call(path: string, body: unknown, label: string, reset: () => void) {
    void action.run(path, () => api.post(`/api/admin/disputes/${disputeId}/${path}`, body), {
      success: label,
      onSuccess: () => {
        setDialog(null);
        reset();
      },
      // Deux modérateurs sur le même dossier : l'écran doit être relu avant
      // toute nouvelle tentative, et le bouton reste occupé jusque-là.
      refreshOnError: (err) => err instanceof ApiError && err.code === "STALE_DISPUTE",
    });
  }

  const partialAmount = Number.parseInt(amount, 10);
  const partialValid =
    !partial ||
    (Number.isFinite(partialAmount) && partialAmount > 0 && partialAmount < disputedAmountFcfa);
  const canSubmitRefund =
    note.trim().length >= 10 && partialValid && (!overrideNeeded || override.trim().length >= 10);

  if (!openable) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        <Btn variant="o" onClick={() => setDialog("message")}>
          <MessageSquare aria-hidden="true" />
          Répondre
        </Btn>
        {askable ? (
          <Btn variant="o" onClick={() => setDialog("ask")}>
            <HelpCircle aria-hidden="true" />
            Demander une précision
          </Btn>
        ) : null}
        <Btn onClick={() => setDialog("refund")} disabled={!canRefund}>
          <Scale aria-hidden="true" />
          Rembourser
        </Btn>
        <Btn variant="danger" onClick={() => setDialog("reject")}>
          <ThumbsDown aria-hidden="true" />
          Écarter
        </Btn>
      </div>

      {providerDisputeActive ? (
        <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed text-danger">
          Un chargeback est en cours chez l&apos;opérateur : rembourser ici débiterait deux fois le
          formateur.
        </p>
      ) : overrideNeeded && !isSuperAdmin ? (
        <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed text-gold-ink">
          Ce dossier est hors barème ({DISPUTE_OPENING_WINDOW_DAYS} jours / {CONSUMPTION_THRESHOLD_LABEL}). Seul un super-administrateur peut le
          rembourser, avec justification.
        </p>
      ) : null}

      <Modal
        open={dialog === "message"}
        onOpenChange={(o) => setDialog(o ? "message" : null)}
        title="Répondre à l'apprenant"
        description="Votre message apparaît dans le fil et déclenche une notification."
        footer={
          <>
            <Btn
              loading={action.isRunning("messages")}
              disabled={!message.trim()}
              onClick={() => call("messages", { body: message.trim() }, "Message envoyé.", () => setMessage(""))}
            >
              Envoyer
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>Annuler</Btn>
          </>
        }
      >
        <textarea
          rows={5}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="Message au demandeur"
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>

      <Modal
        open={dialog === "ask"}
        onOpenChange={(o) => setDialog(o ? "ask" : null)}
        title="Demander une précision"
        description="L'apprenant disposera de sept jours pour répondre. Passé ce délai, le dossier se clôt et son accès est rétabli."
        footer={
          <>
            <Btn
              loading={action.isRunning("ask-learner")}
              disabled={question.trim().length < 10}
              onClick={() =>
                call(
                  "ask-learner",
                  { expectedUpdatedAt: updatedAt, question: question.trim() },
                  "Demande envoyée à l'apprenant.",
                  () => setQuestion(""),
                )
              }
            >
              Envoyer la demande
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>Annuler</Btn>
          </>
        }
      >
        <textarea
          rows={4}
          maxLength={2000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pouvez-vous préciser ce qui manque par rapport à la fiche ?"
          aria-label="Question posée à l'apprenant"
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>

      <Modal
        open={dialog === "refund"}
        onOpenChange={(o) => setDialog(o ? "refund" : null)}
        size="lg"
        title="Rembourser l'apprenant"
        description="La décision est actée immédiatement. Le solde du formateur n'est débité qu'au moment où le remboursement est réellement effectué."
        footer={
          <>
            <Btn
              loading={action.isRunning("resolve")}
              disabled={!canSubmitRefund}
              onClick={() =>
                call(
                  "resolve",
                  {
                    expectedUpdatedAt: updatedAt,
                    resolution: partial ? "PARTIAL_REFUND" : "FULL_REFUND",
                    resolutionNote: note.trim(),
                    ...(partial ? { refundAmountFcfa: partialAmount } : {}),
                    // `policyOverride` est ce qui active la dérogation côté
                    // service : sans lui, la justification seule ne suffit pas
                    // et le dossier hors barème repart en REFUND_RULE_NOT_MET.
                    ...(overrideNeeded
                      ? { policyOverride: true, overrideJustification: override.trim() }
                      : {}),
                  },
                  "Remboursement décidé.",
                  () => { setNote(""); setOverride(""); setAmount(""); setPartial(false); },
                )
              }
            >
              Valider le remboursement
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>Annuler</Btn>
          </>
        }
      >
        <label
          className={cn(
            "mb-4 flex cursor-pointer items-center gap-3 rounded-nk border-[1.5px] px-4 py-3 text-[14px]",
            partial ? "border-brand bg-brand-tint" : "border-line",
          )}
        >
          <input
            type="checkbox"
            checked={partial}
            onChange={(e) => setPartial(e.target.checked)}
            className="size-4 accent-brand"
          />
          Remboursement partiel (total contesté : {fmtFcfa(disputedAmountFcfa)})
        </label>

        {partial ? (
          <Field
            label="Montant remboursé (FCFA)"
            type="number"
            inputMode="numeric"
            min={1}
            max={disputedAmountFcfa - 1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={
              amount && !partialValid
                ? `Le montant doit être compris entre 1 et ${disputedAmountFcfa - 1}.`
                : undefined
            }
          />
        ) : null}

        <label htmlFor="refund-note" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motif communiqué à l&apos;apprenant
        </label>
        <textarea
          id="refund-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mb-4 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />

        {overrideNeeded ? (
          <>
            <p className="mb-2 rounded-nk bg-gold-tint px-4 py-3 text-[13px] leading-relaxed text-gold-ink">
              Ce dossier sort du barème {DISPUTE_OPENING_WINDOW_DAYS} jours / {CONSUMPTION_THRESHOLD_LABEL}. La dérogation sera enregistrée au journal
              d&apos;audit avec votre justification.
            </p>
            <label htmlFor="refund-override" className="mb-1.5 block text-[13.5px] font-bold text-ink">
              Justification de la dérogation
            </label>
            <textarea
              id="refund-override"
              rows={3}
              maxLength={2000}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
            />
          </>
        ) : null}
      </Modal>

      <Modal
        open={dialog === "reject"}
        onOpenChange={(o) => setDialog(o ? "reject" : null)}
        title="Écarter la contestation ?"
        description="Les fonds gelés seront rendus au formateur et l'accès de l'apprenant rétabli."
        footer={
          <>
            <Btn
              variant="danger"
              loading={action.isRunning("resolve")}
              disabled={note.trim().length < 10}
              onClick={() =>
                call(
                  "resolve",
                  { expectedUpdatedAt: updatedAt, resolution: "REJECT", resolutionNote: note.trim() },
                  "Contestation écartée.",
                  () => setNote(""),
                )
              }
            >
              Écarter
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>Annuler</Btn>
          </>
        }
      >
        <label htmlFor="reject-note" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motif communiqué à l&apos;apprenant
        </label>
        <textarea
          id="reject-note"
          rows={4}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>
    </>
  );
}
