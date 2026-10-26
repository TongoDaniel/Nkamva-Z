"use client";

import * as React from "react";
import { Check, CircleAlert, FileUp, RotateCcw, TriangleAlert } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { StPill } from "@/components/nk/status-pill";
import { UploadBar } from "@/components/nk/upload-bar";
import { api, ApiError } from "@/lib/client";
import { DOCUMENT_SLOTS, type DocumentSlot } from "@/lib/trainer-document-slots";
import { putToPresignedUrl, sha256Hex, type UploadProgress } from "@/lib/upload";
import { cn } from "@/lib/utils";

/**
 * Ce que le wizard sait d'une pièce, sans interroger le serveur.
 *
 * Le parcours connecté relit son dossier après chaque dépôt (`router.refresh`).
 * Ici on ne peut pas : le dossier vient d'être créé par le navigateur, la page
 * serveur ne le connaît pas, et un rafraîchissement la ferait rediriger vers
 * `/candidature` au milieu de la saisie. L'état vit donc dans le composant, et
 * la vérité serveur est reprise à l'envoi — `submitApplication` refuse un
 * dossier dont une pièce manque, quoi que cet écran ait cru.
 */
export interface SlotState {
  uploaded: boolean;
  fileName: string | null;
  error: string | null;
}

export const EMPTY_SLOTS: Record<string, SlotState> = {};

function SlotRow({
  slot,
  state,
  disabled,
  onUploaded,
  onFailed,
}: {
  slot: DocumentSlot;
  state: SlotState | undefined;
  disabled: boolean;
  onUploaded: (fileName: string) => void;
  onFailed: (message: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [phase, setPhase] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<UploadProgress | null>(null);

  const done = state?.uploaded ?? false;

  async function send(file: File) {
    // Refusé avant tout appel réseau : inutile de faire monter deux gigaoctets
    // pour se voir opposer le plafond à l'arrivée.
    if (file.size > slot.maxBytes) {
      onFailed(`Fichier trop lourd : ${slot.maxLabel}`);
      return;
    }

    setPending(true);
    try {
      setPhase("Préparation de l'envoi…");
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

      setPhase("Envoi du fichier…");
      // Dépôt direct vers R2, hors de `api` : pas de délai d'abandon sur un
      // gros fichier parti sur un réseau lent.
      await putToPresignedUrl(ticket.uploadUrl, file, { onProgress: setSent });

      // Le dernier octet est parti ; le serveur relit l'objet et vérifie que
      // son contenu correspond au type annoncé. Durée imprévisible : la barre
      // redevient indéterminée plutôt que de rester figée à 100 %.
      setSent(null);
      setPhase("Vérification…");
      await api.post(`/api/trainer-applications/me/documents/${ticket.documentId}/confirm`);

      onUploaded(file.name);
    } catch (err) {
      onFailed(
        err instanceof ApiError
          ? err.message
          : err instanceof Error && err.message === "SUBTLE_CRYPTO_UNAVAILABLE"
            ? "Votre navigateur ne peut pas signer le fichier sur une connexion non sécurisée."
            : "L'envoi a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
      setPhase(null);
      setSent(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const inputId = `signup-doc-${slot.type}`;

  return (
    <div
      className={cn(
        "mb-3.5 rounded-nk border-[1.5px] p-4.5",
        done
          ? "border-brand-tint-2 bg-brand-tint/40"
          : state?.error
            ? "border-danger/40 bg-danger-tint/40"
            : "border-line bg-card",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
            {done ? <Check className="size-4 text-brand" aria-hidden="true" /> : null}
            {slot.label}
          </h3>
          <p className="mt-1 max-w-[48ch] text-[13px] leading-relaxed text-ink-2">{slot.help}</p>
        </div>
        {done ? <StPill tone="info">Déposée</StPill> : null}
      </div>

      {state?.fileName ? (
        <p className="mt-2.5 truncate text-[13px] text-ink-3">{state.fileName}</p>
      ) : null}

      {state?.error ? (
        <p
          role="alert"
          className="mt-2.5 flex items-start gap-2 rounded-nk-sm bg-danger-tint px-3.5 py-2.5 text-[13px] leading-relaxed font-semibold text-danger"
        >
          <CircleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </p>
      ) : null}

      <div className="mt-3.5">
        <input
          ref={inputRef}
          type="file"
          id={inputId}
          accept={slot.accept}
          className="sr-only"
          disabled={disabled || pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <Btn
          variant={done ? "o" : "p"}
          size="sm"
          type="button"
          loading={pending}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          aria-controls={inputId}
        >
          {done ? <RotateCcw aria-hidden="true" /> : <FileUp aria-hidden="true" />}
          {done ? "Remplacer" : "Déposer le fichier"}
        </Btn>
        {pending ? (
          <UploadBar progress={sent} label={phase ?? "Envoi…"} />
        ) : (
          <p className="mt-2 text-[13px] text-ink-3">{slot.maxLabel}</p>
        )}
      </div>
    </div>
  );
}

/** Les trois pièces obligatoires, déposées une à une pendant la candidature. */
export function WizardDocuments({
  slots,
  storageAvailable,
  onChange,
}: {
  slots: Record<string, SlotState>;
  storageAvailable: boolean;
  onChange: (type: string, next: SlotState) => void;
}) {
  return (
    <>
      {!storageAvailable ? (
        <p className="mb-4 flex items-start gap-2.5 rounded-nk bg-gold-tint px-4 py-3.5 text-[13px] leading-relaxed text-gold-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Le stockage des fichiers n&apos;est pas configuré sur cet environnement : le dépôt de
            pièces est indisponible. Votre présentation, elle, est bien enregistrée : reprenez
            depuis <b>Ma candidature</b> une fois le stockage en place.
          </span>
        </p>
      ) : null}

      {DOCUMENT_SLOTS.map((slot) => (
        <SlotRow
          key={slot.type}
          slot={slot}
          state={slots[slot.type]}
          disabled={!storageAvailable}
          onUploaded={(fileName) => onChange(slot.type, { uploaded: true, fileName, error: null })}
          onFailed={(message) =>
            onChange(slot.type, {
              uploaded: slots[slot.type]?.uploaded ?? false,
              fileName: slots[slot.type]?.fileName ?? null,
              error: message,
            })
          }
        />
      ))}
    </>
  );
}
