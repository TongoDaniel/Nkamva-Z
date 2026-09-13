"use client";

// ==========================================================================
// Événements à venir — arbitrage 142
// ==========================================================================
// Deux onglets, parce que les deux listes ne promettent pas la même chose :
//
//   « Mes communautés » — les séances où l'on peut entrer. La ligne mène à la
//                         salle (ou à la console, pour qui anime).
//   « Tendance »        — les séances des communautés publiques les plus
//                         rejointes, qu'on n'a pas rejointes. La ligne mène à
//                         la **fiche** de la communauté : la salle refuserait
//                         un non-membre (`NOT_MEMBER`), et c'est l'adhésion
//                         qui ouvre la porte (arbitrage 46).
//
// Ce que la maquette montrait et qui n'a pas été repris, faute d'exister :
// « Complet » ou « Places limitées » (aucune jauge), un lieu (tout est en
// ligne), une catégorie de communauté, une photo de séance. Le sélecteur de mois
// non plus : le calendrier vit sur `/mes-lives`, vers lequel mène le titre.
//
// **L'heure.** Le serveur ne connaît pas le fuseau du lecteur. Rendre l'heure
// dans le sien, puis dans celui du navigateur, ferait deux textes différents
// pour le même nœud — une erreur d'hydratation, ou pire une heure fausse
// figée. Le premier rendu, serveur et navigateur confondus, écrit donc l'heure
// dans le fuseau **de l'animateur**, qui est une donnée de la séance et donne
// le même texte partout ; une fois monté, le composant repasse dans le fuseau
// du lecteur, et rappelle celui de l'animateur s'il diffère (arbitrage 107).
// Les filtres de période attendent le même moment : « aujourd'hui » dépend de
// l'endroit où l'on est.
// ==========================================================================

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tabs } from "@/components/nk/tabs";
import { StPill } from "@/components/nk/status-pill";
import { CommunityThumb, type ThumbnailSrc } from "@/components/nk/community-card";
import { hostTimeLabel } from "@/components/nk/live-row";
import { fmtNumber } from "@/lib/format";
import { SectionTitle } from "./section-title";

/** Ce qu'une ligne d'événement reçoit du serveur. */
export interface EventItem {
  id: string;
  title: string;
  /** ISO 8601. */
  startsAt: string;
  durationMinutes: number;
  /** Fuseau où l'animateur a pensé l'heure — nul sur les séances anciennes. */
  timeZone: string | null;
  live: boolean;
  /** La personne anime cette séance : la ligne mène à sa console. */
  hosting: boolean;
  href: string;
  communityName: string;
  thumbnail: ThumbnailSrc;
  /** Prix mensuel de l'adhésion — onglet « Tendance » seulement. */
  priceFcfa: number | null;
}

/**
 * Le fuseau du premier rendu quand la séance n'en porte pas (programmée avant
 * l'arbitrage 107). Celui du marché d'origine de la plateforme : c'est l'heure
 * que l'animateur avait le plus probablement en tête.
 */
const FALLBACK_HOST_TIME_ZONE = "Africa/Douala";

/** Au-delà, la ligne suivante renvoie vers la liste complète. */
const MAX_ROWS = 5;

type Origin = "mine" | "trending";
type Period = "all" | "today" | "week" | "month";

/**
 * « Semaine » et « Mois », pas « Cette semaine » et « Ce mois-ci » : les quatre
 * libellés longs demandaient 389 px dans une piste de 337 à 375 px de large, et
 * « Ce mois-ci » passait sous le bord, sans rien pour dire qu'il existait. Le
 * groupe s'annonce « Période » : « Période, Semaine » se comprend.
 */
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "today", label: "Aujourd'hui" },
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
];

const PERIOD_SUFFIX: Record<Period, string> = {
  all: "",
  today: " aujourd'hui",
  week: " cette semaine",
  month: " ce mois-ci",
};

/**
 * L'heure du navigateur, une fois monté — `null` avant. Rafraîchie chaque
 * minute : un accueil laissé ouvert doit voir « Aujourd'hui » basculer, et une
 * séance terminée sortir de la liste.
 */
