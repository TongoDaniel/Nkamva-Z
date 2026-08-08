"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Circle,
  Hand,
  LogOut,
  Mic,
  MicOff,
  PlayCircle,
  Send,
  Square,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { StPill } from "@/components/nk/status-pill";
import { Tabs } from "@/components/nk/tabs";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/client";
import { useLiveRoom } from "@/hooks/use-live-room";
import { cn } from "@/lib/utils";
import type { LiveRoomView } from "@/lib/lives";

type Panel = "requests" | "participants" | "chat";

/** « il y a 1 min 35 s » — l'attente d'une demande de parole se lit d'un coup d'œil. */
function waitedLabel(since: Date, at: number): string {
  const seconds = Math.max(0, Math.round((at - since.getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
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

export function LiveConsole({ room }: { room: LiveRoomView }) {
  const router = useRouter();
  const [panel, setPanel] = React.useState<Panel>("requests");
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
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
  const queue = others
    .filter((p) => p.handRaisedAt)
    .sort((a, b) => a.handRaisedAt!.getTime() - b.handRaisedAt!.getTime());

  async function act(body: unknown, message?: string) {
    setPending(true);
    try {
      await api.post(`/api/lives/${room.id}`, body);
      if (message) toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action n'a pas abouti.");
    } finally {
      setPending(false);
    }
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
  async function unmuteAll() {
    const locked = others.filter((p) => p.mutedByHost);
    setPending(true);
    try {
      for (const p of locked) {
        await api.post(`/api/lives/${room.id}`, { action: "mute", userId: p.userId, muted: false });
      }
      toast.success("Tous les micros sont rendus à leurs propriétaires.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action n'a pas abouti.");
    } finally {
      setPending(false);
    }
  }

  async function applyToSelection(muted: boolean) {
    if (selected.size === 0) return;
    setPending(true);
    try {
      for (const userId of selected) {
        await api.post(`/api/lives/${room.id}`, { action: "mute", userId, muted });
      }
      const count = selected.size;
      setSelected(new Set());
      toast.success(
        muted
          ? `${count} micro${count > 1 ? "s" : ""} coupé${count > 1 ? "s" : ""}.`
          : `${count} micro${count > 1 ? "s" : ""} rendu${count > 1 ? "s" : ""}.`,
      );
      router.refresh();
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
    await act({ action: "message", body: text });
    setDraft("");
  }

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(room.startsAt);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
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
                <StPill tone="muted">Pas encore ouverte</StPill>
              )}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-[#b9c9dd]">
              {room.community.name} · vous animez · {dateLabel}
            </p>
          </div>

          {room.status === "SCHEDULED" ? (
            <Btn size="sm" loading={pending} onClick={() => act({ action: "start" }, "Séance ouverte. L'enregistrement a démarré.")}>
              <PlayCircle aria-hidden="true" />
              Ouvrir la séance
            </Btn>
          ) : null}
          {live ? (
            <Btn variant="danger" size="sm" loading={pending} onClick={() => act({ action: "end" }, "Séance close. Le replay est en préparation.")}>
              <Square aria-hidden="true" />
              Terminer
            </Btn>
          ) : null}

          <Btn asChild variant="gh" size="sm">
            <Link href="/formateur/lives">
              <LogOut aria-hidden="true" />
              Quitter
            </Link>
          </Btn>
        </header>

        {/* Arbitrage 38 : l'enregistrement est automatique. Rien à décider au
            lancement, donc rien à basculer ici — seulement à signaler. */}
        {live ? (
          <p className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-danger/15 px-5 py-2.5 text-[13px] font-semibold">
            <Circle className="size-2.5 fill-danger text-danger" aria-hidden="true" />
            Enregistrement en cours
            <span className="font-medium text-[#b9c9dd]">
              — automatique pour tout live, le replay sera daté du jour de la session.
            </span>
          </p>
        ) : null}

        <div className="grid min-h-[240px] place-items-center bg-navy-2 px-6 py-6 text-center">
          {live && transport.connected && transport.tiles.length > 0 ? (
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {transport.tiles.map((tile) => (
                <div
                  key={tile.identity}
                  className={cn(
                    "relative aspect-video overflow-hidden rounded-nk bg-navy",
                    tile.speaking && "ring-2 ring-brand",
                  )}
                >
                  {tile.attach ? (
                    <video
                      ref={tile.attach}
                      autoPlay
                      playsInline
                      muted
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center">
                      <Avatar name={tile.isLocal ? "Vous" : tile.name} size="lg" />
                    </span>
                  )}
                  <span className="absolute bottom-1.5 left-2 max-w-[80%] truncate rounded-full bg-black/50 px-2 py-0.5 text-[11.5px] font-semibold text-white">
                    {tile.isLocal ? "Vous" : tile.name}
                  </span>
                </div>
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
              <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
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
          )}
        </div>

        {/* Arbitrage 37 : le locuteur actif est affiché, ici comme chez l'apprenant. */}
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
            disabled={!transport.connected}
            label={
              controlsReason ?? (transport.micEnabled ? "Couper mon micro" : "Activer mon micro")
            }
            onClick={() => void transport.setMic(!transport.micEnabled)}
          >
            {transport.micEnabled ? <Mic /> : <MicOff />}
          </ControlButton>
          <ControlButton
            active={transport.camEnabled}
            disabled={!transport.connected}
            label={
              controlsReason ?? (transport.camEnabled ? "Couper ma caméra" : "Activer ma caméra")
            }
            onClick={() => void transport.setCam(!transport.camEnabled)}
          >
            {transport.camEnabled ? <Video /> : <VideoOff />}
          </ControlButton>
          {/* Un bouton gris sans motif se lit comme une panne. Le dire ici, et
              pas seulement dans l'infobulle : une infobulle suppose de survoler
              ce qu'on a déjà pris pour cassé. */}
          {controlsReason ? (
            <p className="w-full text-center text-[12.5px] text-[#8fa6c0]">{controlsReason}</p>
          ) : null}
        </div>

        {/* Arbitrage 35 : couper tout le monde, et rouvrir. Le geste sur un seul
            ou sur plusieurs vit dans l'onglet Participants. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-5 py-3.5">
          <p className="min-w-0 flex-1 text-[13px] text-[#b9c9dd]">
            {lockedCount === 0
              ? "Aucun micro coupé — chacun parle librement."
              : `${lockedCount} micro${lockedCount > 1 ? "s" : ""} coupé${lockedCount > 1 ? "s" : ""} par vous.`}
          </p>
          <Btn
            variant="gh"
            size="sm"
            loading={pending}
            onClick={() => act({ action: "mute-all" }, "Micros coupés. Ils ne peuvent pas les rouvrir eux-mêmes.")}
            disabled={others.length === 0 || lockedCount === others.length}
          >
            <MicOff aria-hidden="true" />
            Couper tous les micros
          </Btn>
          <Btn variant="gh" size="sm" loading={pending} onClick={unmuteAll} disabled={lockedCount === 0}>
            <Mic aria-hidden="true" />
            Tout rouvrir
          </Btn>
        </div>
      </section>

      {/* Panneau de modération */}
      <section
        aria-label="Modération de la session"
        className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm"
      >
        <Tabs
          label="Modération de la session"
          panelId="console-panneau"
          value={panel}
          onValueChange={(value) => setPanel(value as Panel)}
          items={[
            { value: "requests", label: "Demandes", count: queue.length },
            { value: "participants", label: "Participants", count: room.participants.length },
            { value: "chat", label: "Salon", count: room.messages.length },
          ]}
          size="sm"
          className="!mb-0 px-2"
        />

        <div id="console-panneau" className="p-4">
          {panel === "requests" ? (
            queue.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] leading-relaxed text-ink-3">
                Personne ne demande la parole.
                <br />
                Les mains levées se rangent ici, dans l&apos;ordre où elles arrivent.
              </p>
            ) : (
              <>
                <p className="mb-3 rounded-nk-sm bg-brand-tint px-3 py-2 text-[13px] font-semibold text-brand-dark">
                  {queue.length} demande{queue.length > 1 ? "s" : ""} de parole, de la plus ancienne
                  à la plus récente.
                </p>
                <ol className="flex flex-col gap-2.5">
                  {queue.map((p, index) => (
                    <li
                      key={p.userId}
                      className="flex flex-wrap items-center gap-2.5 rounded-nk border border-line px-3 py-2.5"
                    >
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[12.5px] font-extrabold text-white"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[14px] font-bold">
                          {p.name ?? "Membre"}
                          {/* Le rang n'est qu'une pastille décorative : sans ce
                              doublon, un lecteur d'écran lit la file à plat. */}
                          <span className="sr-only">
                            {" "}
                            — position {index + 1} dans la file de parole
                          </span>
                        </b>
                        <small className="block text-[12.5px] text-ink-3">
                          {clock === null
                            ? "main levée"
                            : `main levée depuis ${waitedLabel(p.handRaisedAt!, clock)}`}
                          {p.mutedByHost ? " · micro coupé" : ""}
                        </small>
                      </span>
                      {/* Arbitrage 41 : donner la parole lève le verrou et baisse
                          la main d'un même geste. Le micro n'est pas rallumé à la
                          place du participant — on lui rend la commande. */}
                      <Btn
                        size="sm"
                        loading={pending}
                        onClick={() =>
                          act(
                            { action: "mute", userId: p.userId, muted: false },
                            `${p.name ?? "Le participant"} a la parole — sa main est baissée, son micro lui est rendu.`,
                          )
                        }
                      >
                        Donner la parole
                      </Btn>
                      <Btn
                        variant="t"
                        size="sm"
                        loading={pending}
                        onClick={() =>
                          act({ action: "lower-hand", userId: p.userId }, "Demande retirée de la file.")
                        }
                        aria-label={`Retirer la demande de ${p.name ?? "ce participant"}`}
                      >
                        Retirer
                      </Btn>
                    </li>
                  ))}
                </ol>
              </>
            )
          ) : panel === "participants" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink-2">
                  {selected.size === 0
                    ? "Cochez pour agir sur plusieurs micros."
                    : `${selected.size} sélectionné${selected.size > 1 ? "s" : ""}`}
                </p>
                <Btn
                  variant="o"
                  size="sm"
                  disabled={selected.size === 0 || pending}
                  onClick={() => applyToSelection(true)}
                >
                  <MicOff aria-hidden="true" />
                  Couper
                </Btn>
                <Btn
                  variant="o"
                  size="sm"
                  disabled={selected.size === 0 || pending}
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
                      </span>
                      {p.handPosition ? (
                        <Hand className="size-4 shrink-0 text-brand" aria-label="Main levée" />
                      ) : null}
                      {p.isHost ? (
                        <StPill tone="info">Vous</StPill>
                      ) : (
                        <Btn
                          variant={p.mutedByHost ? "o" : "t"}
                          size="sm"
                          loading={pending}
                          onClick={() =>
                            act(
                              { action: "mute", userId: p.userId, muted: !p.mutedByHost },
                              p.mutedByHost
                                ? `Micro rendu à ${p.name ?? "ce participant"}.`
                                : `Micro de ${p.name ?? "ce participant"} coupé.`,
                            )
                          }
                        >
                          {p.mutedByHost ? "Rouvrir" : "Couper"}
                        </Btn>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Arbitrage 40 : la console ne sait que couper un micro. Exclure
                  quelqu'un d'une session est un autre geste, qui relève du
                  bannissement de communauté — ne pas l'ajouter ici. */}
              <p className="mt-3 border-t border-line-2 pt-3 text-[12.5px] leading-relaxed text-ink-3">
                Vous pouvez couper un micro, pas retirer quelqu&apos;un de la session : exclure
                relève du bannissement de la communauté.
              </p>
            </>
          ) : (
            <>
              <ul className="mb-3 flex max-h-[330px] flex-col gap-3 overflow-y-auto">
                {room.messages.length === 0 ? (
                  <li className="py-6 text-center text-[13px] text-ink-3">
                    Le salon est vide pour l&apos;instant.
                  </li>
                ) : (
                  room.messages.map((line) => (
                    <li key={line.id} className="flex gap-2.5">
                      <Avatar name={line.authorName ?? "Membre"} size="sm" />
                      <span className="min-w-0">
                        <b className="block text-[13px] font-bold">
                          {line.authorId === room.viewerId ? "Vous" : (line.authorName ?? "Membre")}
                        </b>
                        <small className="block text-[13.5px] leading-relaxed text-ink-2">
                          {line.body}
                        </small>
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <form onSubmit={sendChat} noValidate className="flex items-center gap-2">
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
                <Btn type="submit" size="sm" disabled={!draft.trim() || pending} aria-label="Envoyer">
                  <Send aria-hidden="true" />
                </Btn>
              </form>
              {/* Arbitrage 42 : le salon survit à la session, attaché au replay. */}
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
                Ce salon est conservé et rattaché au replay : ce qui s&apos;écrit ici reste lisible
                après la session.
              </p>
            </>
          )}
        </div>
      </section>

      <p className="flex items-center gap-2 text-[13px] text-ink-3 lg:col-span-2">
        <Users className="size-4" aria-hidden="true" />
        {others.length} participant{others.length > 1 ? "s" : ""} dans la salle.
      </p>
    </div>
  );
}
