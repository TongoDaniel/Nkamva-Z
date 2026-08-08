"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

/** Miroir de COMMUNITY_COVER_LIMITS dans src/lib/communities.ts. */
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = 5_242_880;

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
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);

  async function onFile(file: File) {
    if (!IMAGE_MIMES.includes(file.type)) {
      toast.error("Formats acceptés : PNG, JPEG, WebP.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error("L'image ne doit pas dépasser 5 Mo.");
      return;
    }

    setPending(true);
    try {
      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
        `/api/trainer/communities/${communityId}/cover`,
        { mimeType: file.type, sizeBytes: file.size },
      );

      // Sans identifiants R2, le backend renvoie une URL factice. Enregistrer
      // la clé donnerait une bannière qui n'existe pas : mieux vaut le dire.
      if (data.uploadUrl.startsWith(PLACEHOLDER_PREFIX)) {
        toast.error("Stockage des fichiers non configuré : l'image n'a pas pu être envoyée.");
        return;
      }

      const upload = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("UPLOAD_FAILED");

      await api.post(`/api/trainer/communities/${communityId}/cover/confirm`, {
        s3Key: data.s3Key,
        mimeType: file.type,
      });
      toast.success("Bannière mise à jour.");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "L'envoi de l'image a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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
          if (file) void onFile(file);
        }}
      />
      <Btn
        variant="o"
        size="sm"
        className="mt-4"
        loading={pending}
        onClick={() => inputRef.current?.click()}
        aria-controls="nk-banniere-fichier"
      >
        <ImageUp aria-hidden="true" />
        {currentKey ? "Remplacer la bannière" : "Ajouter une bannière"}
      </Btn>
      <p className="mt-2 text-[12.5px] text-ink-3">
        PNG, JPEG ou WebP, 5 Mo maximum. Elle compte dans votre stockage. À défaut, un dégradé
        est affiché.
      </p>
    </section>
  );
}
