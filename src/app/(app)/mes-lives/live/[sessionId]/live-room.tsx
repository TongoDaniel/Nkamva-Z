"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Hand,
  LogOut,
  Mic,
  MicOff,
  NotebookPen,
  Send,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { ReportButton } from "@/components/nk/report-button";
import { StPill } from "@/components/nk/status-pill";
import { Tabs } from "@/components/nk/tabs";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/client";
import { useLiveRoom } from "@/hooks/use-live-room";
import { cn } from "@/lib/utils";
import type { LiveRoomView } from "@/lib/lives";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

type Panel = "chat" | "participants" | "notes";

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

function ControlButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-12 place-items-center rounded-full border transition [&_svg]:size-[19px]",
        disabled
          ? "cursor-not-allowed border-white/15 bg-white/5 text-white/40"
          : active
            ? "cursor-pointer border-white/25 bg-white/15 text-white hover:bg-white/25"
            : "cursor-pointer border-danger/40 bg-danger-tint text-danger hover:bg-danger/20",
      )}
    >
      {children}
    </button>
  );
}

/** Tuile vidéo d'un participant. Sans piste publiée, on montre son initiale. */
function Tile({
  name,
  speaking,
  attach,
}: {
  name: string;
  speaking: boolean;
  attach: ((el: HTMLVideoElement | null) => void) | null;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-nk bg-navy-2",
        speaking && "ring-2 ring-brand",
      )}
    >
      {attach ? (
        <video ref={attach} autoPlay playsInline muted className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center">
          <Avatar name={name} size="lg" />
        </span>
      )}
      <span className="absolute bottom-1.5 left-2 max-w-[80%] truncate rounded-full bg-black/50 px-2 py-0.5 text-[11.5px] font-semibold text-white">
        {name}
      </span>
    </div>
  );
}

