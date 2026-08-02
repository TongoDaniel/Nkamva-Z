import Link from "next/link";
import { Btn } from "./button";
import { Chip } from "./chip";
import { Price } from "./resource-card";
import type { Community } from "@/features/demo/community-data";

/** Carte communauté (`.cc`) : bandeau dégradé, avatar de l'animateur, prix mensuel. */
export function CommunityCard({ community }: { community: Community }) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-nk border border-line bg-card shadow-nk-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-nk focus-within:-translate-y-1 focus-within:shadow-nk">
      <div className="relative h-[104px] bg-gradient-to-br from-navy to-info">
        <span
          className="absolute -bottom-6 left-5 grid size-[50px] place-items-center rounded-[14px] border-[3px] border-card bg-navy-2 font-display text-[15px] font-extrabold text-white"
          aria-hidden="true"
        >
          {community.author.initials}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-8">
        <Chip tone={community.category.tone} className="self-start">
          {community.category.label}
        </Chip>

        <h3 className="text-[16.5px] font-bold leading-[1.3]">
          <Link
            href={`/communautes/${community.slug}`}
            className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
          >
            {community.name}
          </Link>
        </h3>

        <p className="text-[13px] text-ink-2">
          Animée par <b className="font-bold text-ink">{community.author.name}</b>
        </p>
        <p className="text-[12.5px] font-medium text-ink-3">
          {community.members.toLocaleString("fr-FR")} membres
        </p>

        <div className="mt-auto flex items-center justify-between border-t border-line-2 pt-3">
          <span>
            <Price amountFcfa={community.price} className="text-[17px]" />
            <small className="ml-1 text-xs font-semibold text-ink-3">/ mois</small>
          </span>
          {/* Le lien de la carte couvre déjà toute la surface : ce bouton est
              une affordance visuelle, pas une seconde cible de tabulation. */}
          <Btn size="sm" tabIndex={-1} aria-hidden="true" className="pointer-events-none relative z-[2]">
            Rejoindre
          </Btn>
        </div>
      </div>
    </article>
  );
}
