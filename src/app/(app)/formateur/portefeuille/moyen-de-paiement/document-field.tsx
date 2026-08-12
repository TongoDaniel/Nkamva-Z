"use client";

import * as React from "react";
import { Check, Paperclip, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { UploadBar } from "@/components/nk/upload-bar";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import {
  sha256Hex,
  putToPresignedUrl,
  PLACEHOLDER_UPLOAD_PREFIX,
  type UploadProgress,
} from "@/lib/upload";
import { cn } from "@/lib/utils";

/** Miroir de BUSINESS_DOC_ALLOWED_MIMES / BUSINESS_DOC_MAX_SIZE_BYTES. */
const ALLOWED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10_485_760;

export type DocumentKind = "BUSINESS_DOC" | "LEGAL_REP_PROOF";

/**
 * Un document d'entreprise : empreinte, présignature, dépôt direct sur R2,
 * puis remontée de la clé au formulaire. La clé n'a de valeur que rattachée
 * au moyen de paiement, ce que fait la création — tant qu'elle ne l'est pas,
 * elle expire d'elle-même au bout de 24 h.
 */
export function DocumentField({
  kind,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  kind: DocumentKind;
  label: string;
  hint: string;
  value: { s3Key: string; fileName: string } | null;
  onChange: (value: { s3Key: string; fileName: string } | null) => void;
  error?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);
  const id = React.useId();

  const send = useAction(
    async (file: File) => {
      const sha256 = await sha256Hex(file);
      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
        "/api/trainer/payout-methods/documents/upload",
        { kind, mimeType: file.type, sizeBytes: file.size, sha256 },
      );

      // Sans identifiants R2, le backend renvoie une URL factice. Garder la clé
      // donnerait un dossier qui paraît complet et ne l'est pas. Levé plutôt
      // que retourné : un retour vaudrait réussite.
      if (data.uploadUrl.startsWith(PLACEHOLDER_UPLOAD_PREFIX)) {
        throw new ApiError(
          "STORAGE_NOT_CONFIGURED",
          "Stockage des fichiers non configuré : le document n'a pas pu être envoyé.",
          0,
        );
      }

      await putToPresignedUrl(data.uploadUrl, file, { onProgress: setProgress });
      return { s3Key: data.s3Key, fileName: file.name };
    },
    {
      // Le document n'est pas encore enregistré : il remonte au formulaire, qui
      // l'enverra avec le reste. Rien à rafraîchir, rien à annoncer.
      success: null,
      error: null,
      refresh: false,
      onSuccess: (doc) => onChange(doc),
      onError: (err) =>
        setLocalError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error && err.message === "SUBTLE_CRYPTO_UNAVAILABLE"
              ? "Votre navigateur ne peut pas signer le fichier sur une connexion non sécurisée."
              : "L'envoi du document a échoué. Réessayez.",
        ),
    },
  );

  // Le champ se vide une fois l'envoi retombé : sans cela, redéposer deux fois
  // le même fichier n'émettrait pas de second `change`.
  React.useEffect(() => {
    if (send.pending) return;
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [send.pending]);

  function onFile(file: File) {
    setLocalError(null);

    if (!ALLOWED_MIMES.includes(file.type)) {
      setLocalError("Formats acceptés : PDF, PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Le document ne doit pas dépasser 10 Mo.");
      return;
    }
    void send.run(file);
  }

  // L'erreur du champ passe devant celle du formulaire : elle est toujours plus
  // récente, et elle décrit ce qui vient d'échouer plutôt que ce qui manquait à
  // la dernière soumission.
  const shown = localError ?? error;

  return (
    <div className="mb-[18px]">
      <p className="mb-1.5 text-[13.5px] font-bold text-ink">{label}</p>

      <input
        ref={inputRef}
        type="file"
        id={id}
        accept={ALLOWED_MIMES.join(",")}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />

      {value ? (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-brand/40 bg-brand-tint px-3.5 py-2.5">
          <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-brand-dark">
            {value.fileName}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-brand-dark hover:bg-brand/10"
            aria-label={`Retirer ${value.fileName}`}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </p>
      ) : (
        <Btn
          variant="o"
          size="sm"
          loading={send.pending}
          onClick={() => inputRef.current?.click()}
          aria-controls={id}
          className={cn(shown && "border-danger text-danger")}
        >
          <Paperclip aria-hidden="true" />
          Choisir un fichier
        </Btn>
      )}

      {send.pending ? (
        <UploadBar progress={progress} label="Envoi du document…" />
      ) : null}
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{hint}</p>
      {shown ? <p className="mt-1.5 text-[12.5px] font-semibold text-danger">{shown}</p> : null}
    </div>
  );
}
