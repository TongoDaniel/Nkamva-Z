import Link from "next/link";
import { Chip } from "@/components/nk/chip";
import { categoryTone, Cover, coverImageUrl, formatLabel } from "@/components/nk/cover";
import { Price } from "@/components/nk/resource-card";
import { fmtDuration } from "@/lib/format";
import type { CourseListItem } from "@/lib/dto";

/**
 * Carte compacte de la bande défilante du hero — port de `.mc`.
 * Le second exemplaire de la bande est décoratif : il ne doit ni être annoncé,
 * ni être atteignable au clavier, d'où `decorative`.
 */
export function MiniCard({
  course,
  decorative,
}: {
  course: CourseListItem;
  decorative?: boolean;
}) {
  const typeLabel = [formatLabel(course.format), fmtDuration(course.durationSeconds)]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  return (
    <article
      aria-hidden={decorative || undefined}
      className="group relative w-[272px] flex-none overflow-hidden rounded-[18px] border border-line bg-card shadow-nk-sm transition duration-200 hover:-translate-y-1 hover:shadow-nk"
    >
      <Cover
        category={course.category}
        format={course.format}
        typeLabel={typeLabel}
        imageUrl={coverImageUrl(course)}
        className="aspect-[16/8.4]"
      />
      <div className="grid gap-[7px] px-[15px] pb-3.5 pt-[13px] text-left">
        <h3 className="text-[14.5px] font-bold leading-[1.32]">
          {decorative ? (
            <span className="text-ink">{course.title}</span>
          ) : (
            <Link
              href={`/ressources/${course.slug}`}
              className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
            >
              {course.title}
            </Link>
          )}
        </h3>
        <div className="flex items-center justify-between text-[13px] font-medium text-ink-2">
          <Chip tone={categoryTone(course.category)}>{course.category}</Chip>
          <Price amountFcfa={course.priceFcfa} className="text-base" />
        </div>
      </div>
    </article>
  );
}
