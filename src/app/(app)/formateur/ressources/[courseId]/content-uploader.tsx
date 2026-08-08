"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, CheckCircle2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { fmtBytes } from "@/lib/format";

/**
 * Miroir de COURSE_UPLOAD_LIMITS dans src/lib/courses.ts.
 *
 * `mime` est le type **canonique** : c'est lui qui part à la présignature *et*
 * en en-tête du PUT, les deux devant coïncider pour que la signature couvre
 * l'envoi. Il ne peut donc pas être `file.type`, que Windows rend en
 * `application/x-zip-compressed` pour un .zip et laisse **vide** pour un .rar
 * sans logiciel associé — d'où la reconnaissance par extension.
 */
const CONTENT_TYPES = [
  {
    kind: "video",
    mime: "video/mp4",
    exts: [".mp4"],
    maxBytes: 2_147_483_648,
    tooBig: "La vidéo ne doit pas dépasser 2 Go.",
  },
  {
    kind: "pdf",
    mime: "application/pdf",
    exts: [".pdf"],
    maxBytes: 10_485_760,
    tooBig: "Le document ne doit pas dépasser 10 Mo.",
  },
  {
    kind: "archive",
    mime: "application/zip",
    exts: [".zip"],
    maxBytes: 2_147_483_648,
    tooBig: "L'archive ne doit pas dépasser 2 Go.",
  },
  {
    kind: "archive",
    mime: "application/vnd.rar",
    exts: [".rar"],
    maxBytes: 2_147_483_648,
    tooBig: "L'archive ne doit pas dépasser 2 Go.",
  },
] as const;

/** Filtre du sélecteur : par extension, pour la même raison. */
const ACCEPT = CONTENT_TYPES.flatMap((t) => t.exts).join(",");

function contentTypeFor(file: File) {
  const name = file.name.toLowerCase();
  return CONTENT_TYPES.find((t) => t.exts.some((ext) => name.endsWith(ext))) ?? null;
}

/** Repli de presignUpload() quand R2 n'est pas configuré. */
const PLACEHOLDER_PREFIX = "data:placeholder-upload/";

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
    const type = contentTypeFor(file);
    if (!type) {
      toast.error("Formats acceptés : MP4, PDF, ZIP ou RAR.");
      return;
    }
    if (file.size > type.maxBytes) {
      toast.error(type.tooBig);
      return;
    }
    // Contrôle local avant de présigner : inutile de faire patienter quelqu'un
    // sur un envoi que le serveur refusera.
    if (file.size > remainingBytes) {
      toast.error(
        `Il vous reste ${fmtBytes(remainingBytes)} de stockage. Ce fichier en demande ${fmtBytes(file.size)}.`,
      );
      return;
    }

    setPending(true);
    try {
      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
        `/api/trainer/courses/${courseId}/upload`,
        { mimeType: type.mime, sizeBytes: file.size, kind: type.kind },
      );

      if (data.uploadUrl.startsWith(PLACEHOLDER_PREFIX)) {
        toast.error("Stockage des fichiers non configuré : le contenu n'a pas pu être envoyé.");
        return;
      }

      const upload = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": type.mime },
        body: file,
      });
      if (!upload.ok) throw new Error("UPLOAD_FAILED");

      await api.post(`/api/trainer/courses/${courseId}/upload/confirm`, {
        s3Key: data.s3Key,
        kind: type.kind,
        mimeType: type.mime,
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
              <span className="font-normal text-ink-3">· {fmtBytes(currentSizeBytes)}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-[13.5px] text-ink-2">
            Obligatoire avant publication — MP4, PDF, ZIP ou RAR.
          </span>
        )}
      </div>
      <p className="text-[12.5px] text-ink-3">
        Stockage restant : {fmtBytes(remainingBytes)}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
    </div>
  );
}
