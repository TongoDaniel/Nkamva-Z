"use client";

import * as React from "react";
import Link from "next/link";
import {
  AudioLines,
  Circle,
  Hand,
  LogOut,
  Mic,
  MicOff,
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
import { CONSOLE_CHAT, CONSOLE_PARTICIPANTS } from "@/features/demo/trainer-live-data";
import type { ConsoleParticipant } from "@/features/demo/trainer-live-data";
import type { LiveSession } from "@/features/demo/live-data";

type Panel = "requests" | "participants" | "chat";

interface ChatLine {
  id: string;
  author: string;
  self?: boolean;
  text: string;
}

/** « il y a 1 min 35 s » — l'attente d'une demande de parole se lit d'un coup d'œil. */
function waitedLabel(since: number, at: number): string {
  const seconds = Math.max(0, Math.round((at - since) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

function ControlButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-12 cursor-pointer place-items-center rounded-full border transition [&_svg]:size-[19px]",
        active
          ? "border-white/25 bg-white/15 text-white hover:bg-white/25"
          : "border-danger/40 bg-danger-tint text-danger hover:bg-danger/20",
      )}
    >
      {children}
    </button>
  );
}

export function LiveConsole({ session, live }: { session: LiveSession; live: boolean }) {
  const [panel, setPanel] = React.useState<Panel>("requests");
  const [roster, setRoster] = React.useState<ConsoleParticipant[]>(CONSOLE_PARTICIPANTS);
  const [micOn, setMicOn] = React.useState(true);
  const [camOn, setCamOn] = React.useState(true);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [chat, setChat] = React.useState<ChatLine[]>(CONSOLE_CHAT);
  const [draft, setDraft] = React.useState("");
  // Les durées d'attente dépendent de l'horloge : les calculer au rendu serveur
  // donnerait une autre valeur à l'hydratation. On n'affiche qu'après montage.
  const [clock, setClock] = React.useState<number | null>(null);

  React.useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const others = roster.filter((p) => !p.host);
  const speaker = roster.find((p) => p.speaking);
  const lockedCount = others.filter((p) => p.mutedByHost).length;

  /** File des demandes de parole, du plus ancien au plus récent (arbitrage 36). */
  const queue = React.useMemo(
    () =>
      roster
        .filter((p) => p.handRaisedAt)
        .sort((a, b) => (a.handRaisedAt as number) - (b.handRaisedAt as number)),
    [roster],
  );

  const patch = (ids: ReadonlySet<string> | string[], change: Partial<ConsoleParticipant>) => {
    const target = ids instanceof Set ? ids : new Set(ids);
    setRoster((current) =>
      current.map((p) => (!p.host && target.has(p.id) ? { ...p, ...change } : p)),
    );
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const muteAll = () => {
    patch(
      others.map((p) => p.id),
      { mutedByHost: true },
    );
    toast.success(`${others.length} micros coupés. Ils ne peuvent pas les rouvrir eux-mêmes.`);
  };

  const unmuteAll = () => {
    patch(
      others.map((p) => p.id),
      { mutedByHost: false },
    );
    toast.success("Tous les micros sont rendus à leurs propriétaires.");
  };

  const applyToSelection = (mutedByHost: boolean) => {
    const count = selected.size;
    if (count === 0) return;
    patch(selected, { mutedByHost });
    setSelected(new Set());
    toast.success(
      mutedByHost
        ? `${count} micro${count > 1 ? "s" : ""} coupé${count > 1 ? "s" : ""}.`
        : `${count} micro${count > 1 ? "s" : ""} rendu${count > 1 ? "s" : ""}.`,
    );
  };

  const toggleMute = (p: ConsoleParticipant) => {
    patch([p.id], { mutedByHost: !p.mutedByHost });
    toast.success(
      p.mutedByHost ? `Micro rendu à ${p.name}.` : `Micro de ${p.name} coupé.`,
    );
  };

  /**
   * Consommer une entrée de la file : le verrou tombe et la main se baisse. On
   * ne rallume pas le micro à la place du participant — arbitrage 35, rouvrir
   * rend la commande, cela ne l'actionne pas.
   */
  const giveFloor = (p: ConsoleParticipant) => {
    patch([p.id], { mutedByHost: false, handRaisedAt: undefined });
    toast.success(`${p.name} a la parole — sa main est baissée, son micro lui est rendu.`);
  };

  const dismissRequest = (p: ConsoleParticipant) => {
    patch([p.id], { handRaisedAt: undefined });
    toast.success(`Demande de ${p.name} retirée de la file.`);
  };

  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setChat((current) => [...current, { id: `local-${Date.now()}`, author: "Vous", self: true, text }]);
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
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
      {/* Scène */}
      <section className="min-w-0 overflow-hidden rounded-nk-lg bg-navy text-white shadow-nk">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2.5 text-[19px] font-extrabold">
              {session.title}
              {live ? (
                <StPill tone="bad">En direct</StPill>
              ) : (
                <StPill tone="muted">Pas encore ouvert</StPill>
              )}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-[#b9c9dd]">
              {session.community.name} · vous animez · {dateLabel}
            </p>
          </div>
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

        <div className="grid aspect-video place-items-center bg-navy-2 px-6 text-center">
          <div>
            <span
              className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-white/10"
              aria-hidden="true"
            >
              <Video className="size-7" />
            </span>
            <p className="text-[15px] font-bold">Votre flux se branchera ici</p>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
              La diffusion temps réel n&apos;est pas encore raccordée. Les commandes de modération
              ci-dessous réagissent, mais n&apos;atteignent aucun participant.
            </p>
          </div>
        </div>

        {/* Arbitrage 37 : le locuteur actif est affiché, ici comme chez l'apprenant. */}
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
            active={micOn}
            label={micOn ? "Couper mon micro" : "Activer mon micro"}
            onClick={() => setMicOn((on) => !on)}
          >
            {micOn ? <Mic /> : <MicOff />}
          </ControlButton>
          <ControlButton
            active={camOn}
            label={camOn ? "Couper ma caméra" : "Activer ma caméra"}
            onClick={() => setCamOn((on) => !on)}
          >
            {camOn ? <Video /> : <VideoOff />}
          </ControlButton>
        </div>

        {/* Arbitrage 35 : couper tout le monde, et rouvrir. Le geste sur un seul
            ou sur plusieurs vit dans l'onglet Participants. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-5 py-3.5">
          <p className="min-w-0 flex-1 text-[13px] text-[#b9c9dd]">
            {lockedCount === 0
              ? "Aucun micro coupé — chacun parle librement."
              : `${lockedCount} micro${lockedCount > 1 ? "s" : ""} coupé${lockedCount > 1 ? "s" : ""} par vous.`}
          </p>
          <Btn variant="gh" size="sm" onClick={muteAll} disabled={lockedCount === others.length}>
            <MicOff aria-hidden="true" />
            Couper tous les micros
          </Btn>
          <Btn variant="gh" size="sm" onClick={unmuteAll} disabled={lockedCount === 0}>
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
            { value: "participants", label: "Participants", count: roster.length },
            { value: "chat", label: "Salon", count: chat.length },
          ]}
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
                      key={p.id}
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
                          {p.name}
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
                            : `main levée depuis ${waitedLabel(p.handRaisedAt as number, clock)}`}
                          {p.mutedByHost ? " · micro coupé" : ""}
                        </small>
                      </span>
                      <Btn size="sm" onClick={() => giveFloor(p)}>
                        Donner la parole
                      </Btn>
                      <Btn
                        variant="t"
                        size="sm"
                        onClick={() => dismissRequest(p)}
                        aria-label={`Retirer la demande de ${p.name}`}
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
                  disabled={selected.size === 0}
                  onClick={() => applyToSelection(true)}
                >
                  <MicOff aria-hidden="true" />
                  Couper
                </Btn>
                <Btn
                  variant="o"
                  size="sm"
                  disabled={selected.size === 0}
                  onClick={() => applyToSelection(false)}
                >
                  <Mic aria-hidden="true" />
                  Rouvrir
                </Btn>
              </div>

              <ul className="flex flex-col gap-1">
                {roster.map((p) => {
                  const rank = queue.findIndex((entry) => entry.id === p.id);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2.5 rounded-nk-sm px-1.5 py-2 hover:bg-paper"
                    >
                      {p.host ? (
                        <span className="size-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelected(p.id)}
                          aria-label={`Sélectionner ${p.name}`}
                          className="size-4 shrink-0 cursor-pointer accent-brand"
                        />
                      )}
                      <span className="relative shrink-0">
                        <Avatar name={p.name} size="sm" />
                        {rank !== -1 ? (
                          <span
                            className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-brand text-[10.5px] font-extrabold text-white"
                            aria-hidden="true"
                          >
                            {rank + 1}
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                        {p.name}
                      </span>
                      {p.speaking ? (
                        <AudioLines className="size-4 shrink-0 text-brand" aria-label="Parle" />
                      ) : null}
                      {rank !== -1 ? (
                        <Hand className="size-4 shrink-0 text-brand" aria-label="Main levée" />
                      ) : null}
                      {p.selfMuted && !p.mutedByHost ? (
                        <MicOff
                          className="size-4 shrink-0 text-ink-3"
                          aria-label="Micro fermé par le participant"
                        />
                      ) : null}
                      {p.host ? (
                        <StPill tone="info">Vous</StPill>
                      ) : (
                        <Btn
                          variant={p.mutedByHost ? "o" : "t"}
                          size="sm"
                          onClick={() => toggleMute(p)}
                        >
                          {p.mutedByHost ? "Rouvrir" : "Couper"}
                        </Btn>
                      )}
                    </li>
                  );
                })}
              </ul>

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
                <label htmlFor="console-chat-saisie" className="sr-only">
                  Écrire dans le salon
                </label>
                <input
                  id="console-chat-saisie"
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
        {session.attendees} membres inscrits · {others.length} présents sur le plateau de
        démonstration.
      </p>
    </div>
  );
}
