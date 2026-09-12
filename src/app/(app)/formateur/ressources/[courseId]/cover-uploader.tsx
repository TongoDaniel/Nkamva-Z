"use client";

import * as React from "react";
import { ImageUp } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Hint } from "@/components/nk/hint";
import { toast } from "@/components/nk/toast";
import { UploadBar } from "@/components/nk/upload-bar";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { formatBytes, IMAGE_MAX_WIDTH, shrinkImage } from "@/lib/image";
import { putToPresignedUrl, type UploadProgress } from "@/lib/upload";

/** Miroir de COURSE_UPLOAD_LIMITS.image dans src/lib/courses.ts. */
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = 5_242_880;

/** Repli de presignUpload() quand R2 n'est pas configuré. */
const PLACEHOLDER_PREFIX = "data:placeholder-upload/";

export function CoverUploader({
  courseId,
  currentKey,
}: {
  courseId: string;
  currentKey: string | null;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);

  const send = useAction(
    async (original: File) => {
      // Réduction **avant** la présignature : la taille annoncée doit être celle
      // de l'objet réellement déposé, sinon le quota de stockage est réservé sur
      // les 5 Mo d'origine.
      const { file, changed, originalBytes } = await shrinkImage(original);
      if (changed) {
        toast.info(
          `Image réduite à ${IMAGE_MAX_WIDTH} px — ${formatBytes(originalBytes)} → ${formatBytes(file.size)}.`,
        );
      }

      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
        `/api/trainer/courses/${courseId}/upload`,
        { mimeType: file.type, sizeBytes: file.size, kind: "image" },
      );

      // Sans identifiants R2, le backend renvoie une URL factice. Enregistrer la
      // clé donnerait une couverture qui n'existe pas : mieux vaut le dire.
      // Levé plutôt que retourné — un retour vaudrait réussite, et l'écran
      // annoncerait une couverture qui n'a jamais été déposée.
      if (data.uploadUrl.startsWith(PLACEHOLDER_PREFIX)) {
        throw new ApiError(
          "STORAGE_NOT_CONFIGURED",
          "Stockage des fichiers non configuré : l'image n'a pas pu être envoyée.",
          0,
        );
      }

      // Dépôt direct sur R2, hors de `api` : pas de délai d'abandon, un gros
      // fichier sur un réseau lent ne doit pas être coupé à vingt secondes.
      await putToPresignedUrl(data.uploadUrl, file, { onProgress: setProgress });

      // Le fichier est parti ; le serveur relit encore l'objet pour en
      // mesurer la taille réelle. La barre redevient indéterminée.
      setProgress(null);

      // Confirmation plutôt que PATCH direct : c'est elle qui relit la taille
      // réelle de l'objet et alimente le quota de stockage.
      await api.post(`/api/trainer/courses/${courseId}/upload/confirm`, {
        s3Key: data.s3Key,
        kind: "image",
        mimeType: file.type,
      });
    },
    {
      success: "Couverture mise à jour.",
      error: "L'envoi de l'image a échoué. Réessayez.",
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
    if (!IMAGE_MIMES.includes(file.type)) {
      toast.error("Formats acceptés : PNG, JPEG, WebP.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error("L'image ne doit pas dépasser 5 Mo.");
      return;
    }
    void send.run(file);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        id="nk-cover"
        accept={IMAGE_MIMES.join(",")}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <Btn
        variant="o"
        size="sm"
        loading={send.pending}
        onClick={() => inputRef.current?.click()}
        aria-controls="nk-cover"
      >
        <ImageUp aria-hidden="true" />
        {currentKey ? "Remplacer la couverture" : "Ajouter une couverture"}
      </Btn>
      {send.pending ? (
        <UploadBar progress={progress} label="Envoi de la couverture…" />
      ) : null}
      {/* La contrainte reste à l'air libre — elle évite un envoi refusé —, le
          traitement qui suit passe derrière le ⓘ. */}
      <p className="mt-2 flex items-center gap-1 text-[13px] text-ink-3">
        PNG, JPEG ou WebP, 5 Mo maximum.
        <Hint label="Ce que devient l'image après l'envoi">
          L&apos;image est réduite à {IMAGE_MAX_WIDTH} px avant l&apos;envoi, ce qui allège aussi
          votre forfait. À défaut, une couverture est générée à partir de la catégorie et du
          format.
        </Hint>
      </p>
    </div>
  );
}
