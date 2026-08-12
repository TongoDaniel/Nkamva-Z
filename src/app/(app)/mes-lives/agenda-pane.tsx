"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, PlayCircle, Radio, X } from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { EmptyState } from "@/components/nk/empty-state";
import { LiveSessionRow, ReplayRow } from "@/components/nk/live-row";
import { Tabs } from "@/components/nk/tabs";
import { cn } from "@/lib/utils";
import type { AgendaSession, ReplayView } from "@/lib/lives";

type Tab = "upcoming" | "replays";

/**
 * Le filtre d'origine, qui remplace la séparation en deux écrans. `all` est le
 * défaut : l'intérêt de la fusion est justement de voir d'un coup ce qu'on
 * anime et ce qu'on suit, l'un à côté de l'autre et dans l'ordre du temps.
 */
type Origin = "all" | "mine" | "joined";

const DAY_NAMES = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

/** Clé de jour, commune au calendrier et au filtre de liste. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function longDay(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(date);
}

/** Ce qu'un jour du calendrier porte — un jour peut porter les trois. */
interface DayMark {
  mine: boolean;
  joined: boolean;
  replay: boolean;
  count: number;
}

/**
 * Grille d'un mois. Trois choses la séparent de la version précédente, qui ne
 * servait qu'à sauter vers une ligne :
 *
 * 1. elle navigue de mois en mois — un agenda qui ne montre que le mois courant
 *    ne dit rien d'une séance programmée le 2 du mois suivant ;
 * 2. un jour porte autant de pastilles que d'origines, là où la version d'avant
 *    n'en retenait qu'une seule par jour et masquait silencieusement le reste ;
 * 3. cliquer un jour **filtre** la liste sur ce jour au lieu d'y faire défiler,
 *    ce qui reste vrai quand le jour porte plusieurs entrées.
 */