function useNow(): Date | null {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Fin exclue de la période, en heure locale. `null` : pas de borne. */
function periodEnd(period: Period, now: Date): Date | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (period) {
    case "all":
      return null;
    case "today":
      return new Date(y, m, d + 1);
    case "week": {
      // La semaine française commence lundi ; `getDay()` met dimanche à 0.
      const sinceMonday = (now.getDay() + 6) % 7;
      return new Date(y, m, d - sinceMonday + 7);
    }
    case "month":
      return new Date(y, m + 1, 1);
  }
}

function isShown(item: EventItem, now: Date, end: Date | null): boolean {
  const start = new Date(item.startsAt).getTime();
  // Une séance jamais lancée reste « programmée » après son créneau. Passé
  // celui-ci, elle n'est plus à venir.
  if (!item.live && start + item.durationMinutes * 60_000 < now.getTime()) return false;
  if (!end) return true;
  return item.live || start < end.getTime();
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function dateParts(iso: string, timeZone: string | undefined) {
  const date = new Date(iso);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fr-FR", { ...options, timeZone }).format(date).replace(".", "");
  return {
    weekday: format({ weekday: "short" }),
    day: format({ day: "numeric" }),
    month: format({ month: "short" }),
    time: format({ hour: "2-digit", minute: "2-digit" }),
    long: format({ weekday: "long", day: "numeric", month: "long" }),
  };
}

function EventRow({ item, now }: { item: EventItem; now: Date | null }) {
  const parts = dateParts(item.startsAt, now ? undefined : item.timeZone ?? FALLBACK_HOST_TIME_ZONE);
  const host = now ? hostTimeLabel(new Date(item.startsAt), item.timeZone) : null;
  const today = now ? sameLocalDay(new Date(item.startsAt), now) : false;

  // Une seule marque par ligne, la plus urgente : deux pastilles côte à côte
  // dans 180 px se liraient comme une seule phrase.
  const mark = item.live ? (
    <StPill tone="bad">En direct</StPill>
  ) : item.hosting ? (
    <StPill tone="ok">J&apos;anime</StPill>
  ) : today ? (
    <StPill tone="info">Aujourd&apos;hui</StPill>
  ) : item.priceFcfa !== null ? (
    <span className="whitespace-nowrap font-semibold text-ink-2">
      {fmtNumber(item.priceFcfa)} FCFA / mois
    </span>
  ) : null;

  return (
    <li>
      <Link
        href={item.href}
        className="group flex items-center gap-3 rounded-nk-lg border border-line bg-card p-2.5 shadow-nk-sm transition duration-150 hover:border-brand focus-visible:border-brand sm:gap-4 sm:p-3"
      >
        <span className="flex w-10 shrink-0 flex-col items-center leading-none sm:w-12" aria-hidden="true">
          <small className="text-[13px] font-semibold uppercase text-ink-3">{parts.weekday}</small>
          <b className="my-1 font-display text-[22px] font-extrabold text-ink">{parts.day}</b>
          <small className="text-[13px] font-semibold text-ink-3">{parts.month}</small>
        </span>
        {/* Pas de vignette sous `sm`. Entre la date, elle et le chevron, il ne
            restait que 160 px au texte à 375 px de large : titre, communauté,
            heure et prix s'y empilaient sur quatre lignes, et une rangée
            montait à 126 px. Le bloc de date suffit à rythmer la liste. */}
        <CommunityThumb
          thumbnail={item.thumbnail}
          name={item.communityName}
          compact
          className="hidden h-14 w-[84px] rounded-nk-sm sm:grid"
        />
        <span className="min-w-0 flex-1">
          <span className="sr-only">{parts.long}, </span>
          <b className="block truncate text-[14.5px] font-bold text-ink group-hover:text-brand">
            {item.title}
          </b>
          {/* La communauté a sa ligne sur téléphone, où la place manque ; à
              partir de `sm` elle rejoint celle de l'heure. Une ligne de moins :
              la rangée tombait à 108 px sur un écran qui avait toute la
              largeur pour la tenir en trois. */}
          <span className="block truncate text-[13px] text-ink-2 sm:hidden">{item.communityName}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-ink-3">
            <span className="hidden max-w-[40ch] truncate text-ink-2 sm:inline">{item.communityName}</span>
            <span className="whitespace-nowrap">
              {parts.time} · {item.durationMinutes} min
            </span>
            {mark}
          </span>
          {host ? <span className="block truncate text-[13px] text-ink-3">soit {host}</span> : null}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export function UpcomingEvents({
  mine,
  trending,
  hasCommunities,
  agendaHref,
  exploreHref,
  className,
}: {
  mine: EventItem[];
  trending: EventItem[];
  /** Sans communauté, l'onglet vide invite à en rejoindre une. */
  hasCommunities: boolean;
  agendaHref: string;
  exploreHref: string;
  className?: string;
}) {
  const now = useNow();
  // Ouvert sur « Mes communautés » s'il a quelque chose à montrer : un nouvel
  // inscrit n'arrive jamais sur un onglet vide quand l'autre ne l'est pas.
  const [origin, setOrigin] = React.useState<Origin>(
    mine.length > 0 || trending.length === 0 ? "mine" : "trending",
  );
  const [period, setPeriod] = React.useState<Period>("all");

  const end = now ? periodEnd(period, now) : null;
  const keep = (items: EventItem[], bound: Date | null) =>
    now ? items.filter((item) => isShown(item, now, bound)) : items;

  const lists = { mine: keep(mine, end), trending: keep(trending, end) };
  // Les compteurs des onglets ignorent la période : ils disent ce que l'onglet
  // contient, pas ce que le filtre en laisse — sinon « Tendance 0 » sous
  // « Aujourd'hui » ferait croire l'onglet vide pour de bon.
  const counts = { mine: keep(mine, null).length, trending: keep(trending, null).length };
  const shown = lists[origin];

  return (
    <section aria-labelledby="evenements-a-venir" className={className}>
      <SectionTitle
        id="evenements-a-venir"
        title="Événements à venir"
        href={agendaHref}
        linkLabel="Mon agenda"
        className="mb-2"
      />
      <Tabs
        label="Origine des événements"
        panelId="evenements-liste"
        value={origin}
        onValueChange={(value) => setOrigin(value as Origin)}
        items={[
          { value: "mine", label: "Mes communautés", count: counts.mine },
          { value: "trending", label: "Tendance", count: counts.trending },
        ]}
        className="mb-3 sm:mb-4"
      />
      <Tabs
        variant="pill"
        label="Période"
        panelId="evenements-liste"
        value={period}
        onValueChange={(value) => setPeriod(value as Period)}
        items={PERIODS}
        className="mb-3 sm:mb-4"
      />

      <div id="evenements-liste">
        {shown.length === 0 ? (
          <div className="rounded-nk-lg border-[1.5px] border-dashed border-line px-4 py-5 text-center text-[14px] leading-relaxed text-ink-2">
            {origin === "mine" ? (
              <>
                <p>
                  {hasCommunities
                    ? `Aucune séance prévue dans vos communautés${PERIOD_SUFFIX[period]}.`
                    : "Rejoignez une communauté pour retrouver ici ses séances en direct."}
                </p>
                {counts.trending > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOrigin("trending")}
                    className="nk-tap relative mt-2 cursor-pointer font-bold text-brand"
                  >
                    Voir les séances en tendance
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p>Aucune séance annoncée par d&apos;autres communautés{PERIOD_SUFFIX[period]}.</p>
                <Link href={exploreHref} className="nk-tap relative mt-2 inline-block font-bold text-brand">
                  Explorer les communautés
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {shown.slice(0, MAX_ROWS).map((item) => (
                <EventRow key={item.id} item={item} now={now} />
              ))}
            </ul>
            {shown.length > MAX_ROWS ? (
              <p className="mt-3 text-[13px] text-ink-2">
                Et {shown.length - MAX_ROWS} autre{shown.length - MAX_ROWS > 1 ? "s" : ""}.{" "}
                <Link
                  href={origin === "mine" ? agendaHref : exploreHref}
                  className="nk-tap relative font-bold text-brand"
                >
                  {origin === "mine" ? "Tout l'agenda" : "Explorer les communautés"}
                </Link>
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
