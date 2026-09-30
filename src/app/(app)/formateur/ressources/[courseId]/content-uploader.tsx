"use client";

import * as React from "react";
import { FileUp, CheckCircle2, Trash2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Hint } from "@/components/nk/hint";
import { toast } from "@/components/nk/toast";
import { UploadBar } from "@/components/nk/upload-bar";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { fmtBytes, fmtDuration } from "@/lib/format";
import { putToPresignedUrl, type UploadProgress } from "@/lib/upload";
import { LARGE_FILE_MAX_BYTES, PDF_MAX_BYTES, sizeLimitLabel } from "@/lib/rules";

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
    maxBytes: LARGE_FILE_MAX_BYTES,
    tooBig: `La vidéo ne doit pas dépasser ${sizeLimitLabel(LARGE_FILE_MAX_BYTES)}.`,
  },
  {
    kind: "pdf",
    mime: "application/pdf",
    exts: [".pdf"],
    maxBytes: PDF_MAX_BYTES,
    tooBig: `Le document ne doit pas dépasser ${sizeLimitLabel(PDF_MAX_BYTES)}.`,
  },
  {
    kind: "archive",
    mime: "application/zip",
    exts: [".zip"],
    maxBytes: LARGE_FILE_MAX_BYTES,
    tooBig: `L'archive ne doit pas dépasser ${sizeLimitLabel(LARGE_FILE_MAX_BYTES)}.`,
  },
  {
    kind: "archive",
    mime: "application/vnd.rar",
    exts: [".rar"],
    maxBytes: LARGE_FILE_MAX_BYTES,
    tooBig: `L'archive ne doit pas dépasser ${sizeLimitLabel(LARGE_FILE_MAX_BYTES)}.`,
  },
] as const;

/**
 * Miroir de `CONTENT_KIND_BY_FORMAT` : le genre de fichier qu'attend chaque
 * format annoncé (F3.9). Le serveur refuse désormais un dépôt qui contredit la
 * fiche — autant ne proposer que ce qui passera, plutôt que de laisser
 * quelqu'un envoyer deux gigaoctets pour un refus.
 */
const KIND_BY_FORMAT: Record<string, "video" | "pdf" | "archive"> = {
  video: "video",
  pdf: "pdf",
  kit: "archive",
  notion: "archive",
  tableur: "archive",
};

/** Le nom du fichier réellement déposé, lu sur son type MIME enregistré. */
const DEPOSE_LABELS: Record<string, string> = {
  "video/mp4": "Vidéo MP4",
  "application/pdf": "Document PDF",
  "application/zip": "Archive ZIP",
  "application/x-zip-compressed": "Archive ZIP",
  "application/vnd.rar": "Archive RAR",
  "application/x-rar-compressed": "Archive RAR",
};

/** Ce qu'on accepte pour un format donné, et comment on le dit. */
function typesFor(format: string) {
  const kind = KIND_BY_FORMAT[format];
  const types = kind ? CONTENT_TYPES.filter((t) => t.kind === kind) : CONTENT_TYPES;
  return types.length ? types : CONTENT_TYPES;
}

function contentTypeFor(file: File, types: readonly (typeof CONTENT_TYPES)[number][]) {
  const name = file.name.toLowerCase();
  return types.find((t) => t.exts.some((ext) => name.endsWith(ext))) ?? null;
}

