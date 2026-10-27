"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Circle,
  Hand,
  Inbox,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PlayCircle,
  Send,
  Square,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { ReportButton } from "@/components/nk/report-button";
import { StPill } from "@/components/nk/status-pill";
import { Hint } from "@/components/nk/hint";
import { LiveControlButton } from "@/components/nk/live-control";
import { LiveStage, SharingNotice } from "@/components/nk/live-stage";
import { Tabs } from "@/components/nk/tabs";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { useLiveRoom } from "@/hooks/use-live-room";
import { cn } from "@/lib/utils";
import type { LiveRoomView } from "@/lib/lives";

type Panel = "requests" | "participants" | "chat";

/**
 * Arbitrage 148 — la console porte le même ton que la salle de l'apprenant : le
 * fond blanc, retenu le 16 septembre 2026. Les couleurs de la scène viennent des
 * jetons `--live-*` (`globals.css`) ; `"sombre"` rend le bleu nuit d'origine.
 */
const TON: "clair" | "sombre" = "clair";

/** « il y a 1 min 35 s » — l'attente d'une demande de parole se lit d'un coup d'œil. */
function waitedLabel(since: Date, at: number): string {
  const seconds = Math.max(0, Math.round((at - since.getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

export function LiveConsole({ room }: { room: LiveRoomView }) {
  const router = useRouter();
  /**
   * Le volet ouvert sous la scène, ou `null` quand le panneau est replié —
   * même règle que la salle de l'apprenant (arbitrages 148 et 149). `volet` est
   * ce que montrent les onglets à partir de `lg`, où rien ne se replie.
   */
  // Replié à l'ouverture, comme la salle : la pastille du bouton Demandes
  // suffit à signaler une main levée sans occuper la moitié de l'écran.
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const volet: Panel = panel ?? "requests";
  const replie = panel === null;
  const basculer = (cible: Panel) => setPanel((courant) => (courant === cible ? null : cible));
  const fil = React.useRef<HTMLUListElement | null>(null);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = React.useState("");
  const action = useKeyedAction();
  // Les durées d'attente dépendent de l'horloge : les calculer au rendu serveur
  // donnerait une autre valeur à l'hydratation. On n'affiche qu'après montage.
  const [clock, setClock] = React.useState<number | null>(null);

  const live = room.live;
  const transport = useLiveRoom(
    live ? room.serverUrl : null,
    live ? room.token : null,
    live ? room.id : null,
  );

  React.useEffect(() => {
    const el = fil.current;
    if (!el || volet !== "chat") return;
    const enBas = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (enBas || el.scrollTop === 0) el.scrollTop = el.scrollHeight;
  }, [room.messages, volet]);

  React.useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // La salle bouge sans nous : mains levées et arrivées se suivent par
  // rafraîchissement régulier. Convention du projet : polling, pas de WebSocket.
  React.useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [live, router]);

  /**
   * Pourquoi micro et caméra sont éteints — `null` quand ils sont utilisables.
   *
   * Ils ne s'activent que sur une salle connectée, et il n'y a pas de salle
   * tant que la séance n'est pas ouverte : `useLiveRoom` reçoit `null` dans ce
   * cas et ne tente aucune connexion. C'est voulu ; ce qui ne l'était pas,
   * c'est que les boutons annoncent « Activer mon micro » sans jamais pouvoir
   * le faire, ce qui donne l'impression d'une commande cassée.
   */
  const controlsReason = !live
    ? room.status === "ENDED"
      ? "La séance est terminée : les commandes sont closes."
      : "Ouvrez la séance pour activer votre micro et votre caméra."
    : !room.transportConfigured
      ? "Diffusion non configurée sur cette instance : la modération et le salon restent utilisables."
      : transport.connecting
        ? "Connexion à la salle en cours…"
        : transport.error
          ? "La connexion au serveur temps réel a échoué. La modération et le salon restent utilisables."
          : !transport.connected
            ? "En attente de la salle."
            : null;

  const others = room.participants.filter((p) => !p.isHost);
  const lockedCount = others.filter((p) => p.mutedByHost).length;

  /**
   * Arbitrage 144 — une seule file, deux natures de demande.
   *
   * Séparer « mains levées » et « demandes d'écran » en deux onglets aurait
   * obligé l'animateur à surveiller deux endroits pendant qu'il parle, et fait
   * perdre ce que la file ordonnait : qui attend depuis le plus longtemps. Ce
   * qu'on accorde diffère, l'ordre d'arrivée non.
   */
  const requests = others
    .flatMap((p) => [
      ...(p.handRaisedAt ? [{ kind: "hand" as const, since: p.handRaisedAt, participant: p }] : []),
      ...(p.screenRequestedAt
        ? [{ kind: "screen" as const, since: p.screenRequestedAt, participant: p }]
        : []),
    ])
    .sort((a, b) => a.since.getTime() - b.since.getTime());

  /**
   * `key` désigne le bouton cliqué : sans elle, un seul booléen faisait tourner
   * toute la console — commandes de séance, file des mains levées et chaque
   * ligne de participant — à chaque geste de modération.
   */
  function act(key: string, body: unknown, message?: string, after?: () => void) {
    void action.run(key, () => api.post(`/api/lives/${room.id}`, body), {
      success: message ?? null,
      error: "L'action n'a pas abouti.",
      onSuccess: after,
    });
  }

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Rouvrir en masse passe par un appel par participant plutôt que par un verbe
   * dédié : chaque levée de verrou est un geste de modération, et l'audit doit
   * pouvoir dire lequel a visé qui.
   */
  function unmuteAll() {
    const locked = others.filter((p) => p.mutedByHost);
    void action.run(
      "unmute-all",
      async () => {
        for (const p of locked) {
          await api.post(`/api/lives/${room.id}`, {
            action: "mute",
            userId: p.userId,
            muted: false,
          });
        }
      },
      {
        success: "Tous les micros sont rendus à leurs propriétaires.",
        error: "L'action n'a pas abouti.",
      },
    );
  }

  function applyToSelection(muted: boolean) {
    if (selected.size === 0) return;
    const count = selected.size;
    const targets = [...selected];
    void action.run(
      muted ? "select-mute" : "select-unmute",
      async () => {
        for (const userId of targets) {
          await api.post(`/api/lives/${room.id}`, { action: "mute", userId, muted });
        }
      },
      {
        success: muted
          ? `${count} micro${count > 1 ? "s" : ""} coupé${count > 1 ? "s" : ""}.`
          : `${count} micro${count > 1 ? "s" : ""} rendu${count > 1 ? "s" : ""}.`,
        error: "L'action n'a pas abouti.",
        // La sélection ne se vide qu'à l'arrivée de la salle relue : la vider
        // plus tôt afficherait des micros encore ouverts comme désélectionnés.
        onSuccess: () => setSelected(new Set()),
      },
    );
  }

  function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Le champ ne se vide qu'à l'arrivée du message dans le salon relu.
    act("message", { action: "message", body: text }, undefined, () => setDraft(""));
  }

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(room.startsAt);

  // Les deux règles de la console (arbitrages 40 et 42), lues au ⓘ — dans la
  // barre d'onglets à partir de `lg`, dans l'entête sur téléphone.
  const regles = (
    <>
      Vous pouvez couper un micro et ouvrir un écran, pas retirer quelqu&apos;un de la
      session : exclure relève du bannissement de la communauté. Le partage d&apos;écran
      d&apos;un participant passe toujours par vous, et se retire du même geste ; le vôtre
      ne demande rien. Le salon, lui, est conservé et rattaché au replay — ce qui
      s&apos;y écrit reste lisible après la session.
    </>
  );

  const stagePeople = room.participants.map((p) => ({
    userId: p.userId,
    name: p.name,
    avatarUrl: p.avatarUrl,
  }));

  // Qui présente, s'il y a quelqu'un : la tuile d'écran porte l'identité de son
  // auteur, il n'y a pas d'état de séance à tenir pour le savoir.
  const presenter = transport.tiles.find((t) => t.kind === "screen");
  const presenterName = presenter
    ? presenter.isLocal
      ? "Vous"
      : (room.participants.find((p) => p.userId === presenter.identity)?.name ?? presenter.name)
    : null;

  /**
   * Arbitrage 148 — sur téléphone, les onglets du panneau sont des boutons de la
   * rangée de commandes. Toucher le volet ouvert replie le panneau (149).
   */
  const volets = (
    <div className="flex items-center gap-1.5 sm:gap-3 lg:hidden">
      <LiveControlButton
        kind="panel"
        active={panel === "requests"}
        label={panel === "requests" ? "Replier les demandes" : "Demandes"}
        count={requests.length}
        controls="console-panneau"
        onClick={() => basculer("requests")}
      >
        <Inbox />
      </LiveControlButton>
      <LiveControlButton
        kind="panel"
        active={panel === "participants"}
        label={panel === "participants" ? "Replier les participants" : "Participants"}
        count={room.participants.length}
        controls="console-panneau"
        onClick={() => basculer("participants")}
      >
        <Users />
      </LiveControlButton>
      <LiveControlButton
        kind="panel"
        active={panel === "chat"}
        label={panel === "chat" ? "Replier le salon" : "Salon"}
        count={room.messages.length}
        controls="console-panneau"
        onClick={() => basculer("chat")}
      >
        <MessageSquare />
      </LiveControlButton>
    </div>
  );

  /**
   * Couper tout le monde, et rouvrir (arbitrage 35) — avec l'état des micros et
   * de la scène.
   *
   * Deux emplacements. Sous la scène à partir de `lg`, comme avant. Sur
   * téléphone, en tête du volet Participants : dans une scène plafonnée, la
   * barre prenait la hauteur de la vidéo elle-même, et c'est un geste sur les
   * participants, rangé avec eux.
   */
  const coupure = (surScene: boolean) => (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        surScene
          ? "hidden border-t border-[var(--live-line)] px-5 py-3.5 lg:flex"
          : "mb-3 shrink-0 rounded-nk border border-line px-3 py-2.5 lg:hidden",
      )}
    >
      <p
        className={cn(
          "min-w-0 flex-1 text-[13px]",
          surScene ? "text-[var(--live-muted)]" : "text-ink-2",
        )}
      >
        {lockedCount === 0
          ? "Aucun micro coupé — chacun parle librement."
          : `${lockedCount} micro${lockedCount > 1 ? "s" : ""} coupé${lockedCount > 1 ? "s" : ""} par vous.`}
        {/* Arbitrage 93 — l'occupation de la scène, pas une jauge de places
            dans la salle : personne n'est refusé à l'entrée. */}
        <span
          className={cn(
            "mt-0.5 block text-[13px]",
            surScene ? "text-[var(--live-faint)]" : "text-ink-3",
          )}
        >
          Scène : {room.stage.taken} sur {room.stage.capacity} à l&apos;antenne
          {room.stage.full ? " — complète, coupez un micro pour libérer une place." : "."}
        </span>
      </p>
      <Btn
        variant={!surScene || TON === "clair" ? "o" : "gh"}
        size="sm"
        loading={action.isRunning("mute-all")}
        onClick={() =>
          act("mute-all", { action: "mute-all" }, "Micros coupés. Ils ne peuvent pas les rouvrir eux-mêmes.")
        }
        disabled={others.length === 0 || lockedCount === others.length}
      >
        <MicOff aria-hidden="true" />
        Couper tous les micros
      </Btn>
      <Btn
        variant={!surScene || TON === "clair" ? "o" : "gh"}
        size="sm"
        loading={action.isRunning("unmute-all")}
        onClick={unmuteAll}
        disabled={lockedCount === 0}
      >
        <Mic aria-hidden="true" />
        Tout rouvrir
      </Btn>
    </div>
  );

  /**
   * Les commandes de l'animateur, rendues **dans** la scène : en plein écran,
   * l'élément qui s'étire est la scène, et une barre restée dehors serait
   * inatteignable au moment précis où l'on en a le plus besoin.
   */
  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-3 py-2 sm:gap-3 sm:px-5 sm:py-4">
      <LiveControlButton
        active={transport.micEnabled}
        disabled={!transport.connected}
        label={controlsReason ?? (transport.micEnabled ? "Couper mon micro" : "Activer mon micro")}
        onClick={() => void transport.setMic(!transport.micEnabled)}
      >
        {transport.micEnabled ? <Mic /> : <MicOff />}
      </LiveControlButton>
      <LiveControlButton
        active={transport.camEnabled}
        disabled={!transport.connected}
        label={controlsReason ?? (transport.camEnabled ? "Couper ma caméra" : "Activer ma caméra")}
        onClick={() => void transport.setCam(!transport.camEnabled)}
      >
        {transport.camEnabled ? <Video /> : <VideoOff />}
      </LiveControlButton>
      {/* Arbitrage 144 — l'animateur partage de plein droit : rien à demander,
          rien à accorder. Le bouton ne porte donc aucun état d'autorisation. */}
      <LiveControlButton
        kind="toggle"
        active={transport.screenEnabled}
        // `getDisplayMedia` n'existe pas sur navigateur mobile : on désactive et
        // on explique, plutôt que d'offrir un bouton qui échouerait à coup sûr.
        disabled={!transport.connected || !transport.screenShareSupported}
        label={
          controlsReason ??
          (!transport.screenShareSupported
            ? "Partage d'écran indisponible sur ce navigateur — présentez depuis un ordinateur"
            : transport.screenEnabled ? "Arrêter le partage d'écran" : "Partager mon écran")
        }
        onClick={() => void transport.setScreen(!transport.screenEnabled)}
      >
        {transport.screenEnabled ? <MonitorX /> : <MonitorUp />}
      </LiveControlButton>
      <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-[var(--live-line)] sm:block lg:hidden" />
      {volets}
      {/* Un bouton gris sans motif se lit comme une panne. Le dire ici, et
          pas seulement dans l'infobulle : une infobulle suppose de survoler
          ce qu'on a déjà pris pour cassé. */}
      {controlsReason ? (
        <p className="w-full text-center text-[13px] text-[var(--live-faint)]">{controlsReason}</p>
      ) : null}
      {transport.deviceError ? (
        <p role="alert" className="w-full text-center text-[13px] text-[var(--live-alert-fg)]">
          {transport.deviceError}
        </p>
      ) : null}
    </div>
  );

  return (
    /*
      Arbitrage 147, étendu à la console : sur téléphone, elle tient dans la
      fenêtre — scène plafonnée en haut, panneau en dessous, rien qui défile hors
      des listes. À partir de `lg`, les deux colonnes d'origine.
    */
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:items-start lg:gap-5 lg:grid-cols-[1fr_360px]">
      {/* Scène */}
      <section
        className={cn(
          "nk-live flex min-w-0 flex-col overflow-hidden bg-[var(--live-bg)] text-[var(--live-fg)]",
          "lg:max-h-none lg:flex-none lg:rounded-nk-lg lg:shadow-nk",
          TON === "clair" && "nk-live-clair lg:border lg:border-line",
          replie ? "min-h-0 flex-1" : "max-h-[62dvh] shrink-0",
        )}
      >
        {/*
          Le titre et les commandes de séance se disputaient la même ligne :
          « Terminer » et « Quitter » se retrouvaient au milieu d'un titre long,
          et le nom de la communauté tombait à « Atelier … ». Deux rangées
          désormais — l'identité de la séance, puis ce qu'on peut en faire.
        */}
        {/* Sur téléphone, trois lignes au lieu de cinq (arbitrage 150) : titre
            et état, communauté, puis les gestes de séance. */}
        <header className="shrink-0 border-b border-[var(--live-line)] px-4 py-2.5 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15.5px] font-extrabold sm:flex-wrap sm:gap-x-2.5 sm:gap-y-1 sm:text-[17px] lg:text-[19px]">
              <span className="min-w-0 truncate sm:whitespace-normal sm:break-words">{room.title}</span>
              {live ? (
                <StPill tone="bad">En direct</StPill>
              ) : room.status === "ENDED" ? (
                <StPill tone="muted">Terminée</StPill>
              ) : (
                <StPill tone="muted">Pas encore ouverte</StPill>
              )}
            </h2>
            <p className="mt-0.5 truncate text-[13px] leading-relaxed text-[var(--live-muted)] sm:mt-1 sm:whitespace-normal">
              {room.community.name} · vous animez
              <span className="hidden lg:inline"> · {dateLabel}</span>
            </p>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-3">
          {room.status === "SCHEDULED" ? (
            <Btn size="sm" loading={action.isRunning("start")} onClick={() => act("start", { action: "start" }, "Séance ouverte. L'enregistrement a démarré.")}>
              <PlayCircle aria-hidden="true" />
              Ouvrir la séance
            </Btn>
          ) : null}
          {live ? (
            <Btn variant="danger" size="sm" loading={action.isRunning("end")} onClick={() => act("end", { action: "end" }, "Séance close. Le replay est en préparation.")}>
              <Square aria-hidden="true" />
              Terminer
            </Btn>
          ) : null}

          <BtnLink
            href="/mes-lives"
            variant={TON === "clair" ? "o" : "gh"}
            size="sm"
            aria-label="Quitter la console"
          >
            <LogOut aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Quitter</span>
          </BtnLink>
          <span className="ml-auto lg:hidden">
            <Hint label="Ce que la console peut, et ce que devient le salon" align="end">
              {regles}
            </Hint>
          </span>
          </div>
        </header>

        {/* Arbitrage 38 : l'enregistrement est automatique. Rien à décider au
            lancement, donc rien à basculer ici — seulement à signaler. */}
        {live ? (
          <p className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--live-line)] bg-[var(--live-alert-bg)] px-4 py-2 text-[13px] font-semibold sm:px-5 sm:py-2.5">
            <Circle className="size-2.5 fill-danger text-danger" aria-hidden="true" />
            <span className="text-[var(--live-alert-fg)]">Enregistrement en cours</span>
            {/* L'explication tient une ligne de plus sur téléphone : elle y
                est redite par le ⓘ de l'entête. */}
            <span className="hidden font-medium text-[var(--live-muted)] lg:inline">
              — automatique pour tout live, le replay sera daté du jour de la session.
            </span>
          </p>
        ) : null}

        <LiveStage
          className="min-h-0 flex-1"
          tone={TON}
          tiles={transport.tiles}
          people={stagePeople}
          hostUserId={room.viewerId}
          controls={controls}
          empty={
            <div>
              <span
                className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[var(--live-soft)] shadow-nk-sm"
                aria-hidden="true"
              >
                <Video className="size-7" />
              </span>
              <p className="text-[15px] font-bold">
                {!live
                  ? room.status === "ENDED"
                    ? "Séance terminée"
                    : "La séance n'est pas ouverte"
                  : transport.connecting
                    ? "Connexion à la salle…"
                    : room.transportConfigured
                      ? "En attente du flux"
                      : "Diffusion non configurée"}
              </p>
              <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--live-muted)]">
                {!live
                  ? room.status === "ENDED"
                    ? "Son replay apparaîtra dans vos sessions dès la fin de l'encodage."
                    : "Ouvrez-la quand vous êtes prêt : l'enregistrement démarrera en même temps."
                  : room.transportConfigured
                    ? transport.error
                      ? "La connexion au serveur temps réel a échoué. La modération et le salon restent utilisables."
                      : "Activez votre micro ou votre caméra pour ouvrir le plateau."
                    : "Le serveur temps réel n'est pas renseigné sur cette instance. La modération et le salon fonctionnent."}
              </p>
            </div>
          }
        />

        {presenterName ? <SharingNotice name={presenterName} /> : null}

        {/* Arbitrage 37 : le locuteur actif est affiché, ici comme chez l'apprenant. */}
        {transport.activeSpeaker ? (
          <p className="flex items-center justify-center gap-2 border-t border-[var(--live-line)] px-5 py-2.5 text-[13px] font-semibold text-[var(--live-muted)]">
            <AudioLines className="size-4 text-brand" aria-hidden="true" />
            <span aria-live="polite">
              <b className="text-[var(--live-fg)]">{transport.activeSpeaker}</b> a la parole
            </span>
          </p>
        ) : null}

        {coupure(true)}
      </section>

      {/* Panneau de modération */}
      <section
        aria-label="Modération de la session"
        className={cn(
          "min-h-0 flex-1 flex-col overflow-hidden border-t border-line bg-card lg:flex lg:flex-none lg:rounded-nk-lg lg:border lg:shadow-nk-sm",
          replie ? "hidden" : "flex",
        )}
      >
        {/* Les deux règles de la console — arbitrages 40 et 42 — tenaient chacune
            un paragraphe en pied de panneau. Pendant un direct, c'est là que la
            place manque le plus : elles se lisent désormais au ⓘ, posé au bout
            de la barre. */}
        <div className="hidden shrink-0 items-center gap-1 pr-3 lg:flex">
          <Tabs
            label="Modération de la session"
            panelId="console-panneau"
            value={volet}
            onValueChange={(value) => setPanel(value as Panel)}
            items={[
              { value: "requests", label: "Demandes", count: requests.length },
              { value: "participants", label: "Participants", count: room.participants.length },
              { value: "chat", label: "Salon", count: room.messages.length },
            ]}
            size="sm"
            className="!mb-0 min-w-0 flex-1 px-2"
          />
          <Hint
            label="Ce que la console peut, et ce que devient le salon"
            align="end"
          >
            {regles}
          </Hint>
        </div>

        <div id="console-panneau" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:overflow-visible">
          {volet === "requests" ? (
            requests.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] leading-relaxed text-ink-3">
                Personne ne demande rien.
                <br />
                Les mains levées et les demandes de partage d&apos;écran se rangent ici, dans
                l&apos;ordre où elles arrivent.
              </p>
            ) : (
              <>
                <p className="mb-3 rounded-nk-sm border border-line border-l-4 border-l-brand bg-card px-3 py-2 text-[13px] font-semibold text-brand-dark rounded-l-sm">
                  {requests.length} demande{requests.length > 1 ? "s" : ""}, de la plus ancienne à
                  la plus récente.
                </p>
                <ol className="flex flex-col gap-2.5">
                  {requests.map((demande, index) => {
                    const p = demande.participant;
                    const nom = p.name ?? "Membre";
                    const parole = demande.kind === "hand";
                    return (
                      <li
                        key={`${demande.kind}:${p.userId}`}
                        className="rounded-nk border border-line px-3 py-2.5"
                      >
                        {/*
                          Le nom et les deux boutons tenaient sur une seule ligne
                          de flex : à 360 px de panneau, le nom tombait à 31 px —
                          « Ko… » — pendant que « main levée depuis 8 min »
                          s'étalait sur six lignes, et sur mobile les boutons
                          passaient par-dessus le texte. L'identité tient sa
                          rangée, les gestes la leur.
                        */}
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-extrabold text-white"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <Avatar name={nom} src={p.avatarUrl} size="sm" className="shrink-0" />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-[14px] font-bold">
                              {nom}
                              {/* Le rang n'est qu'une pastille décorative : sans ce
                                  doublon, un lecteur d'écran lit la file à plat. */}
                              <span className="sr-only">
                                {" "}
                                — position {index + 1} dans la file des demandes
                              </span>
                            </b>
                            <small className="block text-[13px] text-ink-3">
                              {clock === null
                                ? parole
                                  ? "main levée"
                                  : "partage d'écran demandé"
                                : `${parole ? "main levée" : "partage d'écran demandé"} depuis ${waitedLabel(demande.since, clock)}`}
                              {parole && p.mutedByHost ? " · micro coupé" : ""}
                              {parole && !p.mutedByHost && !p.onStage ? " · hors scène" : ""}
                            </small>
                          </span>
                          <StPill tone={parole ? "info" : "warn"}>
                            {parole ? "Parole" : "Écran"}
                          </StPill>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                          {parole ? (
                            /* Arbitrage 41 : donner la parole lève le verrou et baisse
                               la main d'un même geste. Le micro n'est pas rallumé à la
                               place du participant — on lui rend la commande.
                               Arbitrage 93 : le geste consomme une place, et il n'y en
                               a que neuf. Le bouton se désactive plutôt que d'échouer
                               après coup — celui qui donne la parole doit savoir
                               **avant** de cliquer qu'il faut d'abord en libérer une. */
                            <Btn
                              size="sm"
                              disabled={room.stage.full && !p.onStage}
                              title={
                                room.stage.full && !p.onStage
                                  ? "Scène complète : coupez d'abord un micro."
                                  : undefined
                              }
                              loading={action.isRunning(`floor:${p.userId}`)}
                              onClick={() =>
                                act(
                                  `floor:${p.userId}`,
                                  { action: "mute", userId: p.userId, muted: false },
                                  `${nom} a la parole — sa main est baissée, son micro lui est rendu.`,
                                )
                              }
                            >
                              Donner la parole
                            </Btn>
                          ) : (
                            /* Arbitrage 144 — accorder l'écran ne touche ni au micro ni
                               aux neuf places : ce n'est pas une prise de parole, et le
                               bouton ne se désactive donc jamais sur une scène pleine. */
                            <Btn
                              size="sm"
                              loading={action.isRunning(`screen:${p.userId}`)}
                              onClick={() =>
                                act(
                                  `screen:${p.userId}`,
                                  { action: "screen-grant", userId: p.userId, allowed: true },
                                  `${nom} peut partager son écran.`,
                                )
                              }
                            >
                              <MonitorUp aria-hidden="true" />
                              Autoriser l&apos;écran
                            </Btn>
                          )}
                          <Btn
                            variant="t"
                            size="sm"
                            loading={action.isRunning(`retirer:${demande.kind}:${p.userId}`)}
                            onClick={() =>
                              act(
                                `retirer:${demande.kind}:${p.userId}`,
                                parole
                                  ? { action: "lower-hand", userId: p.userId }
                                  : { action: "screen-grant", userId: p.userId, allowed: false },
                                "Demande retirée de la file.",
                              )
                            }
                            aria-label={`Retirer la demande de ${nom}`}
                          >
                            Retirer
                          </Btn>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )
          ) : volet === "participants" ? (
            <>
              {coupure(false)}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink-2">
                  {selected.size === 0
                    ? "Cochez pour agir sur plusieurs micros."
                    : `${selected.size} sélectionné${selected.size > 1 ? "s" : ""}`}
                </p>
                <Btn
                  variant="o"
                  size="sm"
                  disabled={selected.size === 0 || action.busy}
                  onClick={() => applyToSelection(true)}
                >
                  <MicOff aria-hidden="true" />
                  Couper
                </Btn>
                <Btn
                  variant="o"
                  size="sm"
                  disabled={selected.size === 0 || action.busy}
                  onClick={() => applyToSelection(false)}
                >
                  <Mic aria-hidden="true" />
                  Rouvrir
                </Btn>
              </div>

              {room.participants.length === 0 ? (
                <p className="py-8 text-center text-[13.5px] text-ink-3">
                  Personne n&apos;est encore entré dans la salle.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {room.participants.map((p) => (
                    <li
                      key={p.userId}
                      className="flex items-center gap-2.5 rounded-nk-sm px-1.5 py-2 hover:bg-paper"
                    >
                      {p.isHost ? (
                        <span className="size-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={selected.has(p.userId)}
                          onChange={() => toggleSelected(p.userId)}
                          aria-label={`Sélectionner ${p.name ?? "ce participant"}`}
                          className="size-4 shrink-0 cursor-pointer accent-brand"
                        />
                      )}
                      <span className="relative shrink-0">
                        <Avatar name={p.name ?? "Membre"} src={p.avatarUrl} size="sm" />
                        {p.handPosition ? (
                          <span
                            className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-brand text-[13px] font-extrabold text-white"
                            aria-hidden="true"
                          >
                            {p.handPosition}
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                        {p.name ?? "Membre"}
                      </span>
                      {p.handPosition ? (
                        <Hand className="size-4 shrink-0 text-brand" aria-label="Main levée" />
                      ) : null}
                      {p.isHost ? (
                        <StPill tone="info">Vous</StPill>
                      ) : (
                        <>
                          {/* Arbitrage 144 — l'écran s'accorde et se retire d'ici
                              aussi, sans passer par une demande : un animateur qui
                              dit « montre-nous ça » à l'oral n'a pas à attendre que
                              la personne pense à cliquer. L'icône seule, pour ne pas
                              pousser la ligne comme le faisaient les deux libellés
                              de la file. */}
                          <button
                            type="button"
                            onClick={() =>
                              act(
                                `screen:${p.userId}`,
                                {
                                  action: "screen-grant",
                                  userId: p.userId,
                                  allowed: !p.screenAllowed,
                                },
                                p.screenAllowed
                                  ? `${p.name ?? "Ce participant"} ne peut plus partager son écran.`
                                  : `${p.name ?? "Ce participant"} peut partager son écran.`,
                              )
                            }
                            disabled={action.busy}
                            aria-pressed={p.screenAllowed}
                            title={
                              p.screenAllowed
                                ? "Retirer l'autorisation de partage d'écran"
                                : "Autoriser le partage d'écran"
                            }
                            className={cn(
                              "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full transition [&_svg]:size-4",
                              p.screenAllowed
                                ? "bg-paper text-ink ring-1 ring-brand hover:bg-paper"
                                : "text-ink-3 hover:bg-paper hover:text-ink",
                              p.screenRequestedAt && !p.screenAllowed && "ring-2 ring-brand/40",
                            )}
                          >
                            {p.screenAllowed ? <MonitorUp /> : <MonitorX />}
                            <span className="sr-only">
                              {p.screenAllowed
                                ? `Retirer l'autorisation de partage d'écran de ${p.name ?? "ce participant"}`
                                : `Autoriser ${p.name ?? "ce participant"} à partager son écran`}
                            </span>
                          </button>
                          <Btn
                            variant={p.mutedByHost ? "o" : "t"}
                            size="sm"
                            loading={action.isRunning(`mute:${p.userId}`)}
                            onClick={() =>
                              act(
                                `mute:${p.userId}`,
                                { action: "mute", userId: p.userId, muted: !p.mutedByHost },
                                p.mutedByHost
                                  ? `Micro rendu à ${p.name ?? "ce participant"}.`
                                  : `Micro de ${p.name ?? "ce participant"} coupé.`,
                              )
                            }
                          >
                            {p.mutedByHost ? "Rouvrir" : "Couper"}
                          </Btn>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <ul
                ref={fil}
                className="mb-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:max-h-[330px] lg:flex-none"
              >
                {room.messages.length === 0 ? (
                  <li className="py-6 text-center text-[13px] text-ink-3">
                    Le salon est vide pour l&apos;instant.
                  </li>
                ) : (
                  room.messages.map((line) => (
                    <li key={line.id} className="flex items-start gap-2.5">
                      <Avatar
                        name={line.authorName ?? "Membre"}
                        src={line.authorAvatarUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <b className="block text-[13px] font-bold">
                          {line.authorId === room.viewerId ? "Vous" : (line.authorName ?? "Membre")}
                        </b>
                        <small
                          className={cn(
                            "block text-[13.5px] leading-relaxed",
                            line.deleted ? "italic text-ink-3" : "text-ink-2",
                          )}
                        >
                          {line.deleted ? "Ce message a été retiré." : line.body}
                        </small>
                      </span>
                      {/* Couper le micro d'un participant est du ressort de
                          l'animateur ; ce qu'il lit et qui relève de la
                          plateforme se remonte, comme pour un membre. */}
                      {line.authorId === room.viewerId || line.deleted ? null : (
                        <ReportButton
                          variant="icon"
                          targetType="LIVE_MESSAGE"
                          targetId={line.id}
                          name={line.authorName ?? undefined}
                          className="size-7 text-ink-3/70"
                        />
                      )}
                    </li>
                  ))
                )}
              </ul>
              <form onSubmit={sendChat} noValidate className="flex shrink-0 items-center gap-2">
                <label htmlFor="console-chat-saisie" className="sr-only">
                  Écrire dans le salon
                </label>
                <input
                  id="console-chat-saisie"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Écrire un message…"
                  autoComplete="off"
                  maxLength={2000}
                  className="min-w-0 flex-1 rounded-full border-[1.5px] border-line bg-card px-3.5 py-2 text-[14px] outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
                />
                <Btn type="submit" size="sm" disabled={!draft.trim() || action.busy} aria-label="Envoyer">
                  <Send aria-hidden="true" />
                </Btn>
              </form>            </>
          )}
        </div>
      </section>

      <p className="hidden items-center gap-2 text-[13px] text-ink-3 lg:col-span-2 lg:flex">
        <Users className="size-4" aria-hidden="true" />
        {others.length} participant{others.length > 1 ? "s" : ""} dans la salle.
      </p>
    </div>
  );
}
