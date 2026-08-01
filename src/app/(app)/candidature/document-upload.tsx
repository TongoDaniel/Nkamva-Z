"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, RotateCcw, TriangleAlert } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { StPill } from "@/components/nk/status-pill";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";
import { DOCUMENT_STATUS, type DocumentSlot } from "./documents";

export interface DocumentState {
  id: string;
  type: string;
  status: string;
  rejectionReason: string | null;
  resubmissionCount: number;
  originalFileName: string | null;
}

export function DocumentUpload({
  slot,
  document: current,
  editable,
  storageAvailable,
}: {
  slot: DocumentSlot;
  document?: DocumentState;
  editable: boolean;
  storageAvailable: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);

  const confirmed = current && ["PENDING", "RESUBMITTED", "APPROVED"].includes(current.status);
  const rejected = current?.status === "REJECTED";
  const state = current ? DOCUMENT_STATUS[current.status] : null;

  async function onFile(file: File) {
    setPending(true);
    try {
      setProgress("Préparation de l'envoi…");
      const { data: ticket } = await api.post<{ documentId: string; uploadUrl: string }>(
        "/api/trainer-applications/me/documents/upload",
        {
          type: slot.type,
          mimeType: file.type,
          sizeBytes: file.size,
          originalFileName: file.name,
        },
      );

      setProgress("Envoi du fichier…");
      const upload = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("UPLOAD_FAILED");

      // La confirmation revérifie côté serveur que le fichier est bien arrivé
      // et que son contenu correspond au type annoncé.
      setProgress("Vérification…");
      await api.post(`/api/trainer-applications/me/documents/${ticket.documentId}/confirm`);

      toast.success(`${slot.label} déposée.`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "L'envoi a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const inputId = `doc-${slot.type}`;

  return (
    <div
      className={cn(
        "rounded-nk border-[1.5px] p-5",
        confirmed ? "border-brand-tint-2 bg-brand-tint/40" : rejected ? "border-danger/40 bg-danger-tint/40" : "border-line bg-card",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-bold">
            {confirmed ? <Check className="size-4 text-brand" aria-hidden="true" /> : null}
            {slot.label}
          </h3>
          <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-ink-2">{slot.help}</p>
        </div>
        {state ? <StPill tone={state.tone}>{state.label}</StPill> : null}
      </div>

      {current?.originalFileName ? (
        <p className="mt-3 truncate text-[12.5px] text-ink-3">{current.originalFileName}</p>
      ) : null}

      {rejected && current?.rejectionReason ? (
        <p className="mt-3 flex items-start gap-2 rounded-nk-sm bg-danger-tint px-3.5 py-2.5 text-[13px] leading-relaxed text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <b>Motif du refus :</b> {current.rejectionReason}
          </span>
        </p>
      ) : null}

      {editable ? (
        <div className="mt-4">
          <input
            ref={inputRef}
            type="file"
            id={inputId}
            accept={slot.accept}
            className="sr-only"
            disabled={!storageAvailable || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <Btn
            variant={confirmed || rejected ? "o" : "p"}
            size="sm"
            loading={pending}
            disabled={!storageAvailable}
            onClick={() => inputRef.current?.click()}
            aria-controls={inputId}
          >
            {confirmed || rejected ? (
              <RotateCcw aria-hidden="true" />
            ) : (
              <FileUp aria-hidden="true" />
            )}
            {rejected ? "Renvoyer la pièce" : confirmed ? "Remplacer" : "Déposer le fichier"}
          </Btn>
          <p className="mt-2 text-[12px] text-ink-3" aria-live="polite">
            {progress ?? slot.maxLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}
