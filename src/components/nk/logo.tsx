import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo NKAMVA — port de `.logo`.
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
        // `nk-tap` : en mode `compact` le mot est `sr-only` sous `lg` et le lien
        // se réduit à la marque, soit 36×36 — sous la cible tactile.
        "nk-tap relative inline-flex items-center gap-2.5 font-display text-[21px] font-extrabold tracking-[-0.01em] text-ink hover:text-ink",
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
      <span className={cn(compact && "sr-only lg:not-sr-only")}>
        NKAM<em className="not-italic text-brand">VA</em>
      </span>
    </Link>
  );
}
