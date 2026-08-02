import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo NkamVa — port de `.logo`.
 * La maquette a abandonné la pastille générée au profit du vrai mot-symbole
 * (`assets/img/mark.svg`, navy + éclair azur), servi depuis `public/mark.svg`.
 */
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
      <Image
        src="/mark.svg"
        alt=""
        width={36}
        height={36}
        priority
        className="block size-9 shrink-0 rounded-[11px]"
      />
      <span className={cn(compact && "max-[860px]:sr-only")}>
        Nkam<em className="not-italic text-brand">Va</em>
      </span>
    </Link>
  );
}
