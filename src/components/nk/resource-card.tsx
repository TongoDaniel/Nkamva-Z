import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { Chip } from "./chip";
import { categoryTone, Cover, coverImageUrl, formatLabel } from "./cover";
import { FavButton } from "./fav-button";
import { initials } from "./avatar";
import { fmtDuration, fmtNumber } from "@/lib/format";
import { routesOf, type Space } from "@/lib/spaces";
import type { CourseListItem } from "@/lib/dto";
import { cn } from "@/lib/utils";

/** Prix en FCFA, typographie display de la maquette (`.price`). */
export function Price({ amountFcfa, className }: { amountFcfa: number; className?: string }) {
  return (
    <span className={cn("font-display text-[19px] font-extrabold tracking-[-0.01em]", className)}>
      {fmtNumber(amountFcfa)}
      <small className="ml-[3px] text-[13px] font-bold text-ink-3">FCFA</small>
    </span>
  );
}

/**
 * Ce que la carte lit d'une ressource. Plus étroit que `CourseListItem` : une
 * ressource **possédée** (`ResourceItem.course`) n'a ni accroche ni prix, et
 * doit pouvoir passer par la même carte plutôt que par une seconde génération.
 */
export type ResourceCardCourse = Pick<
  CourseListItem,
  "id" | "slug" | "title" | "category" | "format" | "durationSeconds" | "coverS3Key"
> & {
  priceFcfa?: number;
  trainerProfile?: {
    user?: { fullName: string | null } | null;
    ratingAverage?: number;
    ratingCount?: number;
  } | null;
};

/** Carte ressource partagée catalogue / accueil / suggestions — port de `.rc`. */
export function ResourceCard({
  course,
  space,
  href,
  footer,
  compact,
  favoritable,
  favorited,
  eager,
  className,
}: {
  course: ResourceCardCourse;
  /**
   * Cible du lien, quand ce n'est pas la fiche du catalogue — une ressource
   * possédée s'ouvre dans `/mes-ressources`, pas sur sa page de vente.
   */
  href?: string;
  /**
   * Remplace la rangée du prix. C'est la progression de lecture, pour une
   * ressource déjà à soi : lui afficher son prix n'aurait aucun sens.
   */
  footer?: React.ReactNode;
  /**
   * Forme resserrée des rangées défilantes : sans la pastille de catégorie, et
   * avec des marges de vignette. La carte y fait 220 px de large, pas 300.
   */
  compact?: boolean;
  /**
   * Espace qui rend la carte. Prop obligatoire et sans valeur par défaut : une
   * carte posée dans l'espace connecté qui pointerait vers `/ressources` ferait
   * retomber l'utilisateur dans la coquille visiteur.
   */
  space: Space;
  /** Affiche le cœur de mise en favori. */
  favoritable?: boolean;
  /** État initial du cœur, lu côté serveur pour éviter un clignotement. */
  favorited?: boolean;
  /**
   * À poser sur la **première** carte d'une liste, et sur elle seule : c'est en
   * général le plus grand élément peint à l'ouverture, donc le LCP. Les autres
   * restent paresseuses — sur un forfait facturé au mégaoctet, une grille de
   * douze cartes ne doit pas tirer douze couvertures d'un coup.
   */
  eager?: boolean;
  className?: string;
}) {
  const duration = fmtDuration(course.durationSeconds);
  const trainerName = course.trainerProfile?.user?.fullName ?? "Formateur NKAMVA";
  const typeLabel = [formatLabel(course.format), duration].filter(Boolean).join(" · ").toUpperCase();

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm transition duration-200 hover:-translate-y-1 hover:shadow-nk focus-within:-translate-y-1 focus-within:shadow-nk",
        className,
      )}
    >
      <Cover
        category={course.category}
        format={course.format}
        typeLabel={typeLabel}
        imageUrl={coverImageUrl(course)}
        eager={eager}
      >
        {favoritable ? (
          <FavButton courseTitle={course.title} courseId={course.id} defaultPressed={favorited} />
        ) : null}
      </Cover>
      <div
        className={cn(
          "flex flex-1 flex-col",
          compact ? "gap-1.5 px-3.5 pb-3.5 pt-3" : "gap-2 px-[18px] pb-[18px] pt-4",
        )}
      >
        {compact ? null : (
          <Chip tone={categoryTone(course.category)} className="self-start">
            {course.category}
          </Chip>
        )}
        <h3 className={cn("font-bold leading-tight", compact ? "text-[15px]" : "text-[16.5px]")}>
          {/* Le lien couvre toute la carte : une seule cible cliquable, un seul
              élément dans l'ordre de tabulation. */}
          <Link
            href={href ?? routesOf(space).course(course.slug)}
            className={cn(
              "text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand",
              compact && "line-clamp-2",
            )}
          >
            {course.title}
          </Link>
        </h3>
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <span
            className="grid size-[22px] shrink-0 place-items-center rounded-full bg-brand-tint-2 text-[13px] font-bold text-brand-dark"
            aria-hidden="true"
          >
            {initials(trainerName)}
          </span>
          {trainerName}
        </p>
        {(course.trainerProfile?.ratingCount ?? 0) > 0 ? (
          <p className="flex items-center gap-1 text-[13px] font-medium text-ink-3">
            <Star className="size-3.5 fill-gold text-gold" aria-hidden="true" />
            {(course.trainerProfile?.ratingAverage ?? 0).toFixed(1)}
            <span className="sr-only">sur 5,</span>
            <span>({course.trainerProfile?.ratingCount} avis)</span>
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line-2 pt-2.5">
          {footer ?? (
            <>
              <Price
                amountFcfa={course.priceFcfa ?? 0}
                className={compact ? "text-[16px]" : undefined}
              />
              <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand" aria-hidden="true">
                Voir
                <ArrowRight className="size-[15px] transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
