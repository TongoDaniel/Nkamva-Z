"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Clock, DoorOpen, Radio, Users } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import { useSessionTimeZone } from "@/hooks/use-reader-time-zone";
// Le type seulement : `lib/lives` ouvre la base, il ne doit pas entrer dans le
// navigateur. Le délai d'ouverture arrive par une prop.
import type { LiveSessionCard } from "@/lib/lives";

/**
 * La fiche d'une séance, côté écran.
 * ==========================================================================
 * Composant client pour trois raisons, toutes liées à l'horloge du lecteur :
 * l'heure s'écrit dans **son** fuseau (`useSessionTimeZone`), le délai restant
 * dépend de l'instant où il lit, et le fichier d'agenda se fabrique dans son
 * navigateur.
 *
 * Le rappel, ici, c'est l'agenda du téléphone : le fichier `.ics` porte une
 * alarme un quart d'heure avant. La plateforme n'envoie pas encore de rappel
 * elle-même, et la fiche ne le promet pas.
 * ==========================================================================
 */

/** « dans 4 jours », « dans 3 h 20 », « dans 12 min » — jamais de secondes. */
function delai(startsAt: Date, now: number): string | null {
  const ms = startsAt.getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `dans ${Math.max(1, minutes)} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) {
    const reste = minutes % 60;
    return reste > 0 ? `dans ${heures} h ${String(reste).padStart(2, "0")}` : `dans ${heures} h`;
  }
  const jours = Math.round(heures / 24);
  return `dans ${jours} jour${jours > 1 ? "s" : ""}`;
}

/** `20261121T190000Z` — l'instant en temps universel, comme le veut le format. */
function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Virgules, points-virgules et retours à la ligne s'échappent dans un texte iCalendar. */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

function buildIcs(card: LiveSessionCard, roomUrl: string, opensMinutes: number): string {
  const end = new Date(card.startsAt.getTime() + card.durationMinutes * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NKAMVA//Seances//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:seance-${card.id}@nkamva`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(card.startsAt)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(card.title)}`,
    `DESCRIPTION:${icsText(
      [card.description, `${card.community.name}, animé par ${card.host.name}.`, roomUrl]
        .filter(Boolean)
        .join("\n\n"),
    )}`,
    `URL:${roomUrl}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(card.title)}`,
    `TRIGGER:-PT${opensMinutes}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function SessionCard({
  card,
  opensMinutes,
}: {
  card: LiveSessionCard;
  /** Minutes avant l'heure où la salle d'attente s'ouvre (`WAITING_ROOM_OPENS_MINUTES`). */
  opensMinutes: number;
}) {
  const router = useRouter();
  const { timeZone, hostLabel } = useSessionTimeZone(card.timeZone);
  // Le délai dépend de l'horloge : nul au premier rendu, pour que le serveur
  // et le navigateur écrivent la même page.
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  // À l'heure où la salle d'attente s'ouvre, la fiche se relit : le bouton
  // d'entrée apparaît sans qu'on ait à recharger la page.
  const opensAt = card.roomOpensAt.getTime();
  const roomOpen = card.roomOpen || (now !== null && now >= opensAt);
  React.useEffect(() => {
    if (card.roomOpen || card.status !== "SCHEDULED") return;
    const wait = opensAt - Date.now();
    // `setTimeout` déborde au-delà de 24 jours ; une fiche ouverte si longtemps
    // sera rechargée bien avant.
    if (wait <= 0 || wait > 12 * 3_600_000) return;
    const id = window.setTimeout(() => router.refresh(), wait + 1_000);
    return () => window.clearTimeout(id);
  }, [card.roomOpen, card.status, opensAt, router]);

  const jour = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(card.startsAt);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(card.startsAt);
  const chezLui = hostLabel(card.startsAt);
  const reste = now === null ? null : delai(card.startsAt, now);

  const live = card.status === "LIVE";
  const ended = card.status === "ENDED";

  function addToCalendar() {
    const roomUrl = `${window.location.origin}/mes-lives/live/${card.id}`;
    const blob = new Blob([buildIcs(card, roomUrl, opensMinutes)], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "seance-nkamva.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }

  return (
    <div className="mt-2 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm sm:p-7">
        <div className="flex flex-wrap items-center gap-2.5">
          {live ? (
            <StPill tone="bad">En direct</StPill>
          ) : ended ? (
            <StPill tone="muted">Terminée</StPill>
          ) : (
            <StPill tone="muted">Programmée</StPill>
          )}
          {!live && !ended && reste ? (
            <span className="text-[13.5px] font-semibold text-ink-2">Commence {reste}</span>
          ) : null}
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-brand"
              aria-hidden="true"
            >
              <Radio className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <dt className="text-[13px] font-semibold text-ink-3">Date</dt>
              <dd className="text-[15.5px] font-bold first-letter:uppercase">{jour}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-brand"
              aria-hidden="true"
            >
              <Clock className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <dt className="text-[13px] font-semibold text-ink-3">Heure et durée</dt>
              <dd className="text-[15.5px] font-bold">
                {heure} · {card.durationMinutes} min
              </dd>
              {chezLui ? <dd className="text-[13px] text-ink-2">soit {chezLui}</dd> : null}
            </div>
          </div>
        </dl>

        {card.description ? (
          <>
            <h2 className="mb-2 mt-7 border-t border-line-2 pt-6 text-[16px] font-extrabold">
              Au programme
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-2 text-pretty">{card.description}</p>
          </>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-3 border-t border-line-2 pt-6">
          {ended ? (
            <BtnLink href="/mes-lives?onglet=replays">Voir les replays</BtnLink>
          ) : roomOpen ? (
            <BtnLink
              href={
                card.isHost ? `/formateur/lives/${card.id}/console` : `/mes-lives/live/${card.id}`
              }
            >
              <DoorOpen aria-hidden="true" />
              {card.isHost
                ? "Ouvrir la console"
                : live
                  ? "Rejoindre le direct"
                  : "Entrer dans la salle d'attente"}
            </BtnLink>
          ) : null}
          {!ended && !live ? (
            <Btn variant={roomOpen ? "o" : "p"} onClick={addToCalendar}>
              <CalendarPlus aria-hidden="true" />
              Ajouter à mon agenda
            </Btn>
          ) : null}
        </div>

        {!ended && !live && !roomOpen ? (
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-3">
            La salle d&apos;attente ouvre {opensMinutes} minutes avant le début. Le
            fichier d&apos;agenda ajoute un rappel à ce moment-là, sur votre téléphone ou votre
            ordinateur.
          </p>
        ) : null}
      </section>

      <aside className="grid gap-5">
        <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
          <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-ink-3">
            Animée par
          </h2>
          <div className="flex items-center gap-3.5">
            <Avatar
              name={card.host.name}
              src={card.host.avatarUrl}
              size="lg"
              alt={`Photo de ${card.host.name}`}
            />
            <div className="min-w-0">
              <b className="block text-[15.5px] font-extrabold">{card.host.name}</b>
              <small className="block text-[13px] leading-snug text-ink-2">{card.host.role}</small>
            </div>
          </div>
        </section>

        <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
          <h2 className="mb-1.5 flex items-center gap-2 text-[15px] font-bold">
            <Users className="size-4 text-ink-3" aria-hidden="true" />
            {card.community.name}
          </h2>
          <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
            Cette séance est réservée aux membres de la communauté. Elle est enregistrée : son
            replay y sera disponible ensuite.
          </p>
          <BtnLink href={`/mes-communautes/${card.community.slug}`} variant="o" size="sm" block>
            Ouvrir la communauté
          </BtnLink>
        </section>
      </aside>
    </div>
  );
}
