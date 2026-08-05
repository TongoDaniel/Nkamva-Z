"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, PlayCircle, Radio } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { EmptyState } from "@/components/nk/empty-state";
import { StPill } from "@/components/nk/status-pill";
import { Tabs } from "@/components/nk/tabs";
import { fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgendaSession, ReplayView } from "@/lib/lives";

type Tab = "upcoming" | "replays";

const DAY_NAMES = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

function dayNumber(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric" }).format(date);
}
function shortDay(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date).replace(".", "");
}
function shortMonth(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", "");
}
function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Bloc de date à gauche de chaque ligne, comme `.live-date` de la maquette. */
function DateBlock({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span
      className="grid size-[52px] shrink-0 place-items-center rounded-nk-sm border border-line bg-paper leading-none"
      aria-hidden="true"
    >
      <b className="font-display text-[19px] font-extrabold">{top}</b>
      <small className="text-[11px] font-semibold uppercase text-ink-3">{bottom}</small>
    </span>
  );
}

/**
 * Grille du mois courant. Les jours porteurs d'un live ou d'un replay sont
 * cliquables et amènent à l'entrée correspondante — le calendrier sert de
 * raccourci vers la liste, il ne la remplace pas.
 */
function MonthGrid({
  marks,
  onPick,
}: {
  marks: Map<string, { tab: Tab; id: string }>;
  onPick: (target: { tab: Tab; id: string }) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay() met dimanche à 0 ; la semaine française commence lundi.
  const offset = (first.getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    first,
  );

  return (
    /* Padding réduit sous `sm` : sept colonnes dans 339 px ne laissent que
       39 px par case avec `p-5`, sous les 44 px de cible tactile. À `p-3` la
       case monte à 41,6 px, et `nk-tap` complète jusqu'à 44 px sans empiéter
       sur la voisine (2,4 px demandés dans 4 px de gouttière). */
    <section
      aria-label={`Calendrier de ${monthLabel}`}
      className="rounded-nk-lg border border-line bg-card p-3 shadow-nk-sm sm:p-5"
    >
      <h2 className="mb-3 text-[15px] font-extrabold capitalize">{monthLabel}</h2>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_NAMES.map((d) => (
          <span key={d} className="py-1 text-[11px] font-bold uppercase text-ink-3">
            {d}
          </span>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`vide-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = `${year}-${month}-${day}`;
          const mark = marks.get(key);
          const isToday = day === today.getDate();
          const label = `${day} ${monthLabel}`;
          if (!mark) {
            return (
              <span
                key={day}
                className={cn(
                  "grid aspect-square place-items-center rounded-nk-sm text-[13px] text-ink-2",
                  isToday && "font-extrabold text-ink ring-1 ring-line",
                )}
              >
                {day}
              </span>
            );
          }
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(mark)}
              aria-label={`${label} — ${mark.tab === "upcoming" ? "live prévu" : "replay disponible"}`}
              className={cn(
                "nk-tap relative grid aspect-square cursor-pointer place-items-center rounded-nk-sm text-[13px] font-bold transition",
                mark.tab === "upcoming"
                  ? "bg-brand text-white hover:bg-brand-dark"
                  : "bg-brand-tint text-brand hover:bg-brand-tint-2",
                isToday && "ring-2 ring-ink",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
        Les jours marqués portent un live ou un replay — cliquez pour l&apos;ouvrir.
      </p>
    </section>
  );
}

export function AgendaPane({
  sessions,
  replays,
}: {
  sessions: AgendaSession[];
  replays: ReplayView[];
}) {
  const [tab, setTab] = React.useState<Tab>("upcoming");
  const [flashed, setFlashed] = React.useState<string | null>(null);

  const marks = React.useMemo(() => {
    const map = new Map<string, { tab: Tab; id: string }>();
    for (const s of sessions) {
      const d = s.startsAt;
      map.set(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, { tab: "upcoming", id: s.id });
    }
    for (const r of replays) {
      const d = r.recordedAt;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, { tab: "replays", id: r.id });
    }
    return map;
  }, [sessions, replays]);

  const pick = ({ tab: target, id }: { tab: Tab; id: string }) => {
    setTab(target);
    setFlashed(id);
    // Le rendu doit avoir eu lieu avant qu'on cherche la ligne à faire défiler.
    window.setTimeout(() => {
      document.getElementById(`agenda-${id}`)?.scrollIntoView({ block: "center" });
    }, 0);
    window.setTimeout(() => setFlashed(null), 1400);
  };

  const rowClass = (id: string) =>
    cn(
      "flex items-center gap-4 rounded-nk border bg-card px-4 py-3.5 transition-colors",
      flashed === id ? "border-brand bg-brand-tint/40" : "border-line",
    );

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <Tabs
          label="Filtrer l'agenda"
          panelId="agenda-liste"
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          items={[
            { value: "upcoming", label: "À venir", count: sessions.length },
            { value: "replays", label: "Replays", count: replays.length },
          ]}
        />

        <div id="agenda-liste" className="flex flex-col gap-2.5">
          {tab === "upcoming" ? (
            sessions.length === 0 ? (
              <EmptyState
                icon={<Radio />}
                title="Aucun live planifié"
                description="Les sessions programmées par vos communautés apparaîtront ici."
              />
            ) : (
              sessions.map((session) => (
                <article key={session.id} id={`agenda-${session.id}`} className={rowClass(session.id)}>
                  <DateBlock top={dayNumber(session.startsAt)} bottom={shortDay(session.startsAt)} />
                  <div className="min-w-0 flex-1">
                    <h3 className="flex flex-wrap items-center gap-2 text-[15.5px] font-bold">
                      {session.title}
                      {session.live ? <StPill tone="bad">En direct</StPill> : null}
                    </h3>
                    <p className="mt-0.5 truncate text-[13px] text-ink-2">
                      {session.community.name} · {timeLabel(session.startsAt)} ·{" "}
                      {session.durationMinutes} min
                    </p>
                  </div>
                  <Btn asChild variant={session.live ? "p" : "o"} size="sm">
                    <Link href={`/mes-lives/live/${session.id}`}>
                      {session.live ? "Rejoindre" : "Voir"}
                    </Link>
                  </Btn>
                </article>
              ))
            )
          ) : replays.length === 0 ? (
            <EmptyState
              icon={<PlayCircle />}
              title="Aucun replay disponible"
              description="Les rediffusions de vos communautés se rangeront ici."
            />
          ) : (
            replays.map((replay) => (
              <article key={replay.id} id={`agenda-${replay.id}`} className={rowClass(replay.id)}>
                <DateBlock
                  top={dayNumber(replay.recordedAt)}
                  bottom={shortMonth(replay.recordedAt)}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15.5px] font-bold">{replay.title}</h3>
                  <p className="mt-0.5 truncate text-[13px] text-ink-2">
                    {replay.community.name} · {replay.host.name} ·{" "}
                    {fmtDuration(replay.durationSeconds)}
                  </p>
                </div>
                <Btn asChild size="sm">
                  <Link href={`/mes-lives/replay/${replay.id}`}>Regarder</Link>
                </Btn>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <MonthGrid marks={marks} onPick={pick} />
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
