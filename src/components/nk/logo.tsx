import Link from "next/link";
import { cn } from "@/lib/utils";

/** Logo NkamVa — port de `.logo` (pastille verte + mot-symbole). */
export function Logo({
  href = "/",
  className,
  compact,
}: {
  href?: string;
  className?: string;
  /** Masque le mot sous 860px (comportement de la topbar). */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 font-display text-[21px] font-extrabold tracking-[-0.01em] text-ink hover:text-ink",
        className,
      )}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-brand shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]"
        aria-hidden="true"
      >
        <span className="-translate-y-px font-display text-[19px] font-extrabold text-paper">N</span>
      </span>
      <span className={cn(compact && "max-[860px]:sr-only")}>
        Nkam<em className="not-italic text-brand">Va</em>
      </span>
    </Link>
  );
}
