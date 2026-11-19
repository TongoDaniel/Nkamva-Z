"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  BarChart3,
  Camera,
  Ear,
  Heart,
  Mic,
  Plus,
  Settings2,
  Smile,
  Snail,
  ThumbsUp,
  X,
} from "lucide-react";
import { Btn } from "@/components/nk/button";
import { LiveControlButton } from "@/components/nk/live-control";
import type { LiveRoomState } from "@/hooks/use-live-room";
import { cn } from "@/lib/utils";
import {
  acceptedVote,
  isPollMessage,
  isReaction,
  percents,
  tallyVotes,
  validPoll,
  type Poll,
  type ReactionId,
} from "@/lib/live-interactions";

/**
 * Ce qu'on fait dans un direct, en plus de parler.
 * ==========================================================================
 * Revue du 16 novembre 2026. Trois pièces, partagées par la salle et la
 * console comme la scène (`live-stage.tsx`) :
 *
 * 1. **Le choix du micro et de la caméra en cours de séance.** Un casque
 *    branché après l'ouverture ne servait à rien : il fallait quitter la salle,
 *    ce qui rend sa place sur la scène.
 * 2. **Les réactions.** Quatre signes, pensés pour un cours et non pour un
 *    spectacle : « j'ai compris », « plus lentement », « je n'entends pas »,
 *    « merci ». Un formateur qui parle ne lit pas le salon ; il voit passer
 *    un signe au bas de l'image.
 * 3. **Le sondage éclair** de l'animateur : une question, deux à quatre
 *    réponses, le décompte en direct.
 *
 * Tout passe par le canal de données de la salle (`send`, `subscribe`) et
 * **rien n'est écrit en base** : ce sont des gestes de l'instant, comme une
 * main qui se lève dans une salle de classe. Un sondage disparaît donc avec la
 * séance, et la page le dit à l'animateur. Qui arrive en cours de sondage le
 * reçoit : il le demande en entrant, et l'animateur le lui renvoie.
 * ==========================================================================
 */

const REACTION_TOPIC = "nk.reaction";
const POLL_TOPIC = "nk.sondage";
/** Une réaction s'efface de l'image au bout de ce délai. */
const REACTION_TTL = 6_000;
/** L'animateur redit l'état du sondage à ce rythme, pour qui aurait manqué un message. */
const POLL_REPEAT_MS = 8_000;
/** Intervalle minimal entre deux réactions d'une même personne. */
const REACTION_COOLDOWN = 1_500;

const REACTIONS: Array<{ id: ReactionId; label: string; icon: typeof ThumbsUp }> = [
  { id: "compris", label: "J'ai compris", icon: ThumbsUp },
  { id: "lentement", label: "Plus lentement", icon: Snail },
  { id: "entends", label: "Je n'entends pas", icon: Ear },
  { id: "merci", label: "Merci", icon: Heart },
];

const POPOVER =
  "z-[120] w-[min(300px,calc(100vw-24px))] rounded-nk-lg border border-line bg-card p-3 text-ink shadow-nk-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";

const SELECT =
  "w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3 py-2 text-[13.5px] font-semibold text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25";

/* ------------------------------------------------------------------------ */
/* 1. Le micro et la caméra                                                  */
/* ------------------------------------------------------------------------ */

