import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * État vide — port de `.empty`.
 *
 * Généreux sur grand écran, resserré sur téléphone. Il occupait 310 px à 375 px
 * de large — `py-16`, un rond de 64 px, un titre de 19 px — pour dire qu'il n'y
 * a rien : la moitié d'un écran. Il garde sa respiration là où elle se voit, et
 * la moitié en dessous.
 *
 * Il reste l'objet juste quand la page **est** vide : c'est le moment où l'on
 * explique et où l'on propose le premier geste. Dans une carte parmi d'autres,
 * une phrase suffit et cet encadré coûte plus qu'il ne dit.
 */
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
        "rounded-nk-lg border-[1.5px] border-dashed border-line bg-card/40 px-5 py-9 text-center sm:px-6 sm:py-14",
        className,
      )}
    >
      {icon ? (
        <div
          className="mx-auto mb-3.5 grid size-12 place-items-center rounded-full border border-line bg-card text-brand [&_svg]:size-5 sm:mb-4 sm:size-16 sm:[&_svg]:size-7"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="mb-1.5 text-[17px] font-bold sm:text-[19px]">{title}</h3>
      {description ? (
        <p className="mx-auto mb-4 max-w-[380px] text-[14px] leading-relaxed text-ink-2 sm:mb-5 sm:text-[15px]">
          {description}
        </p>
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
