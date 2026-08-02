"use client";

import * as React from "react";
import Link from "next/link";
import {
  AudioLines,
  Bell,
  BellRing,
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
import { StPill } from "@/components/nk/status-pill";
import { Tabs } from "@/components/nk/tabs";
import { toast } from "@/components/nk/toast";
import { cn } from "@/lib/utils";
import { LIVE_CHAT, LIVE_PARTICIPANTS, type LiveSession } from "@/features/demo/live-data";

type Panel = "chat" | "participants" | "notes";

interface ChatLine {
  id: string;
  author: string;
  initials: string;
  text: string;
  self?: boolean;
}

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

export function LiveRoom({ session, live }: { session: LiveSession; live: boolean }) {
  const [panel, setPanel] = React.useState<Panel>("chat");
  const [micOn, setMicOn] = React.useState(true);
  const [camOn, setCamOn] = React.useState(false);
  // Horodatage plutôt que booléen : c'est lui qui donne le rang dans la file de
  // demandes de parole (arbitrage 36).
  const [handRaisedAt, setHandRaisedAt] = React.useState<number | null>(null);
  const [reminder, setReminder] = React.useState(false);
  const [chat, setChat] = React.useState<ChatLine[]>(LIVE_CHAT);
  const [draft, setDraft] = React.useState("");
  const [notes, setNotes] = React.useState("");
  // Le décompte dépend de l'horloge : le calculer au rendu serveur produirait
  // une valeur différente à l'hydratation. On n'affiche qu'après le montage.
  const [countdown, setCountdown] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (live) return;
    const tick = () => setCountdown(remainingLabel(session.startsAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [live, session.startsAt]);

  const me = LIVE_PARTICIPANTS.find((p) => p.self);
  const mutedByHost = Boolean(me?.mutedByHost);
  const speaker = LIVE_PARTICIPANTS.find((p) => p.speaking);

  /** File des demandes de parole, du plus ancien au plus récent. */
  const handQueue = React.useMemo(() => {
    const others = LIVE_PARTICIPANTS.filter((p) => p.handRaisedAt).map((p) => ({
      id: p.id,
      name: p.name,
      raisedAt: p.handRaisedAt as number,
      self: false,
    }));
    const mine = handRaisedAt
      ? [{ id: me?.id ?? "self", name: "Vous", raisedAt: handRaisedAt, self: true }]
      : [];
    return [...others, ...mine].sort((a, b) => a.raisedAt - b.raisedAt);
  }, [handRaisedAt, me?.id]);

  const myRank = handQueue.findIndex((entry) => entry.self) + 1;
  const rankOf = (participantId: string) => {
    const index = handQueue.findIndex((entry) => entry.id === participantId && !entry.self);
    return index === -1 ? null : index + 1;
  };

  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setChat((current) => [
      ...current,
      { id: `local-${Date.now()}`, author: "Vous", initials: "VO", text, self: true },
    ]);
    setDraft("");
  };

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(session.startsAt);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_330px]">
      {/* Scène */}
      <section className="min-w-0 overflow-hidden rounded-nk-lg bg-navy text-white shadow-nk">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2.5 text-[19px] font-extrabold">
              {session.title}
              {live ? (
                <StPill tone="bad">En direct</StPill>
              ) : (
                <StPill tone="muted">Salle d&apos;attente</StPill>
              )}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-[#b9c9dd]">
              {session.community.name} · animé par {session.host.name} · {dateLabel}
            </p>
          </div>
          <Btn asChild variant="gh" size="sm">
            <Link href="/mes-lives">
              <LogOut aria-hidden="true" />
              Quitter
            </Link>
          </Btn>
        </header>

        <div className="grid aspect-video place-items-center bg-navy-2 px-6 text-center">
          {live ? (
            <div>
              <span
                className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-white/10"
                aria-hidden="true"
              >
                <Video className="size-7" />
              </span>
              <p className="text-[15px] font-bold">Le flux vidéo se branchera ici</p>
              <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
                La diffusion temps réel n&apos;est pas encore raccordée. Les commandes ci-dessous
                sont fonctionnelles mais n&apos;émettent rien.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#b9c9dd]">
                Début dans
              </p>
              <p
                className="my-2 font-display text-[clamp(30px,6vw,52px)] font-extrabold tabular-nums"
                aria-live="off"
              >
                {countdown ?? "—"}
              </p>
              <p className="mx-auto max-w-[48ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
                {session.description}
              </p>
              <Btn
                variant={reminder ? "light" : "gh"}
                className="mt-5"
                onClick={() => {
                  setReminder((on) => !on);
                  toast.success(
                    reminder
                      ? "Rappel désactivé."
                      : "Rappel noté localement — les notifications ne sont pas encore branchées.",
                  );
                }}
                aria-pressed={reminder}
              >
                {reminder ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
                {reminder ? "Rappel activé" : "Activer un rappel"}
              </Btn>
            </div>
          )}
        </div>

        {live ? (
          <>
            {speaker ? (
              <p className="flex items-center justify-center gap-2 border-t border-white/10 px-5 py-2.5 text-[13px] font-semibold text-[#b9c9dd]">
                <AudioLines className="size-4 text-brand" aria-hidden="true" />
                <span aria-live="polite">
                  <b className="text-white">{speaker.name}</b> a la parole
                </span>
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-3 px-5 py-4">
              <ControlButton
                active={micOn && !mutedByHost}
                disabled={mutedByHost}
                label={
                  mutedByHost
                    ? "Micro coupé par l'animateur"
                    : micOn
                      ? "Couper le micro"
                      : "Activer le micro"
                }
                onClick={() => setMicOn((on) => !on)}
              >
                {micOn && !mutedByHost ? <Mic /> : <MicOff />}
              </ControlButton>
              <ControlButton
                active={camOn}
                label={camOn ? "Couper la caméra" : "Activer la caméra"}
                onClick={() => setCamOn((on) => !on)}
              >
                {camOn ? <Video /> : <VideoOff />}
              </ControlButton>
              <ControlButton
                active={handRaisedAt !== null}
                label={handRaisedAt !== null ? "Baisser la main" : "Lever la main"}
                onClick={() => {
                  // La parole n'est pas conditionnée à la main levée : chacun
                  // peut parler. Le geste signale qu'on souhaite la prendre, et
                  // la file dit dans quel ordre les demandes sont arrivées.
                  if (handRaisedAt !== null) {
                    setHandRaisedAt(null);
                    toast.success("Main baissée.");
                    return;
                  }
                  const raisedAt = Date.now();
                  setHandRaisedAt(raisedAt);
                  const position =
                    LIVE_PARTICIPANTS.filter(
                      (p) => p.handRaisedAt && p.handRaisedAt < raisedAt,
                    ).length + 1;
                  toast.success(`Main levée — position ${position} dans la file de parole.`);
                }}
              >
                <Hand />
              </ControlButton>
            </div>

            {mutedByHost ? (
              <p className="border-t border-white/10 px-5 py-3 text-center text-[13px] text-[#b9c9dd]">
                Votre micro a été coupé par l&apos;animateur. Levez la main pour demander la
                parole.
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
            { value: "participants", label: "Participants", count: LIVE_PARTICIPANTS.length },
            { value: "notes", label: "Notes" },
          ]}
          className="!mb-0 px-2"
        />

        <div id="live-panneau" className="p-4">
          {panel === "chat" ? (
            <>
              <ul className="mb-3 flex max-h-[330px] flex-col gap-3 overflow-y-auto">
                {chat.map((line) => (
                  <li key={line.id} className="flex gap-2.5">
                    <Avatar name={line.author} size="sm" />
                    <span className="min-w-0">
                      <b className="block text-[13px] font-bold">{line.author}</b>
                      <small className="block text-[13.5px] leading-relaxed text-ink-2">
                        {line.text}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
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
                  className="min-w-0 flex-1 rounded-full border-[1.5px] border-line bg-card px-3.5 py-2 text-[14px] outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
                />
                <Btn type="submit" size="sm" disabled={!draft.trim()} aria-label="Envoyer">
                  <Send aria-hidden="true" />
                </Btn>
              </form>
            </>
          ) : panel === "participants" ? (
            <>
              {handQueue.length > 0 ? (
                <p className="mb-3 rounded-nk-sm bg-brand-tint px-3 py-2 text-[13px] font-semibold text-brand-dark">
                  {handQueue.length} demande{handQueue.length > 1 ? "s" : ""} de parole
                  {myRank > 0 ? ` · vous êtes en position ${myRank}` : ""}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2.5">
                {LIVE_PARTICIPANTS.map((p) => {
                  const rank = p.self ? (myRank > 0 ? myRank : null) : rankOf(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-2.5">
                      <span className="relative">
                        <Avatar name={p.name} size="sm" />
                        {rank ? (
                          <span
                            className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-brand text-[10.5px] font-extrabold text-white"
                            aria-hidden="true"
                          >
                            {rank}
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                        {p.name}
                        {rank ? (
                          <span className="sr-only">
                            {" "}
                            — position {rank} dans la file de parole
                          </span>
                        ) : null}
                      </span>
                      {p.speaking ? (
                        <AudioLines className="size-4 shrink-0 text-brand" aria-label="Parle" />
                      ) : null}
                      {p.mutedByHost ? (
                        <MicOff
                          className="size-4 shrink-0 text-ink-3"
                          aria-label="Micro coupé par l'animateur"
                        />
                      ) : null}
                      {p.host ? <StPill tone="info">Animateur</StPill> : null}
                      {p.self ? <StPill tone="muted">Vous</StPill> : null}
                    </li>
                  );
                })}
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
                Ces notes restent dans cet onglet : rien n&apos;est encore enregistré.
              </p>
            </>
          )}
        </div>
      </section>

      <p className="flex items-center gap-2 text-[13px] text-ink-3 lg:col-span-2">
        <Users className="size-4" aria-hidden="true" />
        {session.attendees} membres inscrits à cette session.
      </p>
    </div>
  );
}
