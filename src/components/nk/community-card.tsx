import Link from 'next/link'
import { Btn } from './btn'
import { Chip } from './chip'
import { Price } from './price'
import type { Community } from '@/features/demo/community-data'

/** Carte communauté (`.cc`) : bandeau dégradé, avatar de l'animateur, prix mensuel. */
export function CommunityCard({
  community,
  index = 0,
}: {
  community: Community
  index?: number
}) {
  return (
    <article
      className="nk-reveal relative flex flex-col overflow-hidden rounded-xl border border-line bg-card shadow-sm transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-md"
      style={{ '--i': index % 8 } as React.CSSProperties}
    >
      <div className="relative h-[104px] bg-gradient-to-br from-navy to-info">
        <span className="absolute -bottom-6 left-5 grid size-[50px] place-items-center rounded-[14px] border-[3px] border-card bg-navy2 font-display text-[15px] font-extrabold text-white">
          {community.author.initials}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-8">
        <Chip tone={community.category.tone} className="self-start">
          {community.category.label}
        </Chip>

        <h3 className="text-[16.5px] font-bold leading-[1.3]">
          <Link href={`/communautes/${community.slug}`} className="text-ink after:absolute after:inset-0 hover:text-brand">
            {community.name}
          </Link>
        </h3>

        <span className="text-[13px] text-ink2">
          Animée par <b className="font-bold text-ink">{community.author.name}</b>
        </span>
        <span className="text-[12.5px] font-medium text-ink3">
          {community.members.toLocaleString('fr-FR')} membres
        </span>

        <div className="mt-auto flex items-center justify-between border-t border-line2 pt-3">
          <span>
            <Price amount={community.price} className="text-[17px]" />
            <small className="ml-1 text-xs font-semibold text-ink3">/ mois</small>
          </span>
          <Btn size="sm" className="pointer-events-none relative z-[2]">
            Rejoindre
          </Btn>
        </div>
      </div>
    </article>
  )
}
