"use client";

import * as React from "react";
import { BadgeCheck, RotateCcw, ThumbsDown, Undo2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { Field } from "@/components/nk/input";
import { useKeyedAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";
import { DOCUMENT_LABELS } from "../status";

export interface ReviewDocument {
  id: string;
  type: string;
  status: string;
  resubmissionCount: number;
}

/**
 * Décisions de revue. `expectedUpdatedAt` accompagne chaque appel : si le
 * dossier a bougé depuis l'affichage, l'API répond 409 et l'écran demande un
 * rechargement au lieu d'écraser la décision d'un pair.
 */
export function ReviewActions({
  applicationId,
  status,
  updatedAt,
  documents,
  candidateName,
  isSuperAdmin,
  maxResubmissions,
}: {
  applicationId: string;
  status: string;
  updatedAt: string;
  documents: ReviewDocument[];
  candidateName: string;
  isSuperAdmin: boolean;
  maxResubmissions: number;
}) {
  const action = useKeyedAction();
  const [openDialog, setOpenDialog] = React.useState<null | "approve" | "documents" | "final">(null);

  const [legalName, setLegalName] = React.useState(candidateName);
  const [finalReason, setFinalReason] = React.useState("");
  const [rejections, setRejections] = React.useState<Record<string, string>>({});

  const reviewable = status === "SUBMITTED";
  const rejectable = status === "SUBMITTED" || status === "RESUBMISSION_PENDING";
  const reopenable = status === "REJECTED" && isSuperAdmin;

  function call(path: string, body: unknown, label: string, done: () => void) {
    void action.run(
      path,
      () => api.post(`/api/admin/trainer-applications/${applicationId}/${path}`, body),
      {
        success: label,
        onSuccess: () => {
          setOpenDialog(null);
          done();
        },
        // Le dossier a changé sous nos yeux : la seule issue est de relire.
        refreshOnError: (err) => err instanceof ApiError && err.code === "STALE_APPLICATION",
      },
    );
  }

  const selectedRejections = Object.entries(rejections)
    .filter(([, reason]) => reason.trim().length >= 10)
    .map(([documentId, reason]) => ({ documentId, reason: reason.trim() }));

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        {reviewable ? (
          <Btn onClick={() => setOpenDialog("approve")}>
            <BadgeCheck aria-hidden="true" />
            Accepter
          </Btn>
        ) : null}
        {reviewable ? (
          <Btn variant="o" onClick={() => setOpenDialog("documents")}>
            <RotateCcw aria-hidden="true" />
            Demander de nouvelles pièces
          </Btn>
        ) : null}
        {rejectable ? (
          <Btn variant="danger" onClick={() => setOpenDialog("final")}>
            <ThumbsDown aria-hidden="true" />
            Refuser définitivement
          </Btn>
        ) : null}
        {reopenable ? (
          <Btn
            variant="o"
            loading={action.isRunning("reopen")}
            onClick={() => call("reopen", {}, "Dossier rouvert.", () => undefined)}
          >
            <Undo2 aria-hidden="true" />
            Rouvrir le dossier
          </Btn>
        ) : null}
      </div>

      {/* T3 */}
      <Modal
        open={openDialog === "approve"}
        onOpenChange={(open) => setOpenDialog(open ? "approve" : null)}
        title="Accepter cette candidature ?"
        description="Un profil formateur et un portefeuille seront créés, et le compte passera en formateur."
        footer={
          <>
            <Btn
              loading={action.isRunning("approve")}
              disabled={legalName.trim().length < 2}
              onClick={() =>
                call(
                  "approve",
                  { expectedUpdatedAt: updatedAt, verifiedLegalName: legalName.trim() },
                  "Candidature acceptée.",
                  () => undefined,
                )
              }
            >
              Accepter
            </Btn>
            <Btn variant="o" onClick={() => setOpenDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <Field
          label="Nom légal vérifié"
          hint="Recopiez le nom tel qu'il figure sur la pièce d'identité."
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
        />
      </Modal>

      {/* T4 */}
      <Modal
        open={openDialog === "documents"}
        onOpenChange={(open) => setOpenDialog(open ? "documents" : null)}
        size="lg"
        title="Demander de nouvelles pièces"
        description="Cochez les pièces à renvoyer et indiquez un motif : le candidat le lira tel quel. Les pièces non listées sont validées."
        footer={
          <>
            <Btn
              loading={action.isRunning("reject-documents")}
              disabled={selectedRejections.length === 0}
              onClick={() =>
                call(
                  "reject-documents",
                  { expectedUpdatedAt: updatedAt, rejections: selectedRejections },
                  "Le candidat a été prévenu.",
                  () => setRejections({}),
                )
              }
            >
              Envoyer la demande
            </Btn>
            <Btn variant="o" onClick={() => setOpenDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <div className="grid gap-3">
          {documents.map((document) => {
            const exhausted = document.resubmissionCount >= maxResubmissions;
            const value = rejections[document.id] ?? "";
            return (
              <div
                key={document.id}
                className={cn(
                  "rounded-nk border-[1.5px] p-4",
                  value ? "border-danger/40 bg-danger-tint/30" : "border-line",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <b className="text-[14px]">{DOCUMENT_LABELS[document.type] ?? document.type}</b>
                  {document.resubmissionCount > 0 ? (
                    <span className="text-[12px] text-ink-3">
                      renvoi {document.resubmissionCount}/{maxResubmissions}
                    </span>
                  ) : null}
                </div>
                {exhausted ? (
                  <p className="text-[12.5px] leading-relaxed text-danger">
                    Cette pièce a épuisé ses renvois : le dossier doit être tranché définitivement.
                  </p>
                ) : (
                  <>
                    <label
                      htmlFor={`reason-${document.id}`}
                      className="mb-1.5 block text-[12.5px] font-bold text-ink-2"
                    >
                      Motif du refus (laisser vide pour valider cette pièce)
                    </label>
                    <textarea
                      id={`reason-${document.id}`}
                      rows={2}
                      maxLength={500}
                      value={value}
                      onChange={(e) =>
                        setRejections((r) => ({ ...r, [document.id]: e.target.value }))
                      }
                      placeholder="Document illisible, merci de renvoyer un scan net."
                      className="w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-2 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
                    />
                    {value.trim().length > 0 && value.trim().length < 10 ? (
                      <p className="mt-1 text-[12px] font-semibold text-danger">
                        Motif trop court pour être utile au candidat.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* T6 / T7 */}
      <Modal
        open={openDialog === "final"}
        onOpenChange={(open) => setOpenDialog(open ? "final" : null)}
        title="Refuser définitivement ?"
        description="Le candidat redevient apprenant. Ses pièces seront effacées 90 jours après cette décision."
        footer={
          <>
            <Btn
              variant="danger"
              loading={action.isRunning("reject-final")}
              disabled={finalReason.trim().length < 10}
              onClick={() =>
                call(
                  "reject-final",
                  { expectedUpdatedAt: updatedAt, reason: finalReason.trim() },
                  "Dossier refusé.",
                  () => setFinalReason(""),
                )
              }
            >
              Refuser
            </Btn>
            <Btn variant="o" onClick={() => setOpenDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor="final-reason" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motif communiqué au candidat
        </label>
        <textarea
          id="final-reason"
          rows={4}
          maxLength={1000}
          value={finalReason}
          onChange={(e) => setFinalReason(e.target.value)}
          placeholder="Expliquez ce qui n'a pas pu être retenu, en des termes exploitables."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>
    </>
  );
}
