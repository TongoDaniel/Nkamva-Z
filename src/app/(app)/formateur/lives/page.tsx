import type { Metadata } from "next";
import Link from "next/link";
import { PlayCircle, Radio, Users, Video } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { listTrainerSessions, listMyReplays } from "@/lib/lives";
import { fmtDuration, fmtNumber } from "@/lib/format";
import { ScheduleLive } from "./schedule-live";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes sessions live",
  robots: { index: false },
};

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function FormateurLivesPage() {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const [all, replays, communities] = await Promise.all([
    listTrainerSessions(auth.user.trainerId),
    listMyReplays(auth.user.id),
    // Un live appartient à une communauté (arbitrage 32) : sans communauté
    // ouverte, il n'y a rien à programmer, et le formulaire le dit.
    db.community.findMany({
      where: { trainerId: auth.user.trainerId, status: "active", eventsEnabled: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // « À animer » ne montre pas le passé : une séance terminée appartient à ses
  // replays, pas à l'agenda.
  const sessions = all
    .filter((s) => s.status === "SCHEDULED" || s.status === "LIVE")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const registered = sessions.reduce((total, s) => total + s.attendees, 0);

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Mes sessions" }]}
        title="Mes sessions live"
        lead="Les sessions que vous animez et les replays qu'elles ont produits."
        actions={<ScheduleLive communities={communities} />}
      />

      <div className="my-8 grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={<Radio />}
          tone="brand"
          value={sessions.length}
          label={`session${sessions.length > 1 ? "s" : ""} à animer`}
        />
        <StatTile
          icon={<Users />}
          tone="blue"
          value={fmtNumber(registered)}
          label="inscriptions cumulées"
        />
        <StatTile
          icon={<PlayCircle />}
          tone="gold"
          value={replays.length}
          label={`replay${replays.length > 1 ? "s" : ""} enregistré${replays.length > 1 ? "s" : ""}`}
        />
      </div>

      <section aria-labelledby="a-animer" className="mb-10">
        <h2 id="a-animer" className="mb-4 text-[17px] font-bold">
          À animer
        </h2>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<Radio />}
            title="Aucune session programmée"
            description="Les lives que vous programmez pour vos communautés apparaîtront ici."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center gap-4 rounded-nk-lg border border-line bg-card px-5 py-4 shadow-nk-sm"
              >
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
                  aria-hidden="true"
                >
                  <Video className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold">
                    {session.title}
                    {session.live ? <StPill tone="bad">En direct</StPill> : null}
                  </h3>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
                    {session.community.name} · {dateLabel(session.startsAt)} ·{" "}
                    {session.durationMinutes} min · {fmtNumber(session.attendees)} inscrits
                  </p>
                </div>
                <Btn asChild variant={session.live ? "p" : "o"} size="sm">
                  <Link href={`/formateur/lives/${session.id}/console`}>
                    {session.live ? "Ouvrir la console" : "Préparer"}
                  </Link>
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="replays" className="mb-10">
        <h2 id="replays" className="mb-1.5 text-[17px] font-bold">
          Replays produits
        </h2>
        {/* Arbitrages 38 et 34 : l'enregistrement n'est pas une option, et c'est
            la date du live qui datera le replay pour l'accès des membres. */}
        <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
          Chaque live est enregistré automatiquement : vous n&apos;avez rien à déclencher. Le replay
          porte la date de la session, pas celle de sa mise en ligne — c&apos;est elle qui décide
          qui y garde accès après avoir quitté la communauté.
        </p>
        {replays.length === 0 ? (
          <EmptyState
            icon={<PlayCircle />}
            title="Aucun replay pour l'instant"
            description="Le premier live que vous animerez produira son enregistrement ici."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {replays.map((replay) => (
              <li
                key={replay.id}
                className="flex flex-wrap items-center gap-4 rounded-nk-lg border border-line bg-card px-5 py-4 shadow-nk-sm"
              >
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-tint text-gold-ink"
                  aria-hidden="true"
                >
                  <PlayCircle className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14.5px] font-bold">{replay.title}</h3>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
                    {replay.community.name} · live du{" "}
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }).format(replay.recordedAt)}{" "}
                    · {fmtDuration(replay.durationSeconds)}
                  </p>
                </div>
                <Btn asChild variant="o" size="sm">
                  <Link href={`/mes-lives/replay/${replay.id}`}>Revoir</Link>
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Arbitrage 43, requalifié par 55 : les deux cadences ayant des droits
          identiques, aucune ne refuse le téléchargement — il est devenu un droit
          uniforme. Ce qui subsiste de l'arbitrage 43, c'est l'interdit : pas de
          case « téléchargeable » par session. Ne pas en ajouter. */}
      <p className="rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
        Tout membre de la communauté peut télécharger vos replays : c&apos;est un droit uniforme,
        il n&apos;y a rien à cocher par session. Chaque enregistrement est conservé 24 mois, puis
        supprimé — vous serez prévenu un mois avant, et l&apos;espace vous sera rendu.
      </p>
    </div>
  );
}
