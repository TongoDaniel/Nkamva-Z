"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Hand,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  NotebookPen,
  Send,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { LiveControlButton } from "@/components/nk/live-control";
import { LiveStage, SharingNotice } from "@/components/nk/live-stage";
import { ReportButton } from "@/components/nk/report-button";
import { StPill } from "@/components/nk/status-pill";
import { Tabs } from "@/components/nk/tabs";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { useLiveRoom } from "@/hooks/use-live-room";
import { useSessionTimeZone } from "@/hooks/use-reader-time-zone";
import { cn } from "@/lib/utils";
import type { LiveRoomView } from "@/lib/lives";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

type Panel = "chat" | "participants" | "notes";

/**
 * Arbitrage 148 — le ton de la salle : le fond blanc, retenu par le
 * propriétaire le 16 septembre 2026, comme pour la console. Tout ce qui colore
 * la scène passe par les jetons `--live-*` de `globals.css` ; le bleu nuit
 * d'origine reste disponible sous `"sombre"`.
 */
const TON: "clair" | "sombre" = "clair";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Décompte jj / hh:mm:ss jusqu'au début de la session. */
function remainingLabel(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days} j ${clock}` : clock;
}

export function LiveRoom({ room }: { room: LiveRoomView }) {
  const router = useRouter();
  /**
   * Le volet ouvert sous la scène — ou `null` quand le panneau est replié
   * (arbitrage 149). Replié, la scène prend toute la hauteur du téléphone.
   *
   * `volet` est ce que montrent les onglets à partir de `lg`, où le panneau ne
   * se replie pas : il est à côté de la scène, il ne lui prend rien.
   */
  // Replié à l'ouverture (demande du propriétaire, 17 septembre 2026) : on
  // entre dans une salle pour la scène ; les volets s'ouvrent à la demande.
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const volet: Panel = panel ?? "chat";
  const replie = panel === null;
  /** Rouvrir un autre volet, ou replier en touchant celui qui est ouvert. */
  const basculer = (cible: Panel) => setPanel((courant) => (courant === cible ? null : cible));
  const [handRaisedAt, setHandRaisedAt] = React.useState<Date | null>(room.handRaisedAt);
  const [messages, setMessages] = React.useState(room.messages);
  const [draft, setDraft] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const action = useKeyedAction();
  // Le décompte dépend de l'horloge : le calculer au rendu serveur produirait
  // une valeur différente à l'hydratation. On n'affiche qu'après le montage.
  const [countdown, setCountdown] = React.useState<string | null>(null);

  const live = room.live;
  const transport = useLiveRoom(
    live ? room.serverUrl : null,
    live ? room.token : null,
    live ? room.id : null,
  );

  React.useEffect(() => {
    if (live) return;
    const tick = () => setCountdown(remainingLabel(room.startsAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [live, room.startsAt]);

  // La salle bouge sans nous : on recharge la vue serveur régulièrement pour
  // suivre les arrivées, les mains levées et les verrous de micro. Convention
  // du projet : polling, pas de WebSocket applicatif.
  React.useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [live, router]);

  React.useEffect(() => setMessages(room.messages), [room.messages]);

  /**
   * Le salon s'ouvre sur les derniers messages, pas sur les premiers.
   *
   * La liste défile dans son volet depuis l'arbitrage 147 : sans cela, elle
   * s'ouvre en haut, c'est-à-dire sur le début de la séance, et il faut la faire
   * défiler à chaque arrivée pour lire ce qui vient de s'écrire.
   *
   * **Sauf si l'on est remonté lire** : au-delà de cent pixels du bas, on est en
   * train de relire, et rien ne doit tirer la vue vers le bas sous prétexte que
   * quelqu'un a écrit.
   */
  const fil = React.useRef<HTMLUListElement | null>(null);
  React.useEffect(() => {
    const el = fil.current;
    if (!el || volet !== "chat") return;
    const enBas = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (enBas || el.scrollTop === 0) el.scrollTop = el.scrollHeight;
  }, [messages, volet]);
  React.useEffect(() => setHandRaisedAt(room.handRaisedAt), [room.handRaisedAt]);

  /**
   * `key` désigne le geste en cours : la main levée et l'envoi d'un message
   * partageaient un seul booléen, si bien qu'écrire figeait aussi la main.
   */
  function act(key: string, body: unknown, message: string | null, after?: () => void) {
    void action.run(key, () => api.post(`/api/lives/${room.id}`, body), {
      success: message,
      error: "L'action n'a pas abouti.",
      onSuccess: after,
    });
  }

  function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void action.run(
      "message",
      () => api.post(`/api/lives/${room.id}`, { action: "message", body: text }),
      {
        // Le message apparaît dans le salon relu : l'annoncer ferait doublon.
        success: null,
        error: "Le message n'est pas parti.",
        // Le champ ne se vide qu'à l'arrivée du message.
        onSuccess: () => setDraft(""),
      },
    );
  }

  // Sans fuseau, le serveur écrivait la date dans le sien — UTC en production —
  // et le navigateur dans celui du lecteur : deux textes pour le même nœud.
  // Le premier rendu prend celui de l'animateur (`hooks/use-reader-time-zone.ts`).
  const { timeZone, hostLabel } = useSessionTimeZone(room.timeZone);
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(room.startsAt);
  const host = hostLabel(room.startsAt);

  const queue = room.participants.filter((p) => p.handPosition !== null);
  const host = room.participants.find((p) => p.isHost) ?? null;
  // Le verrou de l'animateur est la source de vérité côté serveur ; le transport
  // le confirme en révoquant `canPublish`. Les deux doivent dire la même chose.
  const micLocked = room.mutedByHost || !room.canSpeak;
  // Arbitrage 93 — sans place sur la scène, le micro n'est pas disponible non
  // plus. La raison n'a rien à voir avec un verrou : personne n'a été coupé, il
  // n'y a plus de place. Les deux causes se disent séparément, sans quoi un
  // participant lirait qu'on lui a retiré la parole qu'il n'a jamais eue.
  const offStage = !room.isHost && !room.onStage && !micLocked;
  const micUnavailable = micLocked || offStage;

  // Arbitrage 144 — montrer son écran ne dépend ni de la place sur la scène ni
  // du verrou de micro : c'est une autorisation à part, que l'animateur accorde.
  const screenAllowed = room.screenAllowed;
  const screenPending = room.screenRequestedAt !== null;
  // Qui présente, s'il y a quelqu'un. La tuile d'écran porte l'identité de son
  // auteur : pas besoin d'un état de séance pour le savoir.
  const presenter = transport.tiles.find((t) => t.kind === "screen");
  const presenterName = presenter
    ? presenter.isLocal
      ? "Vous"
      : (room.participants.find((p) => p.userId === presenter.identity)?.name ?? presenter.name)
    : null;

  const stagePeople = room.participants.map((p) => ({
    userId: p.userId,
    name: p.name,
    avatarUrl: p.avatarUrl,
  }));

  /**
   * Arbitrage 148 — sur téléphone, les onglets du panneau deviennent des
   * boutons ronds, dans la même rangée que le micro et la main levée.
   *
   * Une barre d'onglets de plus, entre la scène et le salon, coûtait une ligne
   * entière sur un écran où chaque ligne est disputée ; et elle obligeait le
   * pouce à aller chercher deux endroits différents pour deux gestes du même
   * ordre — « je lève la main », « je regarde qui est là ». À partir de `lg`, le
   * panneau est à côté de la scène et garde ses onglets : les boutons y
   * seraient loin de ce qu'ils pilotent.
   */
  const volets = (
    <div className="flex items-center gap-1.5 sm:gap-3 lg:hidden">
      <LiveControlButton
        kind="panel"
        active={panel === "chat"}
        label={panel === "chat" ? "Replier le salon" : "Salon"}
        controls="live-panneau"
        onClick={() => basculer("chat")}
      >
        <MessageSquare />
      </LiveControlButton>
      <LiveControlButton
        kind="panel"
        active={panel === "participants"}
        label={panel === "participants" ? "Replier les participants" : "Participants"}
        count={room.participants.length}
        controls="live-panneau"
        onClick={() => basculer("participants")}
      >
        <Users />
      </LiveControlButton>
      <LiveControlButton
        kind="panel"
        active={panel === "notes"}
        label={panel === "notes" ? "Replier les notes" : "Notes"}
        controls="live-panneau"
        onClick={() => basculer("notes")}
      >
        <NotebookPen />
      </LiveControlButton>
    </div>
  );

  const controls = live ? (
    <>
      {/* 44 px × 7 + 6 px d'écart tiennent dans 375 px : la rangée ne passe à
          la ligne que sur les plus petits téléphones, où elle se replie
          proprement plutôt que de déborder. */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-5 sm:py-4">
        <LiveControlButton
          active={transport.micEnabled}
          disabled={micUnavailable || !transport.connected}
          label={
            micLocked
              ? "Micro coupé par l'animateur"
              : offStage
                ? "Scène complète — levez la main"
                : transport.micEnabled
                  ? "Couper le micro"
                  : "Activer le micro"
          }
          onClick={() => void transport.setMic(!transport.micEnabled)}
        >
          {transport.micEnabled ? <Mic /> : <MicOff />}
        </LiveControlButton>
        <LiveControlButton
          active={transport.camEnabled}
          disabled={micUnavailable || !transport.connected}
          label={
            offStage
              ? "Scène complète — levez la main"
              : transport.camEnabled
                ? "Couper la caméra"
                : "Activer la caméra"
          }
          onClick={() => void transport.setCam(!transport.camEnabled)}
        >
          {transport.camEnabled ? <Video /> : <VideoOff />}
        </LiveControlButton>

        {/*
          Arbitrage 144 — un seul bouton, deux gestes selon le droit qu'on a :
          autorisé, il partage ; sans autorisation, il la demande. Afficher les
          deux côte à côte aurait laissé un bouton « partager » inerte à côté
          d'un bouton « demander », c'est-à-dire la panne apparente qu'on essaie
          justement d'éviter ailleurs sur cet écran.
        */}
        {screenAllowed ? (
          <LiveControlButton
            kind="toggle"
            active={transport.screenEnabled}
            // Autorisé par l'animateur, mais encore faut-il que le navigateur
            // sache capturer un écran — ce que le mobile ne sait pas faire.
            disabled={!transport.connected || !transport.screenShareSupported}
            label={
              !transport.screenShareSupported
                ? "Partage d'écran indisponible sur ce navigateur — rejoignez depuis un ordinateur"
                : transport.screenEnabled ? "Arrêter le partage d'écran" : "Partager mon écran"
            }
            onClick={() => void transport.setScreen(!transport.screenEnabled)}
          >
            {transport.screenEnabled ? <MonitorX /> : <MonitorUp />}
          </LiveControlButton>
        ) : (
          <LiveControlButton
            kind="toggle"
            active={screenPending}
            disabled={action.busy || !room.canSpeak}
            label={
              screenPending
                ? "Retirer ma demande de partage d'écran"
                : "Demander à partager mon écran"
            }
            onClick={() =>
              act(
                "screen",
                { action: "screen", wanted: !screenPending },
                screenPending ? "Demande de partage retirée." : "Demande envoyée à l'animateur.",
              )
            }
          >
            <MonitorUp />
          </LiveControlButton>
        )}

        <LiveControlButton
          kind="toggle"
          active={handRaisedAt !== null}
          disabled={action.busy || !room.canSpeak}
          label={handRaisedAt !== null ? "Baisser la main" : "Lever la main"}
          onClick={() => {
            // La parole n'est pas conditionnée à la main levée : chacun
            // peut parler (arbitrage 31). Le geste signale seulement qu'on
            // souhaite la prendre, et la file dit dans quel ordre les
            // demandes sont arrivées (arbitrage 36).
            const raising = handRaisedAt === null;
            act(
              "hand",
              { action: "hand", raised: raising },
              raising ? "Main levée." : "Main baissée.",
              () => setHandRaisedAt(raising ? new Date() : null),
            );
          }}
        >
          <Hand />
        </LiveControlButton>

        {/* Séparation des deux familles, là où la largeur le permet. */}
        <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-[var(--live-line)] sm:block lg:hidden" />
        {volets}
      </div>

      {/*
        Ce que le navigateur a refusé, dit à l'endroit où l'on vient
        d'appuyer. Le rejet de `setMicrophoneEnabled` n'était rattrapé par
        personne : le bouton restait éteint et rien ne l'expliquait.
        Il passe avant les autres avertissements — c'est le seul auquel la
        personne peut quelque chose tout de suite.
      */}
      {transport.deviceError ? (
        <p
          role="alert"
          className="border-t border-[var(--live-line)] bg-[var(--live-alert-bg)] px-5 py-3 text-center text-[13px] text-[var(--live-alert-fg)]"
        >
          {transport.deviceError}
        </p>
      ) : screenPending ? (
        <p className="border-t border-[var(--live-line)] px-5 py-3 text-center text-[13px] text-[var(--live-muted)]">
          Votre demande de partage d&apos;écran est dans la file de l&apos;animateur. Il vous
          ouvrira l&apos;écran dès qu&apos;il le pourra.
        </p>
      ) : room.mutedByHost ? (
        <p className="border-t border-[var(--live-line)] px-5 py-3 text-center text-[13px] text-[var(--live-muted)]">
          Votre micro a été coupé par l&apos;animateur. Levez la main pour demander la parole.
        </p>
      ) : offStage ? (
        <p className="border-t border-[var(--live-line)] px-5 py-3 text-center text-[13px] text-[var(--live-muted)]">
          La scène est complète — {room.stage.taken} personnes sur {room.stage.capacity} y
          prennent la parole. Levez la main : l&apos;animateur vous la donnera dès qu&apos;une
          place se libère.
        </p>
      ) : !room.canSpeak ? (
        <p className="border-t border-[var(--live-line)] px-5 py-3 text-center text-[13px] text-[var(--live-muted)]">
          {room.mutedReason === "BANNED"
            ? "Vous assistez à la séance sans y prendre la parole."
            : "Votre compte est restreint : vous assistez sans intervenir."}
        </p>
      ) : null}
    </>
  ) : null;

  return (
    /*
      Arbitrage 147 — deux mises en page, et non une qui s'adapte.

      Sur téléphone, la salle tient dans la fenêtre : la scène en haut, plafonnée,
      le panneau en dessous qui prend le reste, et **rien qui défile** hors de la
      liste des messages. Avant, tout était empilé dans une page : lire le salon
      faisait sortir de l'écran le micro, la caméra et la main levée — c'est-à-dire
      exactement ce dont on a besoin au moment où l'on suit la conversation.

      À partir de `lg`, la scène et le panneau sont côte à côte, l'écran suffit,
      et la page redevient un document ordinaire.
    */
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:items-start lg:gap-5 lg:grid-cols-[1fr_330px]">
      {/* Scène */}
      <section
        className={cn(
          "nk-live flex min-w-0 flex-col overflow-hidden bg-[var(--live-bg)] text-[var(--live-fg)]",
          TON === "clair" && "nk-live-clair",
          "lg:max-h-none lg:flex-none lg:rounded-nk-lg lg:shadow-nk",
          replie
            ? // Panneau replié : la scène occupe tout ce qui reste de l'écran.
              "min-h-0 flex-1"
            : // Plafond volontairement haut : au-delà, le salon n'aurait plus
              // assez de place pour montrer deux messages, et c'est lui qu'on
              // lit quand on ne parle pas. La scène se replie en dessous.
              "max-h-[56dvh] shrink-0",
        )}
      >
        {/*
          L'entête tenait sur une seule ligne de flex : un titre long y poussait
          « Quitter » au milieu du texte, et le nom de la communauté finissait
          tronqué à « Atelier … ». Le bouton est désormais sur sa propre colonne,
          et le titre a le droit de passer à la ligne sans rien déplacer.
        */}
        {/* Sur téléphone, l'entête tient en deux lignes (arbitrage 150) : titre
            et état, puis la communauté. Elle en prenait quatre. */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--live-line)] px-4 py-2.5 sm:items-start sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[15.5px] font-extrabold sm:flex-wrap sm:gap-x-2.5 sm:gap-y-1 sm:text-[17px] lg:text-[19px]">
              <span className="min-w-0 truncate sm:whitespace-normal sm:break-words">{room.title}</span>
              {live ? (
                <StPill tone="bad">En direct</StPill>
              ) : room.status === "ENDED" ? (
                <StPill tone="muted">Terminée</StPill>
              ) : (
                <StPill tone="muted">Salle d&apos;attente</StPill>
              )}
            </h2>
            <p className="mt-0.5 truncate text-[13px] leading-relaxed text-[var(--live-muted)] sm:mt-1 sm:whitespace-normal">
              {room.community.name} · animé par {room.host.name}
              {/* La date est une information de programme : elle n'a plus rien à
                  apprendre à quelqu'un déjà entré, et elle coûte une ligne sur
                  un téléphone. Elle reste là où la place ne manque pas. */}
              <span className="hidden lg:inline"> · {dateLabel}</span>
            </p>
            {host ? <p className="mt-0.5 truncate text-[13px] text-[#b9c9dd]">soit {host}</p> : null}
          </div>
          <Btn
            variant={TON === "clair" ? "o" : "gh"}
            size="sm"
            className="shrink-0"
            loading={action.isRunning("leave")}
            onClick={() =>
              // La navigation est jouée dans la transition : le bouton reste
              // occupé jusqu'à ce que l'agenda soit à l'écran.
              act("leave", { action: "leave" }, null, () => router.push("/mes-lives"))
            }
          >
            <LogOut aria-hidden="true" />
            {/* Icône seule sur téléphone : le libellé reste lu par les lecteurs
                d'écran, et le titre garde la largeur. */}
            <span className="sr-only sm:not-sr-only">Quitter</span>
          </Btn>
        </header>

        {live ? (
          <>
            <LiveStage
              className="min-h-0 flex-1"
              tone={TON}
              tiles={transport.tiles}
              people={stagePeople}
              hostUserId={host?.userId ?? null}
              controls={controls}
              empty={
                <div>
                  <span
                    className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[var(--live-soft)] shadow-nk-sm sm:mb-4 sm:size-16"
                    aria-hidden="true"
                  >
                    <Video className="size-6 sm:size-7" />
                  </span>
                  <p className="text-[15px] font-bold">
                    {transport.connecting
                      ? "Connexion à la salle…"
                      : room.transportConfigured
                        ? "En attente du flux"
                        : "Diffusion non configurée"}
                  </p>
                  <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--live-muted)]">
                    {room.transportConfigured
                      ? transport.error
                        ? "La connexion au serveur temps réel a échoué. La séance continue, le salon reste utilisable."
                        : "Personne n'a encore activé sa caméra ou son micro."
                      : "Le serveur temps réel n'est pas renseigné sur cette instance. Le salon et la file de parole fonctionnent."}
                  </p>
                </div>
              }
            />

            {presenterName ? <SharingNotice name={presenterName} /> : null}
            {transport.activeSpeaker ? (
              <p className="flex items-center justify-center gap-2 border-t border-[var(--live-line)] px-5 py-2.5 text-[13px] font-semibold text-[var(--live-muted)]">
                <AudioLines className="size-4 text-brand" aria-hidden="true" />
                <span aria-live="polite">
                  <b className="text-[var(--live-fg)]">{transport.activeSpeaker}</b> a la parole
                </span>
              </p>
            ) : null}
          </>
        ) : (
          <>
          <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto bg-[var(--live-bg-2)] px-6 py-6 text-center">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--live-muted)]">
                {room.status === "ENDED" ? "Séance terminée" : "Début dans"}
              </p>
              {room.status === "ENDED" ? (
                <p className="mx-auto mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-[var(--live-muted)]">
                  Son replay sera disponible dans « Mes lives » dès la fin de l&apos;encodage.
                </p>
              ) : (
                <>
                  <p
                    className="my-2 font-display text-[clamp(30px,6vw,52px)] font-extrabold tabular-nums"
                    aria-live="off"
                  >
                    {countdown ?? "—"}
                  </p>
                  {room.description ? (
                    <p className="mx-auto max-w-[48ch] text-[13.5px] leading-relaxed text-[var(--live-muted)]">
                      {room.description}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
          {/* Hors direct, pas de micro à tenir : la rangée ne porte que les
              volets, et seulement là où ils remplacent les onglets. */}
          <div className="flex shrink-0 justify-center border-t border-[var(--live-line)] px-3 py-2 lg:hidden">
            {volets}
          </div>
          </>
        )}
      </section>

      {/* Panneau latéral — sous la scène sur téléphone, à côté ensuite. */}
      <section
        aria-label="Panneau de la session"
        className={cn(
          "min-h-0 flex-1 flex-col overflow-hidden border-t border-line bg-card lg:flex lg:flex-none lg:rounded-nk-lg lg:border lg:shadow-nk-sm",
          // Replié, le panneau disparaît sur téléphone — et seulement là.
          replie ? "hidden" : "flex",
        )}
      >
        <Tabs
          label="Panneau de la session"
          panelId="live-panneau"
          value={volet}
          onValueChange={(value) => setPanel(value as Panel)}
          items={[
            { value: "chat", label: "Salon" },
            { value: "participants", label: "Participants", count: room.participants.length },
            { value: "notes", label: "Notes" },
          ]}
          className="!mb-0 hidden shrink-0 px-2 lg:flex"
        />

        <div id="live-panneau" className="flex min-h-0 flex-1 flex-col p-4">
          {volet === "chat" ? (
            <>
              <ul
                ref={fil}
                className="mb-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:max-h-[330px] lg:flex-none"
              >
                {messages.length === 0 ? (
                  <li className="py-6 text-center text-[13px] text-ink-3">
                    Le salon est vide. Écrivez le premier message.
                  </li>
                ) : (
                  messages.map((line) => (
                    <li key={line.id} className="flex items-start gap-2.5">
                      <Avatar
                        name={line.authorName ?? "Membre"}
                        src={line.authorAvatarUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <b className="block text-[13px] font-bold">
                          {line.authorId === room.viewerId
                            ? "Vous"
                            : (line.authorName ?? "Membre")}
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
                      {/* Le salon survit à la séance : il reste attaché au
                          replay, donc lisible longtemps après. */}
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
              {/* Arbitrage 42 : ce fil ne disparaît pas à la fin de la séance,
                  il reste rattaché au replay. */}
              {room.canSpeak ? (
                <form onSubmit={sendChat} noValidate className="flex shrink-0 items-center gap-2">
                  <label htmlFor="live-chat-saisie" className="sr-only">
                    Écrire dans le salon
                  </label>
                  <input
                    id="live-chat-saisie"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Écrire un message…"
                    autoComplete="off"
                    maxLength={2000}
                    className="min-w-0 flex-1 rounded-full border-[1.5px] border-line bg-card px-3.5 py-2 text-[14px] outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
                  />
                  <Btn
                    type="submit"
                    size="sm"
                    disabled={!draft.trim() || action.busy}
                    aria-label="Envoyer"
                  >
                    <Send aria-hidden="true" />
                  </Btn>
                </form>
              ) : (
                <p className="text-[13px] text-ink-3">
                  Vous lisez le salon sans y écrire.
                </p>
              )}
            </>
          ) : volet === "participants" ? (
            <>
              {queue.length > 0 ? (
                <p className="mb-3 shrink-0 rounded-nk-sm bg-brand-tint px-3 py-2 text-[13px] font-semibold text-brand-dark">
                  {queue.length} demande{queue.length > 1 ? "s" : ""} de parole
                  {room.handPosition ? ` · vous êtes en position ${room.handPosition}` : ""}
                </p>
              ) : null}
              <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto lg:overflow-visible">
                {room.participants.map((p) => (
                  <li key={p.userId} className="flex items-center gap-2.5">
                    <span className="relative">
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
                      {p.handPosition ? (
                        <span className="sr-only">
                          {" "}
                          — position {p.handPosition} dans la file de parole
                        </span>
                      ) : null}
                    </span>
                    {p.screenAllowed && !p.isHost ? (
                      <MonitorUp
                        className="size-4 shrink-0 text-ink-3"
                        aria-label="Autorisé à partager son écran"
                      />
                    ) : null}
                    {p.mutedByHost ? (
                      <MicOff
                        className="size-4 shrink-0 text-ink-3"
                        aria-label="Micro coupé par l'animateur"
                      />
                    ) : null}
                    {p.isHost ? <StPill tone="info">Animateur</StPill> : null}
                    {p.userId === room.viewerId ? <StPill tone="muted">Vous</StPill> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <label
                htmlFor="live-notes"
                className="mb-2 flex items-center gap-2 text-[13.5px] font-bold"
              >
                <NotebookPen className="size-4 text-ink-3" aria-hidden="true" />
                Vos notes de session
              </label>
              <textarea
                id="live-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                placeholder="Ce que vous voulez retenir de la session…"
                className="min-h-0 w-full flex-1 resize-none rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[14.5px] leading-relaxed outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25 lg:flex-none lg:resize-y"
              />
              <p className="mt-2 shrink-0 text-[13px] text-ink-3">
                Ces notes restent dans cet onglet : elles ne quittent pas votre navigateur.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Le rappel de la communauté et le nombre de présents sortent de l'écran
          sur téléphone : le compte est déjà sur l'onglet « Participants », et la
          communauté n'est pas là où l'on va depuis un direct en cours. */}
      <p className="hidden items-center gap-2 text-[13px] text-ink-3 lg:col-span-2 lg:flex">
        <Users className="size-4" aria-hidden="true" />
        <Link href={routes.community(room.community.slug)} className="hover:text-brand">
          {room.community.name}
        </Link>
        {" · "}
        {room.attendees} participant{room.attendees > 1 ? "s" : ""} présent
        {room.attendees > 1 ? "s" : ""}.
      </p>
    </div>
  );
}