/** « MP4 », « ZIP ou RAR » — la liste des extensions acceptées, en français. */
function extensionsLabel(types: readonly (typeof CONTENT_TYPES)[number][]) {
  const noms = [...new Set(types.flatMap((t) => t.exts))].map((e) => e.slice(1).toUpperCase());
  if (noms.length <= 1) return noms.join("");
  return `${noms.slice(0, -1).join(", ")} ou ${noms.at(-1)}`;
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
  format,
  currentKey,
  currentMimeType,
  durationSeconds,
  currentSizeBytes,
  remainingBytes,
  sold,
}: {
  courseId: string;
  /** Le format annoncé par la fiche : il décide du fichier attendu (F3.9). */
  format: string;
  currentKey: string | null;
  currentMimeType: string | null;
  /** Mesurée au dépôt, jamais saisie (F3.8). Nulle hors vidéo, ou illisible. */
  durationSeconds: number | null;
  currentSizeBytes: number | null;
  remainingBytes: number;
  /**
   * Ressource déjà achetée (arbitrage 13). Son contenu ne peut plus être
   * supprimé — il doit rester servi à ses acheteurs — et c'est précisément pour
   * cela qu'il ne pèse plus sur le quota du formateur.
   */
  sold: boolean;
}) {
  const types = typesFor(format);
  // Ce qui est déjà là, nommé d'après son type MIME enregistré.
  const depose = currentMimeType ? DEPOSE_LABELS[currentMimeType] ?? null : null;
  const attendu = extensionsLabel(types);
  const accept = types.flatMap((t) => t.exts).join(",");
  const inputRef = React.useRef<HTMLInputElement>(null);
  // `null` quand rien ne monte, ou pendant les phases de durée inconnue.
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);
  const [phase, setPhase] = React.useState("");

  const send = useAction(
    async (file: File, type: NonNullable<ReturnType<typeof contentTypeFor>>) => {
      setPhase("Préparation de l'envoi…");
      setProgress(null);
      const { data } = await api.post<{ uploadUrl: string; s3Key: string }>(
        `/api/trainer/courses/${courseId}/upload`,
        { mimeType: type.mime, sizeBytes: file.size, kind: type.kind },
      );

      // Levé plutôt que retourné : un retour vaudrait réussite, et l'écran
      // inviterait à publier une ressource dont le contenu n'est pas déposé.
      if (data.uploadUrl.startsWith(PLACEHOLDER_PREFIX)) {
        throw new ApiError(
          "STORAGE_NOT_CONFIGURED",
          "Stockage des fichiers non configuré : le contenu n'a pas pu être envoyé.",
          0,
        );
      }

      // Dépôt direct sur R2, hors de `api` : pas de délai d'abandon, une vidéo
      // sur un réseau lent ne doit pas être coupée à vingt secondes.
      setPhase("Envoi du fichier…");
      await putToPresignedUrl(data.uploadUrl, file, { onProgress: setProgress });

      // Le dernier octet est parti, mais le serveur relit encore l'objet et
      // vérifie son contenu : la barre redevient indéterminée plutôt que de
      // rester figée à 100 %.
      setPhase("Vérification du fichier…");
      setProgress(null);
      await api.post(`/api/trainer/courses/${courseId}/upload/confirm`, {
        s3Key: data.s3Key,
        kind: type.kind,
        mimeType: type.mime,
      });
    },
    {
      success: "Contenu enregistré. Vous pouvez publier la ressource.",
      error: "L'envoi du contenu a échoué. Réessayez.",
    },
  );

  /**
   * Arbitrage 18 — rendre les octets au quota. Ce geste n'existait pas : le
   * quota d'un formateur ne pouvait que croître depuis son inscription, et
   * l'écran des paliers lui conseillait pourtant de « libérer de l'espace ».
   */
  const remove = useAction(
    async () => {
      await api.del(`/api/trainer/courses/${courseId}/content`);
    },
    {
      success: "Contenu supprimé. L'espace est rendu à votre quota.",
      error: "La suppression a échoué. Réessayez.",
    },
  );

  // Confirmation en deux temps plutôt qu'un clic sec : le fichier part de R2 et
  // ne revient pas. Le dépôt n'a aucune primitive de confirmation — deux états
  // valent mieux qu'une modale inventée ici pour l'occasion.
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!remove.pending) setConfirming(false);
  }, [remove.pending]);

  // Le champ se vide une fois l'envoi retombé : sans cela, redéposer deux fois
  // le même fichier n'émettrait pas de second `change`.
  React.useEffect(() => {
    if (send.pending) return;
    setProgress(null);
    setPhase("");
    if (inputRef.current) inputRef.current.value = "";
  }, [send.pending]);

  function onFile(file: File) {
    const type = contentTypeFor(file, types);
    if (!type) {
      // Le message nomme ce que *cette* ressource attend, et non la liste de
      // tout ce que la plateforme sait recevoir : c'est la question que se pose
      // quelqu'un dont le dépôt vient d'être refusé.
      toast.error(`Cette ressource attend un fichier ${attendu}.`);
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
    void send.run(file, type);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Btn variant="o" loading={send.pending} onClick={() => inputRef.current?.click()}>
          <FileUp aria-hidden="true" />
          {currentKey ? "Remplacer le contenu" : "Déposer le contenu"}
        </Btn>
        {currentKey ? (
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {/* Le genre réellement déposé, et non celui qu'annonce la fiche :
                c'est le fichier qui décide, et le formateur doit pouvoir le
                lire sans le rouvrir (F3.9). */}
            {depose ? `${depose} en place` : "Contenu en place"}
            {currentSizeBytes ? (
              <span className="font-normal text-ink-3">· {fmtBytes(currentSizeBytes)}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-[13.5px] text-ink-2">
            Obligatoire avant publication — fichier {attendu}.
          </span>
        )}
      </div>

      {/*
        F3.8 — la durée mesurée, rendue au formateur. Il ne la saisit plus : il
        doit donc pouvoir vérifier ce qui a été lu, et comprendre qu'une durée
        absente ne l'empêche pas de publier.
      */}
      {currentKey && format === "video" ? (
        durationSeconds ? (
          <p className="text-[13px] text-ink-3">
            Durée mesurée sur votre fichier :{" "}
            <b className="font-semibold text-ink-2">{fmtDuration(durationSeconds)}</b>.
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-3">
            La durée n&apos;a pas pu être lue dans ce fichier. Ce n&apos;est pas bloquant : la
            ressource se publie, et sa fiche n&apos;annoncera simplement pas de durée.
          </p>
        )
      ) : null}
      {send.pending ? <UploadBar progress={progress} label={phase} className="mt-0" /> : null}

      {/*
        Arbitrage 18 — rendre les octets au quota. Sans ce geste, le stockage
        d'un formateur ne pouvait que croître : `archiveCourse` ne change qu'un
        statut, le fichier reste sur R2 et continue de lui être facturé.
      */}
      {currentKey && !sold ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="danger" loading={remove.pending} onClick={() => void remove.run()}>
              <Trash2 aria-hidden="true" />
              Confirmer la suppression
            </Btn>
            <button
              type="button"
              className="text-[13px] font-bold text-ink-2 underline"
              onClick={() => setConfirming(false)}
            >
              Annuler
            </button>
            <span className="text-[13px] text-ink-3">
              Le fichier sera définitivement effacé. La ressource repassera en brouillon.
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="self-start text-[13px] font-bold text-danger underline"
            onClick={() => setConfirming(true)}
          >
            Supprimer le contenu et libérer {currentSizeBytes ? fmtBytes(currentSizeBytes) : "l'espace"}
          </button>
        )
      ) : null}

      {/* Le fait — pourquoi le bouton de suppression a disparu — reste visible ;
          la règle qui l'explique tient dans le ⓘ. */}
      {currentKey && sold ? (
        <p className="flex items-center gap-1 text-[13px] leading-relaxed text-ink-3">
          Contenu verrouillé : cette ressource a déjà été achetée.
          <Hint label="Pourquoi ce contenu ne peut plus être supprimé">
            Son contenu doit rester accessible à ses acheteurs et ne peut plus être supprimé. En
            contrepartie, il ne compte plus dans votre quota de stockage.
          </Hint>
        </p>
      ) : null}

      <p className="text-[13px] text-ink-3">
        Stockage restant : {fmtBytes(remainingBytes)}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
    </div>
  );
}
