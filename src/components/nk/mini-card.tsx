import Link from 'next/link'
import { Chip } from './chip'
import { Cover } from './cover'
import { Price } from './price'
import { coverLabel, type Resource } from '@/features/demo/catalog-data'

/** Carte compacte de la bande défilante du hero (`.mc`). */
export function MiniCard({ resource, decorative = false }: { resource: Resource; decorative?: boolean }) {
  return (
    <article
      aria-hidden={decorative || undefined}
      className="group relative w-[272px] flex-none overflow-hidden rounded-[18px] border border-line bg-card shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-md"
    >
      <Cover
        category={resource.category.id}
        format={resource.format}
        label={coverLabel(resource)}
        className="aspect-[16/8.4]"
        glyphClassName="size-14"
      />
      <div className="grid gap-[7px] px-[15px] pb-3.5 pt-[13px] text-left">
        <h3 className="text-[14.5px] font-bold leading-[1.32]">
          {decorative ? (
            <span>{resource.title}</span>
          ) : (
            <Link href={`/ressources/${resource.slug}`} className="text-ink after:absolute after:inset-0">
              {resource.title}
            </Link>
          )}
        </h3>
        <div className="flex items-center justify-between text-[12.5px] font-medium text-ink2">
          <Chip tone={resource.category.tone}>{resource.category.label}</Chip>
          <Price amount={resource.price} className="text-base" />
        </div>
      </div>
    </article>
  )
}