export function LiveRoom({ room }: { room: LiveRoomView }) {
  const router = useRouter();
  const [panel, setPanel] = React.useState<Panel>("chat");
  const [handRaisedAt, setHandRaisedAt] = React.useState<Date | null>(room.handRaisedAt);
  const [messages, setMessages] = React.useState(room.messages);
  const [draft, setDraft] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
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
  React.useEffect(() => setHandRaisedAt(room.handRaisedAt), [room.handRaisedAt]);

  async function act(body: unknown, onOk?: () => void) {
    setPending(true);
    try {
      await api.post(`/api/lives/${room.id}`, body);
      onOk?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action n'a pas abouti.");
    } finally {
      setPending(false);
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setPending(true);
    try {
      await api.post(`/api/lives/${room.id}`, { action: "message", body: text });
      setDraft("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Le message n'est pas parti.");
    } finally {
      setPending(false);
    }
  }

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(room.startsAt);

  const queue = room.participants.filter((p) => p.handPosition !== null);
  // Le verrou de l'animateur est la source de vérité côté serveur ; le transport
  // le confirme en révoquant `canPublish`. Les deux doivent dire la même chose.
  const micLocked = room.mutedByHost || !room.canSpeak;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_330px]">
      {/* Scène */}
      <section className="min-w-0 overflow-hidden rounded-nk-lg bg-navy text-white shadow-nk">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2.5 text-[19px] font-extrabold">
              {room.title}
              {live ? (
                <StPill tone="bad">En direct</StPill>
              ) : room.status === "ENDED" ? (
                <StPill tone="muted">Terminée</StPill>
              ) : (
                <StPill tone="muted">Salle d&apos;attente</StPill>
              )}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-[#b9c9dd]">
              {room.community.name} · animé par {room.host.name} · {dateLabel}
            </p>
          </div>
          <Btn
            variant="gh"
            size="sm"
            onClick={() =>
              act({ action: "leave" }, () => {
                router.push("/mes-lives");
              })
            }
          >
            <LogOut aria-hidden="true" />
            Quitter
          </Btn>
        </header>

        <div className="grid min-h-[240px] place-items-center bg-navy-2 px-6 py-6 text-center">
          {live ? (
            transport.connected && transport.tiles.length > 0 ? (
              <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {transport.tiles.map((tile) => (
                  <Tile
                    key={tile.identity}
                    name={tile.isLocal ? "Vous" : tile.name}
                    speaking={tile.speaking}
                    attach={tile.attach}
                  />
                ))}
              </div>
            ) : (
              <div>
                <span
                  className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-white/10"
                  aria-hidden="true"
                >
                  <Video className="size-7" />
                </span>
                <p className="text-[15px] font-bold">
                  {transport.connecting
                    ? "Connexion à la salle…"
                    : room.transportConfigured
                      ? "En attente du flux"
                      : "Diffusion non configurée"}
                </p>
                <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
                  {room.transportConfigured
                    ? transport.error
                      ? "La connexion au serveur temps réel a échoué. La séance continue, le salon reste utilisable."
                      : "Personne n'a encore activé sa caméra ou son micro."
                    : "Le serveur temps réel n'est pas renseigné sur cette instance. Le salon et la file de parole fonctionnent."}
                </p>
              </div>
            )
          ) : (
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#b9c9dd]">
                {room.status === "ENDED" ? "Séance terminée" : "Début dans"}
              </p>
              {room.status === "ENDED" ? (
                <p className="mx-auto mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
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
                    <p className="mx-auto max-w-[48ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
                      {room.description}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>

        {live ? (
          <>
            {transport.activeSpeaker ? (
              <p className="flex items-center justify-center gap-2 border-t border-white/10 px-5 py-2.5 text-[13px] font-semibold text-[#b9c9dd]">
                <AudioLines className="size-4 text-brand" aria-hidden="true" />
                <span aria-live="polite">
                  <b className="text-white">{transport.activeSpeaker}</b> a la parole
                </span>
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-3 px-5 py-4">
              <ControlButton
                active={transport.micEnabled}
                disabled={micLocked || !transport.connected}
                label={
                  micLocked
                    ? "Micro coupé par l'animateur"
                    : transport.micEnabled
                      ? "Couper le micro"
                      : "Activer le micro"
                }
                onClick={() => void transport.setMic(!transport.micEnabled)}
              >
                {transport.micEnabled ? <Mic /> : <MicOff />}
              </ControlButton>
              <ControlButton
                active={transport.camEnabled}
                disabled={micLocked || !transport.connected}
                label={transport.camEnabled ? "Couper la caméra" : "Activer la caméra"}
                onClick={() => void transport.setCam(!transport.camEnabled)}
              >
                {transport.camEnabled ? <Video /> : <VideoOff />}
              </ControlButton>
              <ControlButton
                active={handRaisedAt !== null}
                disabled={pending || !room.canSpeak}
                label={handRaisedAt !== null ? "Baisser la main" : "Lever la main"}
                onClick={() => {
                  // La parole n'est pas conditionnée à la main levée : chacun
                  // peut parler (arbitrage 31). Le geste signale seulement qu'on
                  // souhaite la prendre, et la file dit dans quel ordre les
                  // demandes sont arrivées (arbitrage 36).
                  const raising = handRaisedAt === null;
                  void act({ action: "hand", raised: raising }, () => {
                    setHandRaisedAt(raising ? new Date() : null);
                    toast.success(raising ? "Main levée." : "Main baissée.");
                    router.refresh();
                  });
                }}
              >
                <Hand />
              </ControlButton>
            </div>

            {room.mutedByHost ? (
              <p className="border-t border-white/10 px-5 py-3 text-center text-[13px] text-[#b9c9dd]">
                Votre micro a été coupé par l&apos;animateur. Levez la main pour demander la parole.
              </p>
            ) : !room.canSpeak ? (
              <p className="border-t border-white/10 px-5 py-3 text-center text-[13px] text-[#b9c9dd]">
                {room.mutedReason === "BANNED"
                  ? "Vous assistez à la séance sans y prendre la parole."
                  : "Votre compte est restreint : vous assistez sans intervenir."}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      {/* Panneau latéral */}
      <section
        aria-label="Panneau de la session"
        className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm"
      >
        <Tabs
          label="Panneau de la session"
          panelId="live-panneau"
          value={panel}
          onValueChange={(value) => setPanel(value as Panel)}
          items={[
            { value: "chat", label: "Salon" },
            { value: "participants", label: "Participants", count: room.participants.length },
            { value: "notes", label: "Notes" },
          ]}
          className="!mb-0 px-2"
        />

        <div id="live-panneau" className="p-4">
          {panel === "chat" ? (
            <>
              <ul className="mb-3 flex max-h-[330px] flex-col gap-3 overflow-y-auto">
                {messages.length === 0 ? (
                  <li className="py-6 text-center text-[13px] text-ink-3">
                    Le salon est vide. Écrivez le premier message.
                  </li>
                ) : (
                  messages.map((line) => (
                    <li key={line.id} className="flex items-start gap-2.5">
                      <Avatar name={line.authorName ?? "Membre"} size="sm" />
                      <span className="min-w-0 flex-1">
                        <b className="block text-[13px] font-bold">
                          {line.authorName ?? "Membre"}
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
                <form onSubmit={sendChat} noValidate className="flex items-center gap-2">
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
                    disabled={!draft.trim() || pending}
                    aria-label="Envoyer"
                  >
                    <Send aria-hidden="true" />
                  </Btn>
                </form>
              ) : (
                <p className="text-[12.5px] text-ink-3">
                  Vous lisez le salon sans y écrire.
                </p>
              )}
            </>
          ) : panel === "participants" ? (
            <>
              {queue.length > 0 ? (
                <p className="mb-3 rounded-nk-sm bg-brand-tint px-3 py-2 text-[13px] font-semibold text-brand-dark">
                  {queue.length} demande{queue.length > 1 ? "s" : ""} de parole
                  {room.handPosition ? ` · vous êtes en position ${room.handPosition}` : ""}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2.5">
                {room.participants.map((p) => (
                  <li key={p.userId} className="flex items-center gap-2.5">
                    <span className="relative">
                      <Avatar name={p.name ?? "Membre"} size="sm" />
                      {p.handPosition ? (
                        <span
                          className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-brand text-[10.5px] font-extrabold text-white"
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
                rows={11}
                placeholder="Ce que vous voulez retenir de la session…"
                className="w-full resize-y rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[14.5px] leading-relaxed outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
              />
              <p className="mt-2 text-[12.5px] text-ink-3">
                Ces notes restent dans cet onglet : elles ne quittent pas votre navigateur.
              </p>
            </>
          )}
        </div>
      </section>

      <p className="flex items-center gap-2 text-[13px] text-ink-3 lg:col-span-2">
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