function MonthGrid({
  marks,
  selected,
  onPick,
  showOrigins,
}: {
  marks: Map<string, DayMark>;
  selected: string | null;
  onPick: (key: string, mark: DayMark) => void;
  showOrigins: boolean;
}) {
  const today = new Date();
  const [offset, setOffset] = React.useState(0);

  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay() met dimanche à 0 ; la semaine française commence lundi.
  const leading = (view.getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    view,
  );

  const navClass =
    "nk-tap grid size-8 cursor-pointer place-items-center rounded-nk-sm text-ink-2 transition hover:bg-line-2 hover:text-ink";

  return (
    <section
      aria-label={`Calendrier de ${monthLabel}`}
      className="rounded-nk-lg border border-line bg-card p-3 shadow-nk-sm sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 aria-live="polite" className="text-[15px] font-extrabold capitalize">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setOffset(offset - 1)}
            aria-label="Mois précédent"
            className={navClass}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          {offset === 0 ? null : (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="nk-tap cursor-pointer rounded-nk-sm px-2 py-1 text-[12px] font-bold text-brand hover:bg-brand-tint"
            >
              Ce mois
            </button>
          )}
          <button
            type="button"
            onClick={() => setOffset(offset + 1)}
            aria-label="Mois suivant"
            className={navClass}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Padding réduit sous `sm` : sept colonnes dans 339 px ne laissent que
          39 px par case avec `p-5`, sous les 44 px de cible tactile. À `p-3` la
          case monte à 41,6 px, et `nk-tap` complète jusqu'à 44 px sans empiéter
          sur la voisine (2,4 px demandés dans 4 px de gouttière).

          Hauteur fixée, et non `aspect-square` : le panneau ne passe en colonne
          de 300 px qu'à partir de 1024 px. En dessous il s'empile sous la liste
          et prend toute la largeur — une case carrée y faisait 125 px de haut,
          et le mois occupait un écran entier. */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_NAMES.map((d) => (
          <span key={d} className="py-1 text-[11px] font-bold uppercase text-ink-3">
            {d}
          </span>
        ))}
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`vide-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = `${year}-${month}-${day}`;
          const mark = marks.get(key);
          const isToday =
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear();
          const isSelected = selected === key;

          if (!mark) {
            return (
              <span
                key={day}
                className={cn(
                  "grid min-h-[42px] place-items-center rounded-nk-sm text-[13px] text-ink-2",
                  isToday && "font-extrabold text-ink ring-1 ring-line",
                )}
              >
                {day}
              </span>
            );
          }

          // Le libellé énumère ce que le jour porte : les pastilles de couleur
          // ne sont pas lisibles au lecteur d'écran, ni sans perception des
          // couleurs. Même principe que `StPill`, qui rend toujours son texte.
          const parts = [
            mark.mine ? "une séance que vous animez" : null,
            mark.joined ? "un live de vos communautés" : null,
            mark.replay ? "un replay" : null,
          ].filter(Boolean);

          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(key, mark)}
              aria-pressed={isSelected}
              aria-label={`${day} ${monthLabel} — ${parts.join(", ")}`}
              className={cn(
                "nk-tap relative grid min-h-[42px] cursor-pointer place-items-center rounded-nk-sm text-[13px] font-bold transition",
                isSelected
                  ? "bg-ink text-paper"
                  : "bg-brand-tint text-brand hover:bg-brand-tint-2",
                isToday && !isSelected && "ring-2 ring-ink",
              )}
            >
              <span className="-mt-1">{day}</span>
              <span
                className="absolute inset-x-0 bottom-1 flex justify-center gap-[3px]"
                aria-hidden="true"
              >
                {/* Sans formateur à l'écran, tout ce qui n'est pas un replay
                    vient des communautés : deux couleurs pour une seule
                    distinction possible n'apprendraient rien. */}
                {showOrigins && mark.mine ? (
                  <i className={cn("size-1 rounded-full", isSelected ? "bg-paper" : "bg-brand")} />
                ) : null}
                {mark.joined ? (
                  <i className={cn("size-1 rounded-full", isSelected ? "bg-paper/70" : "bg-info")} />
                ) : null}
                {mark.replay ? (
                  <i className={cn("size-1 rounded-full", isSelected ? "bg-paper/70" : "bg-gold")} />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
        Cliquez un jour marqué pour n&apos;afficher que ce qu&apos;il porte.
      </p>
    </section>
  );
}

export function AgendaPane({
  sessions,
  replays,
  isTrainer,
  exploreHref,
}: {
  sessions: AgendaSession[];
  replays: ReplayView[];
  /** Affiche le filtre d'origine et les repères « J'anime ». */
  isTrainer: boolean;
  exploreHref: string;
}) {
  const [tab, setTab] = React.useState<Tab>("upcoming");
  const [origin, setOrigin] = React.useState<Origin>("all");
  const [day, setDay] = React.useState<string | null>(null);

  const keeps = React.useCallback(
    (mine: boolean) => origin === "all" || (origin === "mine") === mine,
    [origin],
  );

  const byOrigin = React.useMemo(
    () => ({
      sessions: sessions.filter((s) => keeps(s.mine)),
      replays: replays.filter((r) => keeps(r.mine)),
    }),
    [sessions, replays, keeps],
  );

  // Le calendrier suit le filtre d'origine : marquer un jour pour une séance
  // que la liste n'affiche plus produirait un jour cliquable et vide.
  const marks = React.useMemo(() => {
    const map = new Map<string, DayMark>();
    const touch = (date: Date, field: keyof Omit<DayMark, "count">) => {
      const key = dayKey(date);
      const mark = map.get(key) ?? { mine: false, joined: false, replay: false, count: 0 };
      mark[field] = true;
      mark.count += 1;
      map.set(key, mark);
    };
    for (const s of byOrigin.sessions) touch(s.startsAt, s.mine ? "mine" : "joined");
    for (const r of byOrigin.replays) touch(r.recordedAt, "replay");
    return map;
  }, [byOrigin]);

  // Changer d'origine peut retirer du calendrier le jour sélectionné : le
  // filtre se relâche alors de lui-même. Le garder afficherait un état vide
  // sous un calendrier où plus rien ne dit quel jour est retenu.
  const activeDay = day && marks.has(day) ? day : null;

  const shown = React.useMemo(
    () => ({
      sessions: activeDay
        ? byOrigin.sessions.filter((s) => dayKey(s.startsAt) === activeDay)
        : byOrigin.sessions,
      replays: activeDay
        ? byOrigin.replays.filter((r) => dayKey(r.recordedAt) === activeDay)
        : byOrigin.replays,
    }),
    [byOrigin, activeDay],
  );

  const pickDay = (key: string, mark: DayMark) => {
    if (activeDay === key) return setDay(null);
    setDay(key);
    // Bascule vers l'onglet qui a quelque chose à montrer ce jour-là : rester
    // sur « À venir » pour un jour qui ne porte qu'un replay afficherait un
    // état vide juste après un clic censé révéler quelque chose.
    if (mark.mine || mark.joined) setTab("upcoming");
    else if (mark.replay) setTab("replays");
  };

  const dayLabel = React.useMemo(() => {
    if (!activeDay) return null;
    const [y, m, d] = activeDay.split("-").map(Number);
    return longDay(new Date(y, m, d));
  }, [activeDay]);

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <Tabs
          label="Filtrer l'agenda"
          panelId="agenda-liste"
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          items={[
            { value: "upcoming", label: "À venir", count: byOrigin.sessions.length },
            { value: "replays", label: "Replays", count: byOrigin.replays.length },
          ]}
        />

        {/* Le filtre d'origine n'existe que pour qui a deux origines. Un
            apprenant n'anime rien : lui proposer « J'anime » offrirait un
            onglet qui ne peut donner qu'un état vide. */}
        {isTrainer ? (
          <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2">
            <Tabs
              label="Filtrer par origine"
              variant="chip"
              value={origin}
              onValueChange={(value) => setOrigin(value as Origin)}
              items={[
                { value: "all", label: "Tout" },
                { value: "mine", label: "J'anime" },
                { value: "joined", label: "Mes communautés" },
              ]}
            />
          </div>
        ) : null}

        {activeDay ? (
          <p className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span>
              Filtré sur le <b className="font-bold text-ink">{dayLabel}</b>
            </span>
            <button
              type="button"
              onClick={() => setDay(null)}
              className="nk-tap inline-flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[12.5px] font-bold text-ink-2 transition hover:border-ink-3 hover:text-ink"
            >
              <X className="size-3.5" aria-hidden="true" />
              Tout le mois
            </button>
          </p>
        ) : null}

        <div id="agenda-liste" className="flex flex-col gap-2.5">
          {tab === "upcoming" ? (
            shown.sessions.length === 0 ? (
              <EmptyState
                icon={<Radio />}
                title={activeDay ? "Rien de prévu ce jour-là" : "Aucun live planifié"}
                description={
                  activeDay
                    ? "Les autres jours marqués du calendrier portent le reste de votre agenda."
                    : origin === "mine"
                      ? "Les séances que vous programmez pour vos communautés apparaîtront ici."
                      : "Les sessions programmées par vos communautés apparaîtront ici."
                }
                action={
                  !activeDay && origin !== "mine" ? (
                    <BtnLink href={exploreHref} variant="o">Explorer les communautés</BtnLink>
                  ) : null
                }
              />
            ) : (
              shown.sessions.map((session) => (
                <LiveSessionRow key={session.id} session={session} />
              ))
            )
          ) : shown.replays.length === 0 ? (
            <EmptyState
              icon={<PlayCircle />}
              title={activeDay ? "Aucun replay ce jour-là" : "Aucun replay disponible"}
              description={
                activeDay
                  ? "Un replay porte la date de son live, pas celle de sa mise en ligne."
                  : origin === "mine"
                    ? "Le premier live que vous animerez produira son enregistrement ici."
                    : "Les rediffusions de vos communautés se rangeront ici."
              }
            />
          ) : (
            shown.replays.map((replay) => <ReplayRow key={replay.id} replay={replay} />)
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <MonthGrid marks={marks} selected={activeDay} onPick={pickDay} showOrigins={isTrainer} />
        <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
          <span
            className="mb-3 grid size-10 place-items-center rounded-xl bg-gold-tint text-gold-ink"
            aria-hidden="true"
          >
            <CalendarDays className="size-5" />
          </span>
          <h2 className="mb-1.5 text-[15px] font-bold">Ne manquez aucun live</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            Le rappel quinze minutes avant chaque session arrivera avec les préférences de
            notification.
          </p>
        </section>
      </div>
    </div>
  );
}
