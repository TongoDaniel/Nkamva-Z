import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Le titre d'une section de l'accueil, et son lien « Tout voir ».
 *
 * Un composant plutôt que la même poignée de classes recopiée six fois : c'est
 * ainsi que les titres de section avaient fini par avoir trois tailles.
 *
 * Aucune dépendance serveur — le bloc Événements, rendu côté navigateur, le
 * pose aussi.
 *
 * Le lien porte le nom de sa section en texte masqué : sans lui, un lecteur
 * d'écran qui liste les liens de la page annonçait cinq « Tout voir » que rien
 * ne distinguait.
 */
export function SectionTitle({
  id,
  title,
  href,
  linkLabel = "Tout voir",
  className,
}: {
  id: string;
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 id={id} className="text-[17px] font-bold sm:text-[19px]">
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          className="nk-tap group relative inline-flex shrink-0 items-center gap-0.5 text-[13px] font-bold text-brand"
        >
          {linkLabel}
          <span className="sr-only">, {title}</span>
          <ChevronRight
            className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}
