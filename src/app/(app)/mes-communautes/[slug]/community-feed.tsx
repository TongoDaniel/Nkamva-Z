"use client";

import * as React from "react";
import Link from "next/link";
import { Library, MessageSquare, MessageSquareOff, Radio } from "lucide-react";
import { Tabs } from "@/components/nk/tabs";
import { EmptyState } from "@/components/nk/empty-state";
import { LiveSessionRow, ReplayRow } from "@/components/nk/live-row";
import { ScheduleLive } from "@/components/screens/schedule-live";
import type { AgendaSession, ReplayView } from "@/lib/lives";

/**
 * Ce que la page d'une communauté montre encore : ses **ressources incluses** et
 * ses **sessions**.
 *
 * Les annonces et le fil de discussion vivaient ici. Ils sont devenus le groupe
 * de la communauté, dans la messagerie (arbitrage 126), et leur historique y a
 * basculé. Ce qui reste ne se parle pas : ce sont des choses à consulter.
 *
 * Le renvoi vers le groupe est donc permanent, et pas un pansement de
 * transition : quelqu'un qui vient chercher la conversation ici doit savoir où
 * elle se tient, sans avoir à le deviner.
 */
export function CommunityFeed({
  community,
  forumEnabled,
  resourcesEnabled,
  eventsEnabled,
  isTrainer,
  resources,
  resourcesCount,
  sessions,
  replays,
}: {
  /** Identité de la communauté, que la rubrique des sessions passe au formulaire. */
  community: { id: string; name: string };
  /** Le groupe est-il ouvert ? Décide du renvoi, pas d'une rubrique. */
  forumEnabled: boolean;
  resourcesEnabled: boolean;
  eventsEnabled: boolean;
  isTrainer: boolean;
  /**
   * La grille des ressources, rendue par la page. Un nœud et non les données :
   * `ResourceCard` lit des objets Prisma que la frontière client ne sait pas
   * sérialiser telle quelle.
   */
  resources: React.ReactNode;
  resourcesCount: number;
  /** Séances à venir et en cours de cette communauté. Vide si `eventsEnabled` est faux. */
  sessions: AgendaSession[];
  replays: ReplayView[];
}) {
  const rubriques = [
    resourcesEnabled && {
      value: "RESOURCES",
      label: "Ressources incluses",
      count: resourcesCount,
    },
    // Le compteur ne porte que les séances à venir : un replay n'est pas une
    // échéance, et le faire gonfler la pastille annoncerait un rendez-vous là où
    // il n'y a qu'une archive.
    eventsEnabled && { value: "SESSIONS", label: "Sessions", count: sessions.length },
  ].filter(Boolean) as Array<{ value: string; label: string; count: number }>;

  const [rubrique, setRubrique] = React.useState(rubriques[0]?.value ?? "RESOURCES");

  const versGroupe = forumEnabled ? (
    <p className="flex flex-wrap items-center justify-between gap-3 rounded-nk-lg border border-line bg-card border-l-4 border-l-brand px-4 py-3 text-[13.5px] leading-relaxed text-ink-2 rounded-l-sm">
      <span className="flex items-start gap-2.5">
        <MessageSquare className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <span>
          Les échanges de cette communauté se passent dans{" "}
          <b className="text-ink">son groupe</b>, avec vos autres conversations.
        </span>
      </span>
      <Link href="/messagerie" className="nk-tap shrink-0 font-bold text-brand">
        Ouvrir le groupe
      </Link>
    </p>
  ) : null;

  if (rubriques.length === 0) {
    return (
      <div className="grid gap-4">
        {versGroupe}
        <EmptyState
          icon={<MessageSquareOff />}
          title="Rien d'ouvert ici"
          description="L'animateur de cette communauté n'a ouvert ni les ressources partagées, ni les sessions en direct."
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {versGroupe}

      {rubriques.length > 1 ? (
        <div className="mt-5">
          <Tabs
            items={rubriques}
            value={rubrique}
            onValueChange={setRubrique}
            label="Rubriques de la communauté"
            panelId="rubrique-panel"
          />
        </div>
      ) : null}

      <div id="rubrique-panel" className="mt-5 grid gap-4">
        {rubrique === "SESSIONS" ? (
          <SessionsSalon
            sessions={sessions}
            replays={replays}
            isTrainer={isTrainer}
            community={community}
          />
        ) : resourcesCount > 0 ? (
          resources
        ) : (
          <EmptyState
            icon={<Library />}
            title="Aucune ressource incluse"
            description={
              isTrainer
                ? "Rattachez vos ressources à cette communauté depuis la console d'animation : vos membres les retrouveront ici."
                : "L'animateur n'a encore rattaché aucune ressource à cette communauté."
            }
          />
        )}
      </div>
    </div>
  );
}

function SessionsSalon({
  sessions,
  replays,
  isTrainer,
  community,
}: {
  sessions: AgendaSession[];
  replays: ReplayView[];
  isTrainer: boolean;
  community: { id: string; name: string };
}) {
  if (sessions.length === 0 && replays.length === 0) {
    return (
      <EmptyState
        icon={<Radio />}
        title="Aucune session pour l'instant"
        description={
          isTrainer
            ? "Les séances que vous programmez pour cette communauté s'afficheront ici, et leurs enregistrements à leur suite."
            : "Quand l'animateur programmera une séance, elle apparaîtra ici, et son replay y restera ensuite."
        }
        action={isTrainer ? <ScheduleLive communities={[community]} inCommunity /> : null}
      />
    );
  }

  const heading = "text-[13px] font-extrabold uppercase tracking-wide text-ink-3";

  return (
    <>
      {isTrainer ? (
        <div className="flex justify-end">
          <ScheduleLive communities={[community]} inCommunity />
        </div>
      ) : null}

      {sessions.length > 0 ? (
        <section className="grid gap-2.5">
          <h3 className={heading}>À venir</h3>
          {sessions.map((session) => (
            <LiveSessionRow key={session.id} session={session} showCommunity={false} />
          ))}
        </section>
      ) : null}

      {replays.length > 0 ? (
        <section className="grid gap-2.5">
          <h3 className={heading}>Replays</h3>
          {replays.map((replay) => (
            <ReplayRow key={replay.id} replay={replay} showCommunity={false} />
          ))}
        </section>
      ) : null}
    </>
  );
}
