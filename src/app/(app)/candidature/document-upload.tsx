"use client";

import * as React from "react";
import { Check, FileUp, RotateCcw, TriangleAlert } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { StPill } from "@/components/nk/status-pill";
import { UploadBar } from "@/components/nk/upload-bar";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { putToPresignedUrl, sha256Hex, type UploadProgress } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { DOCUMENT_STATUS, type DocumentSlot } from "@/lib/trainer-document-slots";

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
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<string | null>(null);
  // Avancement chiffré de l'envoi, distinct du libellé d'étape ci-dessus.
  const [sent, setSent] = React.useState<UploadProgress | null>(null);

  const confirmed = current && ["PENDING", "RESUBMITTED", "APPROVED"].includes(current.status);
  const rejected = current?.status === "REJECTED";
  const state = current ? DOCUMENT_STATUS[current.status] : null;

  const send = useAction(
    async (file: File) => {
      setProgress("Préparation de l'envoi…");
      // L'empreinte est exigée par la présignature : sans elle la route répond
      // 400 et aucune pièce ne pouvait être déposée.
      const sha256 = await sha256Hex(file);
      const { data: ticket } = await api.post<{ documentId: string; uploadUrl: string }>(
        "/api/trainer-applications/me/documents/upload",
        {
          type: slot.type,
          mimeType: file.type,
          sizeBytes: file.size,
          sha256,
          originalFileName: file.name,
        },
      );

      setProgress("Envoi du fichier…");
      // Dépôt direct, hors de `api` : pas de délai d'abandon sur un gros
      // fichier parti sur un réseau lent.
      await putToPresignedUrl(ticket.uploadUrl, file, { onProgress: setSent });

      // La confirmation revérifie côté serveur que le fichier est bien arrivé
      // et que son contenu correspond au type annoncé.
      // Le dernier octet est parti : la barre redevient indéterminée le
      // temps que le serveur relise le fichier.
      setSent(null);
      setProgress("Vérification…");
      await api.post(`/api/trainer-applications/me/documents/${ticket.documentId}/confirm`);
    },
    {
      success: `${slot.label} déposée.`,
      error: "L'envoi a échoué. Réessayez.",
    },
  );

  // Repères d'étape et champ de fichier remis à zéro une fois l'envoi retombé.
  React.useEffect(() => {
    if (send.pending) return;
    setProgress(null);
    setSent(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [send.pending]);

  function onFile(file: File) {
    void send.run(file);
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
        <p className="mt-3 truncate text-[13px] text-ink-3">{current.originalFileName}</p>
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
            disabled={!storageAvailable || send.pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
          <Btn
            variant={confirmed || rejected ? "o" : "p"}
            size="sm"
            loading={send.pending}
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
          {send.pending ? (
            <UploadBar progress={sent} label={progress ?? "Envoi…"} />
          ) : (
            <p className="mt-2 text-[13px] text-ink-3">{slot.maxLabel}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
