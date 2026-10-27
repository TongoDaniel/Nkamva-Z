"use client";

import * as React from "react";
import { FileCheck2, Paperclip, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { api, ApiError } from "@/lib/client";
import {
  sha256Hex,
  putToPresignedUrl,
  PLACEHOLDER_UPLOAD_PREFIX,
  type UploadProgress,
} from "@/lib/upload";
import { UploadBar } from "@/components/nk/upload-bar";
import { cn } from "@/lib/utils";
import { ATTACHMENT_MAX_SIZE_BYTES, sizeLimitLabel } from "@/lib/rules";

/**
 * Pièces jointes d'un litige — le maillon qui manquait.
 *
 * `POST /api/me/disputes/attachments/upload`, `presignDisputeAttachment()`,
 * `PendingAttachment` et le job `PENDING_ATTACHMENT_CLEANUP` existaient depuis
 * le Lot 2 ; rien dans l'interface ne les appelait. L'apprenant pouvait ouvrir
 * un litige et y répondre, jamais y joindre une capture — et le job nettoyait
 * consciencieusement des pièces que personne ne pouvait déposer.
 *
 * Déroulé, en trois temps, et l'ordre compte : l'empreinte est calculée **avant**
 * la présignature, parce que c'est elle qui est signée. Le serveur ne voit jamais
 * l'octet — le fichier part directement du navigateur vers le stockage objet.
 *
 *   1. `sha256Hex(file)` dans le navigateur ;
 *   2. `POST …/attachments/upload` → URL présignée + clé S3 ;
 *   3. `PUT` du fichier sur l'URL présignée.
 *
 * La clé remonte au formulaire, qui l'envoie à la création du litige ou du
 * message. Tant qu'elle n'est pas rattachée, elle expire d'elle-même
 * (`ATTACHMENT_TTL_HOURS`) : une pièce déposée puis abandonnée ne traîne pas.
 */

/** Miroir de `ATTACHMENT_ALLOWED_MIMES` / `ATTACHMENT_MAX_SIZE_BYTES`. */
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_BYTES = ATTACHMENT_MAX_SIZE_BYTES;
/** Miroir du `.max(5)` des deux routes qui consomment les clés. */
export const MAX_ATTACHMENTS = 5;

export interface Attachment {
  s3Key: string;
  fileName: string;
  sizeBytes: number;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function AttachmentPicker({
  value,
  onChange,
  /** Rattache la pièce au litige en cours. Absent à l'ouverture : il n'existe pas encore. */
  disputeId,
  className,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  disputeId?: string;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Le lot part pièce par pièce : on dit laquelle monte, et où elle en est.
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);
  const [current, setCurrent] = React.useState("");
  const inputId = React.useId();

  const remaining = MAX_ATTACHMENTS - value.length;

  async function upload(files: File[]) {
    setError(null);

    // Le lot est refusé en entier plutôt que tronqué en silence : déposer six
    // captures et n'en voir arriver que cinq se remarque trop tard.
    if (files.length > remaining) {
      setError(
        remaining === 0
          ? `Cinq pièces au maximum : retirez-en une avant d'en ajouter.`
          : `Encore ${remaining} pièce${remaining > 1 ? "s" : ""} possible${remaining > 1 ? "s" : ""}.`,
      );
      return;
    }
    for (const file of files) {
      if (!ALLOWED_MIMES.includes(file.type)) {
        setError(`« ${file.name} » : formats acceptés — PNG, JPEG, WebP ou PDF.`);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`« ${file.name} » dépasse ${sizeLimitLabel(MAX_BYTES)}.`);
        return;
      }
    }

    setPending(true);
    const added: Attachment[] = [];
    try {
      for (const [index, file] of files.entries()) {
        const rang = files.length > 1 ? ` (${index + 1} sur ${files.length})` : "";
        setCurrent(`${file.name}${rang}`);
        setProgress(null);
        const sha256 = await sha256Hex(file);
        const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
          "/api/me/disputes/attachments/upload",
          {
            mimeType: file.type,
            sizeBytes: file.size,
            sha256,
            ...(disputeId ? { disputeId } : {}),
          },
        );

        // Sans identifiants de stockage, le serveur rend une URL factice. Garder
        // la clé donnerait un dossier qui paraît complet et ne l'est pas : c'est
        // exactement le repli silencieux qui a fait croire pendant des semaines
        // que le stockage fonctionnait.
        if (data.uploadUrl.startsWith(PLACEHOLDER_UPLOAD_PREFIX)) {
          setError("Stockage des fichiers non configuré : la pièce n'a pas pu être envoyée.");
          return;
        }

        await putToPresignedUrl(data.uploadUrl, file, { onProgress: setProgress });
        setProgress(null);
        added.push({ s3Key: data.s3Key, fileName: file.name, sizeBytes: file.size });
      }
      onChange([...value, ...added]);
    } catch (err) {
      // Ce qui a réussi avant l'échec est conservé : refaire trois dépôts parce
      // que le quatrième a échoué serait une punition sans motif.
      if (added.length) onChange([...value, ...added]);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error && err.message === "SUBTLE_CRYPTO_UNAVAILABLE"
            ? "Votre navigateur ne peut pas signer le fichier sur une connexion non sécurisée."
            : "L'envoi de la pièce a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
      setProgress(null);
      setCurrent("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("mb-[18px]", className)}>
      <p className="mb-1.5 text-[13.5px] font-bold text-ink">
        Pièces jointes <span className="font-medium text-ink-3">(facultatif)</span>
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ALLOWED_MIMES.join(",")}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) void upload(files);
        }}
      />

      {value.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-1.5">
          {value.map((attachment) => (
            <li
              key={attachment.s3Key}
              className="flex items-center gap-2 rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2"
            >
              <FileCheck2 className="size-4 shrink-0 text-brand" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand-dark">
                {attachment.fileName}
              </span>
              <span className="shrink-0 text-[13px] text-brand-dark/70">
                {fmtSize(attachment.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((a) => a.s3Key !== attachment.s3Key))}
                aria-label={`Retirer ${attachment.fileName}`}
                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-lg text-brand-dark hover:bg-brand/10"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {remaining > 0 ? (
        <Btn
          type="button"
          variant="o"
          size="sm"
          loading={pending}
          onClick={() => inputRef.current?.click()}
          aria-controls={inputId}
          className={cn(error && "border-danger text-danger")}
        >
          <Paperclip aria-hidden="true" />
          {value.length === 0 ? "Joindre un fichier" : "Ajouter"}
        </Btn>
      ) : null}

      {pending ? <UploadBar progress={progress} label={current || "Envoi…"} /> : null}

      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        PNG, JPEG, WebP ou PDF · {sizeLimitLabel(MAX_BYTES)} par fichier · {MAX_ATTACHMENTS} au maximum. Elles ne sont
        lues que par le support.
      </p>
      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
