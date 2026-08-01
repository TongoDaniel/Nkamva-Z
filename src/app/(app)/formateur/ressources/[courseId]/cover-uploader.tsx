"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

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
        `/api/trainer/courses/${courseId}/upload`,
        { mimeType: file.type, sizeBytes: file.size, kind: "image" },
      );

      // Sans identifiants R2, le backend renvoie une URL factice. Enregistrer la
      // clé donnerait une couverture qui n'existe pas : mieux vaut le dire.
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

      await api.patch(`/api/trainer/courses/${courseId}`, { coverS3Key: data.s3Key });
      toast.success("Couverture mise à jour.");
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
    <div>
      <input
        ref={inputRef}
        type="file"
        id="nk-cover"
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
        loading={pending}
        onClick={() => inputRef.current?.click()}
        aria-controls="nk-cover"
      >
        <ImageUp aria-hidden="true" />
        {currentKey ? "Remplacer la couverture" : "Ajouter une couverture"}
      </Btn>
      <p className="mt-2 text-[12.5px] text-ink-3">
        PNG, JPEG ou WebP, 5 Mo maximum. À défaut, une couverture est générée à partir de la
        catégorie et du format.
      </p>
    </div>
  );
}
