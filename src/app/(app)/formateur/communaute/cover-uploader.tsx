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
import { COVER_IMAGE_MAX_BYTES, sizeLimitLabel } from "@/lib/rules";

/** Miroir de COMMUNITY_COVER_LIMITS dans src/lib/communities.ts. */
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = COVER_IMAGE_MAX_BYTES;

/** Repli de presignUpload() quand R2 n'est pas configuré. */
const PLACEHOLDER_PREFIX = "data:placeholder-upload/";

/**
 * Bannière de la communauté — même chaîne que la couverture d'un cours :
 * présignature, dépôt direct sur R2, puis confirmation. C'est la confirmation
 * qui enregistre la clé et relit la taille réelle pour le quota de stockage.
 */
export function CommunityCoverUploader({
  communityId,
  currentKey,
  previewUrl,
}: {
  communityId: string;
  currentKey: string | null;
  /** URL signée de la bannière déjà en place, pour l'aperçu. */
  previewUrl: string | null;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);

  const send = useAction(
    async (original: File) => {
      // Réduction **avant** la présignature : la taille annoncée doit être celle
      // de l'objet réellement déposé, sinon le quota est réservé sur l'original.
      const { file, changed, originalBytes } = await shrinkImage(original);
      if (changed) {
        toast.info(
          `Image réduite à ${IMAGE_MAX_WIDTH} px — ${formatBytes(originalBytes)} → ${formatBytes(file.size)}.`,
        );
      }

      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
        `/api/trainer/communities/${communityId}/cover`,
        { mimeType: file.type, sizeBytes: file.size },
      );

      // Sans identifiants R2, le backend renvoie une URL factice. Enregistrer
      // la clé donnerait une bannière qui n'existe pas : mieux vaut le dire.
      // Levé plutôt que retourné — un retour vaudrait réussite.
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

      await api.post(`/api/trainer/communities/${communityId}/cover/confirm`, {
        s3Key: data.s3Key,
        mimeType: file.type,
      });
    },
    {
      success: "Bannière mise à jour.",
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
      toast.error(`L'image ne doit pas dépasser ${sizeLimitLabel(IMAGE_MAX_BYTES)}.`);
      return;
    }
    void send.run(file);
  }

  return (
    <section
      aria-labelledby="nk-banniere"
      className="mt-6 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm"
    >
      <h2 id="nk-banniere" className="text-[17px] font-bold">
        Bannière
      </h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
        L&apos;image en tête de votre communauté, dans l&apos;annuaire comme sur sa fiche.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        {previewUrl ? (
          // Une URL signée expire : `img` plutôt que `next/image`, qui la
          // mettrait en cache sous une clé qui lui survivrait.
          <img
            src={previewUrl}
            alt="Bannière actuelle de votre communauté"
            className="h-[140px] w-full object-cover"
          />
        ) : (
          <div
            className="h-[140px] w-full bg-gradient-to-br from-navy to-info"
            aria-hidden="true"
          />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        id="nk-banniere-fichier"
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
        className="mt-4"
        loading={send.pending}
        onClick={() => inputRef.current?.click()}
        aria-controls="nk-banniere-fichier"
      >
        <ImageUp aria-hidden="true" />
        {currentKey ? "Remplacer la bannière" : "Ajouter une bannière"}
      </Btn>
      {send.pending ? (
        <UploadBar progress={progress} label="Envoi de la bannière…" />
      ) : null}
      {/* Même partage que pour la couverture d'une ressource : la contrainte
          reste lisible, le traitement passe derrière le ⓘ. */}
      <p className="mt-2 flex items-center gap-1 text-[13px] text-ink-3">
        PNG, JPEG ou WebP, {sizeLimitLabel(IMAGE_MAX_BYTES)} maximum.
        <Hint label="Ce que devient l'image après l'envoi">
          L&apos;image est réduite à {IMAGE_MAX_WIDTH} px avant l&apos;envoi. Elle compte dans
          votre stockage. À défaut, un dégradé est affiché.
        </Hint>
      </p>
    </section>
  );
}
