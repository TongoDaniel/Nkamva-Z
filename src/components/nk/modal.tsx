"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modale — port de `.adm-modal` / `.ac-modal`.
 * Bâtie sur Radix Dialog : piège de focus, restitution du focus à la fermeture,
 * Échap, `aria-modal` et inertage de l'arrière-plan sont pris en charge.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  trigger?: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-200 bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-200 max-h-[88vh] w-[calc(100vw-2.5rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
            "rounded-nk-lg bg-card p-7 shadow-nk-lg outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            size === "sm" && "max-w-[380px]",
            size === "md" && "max-w-[440px]",
            size === "lg" && "max-w-[640px]",
          )}
        >
          <Dialog.Title className="mb-1.5 pr-8 text-[19px] font-bold">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mb-5 text-[13.5px] text-ink-2">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
          {footer ? <div className="mt-5 flex flex-col gap-2.5">{footer}</div> : null}
          <Dialog.Close
            aria-label="Fermer"
            className="absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-full border border-line bg-card text-ink-2 hover:text-ink"
          >
            <X className="size-[15px]" aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Ligne clé/valeur d'un récapitulatif de modale (`.ac-rows .rm`). */
export function ModalRows({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="mb-5 flex flex-col gap-2.5 rounded-[14px] bg-paper px-4 py-3.5">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3 text-[13.5px]">
          <dt className="text-ink-2">{r.label}</dt>
          <dd className="font-bold">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
