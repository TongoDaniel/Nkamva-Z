"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, CheckCircle2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

/** Miroir de COURSE_UPLOAD_LIMITS dans src/lib/courses.ts. */
const KIND_BY_MIME: Record<string, "video" | "pdf"> = {
  "video/mp4": "video",
  "application/pdf": "pdf",
};
const MAX_BYTES: Record<"video" | "pdf", number> = {
  video: 2_147_483_648,
  pdf: 10_485_760,
};

/** Repli de presignUpload() quand R2 n'est pas configuré. */
const PLACEHOLDER_PREFIX = "data:placeholder-upload/";

function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} Go`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

/**
 * Dépôt du contenu réellement vendu. Il n'existait aucun écran pour ça : la
 * route d'upload acceptait `video` et `pdf`, mais rien ne l'appelait jamais
 * avec autre chose qu'une image de couverture.
 */
export function ContentUploader({
  courseId,
  currentKey,
  currentSizeBytes,
  remainingBytes,
}: {
  courseId: string;
  currentKey: string | null;
  currentSizeBytes: number | null;
  remainingBytes: number;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);

  async function onFile(file: File) {
    const kind = KIND_BY_MIME[file.type];
    if (!kind) {
      toast.error("Formats acceptés : MP4 pour une vidéo, PDF pour un document.");
      return;
    }
    if (file.size > MAX_BYTES[kind]) {
      toast.error(
        kind === "video"
          ? "La vidéo ne doit pas dépasser 2 Go."
          : "Le document ne doit pas dépasser 10 Mo.",
      );
      return;
    }
    // Contrôle local avant de présigner : inutile de faire patienter quelqu'un
    // sur un envoi que le serveur refusera.
    if (file.size > remainingBytes) {
      toast.error(
        `Il vous reste ${humanSize(remainingBytes)} de stockage. Ce fichier en demande ${humanSize(file.size)}.`,
      );
      return;
    }

    setPending(true);
    try {
      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
        `/api/trainer/courses/${courseId}/upload`,
        { mimeType: file.type, sizeBytes: file.size, kind },
      );

      if (data.uploadUrl.startsWith(PLACEHOLDER_PREFIX)) {
        toast.error("Stockage des fichiers non configuré : le contenu n'a pas pu être envoyé.");
        return;
      }

      const upload = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("UPLOAD_FAILED");

      await api.post(`/api/trainer/courses/${courseId}/upload/confirm`, {
        s3Key: data.s3Key,
        kind,
        mimeType: file.type,
      });
      toast.success("Contenu enregistré. Vous pouvez publier la ressource.");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "L'envoi du contenu a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Btn variant="o" loading={pending} onClick={() => inputRef.current?.click()}>
          <FileUp aria-hidden="true" />
          {currentKey ? "Remplacer le contenu" : "Déposer le contenu"}
        </Btn>
        {currentKey ? (
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Contenu en place
            {currentSizeBytes ? (
              <span className="font-normal text-ink-3">· {humanSize(currentSizeBytes)}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-[13.5px] text-ink-2">
            Obligatoire avant publication — MP4 ou PDF.
          </span>
        )}
      </div>
      <p className="text-[12.5px] text-ink-3">
        Stockage restant : {humanSize(remainingBytes)}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
    </div>
  );
}
