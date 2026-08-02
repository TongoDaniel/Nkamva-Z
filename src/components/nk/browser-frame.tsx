import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Capture d'écran présentée dans un chrome de navigateur — port de `.frame`.
 * La maquette animait un shimmer en attendant l'image ; ici `next/image` sert
 * une image optimisée et le fond rayé tient lieu d'état de chargement.
 */
export function BrowserFrame({
  src,
  alt,
  url,
  className,
  priority,
}: {
  src: string;
  alt: string;
  /** Adresse affichée dans la barre — décorative. */
  url: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-nk border border-line bg-card shadow-nk",
        className,
      )}
    >
      <div
        className="flex items-center gap-1.5 border-b border-line-2 bg-[#fbfaf5] px-3.5 py-2.5"
        aria-hidden="true"
      >
        <i className="size-[9px] rounded-full bg-line" />
        <i className="size-[9px] rounded-full bg-line" />
        <i className="size-[9px] rounded-full bg-line" />
        <span className="ml-2.5 rounded-full border border-line-2 bg-paper px-3 py-[3px] font-sans text-[11px] font-semibold text-ink-3">
          {url}
        </span>
      </div>
      <div className="relative aspect-[909/540] bg-[repeating-linear-gradient(-52deg,#edeadf_0_12px,#f2efe6_12px_24px)]">
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1020px) 640px, 100vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
