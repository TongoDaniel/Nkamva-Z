import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Tracé du mot « NKAMVA », repris tel quel de `public/logo-complet.svg`.
 * Inline plutôt qu'en `<img>` pour hériter de `currentColor` : le même mot sert
 * sur fond clair (navy) et sur les fonds sombres (blanc).
 */
const WORDMARK_PATH =
  "M833.1 371H777.3L684 229.7V371H628.2V142H684L777.3 283.9V142H833.1ZM1016.1 371 939.1 269.9V371H883.3V142H939.1V242.5L1015.5 142H1081L992.3 254.2L1084.3 371ZM1263.1 330.5H1177.6L1163.9 371H1105.5L1188.4 142H1253L1335.8 371H1276.8ZM1248.7 287.5 1220.4 203.6 1192.3 287.5ZM1630.1 142V371H1574.3V233.7L1523.1 371H1478.1L1426.5 233.3V371H1370.8V142H1436.7L1500.9 300.5L1564.5 142ZM1895 142 1813.8 371H1744L1662.7 142H1722.1L1778.9 314.9L1836 142ZM2070.5 330.5H1985.1L1971.4 371H1913L1995.8 142H2060.4L2143.3 371H2084.2ZM2056.2 287.5 2027.8 203.6 1999.7 287.5Z";

/** Le mot seul, sans le symbole. Sa hauteur se règle par `className`. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="628 141 1516 231"
      aria-hidden="true"
      focusable="false"
      className={cn("block h-[15px] w-auto shrink-0", className)}
    >
      <path fill="currentColor" d={WORDMARK_PATH} />
    </svg>
  );
}

/**
 * Logo NKAMVA — symbole (`public/mark.svg`) et mot-symbole officiels.
 * Le texte « NKAMVA » reste dans le DOM pour les lecteurs d'écran.
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
        // `nk-tap` : en mode `compact` le mot est masqué sous `lg` et le lien
        // se réduit à la marque, soit 36×36 — sous la cible tactile.
        "nk-tap relative inline-flex items-center gap-2.5 text-navy hover:text-navy",
        className,
      )}
    >
      <Image
        src="/mark.svg"
        alt=""
        width={36}
        height={36}
        priority
        className="block size-9 shrink-0"
      />
      <Wordmark className={cn(compact && "hidden lg:block")} />
      <span className="sr-only">NKAMVA</span>
    </Link>
  );
}
