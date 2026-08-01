import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chip } from './chip'
import { Cover } from './cover'
import { Price } from './price'
import { coverLabel, type Resource } from '@/features/demo/catalog-data'

/** Carte ressource partagée catalogue / favoris / tableau de bord (`.rc`). */
export function ResourceCard({
  resource,
  index = 0,
  className,
}: {
  resource: Resource
  index?: number
  className?: string
}) {
  return (
    <article
      className={cn(
        'group nk-reveal relative flex flex-col overflow-hidden rounded-xl border border-line bg-card shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-md',
        className,
      )}
      style={{ '--i': index % 8 } as React.CSSProperties}
    >
      <Cover
        category={resource.category.id}
        format={resource.format}
        label={coverLabel(resource)}
      />

      <div className="flex flex-1 flex-col gap-2 px-[18px] pb-[18px] pt-4">
        <Chip tone={resource.category.tone} className="self-start">
          {resource.category.label}
        </Chip>

        <h3 className="text-[16.5px] font-bold leading-[1.3]">
          <Link
            href={`/ressources/${resource.slug}`}
            className="text-ink after:absolute after:inset-0 hover:text-brand"
          >
            {resource.title}
          </Link>
        </h3>

        <span className="flex items-center gap-2 text-[13px] font-medium text-ink2">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-brand-t2 text-[10px] font-bold text-brand-d">
            {resource.author.initials}
          </span>
          {resource.author.name}
        </span>

        <div className="mt-auto flex items-center justify-between border-t border-line2 pt-2.5">
          <Price amount={resource.price} />
          <span className="relative z-[2] inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand">
            Voir
            <ArrowRight className="size-[15px] transition-transform duration-200 group-hover:translate-x-[3px]" />
          </span>
        </div>
      </div>
    </article>
  )
}
