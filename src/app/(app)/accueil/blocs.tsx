// ==========================================================================
// Les blocs des deux accueils
// ==========================================================================
// Un formateur reste un apprenant, et depuis que son accueil **est** son
// espace (`/formateur`), les deux écrans ont besoin de pièces communes : le
// bloc Événements des deux côtés (arbitrage 142), « Reprendre » et
// « Nouveautés » côté formateur, les bandeaux d'état, la file « À traiter » et
// le régime de démarrage de l'autre.
//
// Elles vivaient dans `accueil/page.tsx`, qui les rendait toutes les deux. Les
// sortir ici plutôt que les recopier : deux copies auraient divergé au premier
// correctif, et c'est exactement ce que `nav-entries.ts` a déjà appris pour la
// navigation.
//
// Module serveur : aucun `"use client"`. Le bloc Événements, qui a besoin du
// navigateur pour l'heure, vit à côté dans `upcoming-events.tsx` ; ce qui se
// prépare pour lui — les vignettes signées, les liens — se prépare ici.
// ==========================================================================

import * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, Circle } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { BtnLink } from "@/components/nk/button-link";
import {
  CommunityCard,
  membershipBadge,
  type CommunityCardData,
  type ThumbnailSrc,
} from "@/components/nk/community-card";
import { ResourceCard } from "@/components/nk/resource-card";
import { ProgressRing } from "@/components/nk/progress-ring";
import { ScrollCarousel } from "@/components/nk/scroll-carousel";
import { StPill } from "@/components/nk/status-pill";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { userAvatarSrc } from "@/lib/avatars";
import {
  thumbnailOf,
  visualOfMembership,
  type CommunityVisual,
  type Thumbnail,
} from "@/lib/community-visual";
import { fmtNumber } from "@/lib/format";
import type { AgendaSession } from "@/lib/lives";
import type { MyCommunity } from "@/lib/memberships";
import type { TrendingCourses, TrendingSession, TrendingTrainers } from "@/lib/trending";
import { readingPercent, type CourseListItem, type ResourceItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";
import { SectionTitle } from "./section-title";
import type { EventItem } from "./upcoming-events";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

/** Le pluriel, partout pareil. */
export const s = (n: number) => (n > 1 ? "s" : "");

const DAY_MS = 86_400_000;

/**
 * Largeur des vignettes dans les rangées défilantes. Assez étroites pour qu'on
 * voie dépasser la suivante — c'est ce qui apprend que la rangée glisse.
 */
const COMMUNITY_TILE = "w-[176px] flex-none snap-start sm:w-[228px]";
const RESOURCE_TILE = "w-[216px] flex-none snap-start sm:w-[256px]";

/**
 * Une rangée défilante garde 16 px sous sa piste — l'ombre et le soulèvement
 * des cartes y débordent, et `overflow-x` rognerait sans eux. Cette marge
 * négative les rend à la mise en page : la section suivante se place alors
 * comme après une liste, et toutes les sections de l'accueil prennent le même
 * écart, quelle que soit celle qui les précède.
 */
const ROW_SECTION = "-mb-4";

// ==========================================================================
// Événements — ce que le bloc client reçoit
// ==========================================================================

const NO_THUMBNAIL: ThumbnailSrc = { cover: null, portrait: null };

/**
 * Une vignette par communauté, signée une fois même si la communauté porte dix
 * séances : la signature est un calcul local, mais dix adresses différentes
 * pour la même image, c'est dix téléchargements.
 */
function thumbnails() {
  const cache = new Map<string, Promise<Thumbnail>>();
  return async (visual: CommunityVisual | undefined): Promise<ThumbnailSrc> => {
    if (!visual) return NO_THUMBNAIL;
    let pending = cache.get(visual.id);
    if (!pending) {
      pending = thumbnailOf(visual);
      cache.set(visual.id, pending);
    }
    const { cover, portrait } = await pending;
    return { cover, portrait };
  };
}

/**
 * Les deux listes du bloc Événements.
 *
 * Les liens se décident ici, et c'est le cœur de l'arbitrage 142 : une séance de
 * ses communautés mène à la salle — ou à la console pour qui l'anime —, une
 * séance en tendance mène à la **fiche** de sa communauté, parce que la salle
 * refuse qui n'est pas membre.
 */
export async function buildEventItems({
  agenda,
  visuals,
  trending,
  now = new Date(),
}: {
  agenda: AgendaSession[];
  visuals: Map<string, CommunityVisual>;
  trending: TrendingSession[];
  now?: Date;
}): Promise<{ mine: EventItem[]; trending: EventItem[] }> {
  const thumb = thumbnails();

  // L'agenda garde les séances jamais lancées, sans borne : au-delà d'une
  // journée après leur créneau, elles n'ont plus rien à faire sur un accueil.
  const current = (session: AgendaSession) =>
    session.live ||
    session.startsAt.getTime() + session.durationMinutes * 60_000 >= now.getTime() - DAY_MS;

  const common = (session: AgendaSession) => ({
    id: session.id,
    title: session.title,
    startsAt: session.startsAt.toISOString(),
    durationMinutes: session.durationMinutes,
    timeZone: session.timeZone,
    live: session.live,
    communityName: session.community.name,
  });

  const [mine, others] = await Promise.all([
    Promise.all(
      agenda.filter(current).map(
        async (session): Promise<EventItem> => ({
          ...common(session),
          hosting: session.mine,
          href: session.mine
            ? `/formateur/lives/${session.id}/console`
            : `/mes-lives/live/${session.id}`,
          thumbnail: await thumb(visuals.get(session.community.id)),
          priceFcfa: null,
        }),
      ),
    ),
    Promise.all(
      trending.map(
        async ({ session, visual, priceFcfa }): Promise<EventItem> => ({
          ...common(session),
          hosting: false,
          href: routes.community(session.community.slug),
          thumbnail: await thumb(visual),
          priceFcfa,
        }),
      ),
    ),
  ]);

  return { mine, trending: others };
}

/**
 * Une séance de ses communautés est en cours. C'est la seule chose de l'accueil
 * qui ne peut pas attendre : elle ne reste pas enfouie dans la troisième
 * section, elle passe en tête.
 *
 * La pastille qui pulse s'arrête pour qui a demandé moins de mouvement ; le
 * texte « En direct maintenant » porte l'information seul.
 */
export function LiveNowBanner({ event, className }: { event: EventItem; className?: string }) {
  return (
    <Link
      href={event.href}
      className={`group flex items-center gap-3 rounded-nk-lg border border-danger/30 bg-danger-tint px-4 py-3 transition duration-150 hover:border-danger sm:gap-4 sm:px-5 sm:py-4 ${className ?? ""}`}
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[13px] font-bold uppercase tracking-[0.06em] text-danger">
          En direct maintenant
        </b>
        <span className="block truncate text-[15px] font-bold text-ink">{event.title}</span>
        <span className="block truncate text-[13px] text-ink-2">{event.communityName}</span>
      </span>
      <span className="shrink-0 rounded-full bg-danger px-3.5 py-2 text-[13px] font-bold text-white">
        {event.hosting ? "Ouvrir la console" : "Rejoindre"}
      </span>
    </Link>
  );
}

// ==========================================================================
// Vos communautés
// ==========================================================================

export interface CommunityTile {
  card: CommunityCardData;
  href: string;
  thumbnail: ThumbnailSrc;
  badge: React.ReactNode;
}

/**
 * Les vignettes de ses communautés. Elles mènent à l'**espace** de la
 * communauté, pas à sa fiche : on y est membre, la fiche de vente n'a plus rien
 * à lui apprendre. Une échéance à régler se lit sur la pastille ; l'espace, qui
 * reste ouvert pendant le sursis, porte le bouton pour la régler.
 */
export async function buildCommunityTiles(memberships: MyCommunity[]): Promise<CommunityTile[]> {
  const thumb = thumbnails();
  return Promise.all(
    memberships.map(async (m) => ({
      card: {
        id: m.community.id,
        slug: m.community.slug,
        name: m.community.name,
        priceFcfa: m.community.priceFcfa,
        membersCount: m.community.membersCount,
        visibility: m.community.visibility,
        trainerName: m.community.trainerName,
        trainerAvatarUrl: userAvatarSrc({
          id: m.community.trainerUserId,
          avatarS3Key: m.community.trainerAvatarS3Key,
          avatarUrl: m.community.trainerAvatarUrl,
        }),
      },
      href: `/mes-communautes/${m.community.slug}`,
      thumbnail: await thumb(visualOfMembership(m)),
      badge: membershipBadge({ status: m.status, canceled: Boolean(m.canceledAt) }),
    })),
  );
}

export function CommunitiesRow({ tiles, className }: { tiles: CommunityTile[]; className?: string }) {
  return (
    <section aria-labelledby="vos-communautes" className={`${ROW_SECTION} ${className ?? ""}`}>
      <ScrollCarousel
        label="Vos communautés"
        head={<SectionTitle id="vos-communautes" title="Vos communautés" href="/mes-communautes" className="sm:flex-1" />}
      >
        {tiles.map((tile) => (
          <CommunityCard
            key={tile.card.id}
            community={tile.card}
            href={tile.href}
            thumbnail={tile.thumbnail}
            badge={tile.badge}
            className={COMMUNITY_TILE}
          />
        ))}
      </ScrollCarousel>
    </section>
  );
}

/**
 * À la place de la rangée, pour qui n'a rejoint aucune communauté. Une phrase et
 * un bouton, pas un état vide de 300 px : le reste de la page — la tendance,
 * les formateurs, les ressources — a de quoi se montrer.
 */
export function JoinCommunityPrompt({ className }: { className?: string }) {
  return (
    <section aria-labelledby="vos-communautes" className={className}>
      <SectionTitle id="vos-communautes" title="Vos communautés" className="mb-3" />
      <div className="flex flex-col gap-3 rounded-nk-lg border-[1.5px] border-dashed border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Vous n&apos;avez rejoint aucune communauté. Chacune réunit un formateur, ses séances en
          direct et ses ressources.
        </p>
        <BtnLink href={routes.communities} variant="o" size="sm" className="shrink-0 self-start sm:self-auto">
          Explorer les communautés
        </BtnLink>
      </div>
    </section>
  );
}

// ==========================================================================
// Mes ressources
// ==========================================================================

/**
 * Les commencées d'abord, la dernière ouverte en tête ; les autres ensuite,
 * dans l'ordre d'acquisition. Une ressource dont l'accès est suspendu par un
 * litige n'y figure pas : elle ne s'ouvre pas, et `/mes-ressources` explique
 * pourquoi.
 */
function forResume(items: ResourceItem[]): ResourceItem[] {
  const open = items.filter((item) => item.course && !item.accessSuspended);
  const lastViewed = (item: ResourceItem) =>
    item.courseView?.lastViewedAt ? new Date(item.courseView.lastViewedAt).getTime() : 0;
  return [
    ...open.filter((item) => item.isStarted).sort((a, b) => lastViewed(b) - lastViewed(a)),
    ...open.filter((item) => !item.isStarted),
  ];
}

/**
 * La progression, en barre et en mots. Les mots d'abord : la barre seule ne
 * dit pas « téléchargée » d'une archive, qui n'a pas de position à mesurer.
 */
function ReadingProgress({ item }: { item: ResourceItem }) {
  const course = item.course!;
  const view = item.courseView;
  const percent = readingPercent(view, course.format, course.durationSeconds, course.pageCount);

  const label = !item.isStarted
    ? "À commencer"
    : percent === null
      ? "Commencée"
      : percent < 100
        ? `${percent} % consulté`
        : view?.downloaded && !view.completedAt && !view.lastPage && course.format !== "video"
          ? "Téléchargée"
          : "Terminée";

  // Longueur inconnue : une barre pleine et pâle, qui dit « commencée » sans
  // prétendre savoir de combien — même lecture que `ProgressRing`.
  const width = !item.isStarted ? 0 : percent === null ? 100 : percent;

  return (
    <span className="flex w-full items-center gap-2.5">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-2" aria-hidden="true">
        <i
          className={`block h-full rounded-full bg-brand ${percent === null ? "opacity-35" : ""}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-ink-2">{label}</span>
    </span>
  );
}

/**
 * Remplace les deux tuiles « 0 ressource achetée · 0 en cours » et la liste
 * « Reprendre » : un chiffre ne rouvre rien, une carte si. Les ressources
 * incluses dans une communauté y sont, comme dans `/mes-ressources`.
 */
export function OwnedResourcesRow({ items, className }: { items: ResourceItem[]; className?: string }) {
  const shown = forResume(items).slice(0, 10);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="mes-ressources" className={`${ROW_SECTION} ${className ?? ""}`}>
      <ScrollCarousel
        label="Mes ressources"
        head={<SectionTitle id="mes-ressources" title="Mes ressources" href="/mes-ressources" className="sm:flex-1" />}
      >
        {shown.map((item, i) => (
          <ResourceCard
            key={item.id}
            course={item.course!}
            space="app"
            href={`/mes-ressources/${item.course!.id}`}
            compact
            eager={i === 0}
            footer={<ReadingProgress item={item} />}
            className={RESOURCE_TILE}
          />
        ))}
      </ScrollCarousel>
    </section>
  );
}

// ==========================================================================
// Tendance : formateurs et ressources
// ==========================================================================

/**
 * Le titre suit ce que la liste est vraiment : « tendance » quand il y a eu de
 * quoi classer, « à découvrir » sinon. Un apprenant ou une ressource à zéro ne
 * s'affiche pas en toutes lettres — « 0 apprenant » n'aide personne à choisir.
 */
export function TrendingTrainersList({
  trainers,
  className,
}: {
  trainers: TrendingTrainers;
  className?: string;
}) {
  if (trainers.items.length === 0) return null;
  const title = trainers.ranked ? "Formateurs tendance" : "Formateurs à découvrir";
  return (
    <section aria-labelledby="formateurs-tendance" className={className}>
      <SectionTitle id="formateurs-tendance" title={title} href={routes.trainers} className="mb-3 sm:mb-4" />
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {trainers.items.map((trainer) => {
          const facts = [
            trainer.learners > 0 ? `${fmtNumber(trainer.learners)} apprenant${s(trainer.learners)}` : null,
            trainer.publishedCount > 0
              ? `${fmtNumber(trainer.publishedCount)} ressource${s(trainer.publishedCount)}`
              : null,
          ].filter(Boolean);
          return (
            <li key={trainer.id}>
              <Link
                href={routes.trainer(trainer.id)}
                className="group flex items-center gap-3 rounded-nk-lg border border-line bg-card px-3.5 py-3 shadow-nk-sm transition duration-150 hover:border-brand"
              >
                <Avatar
                  size="md"
                  src={userAvatarSrc({
                    id: trainer.userId,
                    avatarS3Key: trainer.avatarS3Key,
                    avatarUrl: trainer.avatarUrl,
                  })}
                  name={trainer.fullName}
                />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] font-bold text-ink group-hover:text-brand">
                    {trainer.fullName ?? "Formateur NKAMVA"}
                  </b>
                  {trainer.slogan ? (
                    <span className="block truncate text-[13px] text-ink-2">{trainer.slogan}</span>
                  ) : null}
                  {facts.length > 0 ? (
                    <span className="block truncate text-[13px] text-ink-3">{facts.join(" · ")}</span>
                  ) : null}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TrendingCoursesRow({
  courses,
  className,
}: {
  courses: TrendingCourses;
  className?: string;
}) {
  if (courses.items.length === 0) return null;
  const title = courses.ranked ? "Ressources tendance" : "Nouveautés du catalogue";
  return (
    <section aria-labelledby="ressources-catalogue" className={`${ROW_SECTION} ${className ?? ""}`}>
      <ScrollCarousel
        label={title}
        head={
          <SectionTitle
            id="ressources-catalogue"
            title={title}
            href={routes.catalog}
            linkLabel="Tout le catalogue"
            className="sm:flex-1"
          />
        }
      >
        {courses.items.map((course) => (
          <ResourceCard key={course.id} course={course} space="app" compact className={RESOURCE_TILE} />
        ))}
      </ScrollCarousel>
    </section>
  );
}

// ==========================================================================
// Les pièces de l'accueil formateur
// ==========================================================================

/**
 * Les ressources commencées, en lignes compactes.
 *
 * L'anneau porte déjà la valeur en texte pour les lecteurs d'écran : la ligne
 * n'a donc pas de bouton « Reprendre » en plus du titre cliquable, qui serait
 * une seconde cible vers la même page.
 */
export function ResumeList({ items }: { items: ResourceItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const course = item.course;
        if (!course) return null;
        return (
          <li
            key={item.id}
            className="group relative flex items-center gap-3.5 rounded-nk-lg border border-line bg-card px-4 py-3.5 shadow-nk-sm transition duration-150 hover:border-brand focus-within:border-brand"
          >
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
              aria-hidden="true"
            >
              <FormatGlyph format={course.format} className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-bold">
                {/* Même motif que `ResourceCard` : le lien du titre est étendu
                    à toute la ligne par `after:inset-0`. Une seule cible, et le
                    nom accessible reste le titre. */}
                <Link
                  href={`/mes-ressources/${course.id}`}
                  className="text-ink after:absolute after:inset-0 after:content-[''] group-hover:text-brand"
                >
                  {course.title}
                </Link>
              </h3>
              <p className="truncate text-[13px] text-ink-2">{formatLabel(course.format)}</p>
            </div>
            <ProgressRing
              percent={readingPercent(
                item.courseView, course.format, course.durationSeconds, course.pageCount,
              )}
              downloaded={item.courseView?.downloaded ?? false}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Nouveautés du catalogue — jamais ses propres publications. */
export function Novelties({ courses }: { courses: CourseListItem[] }) {
  if (courses.length === 0) return null;
  return (
    <section aria-labelledby="suggestions" className="mt-7 sm:mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="suggestions" className="text-[17px] font-bold">
          Nouveautés du catalogue
        </h2>
        <Link href={routes.catalog} className="nk-tap text-[13px] font-bold text-brand">
          Tout le catalogue
        </Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((course, i) => (
          <ResourceCard key={course.id} course={course} space="app" eager={i === 0} />
        ))}
      </div>
    </section>
  );
}

/**
 * Bandeau d'état. Deux au maximum sont rendus : au-delà, plus rien ne se
 * distingue et l'échéance d'abonnement se noie dans le quota de stockage.
 *
 * Pas de `role="alert"` : ce sont des états permanents, pas des annonces. Avec,
 * un lecteur d'écran réciterait l'échéance à chaque retour sur l'accueil.
 */
export const BANNER_TONES = {
  danger: "border-danger/30 bg-danger-tint text-danger",
  gold: "border-gold/30 bg-gold-tint text-gold-ink",
  clay: "border-clay/30 bg-clay-tint text-clay-ink",
  muted: "border-line bg-card text-ink-2",
} as const;

export interface StateBanner {
  key: string;
  tone: keyof typeof BANNER_TONES;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

/** Une file à traiter : ce qui réclame une action, et le lien pour la faire. */
export interface Task {
  key: string;
  label: string;
  detail: string;
  href: string;
}

/**
 * Une tâche à traiter — **la rangée entière est le lien**.
 *
 * Elle portait un bouton « Ouvrir » à droite. Trois défauts d'un coup : le
 * bouton prenait 78 px de large, ce qui poussait le détail sur deux ou trois
 * lignes et donnait des rangées inégales (82, 120 puis 101 px sur le même
 * écran) ; la rangée entière était `flex-wrap`, donc le bouton passait
 * parfois seul à la ligne ; et un lecteur d'écran annonçait trois liens
 * nommés « Ouvrir », sans rien pour les distinguer.
 *
 * Le lien prend toute la rangée : la cible tactile passe de 78 px de large à
 * toute la carte, le chevron coûte 16 px au lieu de 78, et le nom accessible
 * devient l'intitulé de la tâche.
 *
 * **Plus de pastille d'icône** (retirée le 12 septembre 2026, à la demande du
 * propriétaire). Elle était `aria-hidden` et redondante : les quatre tâches
 * possibles disent déjà ce qu'elles sont — « 2 brouillons à publier »,
 * « 1 litige sans contestation ». Elle coûtait 48 px de largeur au libellé, qui
 * est ce qui se lit. Le chevron reste : lui n'illustre pas, il annonce que la
 * rangée mène ailleurs.
 */
export function TaskRow({ task }: { task: Task }) {
  return (
    <li className="border-b border-line-2 last:border-b-0">
      <Link
        href={task.href}
        className="group flex items-center gap-3.5 py-3.5 transition-colors duration-150"
      >
        <span className="min-w-0 flex-1">
          <b className="block text-sm font-bold group-hover:text-brand">{task.label}</b>
          <small className="block text-[13px] leading-snug text-ink-2">{task.detail}</small>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/** Une étape du régime de démarrage. */
export function StepRow({ done, label, detail, href }: { done: boolean; label: string; detail: string; href: string }) {
  const corps = (
    <>
      <span
        className={
          done
            ? "grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white"
            : "grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-3"
        }
        aria-hidden="true"
      >
        {done ? <Check className="size-4" /> : <Circle className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <b
          className={
            done
              ? "block text-sm font-bold text-ink-2 line-through"
              : "block text-sm font-bold group-hover:text-brand"
          }
        >
          {label}
        </b>
        <small className="block text-[13px] leading-snug text-ink-2">{detail}</small>
      </span>
      {done ? (
        <StPill tone="ok">Fait</StPill>
      ) : (
        <ChevronRight
          className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden="true"
        />
      )}
    </>
  );

  // Même partage que `TaskRow` : le lien prend la rangée. Une étape **faite**
  // n'est pas un lien — il n'y a plus rien à y ouvrir, et la pastille « Fait »
  // le dit déjà.
  return (
    <li className="border-b border-line-2 last:border-b-0">
      {done ? (
        <div className="flex items-center gap-3.5 py-3.5">{corps}</div>
      ) : (
        <Link
          href={href}
          className="group flex items-center gap-3.5 py-3.5 transition-colors duration-150"
        >
          {corps}
        </Link>
      )}
    </li>
  );
}
