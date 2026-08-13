"use client";

import * as React from "react";
import { BadgeCheck, ShieldCheck, ThumbsDown, Undo2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useKeyedAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";

type Dialog = "manual" | "reject" | "escalation";

/**
 * Décisions d'instruction. Chaque appel porte `expectedUpdatedAt` : si un pair
 * a tranché entre l'affichage et le clic, l'API répond 409 et l'écran demande
 * une relecture plutôt que d'écraser sa décision.
 */
export function ReviewActions({
  payoutMethodId,
  status,
  accountNature,
  type,
  updatedAt,
  isSuperAdmin,
  hasVerifiedLegalName,
  microDepositIssued,
  rejectionCount,
  maxRejections,
}: {
  payoutMethodId: string;
  status: string;
  accountNature: string;
  type: string;
  updatedAt: string;
  isSuperAdmin: boolean;
  hasVerifiedLegalName: boolean;
  microDepositIssued: boolean;
  rejectionCount: number;
  maxRejections: number;
}) {
  const action = useKeyedAction();
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [justification, setJustification] = React.useState("");
  const [escalationAction, setEscalationAction] =
    React.useState<"FORCE_VERIFY" | "BLOCK" | "RESTORE">("FORCE_VERIFY");

  const instructible = status === "PENDING_REVIEW";
  const escalated = status === "BLOCKED";
  // Arbitrage 99 — le micro-virement est **abandonné**. Aucun agrégateur
  // bancaire n'existe en zone CEMAC : émettre les deux virements supposait une
  // banque et une opération manuelle par dossier, que personne n'a jamais
  // faite. La vérification d'un compte bancaire se fait sur pièce, en revue
  // manuelle, comme celle d'un compte mobile money.
  //
  // Le service et ses tests restent en place (`verifyPayoutMethod`,
  // `confirmMicroDeposit`) : la décision peut se rouvrir le jour où une banque
  // partenaire arrive, et les dossiers déjà tirés doivent pouvoir se terminer.
  // C'est l'écran qui ne le propose plus.
  const lastChance = rejectionCount + 1 >= maxRejections;

  function call(path: string, body: unknown, label: string, after?: () => void) {
    void action.run(path, () => api.post(`/api/admin/payout-methods/${payoutMethodId}/${path}`, body), {
      success: label,
      onSuccess: () => {
        setDialog(null);
        after?.();
      },
      // Le dossier a bougé sous nos yeux : la seule issue est de relire.
      refreshOnError: (err) => err instanceof ApiError && err.code === "STALE_PAYOUT_METHOD",
    });
  }

  if (!hasVerifiedLegalName) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-2">
        <b className="font-bold text-ink">Aucun nom légal vérifié sur ce formateur.</b> Il n&apos;y
        a rien à quoi comparer le titulaire du compte : la vérification est impossible tant que la
        Modération n&apos;a pas saisi ce nom en approuvant la pièce d&apos;identité (décision 21).
      </p>
    );
  }

  if (!instructible && !escalated) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-2">
        Ce dossier est déjà tranché. Il reste consultable pour l&apos;audit.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-2.5">
        {instructible ? (
          <>
            <Btn block onClick={() => setDialog("manual")}>
              <BadgeCheck aria-hidden="true" />
              Vérifier après contrôle
            </Btn>
            <Btn block variant="danger" onClick={() => setDialog("reject")}>
              <ThumbsDown aria-hidden="true" />
              Refuser
            </Btn>
          </>
        ) : null}

        {escalated && isSuperAdmin ? (
          <Btn block onClick={() => setDialog("escalation")}>
            <ShieldCheck aria-hidden="true" />
            Trancher l&apos;escalade
          </Btn>
        ) : null}
      </div>

      {/* Arbitrage 99 — plus aucun micro-virement n'est émis, mais ceux qui
          l'ont été doivent pouvoir se terminer : le formateur peut encore
          saisir ses deux montants. */}
      {microDepositIssued ? (
        <p className="mt-4 rounded-xl bg-gold-tint px-4 py-3 text-[12.5px] leading-relaxed text-gold-ink">
          <b className="font-extrabold">Des micro-virements sont en attente.</b> Virez les deux
          montants affichés, puis attendez que le formateur les confirme. On ne les retire pas une
          seconde fois : les nouveaux ne correspondraient plus à ce que vous avez envoyé. Ce mode de
          vérification n&apos;est plus proposé sur les nouveaux dossiers.
        </p>
      ) : null}

      {instructible && type === "BANK_IBAN" && !microDepositIssued ? (
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          Un compte bancaire se vérifie <b className="font-bold text-ink-2">sur pièce</b> — RIB au
          nom du titulaire, comparé au nom légal vérifié. Le micro-virement a été abandonné : aucun
          service ne permet de l&apos;émettre automatiquement dans la zone.
        </p>
      ) : null}

      {instructible ? (
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          {rejectionCount > 0 ? (
            <>
              Ce formateur compte déjà <b className="font-bold text-ink-2">{rejectionCount} refus</b>{" "}
              sur {maxRejections}.{" "}
              {lastChance ? "Un refus de plus déclenche le blocage et l'escalade." : null}
            </>
          ) : (
            <>
              Après {maxRejections} refus, la vérification est suspendue et confiée à un
              Super-admin.
            </>
          )}
        </p>
      ) : null}

      {/* PM2 — vérification après contrôle manuel */}
      <Modal
        open={dialog === "manual"}
        onOpenChange={(open) => setDialog(open ? "manual" : null)}
        title="Vérifier ce moyen de paiement ?"
        description="À ne faire qu'après avoir constaté la correspondance sur une pièce fournie. Le délai de sécurité de 72 h continue de courir : la vérification ne le raccourcit pas."
        footer={
          <>
            <Btn
              loading={action.isRunning("verify")}
              onClick={() =>
                call(
                  "verify",
                  { method: "MANUAL_FINANCE", expectedUpdatedAt: updatedAt, note: note.trim() || undefined },
                  "Moyen de paiement vérifié.",
                  () => setNote(""),
                )
              }
            >
              Vérifier
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor="verify-note" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Sur quoi vous êtes-vous appuyé ? (facultatif, conservé à l&apos;audit)
        </label>
        <textarea
          id="verify-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            accountNature === "BUSINESS"
              ? "RCCM au nom de la société, statuts désignant le formateur comme gérant."
              : "Attestation bancaire au nom du titulaire, conforme au nom légal vérifié."
          }
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>


      {/* PM6 — refus */}
      <Modal
        open={dialog === "reject"}
        onOpenChange={(open) => setDialog(open ? "reject" : null)}
        title={lastChance ? "Refuser — et bloquer le formateur ?" : "Refuser ce moyen de paiement ?"}
        description={
          lastChance
            ? `Ce sera le ${maxRejections}e refus : la vérification sera suspendue et le dossier confié à un Super-admin.`
            : "Le formateur pourra en enregistrer un autre. Le motif lui est transmis tel quel."
        }
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
                  "Moyen de paiement refusé.",
                  () => setReason(""),
                )
              }
            >
              Refuser
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>
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
          placeholder="Le nom du titulaire ne correspond pas à l'identité vérifiée."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          Décision 30 — jamais un rejet opaque. Dites ce qui ne correspond pas, sans recopier le
          nom légal vérifié dans le message.
        </p>
      </Modal>

      {/* PM8 / PM9 / PM10 — escalade */}
      <Modal
        open={dialog === "escalation"}
        onOpenChange={(open) => setDialog(open ? "escalation" : null)}
        title="Trancher l'escalade"
        description="Vous avez accès à l'identité et au moyen de paiement. Votre décision contourne le processus standard : elle est motivée et journalisée."
        footer={
          <>
            <Btn
              loading={action.isRunning("escalation-resolve")}
              disabled={justification.trim().length < 10}
              onClick={() =>
                call(
                  "escalation-resolve",
                  { action: escalationAction, justification: justification.trim() },
                  "Escalade tranchée.",
                  () => setJustification(""),
                )
              }
            >
              Appliquer
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <fieldset className="mb-4">
          <legend className="mb-2 text-[13.5px] font-bold text-ink">Décision</legend>
          <div className="grid gap-2">
            {(
              [
                {
                  value: "FORCE_VERIFY" as const,
                  label: "Vérifier malgré l'écart",
                  help: "Le compte est jugé légitime. La carence de 72 h redémarre et le compteur de refus est remis à zéro.",
                },
                {
                  value: "BLOCK" as const,
                  label: "Maintenir le blocage",
                  help: "L'écart n'est pas levé. Le formateur reste bloqué.",
                },
                {
                  value: "RESTORE" as const,
                  label: "Restaurer un moyen archivé",
                  help: "Remet en service le moyen précédemment archivé.",
                },
              ] satisfies Array<{ value: "FORCE_VERIFY" | "BLOCK" | "RESTORE"; label: string; help: string }>
            ).map((option) => (
              <label
                key={option.value}
                className={
                  escalationAction === option.value
                    ? "cursor-pointer rounded-nk border-[1.5px] border-brand bg-brand-tint p-3.5"
                    : "cursor-pointer rounded-nk border-[1.5px] border-line p-3.5 hover:border-brand/40"
                }
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="escalation-action"
                    value={option.value}
                    checked={escalationAction === option.value}
                    onChange={() => setEscalationAction(option.value)}
                    className="size-4 accent-brand"
                  />
                  <b className="text-[14px] font-bold text-ink">{option.label}</b>
                </span>
                <span className="mt-1 block pl-6.5 text-[12.5px] leading-relaxed text-ink-2">
                  {option.help}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="escalation-justification" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Justification
        </label>
        <textarea
          id="escalation-justification"
          rows={4}
          maxLength={2000}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Pièces complémentaires reçues par le support, attestant que le compte est bien celui du formateur."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>

      {escalated && !isSuperAdmin ? (
        <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-3">
          <Undo2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Seul un Super-admin peut trancher une escalade.
        </p>
      ) : null}
    </>
  );
}
