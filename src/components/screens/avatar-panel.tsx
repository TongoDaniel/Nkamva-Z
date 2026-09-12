"use client";

import * as React from "react";
import { ImageUp, Trash2, Users } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { Hint } from "@/components/nk/hint";
import { UploadBar } from "@/components/nk/upload-bar";
import { toast } from "@/components/nk/toast";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { AVATAR_SIZE, formatBytes, shrinkAvatar } from "@/lib/image";
import { putToPresignedUrl, type UploadProgress } from "@/lib/upload";
import { cn } from "@/lib/utils";

/** Miroir de `AVATAR_LIMITS` dans src/lib/avatars.ts. Les deux restent alignés. */
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = 2_097_152;

/** Repli de `presignUpload()` quand R2 n'est pas configuré. */
const PLACEHOLDER_PREFIX = "data:placeholder-upload/";

/**
 * Dépôt d'une photo — la sienne, ou celle d'un groupe.
 * ==========================================================================
 * Un seul panneau pour les deux : la chaîne est la même à l'adresse près
 * (présignature, dépôt direct sur R2, confirmation qui enregistre la clé), et
 * deux copies auraient divergé au premier correctif. Ce qui change tient dans
 * les libellés et dans le repli — des initiales pour une personne, le glyphe de
 * groupe pour une communauté, exactement ce que la messagerie affiche.
 *
 * L'image est recadrée au carré et réduite à 512 px **avant** la présignature :
 * la taille annoncée doit être celle de l'objet réellement déposé, sinon le
 * quota est réservé sur l'original.
 * ==========================================================================
 */
export function AvatarPanel({
  endpoint,
  name,
  src,
  kind,
  title,
  about,
  storageNote,
}: {
  /** Base des trois appels : `POST`, `POST …/confirm`, `DELETE`. */
  endpoint: string;
  /** Ce qui nourrit les initiales du repli. */
  name: string;
  /** La photo en place, ou rien. */
  src: string | null;
  kind: "person" | "group";
  title: string;
  /**
   * Ce que le panneau explique — rendu **dans l'infobulle** du titre, plus en
   * sous-titre : nommé `about` pour que l'appelant sache où son texte atterrit.
   */
  about: React.ReactNode;
  /** Dit que l'image compte dans le quota — vrai pour un groupe seulement. */
  storageNote?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);

  const send = useAction(
    async (original: File) => {
      const { file, changed, originalBytes } = await shrinkAvatar(original);
      if (changed) {
        toast.info(
          `Photo recadrée à ${AVATAR_SIZE} px — ${formatBytes(originalBytes)} → ${formatBytes(file.size)}.`,
        );
      }

      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(endpoint, {
        mimeType: file.type,
        sizeBytes: file.size,
      });

      // Sans identifiants R2, le serveur renvoie une URL factice. Enregistrer
      // la clé donnerait une photo qui n'existe pas : mieux vaut le dire.
      // Levé plutôt que retourné — un retour vaudrait réussite.
      if (data.uploadUrl.startsWith(PLACEHOLDER_PREFIX)) {
        throw new ApiError(
          "STORAGE_NOT_CONFIGURED",
          "Stockage des fichiers non configuré : la photo n'a pas pu être envoyée.",
          0,
        );
      }

      // Dépôt direct sur R2, hors de `api` : pas de délai d'abandon.
      await putToPresignedUrl(data.uploadUrl, file, { onProgress: setProgress });

      // Le fichier est parti ; le serveur relit encore l'objet. La barre
      // redevient indéterminée.
      setProgress(null);

      await api.post(`${endpoint}/confirm`, { s3Key: data.s3Key, mimeType: file.type });
    },
    {
      success: "Photo mise à jour.",
      error: "L'envoi de la photo a échoué. Réessayez.",
    },
  );

  const remove = useAction(() => api.del(endpoint), {
    success: "Photo retirée.",
    error: "Le retrait a échoué. Réessayez.",
  });

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
      toast.error("La photo ne doit pas dépasser 2 Mo.");
      return;
    }
    void send.run(file);
  }

  const occupe = send.pending || remove.pending;
  const titleId = `nk-photo-${kind}`;

  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm"
    >
      <div className="flex items-center gap-1.5">
        <h2 id={titleId} className="text-[17px] font-bold">
          {title}
        </h2>
        {/* Où la photo apparaît, ce qu'elle devient à l'envoi, ce qui la
            remplace : trois phrases lues une fois, réunies derrière le ⓘ
            (arbitrage 138). Seule la contrainte de format reste écrite — elle
            évite un envoi refusé. */}
        <Hint label={`À quoi sert ${kind === "group" ? "la photo du groupe" : "votre photo"}`}>
          {about} La photo est recadrée au carré et réduite à {AVATAR_SIZE} px avant
          l&apos;envoi.{storageNote ? ` ${storageNote}` : ""} À défaut,{" "}
          {kind === "group" ? "un glyphe de groupe tient la place" : "vos initiales tiennent la place"}.
        </Hint>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {src ? (
          <Avatar name={name} src={src} size="lg" alt={`Photo de ${name}`} />
        ) : kind === "group" ? (
          // Le même repli que la liste des conversations : coin carré et
          // glyphe, là où une personne a un rond et ses initiales.
          <span
            className="grid size-16 shrink-0 place-items-center rounded-nk-sm bg-brand-tint text-brand"
            aria-hidden="true"
          >
            <Users className="size-7" />
          </span>
        ) : (
          <Avatar name={name} size="lg" alt={`Initiales de ${name}`} />
        )}

        <div className="flex flex-wrap gap-2.5">
          <input
            ref={inputRef}
            type="file"
            id={`${titleId}-fichier`}
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
            disabled={occupe}
            onClick={() => inputRef.current?.click()}
            aria-controls={`${titleId}-fichier`}
          >
            <ImageUp aria-hidden="true" />
            {src ? "Remplacer la photo" : "Ajouter une photo"}
          </Btn>
          {src ? (
            <Btn
              variant="o"
              size="sm"
              loading={remove.pending}
              disabled={occupe}
              className={cn("text-danger", "hover:border-danger")}
              onClick={() => void remove.run()}
            >
              <Trash2 aria-hidden="true" />
              Retirer
            </Btn>
          ) : null}
        </div>
      </div>

      {send.pending ? <UploadBar progress={progress} label="Envoi de la photo…" /> : null}

      <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
        PNG, JPEG ou WebP, 2 Mo maximum.
      </p>
    </section>
  );
}