export function DeviceMenu({ transport }: { transport: LiveRoomState }) {
  const { micros, cameras } = transport.devices;
  // Rien à choisir tant que l'accès n'est pas accordé, ou s'il n'y a qu'un
  // périphérique de chaque sorte : le bouton ne s'affiche pas pour rien.
  if (micros.length < 2 && cameras.length < 2) return null;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <span>
          <LiveControlButton label="Choisir le micro et la caméra" onClick={() => {}}>
            <Settings2 />
          </LiveControlButton>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={10} className={POPOVER}>
          <p className="mb-2.5 text-[13.5px] font-bold">Micro et caméra</p>
          {micros.length > 1 ? (
            <label className="mb-2.5 block">
              <span className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                <Mic className="size-3.5" aria-hidden="true" />
                Micro
              </span>
              <select
                value={transport.activeDevices.micro ?? ""}
                onChange={(e) => void transport.switchDevice("audioinput", e.target.value)}
                className={SELECT}
              >
                {micros.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {cameras.length > 1 ? (
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                <Camera className="size-3.5" aria-hidden="true" />
                Caméra
              </span>
              <select
                value={transport.activeDevices.camera ?? ""}
                onChange={(e) => void transport.switchDevice("videoinput", e.target.value)}
                className={SELECT}
              >
                {cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-3">
            Le changement se fait sans quitter la salle, et il est retenu pour la prochaine séance.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. Les réactions                                                          */
/* ------------------------------------------------------------------------ */

interface ShownReaction {
  key: number;
  id: ReactionId;
  name: string;
}

/**
 * Les réactions de la salle : celles qu'on reçoit, à afficher, et le geste
 * pour en envoyer une. Ses propres réactions s'affichent aussi : le canal ne
 * renvoie pas un message à son auteur, et on veut voir que le geste est parti.
 */
export function useReactions(transport: LiveRoomState, selfName: string) {
  const [shown, setShown] = React.useState<ShownReaction[]>([]);
  const counter = React.useRef(0);
  const lastSent = React.useRef(0);
  const { subscribe, send } = transport;

  const push = React.useCallback((id: ReactionId, name: string) => {
    counter.current += 1;
    const key = counter.current;
    // Six à l'écran au plus : une salle entière qui applaudit ne doit pas
    // recouvrir l'image.
    setShown((current) => [...current.slice(-5), { key, id, name }]);
    window.setTimeout(() => {
      setShown((current) => current.filter((r) => r.key !== key));
    }, REACTION_TTL);
  }, []);

  React.useEffect(
    () =>
      subscribe(REACTION_TOPIC, (payload, from) => {
        if (isReaction(payload)) push(payload.id, from?.name ?? "Un participant");
      }),
    [subscribe, push],
  );

  const react = React.useCallback(
    (id: ReactionId) => {
      const now = Date.now();
      if (now - lastSent.current < REACTION_COOLDOWN) return;
      lastSent.current = now;
      send(REACTION_TOPIC, { id });
      push(id, selfName);
    },
    [send, push, selfName],
  );

  return { shown, react };
}

export function ReactionButton({
  onReact,
  disabled,
}: {
  onReact: (id: ReactionId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <span>
          <LiveControlButton
            kind="toggle"
            active={open}
            disabled={disabled}
            label="Réagir"
            // Le déclencheur du menu ouvre et ferme : le bouton ne fait que
            // recevoir le clic.
            onClick={() => {}}
          >
            <Smile />
          </LiveControlButton>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={10} className={cn(POPOVER, "w-auto p-2")}>
          <ul className="grid grid-cols-2 gap-1.5">
            {REACTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    onReact(id);
                    setOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold text-ink-2 transition hover:bg-paper hover:text-ink"
                >
                  <Icon className="size-4 shrink-0 text-brand" aria-hidden="true" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Le fil des réactions, posé en bas à gauche de la scène. */
export function ReactionFeed({ shown }: { shown: ShownReaction[] }) {
  return (
    <ul
      aria-live="polite"
      aria-label="Réactions"
      className="pointer-events-none absolute bottom-full left-3 z-[3] mb-2 flex flex-col items-start gap-1.5"
    >
      {shown.map((r) => {
        const reaction = REACTIONS.find((x) => x.id === r.id)!;
        const Icon = reaction.icon;
        return (
          <li
            key={r.key}
            className="flex items-center gap-2 rounded-full border border-[var(--live-line)] bg-[var(--live-glass)] px-3 py-1.5 text-[13px] font-semibold text-[var(--live-glass-fg)] shadow-nk-sm backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-2"
          >
            <Icon className="size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <b className="text-[var(--live-fg)]">{r.name}</b> · {reaction.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* 3. Le sondage éclair                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Le sondage, des deux côtés.
 *
 * L'animateur tient le décompte : chaque vote lui arrive avec l'identité de
 * son auteur, et un second vote de la même personne **remplace** le premier.
 * Le décompte n'est donc pas falsifiable depuis le navigateur d'un
 * participant, qui ne fait qu'envoyer son choix.
 */
export function useQuickPoll(transport: LiveRoomState, isHost: boolean) {
  const [poll, setPoll] = React.useState<Poll | null>(null);
  const [closed, setClosed] = React.useState(false);
  const [votes, setVotes] = React.useState<Map<string, number>>(new Map());
  const [myVote, setMyVote] = React.useState<number | null>(null);
  const { subscribe, send, connected } = transport;
  // Lu par l'écouteur sans le réabonner à chaque vote.
  const current = React.useRef<{ poll: Poll | null; closed: boolean }>({ poll: null, closed: false });
  React.useEffect(() => {
    current.current = { poll, closed };
  }, [poll, closed]);

  React.useEffect(
    () =>
      subscribe(POLL_TOPIC, (payload, from) => {
        if (!isPollMessage(payload)) return;
        if (isHost) {
          const { poll: open, closed: done } = current.current;
          if (payload.type === "ask" && open) {
            send(POLL_TOPIC, { type: done ? "close" : "open", poll: open });
          }
          if (payload.type === "vote" && from) {
            const option = acceptedVote(open, done, payload);
            if (option !== null) setVotes((map) => new Map(map).set(from.identity, option));
          }
          return;
        }
        if ((payload.type === "open" || payload.type === "close") && validPoll(payload.poll)) {
          const incoming = payload.poll;
          setPoll((existing) => {
            if (existing?.id !== incoming.id) setMyVote(null);
            return incoming;
          });
          setClosed(payload.type === "close");
        }
      }),
    [subscribe, send, isHost],
  );

  // En arrivant, et après chaque reconnexion, un participant demande s'il y a
  // un sondage en cours : un message parti pendant une coupure est perdu, et
  // c'est ainsi qu'il le rattrape.
  const { reconnecting } = transport;
  React.useEffect(() => {
    if (!isHost && connected && !reconnecting) send(POLL_TOPIC, { type: "ask" });
  }, [isHost, connected, reconnecting, send]);

  // L'animateur redit l'état du sondage à intervalle régulier. Le canal ne
  // garantit rien pendant une renégociation (essai du 19 novembre 2026 : la
  // clôture s'est perdue chez l'apprenante, qui voyait encore le sondage
  // ouvert). Le message est idempotent : le recevoir deux fois ne change rien.
  React.useEffect(() => {
    if (!isHost || !poll) return;
    const id = window.setInterval(() => {
      send(POLL_TOPIC, { type: closed ? "close" : "open", poll: closed ? { ...poll } : poll });
    }, POLL_REPEAT_MS);
    return () => window.clearInterval(id);
  }, [isHost, poll, closed, send]);

  const tally = React.useMemo(() => {
    if (!poll) return [];
    if (!isHost) return poll.results ?? [];
    return tallyVotes(poll, votes);
  }, [poll, votes, isHost]);

  const start = React.useCallback(
    (question: string, options: string[]) => {
      const next: Poll = { id: `${Date.now()}`, question, options };
      setPoll(next);
      setClosed(false);
      setVotes(new Map());
      send(POLL_TOPIC, { type: "open", poll: next });
    },
    [send],
  );

  const close = React.useCallback(() => {
    if (!poll) return;
    const final = { ...poll, results: tally };
    setPoll(final);
    setClosed(true);
    send(POLL_TOPIC, { type: "close", poll: final });
  }, [poll, tally, send]);

  const dismiss = React.useCallback(() => {
    setPoll(null);
    setClosed(false);
    setVotes(new Map());
    setMyVote(null);
  }, []);

  const vote = React.useCallback(
    (option: number) => {
      if (!poll || closed) return;
      setMyVote(option);
      send(POLL_TOPIC, { type: "vote", pollId: poll.id, option });
    },
    [poll, closed, send],
  );

  return { poll, closed, tally, voters: votes.size, myVote, start, close, dismiss, vote };
}

type QuickPoll = ReturnType<typeof useQuickPoll>;

function Bars({ poll, tally, highlight }: { poll: Poll; tally: number[]; highlight?: number | null }) {
  const shares = percents(tally);
  return (
    <ul className="grid gap-2">
      {poll.options.map((option, i) => {
        const count = tally[i] ?? 0;
        const percent = shares[i] ?? 0;
        return (
          <li key={i}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13.5px]">
              <span className={cn("font-semibold", highlight === i ? "text-brand" : "text-ink")}>{option}</span>
              <span className="shrink-0 tabular-nums text-ink-2">
                {count} · {percent} %
              </span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full bg-line-2" aria-hidden="true">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Le bouton et le formulaire de l'animateur, puis le décompte en direct. */
export function HostPollButton({ poll, disabled }: { poll: QuickPoll; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= 2;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <span>
          <LiveControlButton
            kind="toggle"
            active={open || (poll.poll !== null && !poll.closed)}
            disabled={disabled}
            label={poll.poll && !poll.closed ? "Sondage en cours" : "Lancer un sondage"}
            // Le déclencheur du menu ouvre et ferme : le bouton ne fait que
            // recevoir le clic.
            onClick={() => {}}
          >
            <BarChart3 />
          </LiveControlButton>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={10} className={cn(POPOVER, "w-[min(340px,calc(100vw-24px))]")}>
          {poll.poll ? (
            <div>
              <p className="mb-1 text-[13px] font-semibold text-ink-3">
                {poll.closed ? "Sondage clos" : `Sondage en cours · ${poll.voters} réponse${poll.voters > 1 ? "s" : ""}`}
              </p>
              <p className="mb-3 text-[15px] font-bold">{poll.poll.question}</p>
              <Bars poll={poll.poll} tally={poll.tally} />
              <div className="mt-3.5 flex flex-wrap gap-2">
                {poll.closed ? (
                  <Btn size="sm" variant="o" onClick={poll.dismiss}>
                    Nouveau sondage
                  </Btn>
                ) : (
                  <Btn size="sm" onClick={poll.close}>
                    Clore et montrer le résultat
                  </Btn>
                )}
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!ready) return;
                poll.start(question.trim(), filled);
                setQuestion("");
                setOptions(["", ""]);
              }}
            >
              <label className="mb-2.5 block">
                <span className="mb-1 block text-[13px] font-semibold text-ink-2">Question</span>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={140}
                  placeholder="Vous suivez jusqu'ici ?"
                  className={SELECT}
                />
              </label>
              <span className="mb-1 block text-[13px] font-semibold text-ink-2">Réponses</span>
              <ul className="mb-2 grid gap-1.5">
                {options.map((option, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <input
                      value={option}
                      onChange={(e) =>
                        setOptions((list) => list.map((o, j) => (j === i ? e.target.value : o)))
                      }
                      maxLength={60}
                      placeholder={`Réponse ${i + 1}`}
                      aria-label={`Réponse ${i + 1}`}
                      className={SELECT}
                    />
                    {options.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                        aria-label={`Retirer la réponse ${i + 1}`}
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-paper hover:text-ink"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {options.length < 4 ? (
                <button
                  type="button"
                  onClick={() => setOptions((list) => [...list, ""])}
                  className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-bold text-brand"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Ajouter une réponse
                </button>
              ) : null}
              <Btn type="submit" size="sm" block disabled={!ready}>
                Lancer le sondage
              </Btn>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-3">
                Les réponses s&apos;affichent en direct. Le sondage n&apos;est pas conservé après la
                séance : notez le résultat s&apos;il vous sert.
              </p>
            </form>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Le sondage tel qu'un participant le reçoit, posé au-dessus des commandes. */
export function PollCard({ poll }: { poll: QuickPoll }) {
  const [hidden, setHidden] = React.useState<string | null>(null);
  if (!poll.poll || hidden === poll.poll.id) return null;
  const current = poll.poll;
  return (
    <section
      aria-label="Sondage"
      className="mx-3 mb-1 rounded-nk-lg border border-line bg-card p-4 text-ink shadow-nk-sm sm:mx-5"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink-3">
            {poll.closed ? "Résultat du sondage" : "Sondage de l'animateur"}
          </p>
          <p className="text-[15px] font-bold">{current.question}</p>
        </div>
        <button
          type="button"
          onClick={() => setHidden(current.id)}
          aria-label="Masquer le sondage"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-paper hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {poll.closed ? (
        <Bars poll={current} tally={poll.tally} highlight={poll.myVote} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {current.options.map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={() => poll.vote(i)}
              aria-pressed={poll.myVote === i}
              className={cn(
                "cursor-pointer rounded-full border-[1.5px] px-3.5 py-2 text-[13.5px] font-semibold transition",
                poll.myVote === i
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-card text-ink-2 hover:border-brand hover:text-ink",
              )}
            >
              {option}
            </button>
          ))}
          {poll.myVote !== null ? (
            <p className="w-full text-[13px] text-ink-3">
              Réponse envoyée. Vous pouvez en changer tant que le sondage est ouvert.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
