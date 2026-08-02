"use client";

import * as React from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Conversation, DemoMessage } from "@/features/demo/message-data";

/** Heure courte des bulles : la date complète est déjà donnée par le séparateur. */
function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(
    date,
  );
}

function Bubble({ message }: { message: DemoMessage }) {
  const mine = message.who === "me";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[min(78%,460px)] rounded-nk px-4 py-2.5 text-[14.5px] leading-relaxed",
          mine
            ? "rounded-br-sm bg-brand text-white"
            : "rounded-bl-sm border border-line bg-card text-ink",
        )}
      >
        {message.text}
        <time
          className={cn("mt-1 block text-[11.5px]", mine ? "text-white/70" : "text-ink-3")}
          dateTime={message.sentAt.toISOString()}
        >
          {timeLabel(message.sentAt)}
        </time>
      </p>
    </div>
  );
}

export function ConversationPane({ conversations }: { conversations: Conversation[] }) {
  const [activeId, setActiveId] = React.useState(conversations[0]?.id ?? "");
  // Les messages envoyés vivent dans l'état local : rien n'est persisté tant
  // qu'aucun modèle de conversation n'existe. Le bandeau de démonstration le dit.
  const [drafts, setDrafts] = React.useState<Record<string, DemoMessage[]>>({});
  const [text, setText] = React.useState("");
  const [mobileThread, setMobileThread] = React.useState(false);
  const threadRef = React.useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const messages = React.useMemo(
    () => (active ? [...active.messages, ...(drafts[active.id] ?? [])] : []),
    [active, drafts],
  );

  React.useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  if (!active) return null;

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setDrafts((current) => ({
      ...current,
      [active.id]: [
        ...(current[active.id] ?? []),
        { id: `local-${Date.now()}`, who: "me", text: body, sentAt: new Date() },
      ],
    }));
    setText("");
    toast.success("Message affiché localement — il ne sera pas envoyé.");
  };

  const lastOf = (conversation: Conversation) => {
    const all = [...conversation.messages, ...(drafts[conversation.id] ?? [])];
    return all[all.length - 1];
  };

  return (
    <div className="mt-6 grid overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm md:grid-cols-[300px_1fr]">
      {/* Liste des conversations */}
      <aside
        aria-label="Conversations"
        className={cn(
          "border-line md:block md:border-r",
          mobileThread ? "hidden" : "block",
        )}
      >
        <ul className="max-h-[560px] overflow-y-auto">
          {conversations.map((conversation) => {
            const last = lastOf(conversation);
            const selected = conversation.id === active.id;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(conversation.id);
                    setMobileThread(true);
                  }}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-line-2 px-4 py-3.5 text-left transition-colors",
                    selected ? "bg-brand-tint/40" : "hover:bg-paper",
                  )}
                >
                  <Avatar name={conversation.trainer.name} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-bold text-ink">
                      {conversation.trainer.name}
                    </b>
                    <small className="block truncate text-[13px] text-ink-2">{last.text}</small>
                  </span>
                  <time className="shrink-0 self-start text-[11.5px] text-ink-3">
                    {fmtRelative(last.sentAt)}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Fil actif */}
      <section
        aria-label={`Conversation avec ${active.trainer.name}`}
        className={cn("flex min-w-0 flex-col", mobileThread ? "flex" : "hidden md:flex")}
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <button
            type="button"
            onClick={() => setMobileThread(false)}
            aria-label="Retour aux conversations"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-ink-2 md:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <Avatar name={active.trainer.name} />
          <div className="min-w-0">
            <b className="block truncate text-[15px] font-bold">{active.trainer.name}</b>
            <small className="block truncate text-[12.5px] text-ink-2">
              {active.trainer.role} · {active.community.name}
            </small>
          </div>
        </header>

        <div
          ref={threadRef}
          className="flex max-h-[420px] min-h-[280px] flex-col gap-2.5 overflow-y-auto bg-paper px-4 py-5"
        >
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay =
              !previous || previous.sentAt.toDateString() !== message.sentAt.toDateString();
            return (
              <React.Fragment key={message.id}>
                {newDay ? (
                  <p className="my-1.5 text-center text-[12px] font-semibold text-ink-3">
                    {dayLabel(message.sentAt)}
                  </p>
                ) : null}
                <Bubble message={message} />
              </React.Fragment>
            );
          })}
        </div>

        <form onSubmit={send} noValidate className="flex items-center gap-2.5 border-t border-line px-4 py-3">
          <label htmlFor="messagerie-saisie" className="sr-only">
            Écrire à {active.trainer.name.split(" ")[0]}
          </label>
          <input
            id="messagerie-saisie"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Écrire à ${active.trainer.name.split(" ")[0]}…`}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-full border-[1.5px] border-line bg-card px-4 py-2.5 text-[14.5px] text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          />
          <Btn type="submit" size="sm" disabled={!text.trim()} aria-label="Envoyer">
            <Send aria-hidden="true" />
            <span className="max-sm:sr-only">Envoyer</span>
          </Btn>
        </form>
      </section>
    </div>
  );
}
