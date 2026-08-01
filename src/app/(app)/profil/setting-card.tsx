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
      className={cn("mb-5 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-7", className)}
    >
      <h2 className="text-[17px] font-extrabold">{title}</h2>
      {subtitle ? <p className="mb-5 mt-1.5 text-[14px] leading-relaxed text-ink-2">{subtitle}</p> : <div className="mb-5" />}
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
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-2 py-4 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <b className={cn("block text-[14.5px]", danger && "text-danger")}>{title}</b>
        {description ? (
          <small className="mt-0.5 block max-w-[52ch] text-[12.5px] leading-relaxed text-ink-2">
            {description}
          </small>
        ) : null}
      </div>
      {action}
    </div>
  );
}
