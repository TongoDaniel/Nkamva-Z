import * as React from "react";
import { cn } from "@/lib/utils";

/** Carte de réglages — port de `.setcard`. */
export function SettingCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        // Resserré sur téléphone : `p-6` posait 24 px de marge de chaque côté
        // d'un écran de 375, pour une carte qui n'aligne que des lignes de
        // réglage. La respiration revient dès `sm`.
        "mb-4 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:mb-5 sm:p-6 lg:p-7",
        className,
      )}
    >
      <h2 className="text-[16px] font-extrabold sm:text-[17px]">{title}</h2>
      {subtitle ? (
        <p className="mb-4 mt-1.5 text-[13.5px] leading-relaxed text-ink-2 sm:mb-5 sm:text-[14px]">
          {subtitle}
        </p>
      ) : (
        <div className="mb-4 sm:mb-5" />
      )}
      {children}
      {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2.5">{footer}</div> : null}
    </section>
  );
}

/** Ligne « intitulé + action » d'une carte de réglages (`.secrow`). */
export function SettingRow({
  title,
  description,
  action,
  danger,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 py-3.5 first:border-t-0 first:pt-0 sm:gap-4 sm:py-4">
      <div className="min-w-0 flex-1">
        <b className={cn("block text-[14.5px]", danger && "text-danger")}>{title}</b>
        {description ? (
          <small className="mt-0.5 block max-w-[52ch] text-[13px] leading-relaxed text-ink-2">
            {description}
          </small>
        ) : null}
      </div>
      {action}
    </div>
  );
}
