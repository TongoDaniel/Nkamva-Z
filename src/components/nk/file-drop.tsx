"use client";

import * as React from "react";
import { CreditCard, FileCheck2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zone de dépôt d'un document — port du `<label>` à bordure pointillée du
 * wizard « Devenir formateur ».
 *
 * Le champ reste un `<input type="file">` natif enveloppé dans un `<label>` :
 * le clic, le focus clavier et la validation `required` du navigateur
 * fonctionnent sans code, et le glisser-déposer vient en supplément.
 */
/** Taille lisible : un justificatif de 40 Ko ne doit pas s'afficher « 0.0 Mo ». */
function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function FileDrop({
  id,
  label,
  hint,
  accept = "image/*,.pdf",
  maxBytes = 10 * 1024 * 1024,
  tone = "brand",
  required,
  onFileChange,
}: {
  id: string;
  label: string;
  /** Précision affichée sous le titre (formats, taille). */
  hint: string;
  accept?: string;
  maxBytes?: number;
  tone?: "brand" | "info";
  required?: boolean;
  onFileChange?: (file: File | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const accepts = React.useCallback(
    (candidate: File) => {
      if (candidate.size > maxBytes) {
        return `Fichier trop lourd : ${Math.round(maxBytes / 1024 / 1024)} Mo maximum.`;
      }
      return null;
    },
    [maxBytes],
  );

  function apply(next: File | null) {
    if (next) {
      const issue = accepts(next);
      if (issue) {
        setError(issue);
        return;
      }
    }
    setError(null);
    setFile(next);
    onFileChange?.(next);
  }

  const Icon = tone === "info" ? CreditCard : Upload;

  return (
    <div className="mb-4.5">
      <p className="mb-1.5 text-[13.5px] font-bold text-ink">{label}</p>

      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          apply(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed bg-card px-4 py-3.5 transition-colors",
          dragging ? "border-brand bg-brand-tint/40" : "border-line hover:border-ink-3",
          error && "border-danger",
          "focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-shadow)]",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          required={required && !file}
          className="sr-only"
          onChange={(e) => apply(e.target.files?.[0] ?? null)}
        />
        <span
          aria-hidden="true"
          className={cn(
            "grid size-9 flex-none place-items-center rounded-[10px]",
            file
              ? "bg-brand-tint text-brand"
              : tone === "info"
                ? "bg-info-tint text-info"
                : "bg-brand-tint text-brand",
          )}
        >
          {file ? <FileCheck2 className="size-[18px]" /> : <Icon className="size-[18px]" />}
        </span>
        <span className="min-w-0 flex-1 text-[13.5px] text-ink-2">
          <b className="block truncate text-sm text-ink">
            {file ? file.name : "Déposer un fichier ou cliquer"}
          </b>
          {file ? fmtFileSize(file.size) : hint}
        </span>
        {file ? (
          <button
            type="button"
            aria-label={`Retirer le fichier ${file.name}`}
            onClick={(e) => {
              e.preventDefault();
              if (inputRef.current) inputRef.current.value = "";
              apply(null);
            }}
            className="grid size-7 flex-none cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-line-2 hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
