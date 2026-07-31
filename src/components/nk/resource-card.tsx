import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { Chip } from "./chip";
import { Cover, formatLabel } from "./cover";
import { initials } from "./avatar";
import { fmtDuration, fmtNumber } from "@/lib/format";
import type { CourseListItem } from "@/lib/dto";
import { cn } from "@/lib/utils";

/** Prix en FCFA, typographie display de la maquette (`.price`). */
export function Price({ amountFcfa, className }: { amountFcfa: number; className?: string }) {
  return (
    <span className={cn("font-display text-[19px] font-extrabold tracking-[-0.01em]", className)}>
      {fmtNumber(amountFcfa)}
      <small className="ml-[3px] text-xs font-bold text-ink-3">FCFA</small>
    </span>
  );
}

/** Carte ressource partagée catalogue / accueil / suggestions — port de `.rc`. */
export function ResourceCard({ course }: { course: CourseListItem }) {
  const duration = fmtDuration(course.durationSeconds);
  const trainerName = course.trainerProfile?.user?.fullName ?? "Formateur NkamVa";
  const typeLabel = [formatLabel(course.format), duration].filter(Boolean).join(" · ").toUpperCase();

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm transition duration-200 hover:-translate-y-1 hover:shadow-nk focus-within:-translate-y-1 focus-within:shadow-nk">
      <Cover category={course.category} format={course.format} typeLabel={typeLabel} />
      <div className="flex flex-1 flex-col gap-2 px-[18px] pb-[18px] pt-4">
        <Chip className="self-start">{course.category}</Chip>
        <h3 className="text-[16.5px] font-bold leading-tight">
          {/* Le lien couvre toute la carte : une seule cible cliquable, un seul
              élément dans l'ordre de tabulation. */}
          <Link
            href={`/ressources/${course.slug}`}
            className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
          >
            {course.title}
          </Link>
        </h3>
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <span
            className="grid size-[22px] shrink-0 place-items-center rounded-full bg-brand-tint-2 text-[10px] font-bold text-brand-dark"
            aria-hidden="true"
          >
            {initials(trainerName)}
          </span>
          {trainerName}
        </p>
        {course.trainerProfile?.ratingCount > 0 ? (
          <p className="flex items-center gap-1 text-[12.5px] font-medium text-ink-3">
            <Star className="size-3.5 fill-gold text-gold" aria-hidden="true" />
            {course.trainerProfile.ratingAverage.toFixed(1)}
            <span className="sr-only">sur 5,</span>
            <span>({course.trainerProfile.ratingCount} avis)</span>
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between border-t border-line-2 pt-2.5">
          <Price amountFcfa={course.priceFcfa} />
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand" aria-hidden="true">
            Voir
            <ArrowRight className="size-[15px] transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </article>
  );
}
