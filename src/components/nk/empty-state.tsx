import * as React from "react";
import { cn } from "@/lib/utils";

/** État vide — port de `.empty`. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-nk-lg border-[1.5px] border-dashed border-line bg-card/40 px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div
          className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-brand-tint text-brand [&_svg]:size-7"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="mb-1.5 text-[19px] font-bold">{title}</h3>
      {description ? (
        <p className="mx-auto mb-5 max-w-[380px] text-ink-2">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** État vide compact pour l'intérieur d'une carte admin (`.adm-empty`). */
export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-10 text-center text-[13.5px] font-semibold text-ink-3">{children}</p>
  );
}
