import { BtnLink } from "./button-link";
import { StPill } from "./status-pill";
import { fmtDuration, fmtNumber } from "@/lib/format";
import type { AgendaSession, ReplayView } from "@/lib/lives";

/**
 * Les lignes d'agenda et de replay, partagées par `/mes-lives` et par le salon
 * « Sessions » d'une communauté.
 *
 * Elles vivent ici et non dans `agenda-pane.tsx` parce que deux écrans les
 * rendent : recopier le balisage aurait produit une seconde génération de
 * lignes, qui aurait dérivé au premier ajustement — le défaut exact que la
 * convergence des cartes de ressource a coûté cher à corriger.
 */

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

/**
 * Arbitrage 107 — l'heure s'affiche toujours dans le fuseau du lecteur ; on
 * rappelle celui de l'animateur **seulement** s'il en diffère.
 *
 * Sans cette condition, tout le monde lirait « 18 h 00 (Africa/Douala) » à
 * Douala, ce qui n'apprend rien et alourdit chaque ligne. Avec, un membre de la
 * diaspora sait que 19 h 00 chez lui est bien la séance de 18 h 00 annoncée.
 * Le nom de ville plutôt que l'identifiant : « Douala » se lit, `Africa/Douala`
 * se déchiffre.
 */
export function hostTimeLabel(date: Date, timeZone: string | null): string | null {
  if (!timeZone) return null
  try {
    if (timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone) return null
    const time = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(date);
    const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
    return `${time} à ${city}`;
  } catch {
    // Fuseau inconnu du navigateur : mieux vaut ne rien dire que d'afficher un
    // identifiant brut à côté d'une heure déjà juste.
    return null;
  }
}

const ROW = "flex flex-wrap items-center gap-4 rounded-nk border border-line bg-card px-4 py-3.5";

/** Bloc de date à gauche de chaque ligne, comme `.live-date` de la maquette. */
export function DateBlock({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span
      className="grid size-[52px] shrink-0 place-items-center rounded-nk-sm border border-line bg-paper leading-none"
      aria-hidden="true"
    >
      <b className="font-display text-[19px] font-extrabold">{top}</b>
      <small className="text-[13px] font-semibold uppercase text-ink-3">{bottom}</small>
    </span>
  );
}

export function LiveSessionRow({
  session,
  /**
   * Faux dans le salon d'une communauté : son nom est déjà le titre de la page,
   * le répéter sur chaque ligne ne dit rien de plus.
   */
  showCommunity = true,
}: {
  session: AgendaSession;
  showCommunity?: boolean;
}) {
  return (
    <article className={ROW}>
      <DateBlock top={dayNumber(session.startsAt)} bottom={shortDay(session.startsAt)} />
      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 text-[15.5px] font-bold">
          {session.title}
          {session.live ? <StPill tone="bad">En direct</StPill> : null}
          {session.mine ? <StPill tone="ok">J&apos;anime</StPill> : null}
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-2">
          {showCommunity ? `${session.community.name} · ` : ""}
          {/* Côté animateur, le chiffre utile est le nombre d'inscrits ; côté
              participant, c'est qui anime. */}
          {session.mine
            ? `${fmtNumber(session.attendees)} inscrit${session.attendees > 1 ? "s" : ""}`
            : session.host.name}{" "}
          · {timeLabel(session.startsAt)} · {session.durationMinutes} min
        </p>
        {hostTimeLabel(session.startsAt, session.timeZone) ? (
          <p className="mt-0.5 truncate text-[13px] text-ink-3">
            soit {hostTimeLabel(session.startsAt, session.timeZone)}
          </p>
        ) : null}
      </div>
      {session.mine ? (
        <BtnLink
          href={`/formateur/lives/${session.id}/console`}
          variant={session.live ? "p" : "o"}
          size="sm"
        >
          {session.live ? "Ouvrir la console" : "Préparer"}
        </BtnLink>
      ) : (
        <BtnLink
          href={`/mes-lives/live/${session.id}`}
          variant={session.live ? "p" : "o"}
          size="sm"
        >
          {session.live ? "Rejoindre" : "Voir"}
        </BtnLink>
      )}
    </article>
  );
}

export function ReplayRow({
  replay,
  showCommunity = true,
}: {
  replay: ReplayView;
  showCommunity?: boolean;
}) {
  return (
    <article className={ROW}>
      <DateBlock top={dayNumber(replay.recordedAt)} bottom={shortMonth(replay.recordedAt)} />
      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 text-[15.5px] font-bold">
          {replay.title}
          {replay.mine ? <StPill tone="ok">Ma séance</StPill> : null}
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-2">
          {showCommunity ? `${replay.community.name} · ` : ""}
          {replay.host.name} · {fmtDuration(replay.durationSeconds)}
        </p>
      </div>
      <BtnLink href={`/mes-lives/replay/${replay.id}`} size="sm">Regarder</BtnLink>
    </article>
  );
}
