"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { api, ApiError } from "@/lib/client";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PaneConversation {
  id: string;
  communitySlug: string;
  communityName: string;
  peer: { id: string; fullName: string | null };
  lastMessage: { body: string; createdAt: string | Date; mine: boolean } | null;
  unreadCount: number;
  canWrite: boolean;
  readOnlyReason:
    | "MEMBERSHIP_ENDED"
    | "MEMBER_BANNED"
    | "ACCOUNT_RESTRICTED"
    | "MESSAGING_DISABLED"
    | null;
}

export interface PaneThread extends PaneConversation {
  messages: Array<{
    id: string;
    body: string;
    createdAt: string | Date;
    mine: boolean;
    readAt: string | Date | null;
  }>;
}

const READ_ONLY_LABEL: Record<NonNullable<PaneConversation["readOnlyReason"]>, string> = {
  // Arbitrage 39 — l'écriture cesse, la lecture reste. Le dire, plutôt que de
  // laisser une zone de saisie qui refuserait à l'envoi.
  MEMBERSHIP_ENDED:
    "Votre adhésion à cette communauté est terminée. Le fil reste lisible, et l'écriture reprendra si vous y revenez.",
  MEMBER_BANNED:
    "Vous ne prenez plus la parole dans cette communauté. Le fil reste lisible.",
  ACCOUNT_RESTRICTED: "Votre compte est restreint : l'écriture est suspendue.",
  MESSAGING_DISABLED: "La messagerie n'est plus ouverte dans cette communauté.",
};

/** Heure courte des bulles : la date complète est déjà donnée par le séparateur. */
function timeLabel(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

function dayLabel(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function peerName(conversation: PaneConversation): string {
  return conversation.peer.fullName ?? "Votre interlocuteur";
}

export function ConversationPane({
  conversations,
  initialThread,
}: {
  conversations: PaneConversation[];
  initialThread: PaneThread | null;
}) {
  const [list, setList] = React.useState(conversations);
  const [thread, setThread] = React.useState<PaneThread | null>(initialThread);
  const [loading, setLoading] = React.useState(false);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [mobileThread, setMobileThread] = React.useState(false);
  const threadRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread]);

  // L'accusé de lecture part à l'ouverture du fil, une fois par fil ouvert.
  const readRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!thread || readRef.current === thread.id || thread.unreadCount === 0) return;
    readRef.current = thread.id;
    void api
      .patch(`/api/me/conversations/${thread.id}`)
      .then(() =>
        setList((current) =>
          current.map((c) => (c.id === thread.id ? { ...c, unreadCount: 0 } : c)),
        ),
      )
      .catch(() => {
        // Un accusé perdu n'est pas une erreur à montrer : il repartira à la
        // prochaine ouverture.
      });
  }, [thread]);

  async function select(id: string) {
    setMobileThread(true);
    if (thread?.id === id) return;
    setLoading(true);
    try {
      const { data } = await api.get<PaneThread>(`/api/me/conversations/${id}`);
      setThread(data);
    } catch {
      toast.error("Ce fil n'a pas pu être ouvert. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || !thread) return;
    setSending(true);
    try {
      await api.post(`/api/me/conversations/${thread.id}`, { body });
      const { data } = await api.get<PaneThread>(`/api/me/conversations/${thread.id}`);
      setThread(data);
      setList((current) =>
        current.map((c) =>
          c.id === data.id ? { ...c, lastMessage: data.lastMessage, unreadCount: 0 } : c,
        ),
      );
      setText("");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Votre message n'est pas parti. Réessayez.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 grid overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm md:grid-cols-[300px_1fr]">
      <aside
        aria-label="Conversations"
        className={cn("border-line md:block md:border-r", mobileThread ? "hidden" : "block")}
      >
        <ul className="max-h-[560px] overflow-y-auto">
          {list.map((conversation) => {
            const selected = conversation.id === thread?.id;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => void select(conversation.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-line-2 px-4 py-3.5 text-left transition-colors",
                    selected ? "bg-brand-tint/40" : "hover:bg-paper",
                  )}
                >
                  <Avatar name={peerName(conversation)} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-bold text-ink">
                      {peerName(conversation)}
                    </b>
                    <small className="block truncate text-[13px] text-ink-2">
                      {conversation.lastMessage
                        ? `${conversation.lastMessage.mine ? "Vous : " : ""}${conversation.lastMessage.body}`
                        : conversation.communityName}
                    </small>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 self-start">
                    <time className="text-[11.5px] text-ink-3">
                      {conversation.lastMessage
                        ? fmtRelative(conversation.lastMessage.createdAt)
                        : ""}
                    </time>
                    {conversation.unreadCount > 0 ? (
                      <span
                        className="grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white"
                        aria-label={`${conversation.unreadCount} message(s) non lu(s)`}
                      >
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section
        aria-label={thread ? `Conversation avec ${peerName(thread)}` : "Conversation"}
        className={cn("flex min-w-0 flex-col", mobileThread ? "flex" : "hidden md:flex")}
      >
        {thread ? (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <button
                type="button"
                onClick={() => setMobileThread(false)}
                aria-label="Retour aux conversations"
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-ink-2 md:hidden"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
              <Avatar name={peerName(thread)} />
              <div className="min-w-0">
                <b className="block truncate text-[15px] font-bold">{peerName(thread)}</b>
                <small className="block truncate text-[12.5px] text-ink-2">
                  {thread.communityName}
                </small>
              </div>
            </header>

            <div
              ref={threadRef}
              className="flex max-h-[420px] min-h-[280px] flex-col gap-2.5 overflow-y-auto bg-paper px-4 py-5"
              aria-busy={loading}
            >
              {loading ? (
                <p className="m-auto flex items-center gap-2 text-[13.5px] text-ink-3">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Chargement…
                </p>
              ) : thread.messages.length === 0 ? (
                <p className="m-auto max-w-[36ch] text-center text-[13.5px] text-ink-3">
                  Ce fil est vide. Écrivez le premier message.
                </p>
              ) : (
                thread.messages.map((message, index) => {
                  const previous = thread.messages[index - 1];
                  const newDay =
                    !previous ||
                    new Date(previous.createdAt).toDateString() !==
                      new Date(message.createdAt).toDateString();
                  return (
                    <React.Fragment key={message.id}>
                      {newDay ? (
                        <p className="my-1.5 text-center text-[12px] font-semibold text-ink-3">
                          {dayLabel(message.createdAt)}
                        </p>
                      ) : null}
                      <div className={cn("flex", message.mine ? "justify-end" : "justify-start")}>
                        <p
                          className={cn(
                            "max-w-[min(78%,460px)] whitespace-pre-line rounded-nk px-4 py-2.5 text-[14.5px] leading-relaxed",
                            message.mine
                              ? "rounded-br-sm bg-brand text-white"
                              : "rounded-bl-sm border border-line bg-card text-ink",
                          )}
                        >
                          {message.body}
                          <time
                            className={cn(
                              "mt-1 block text-[11.5px]",
                              message.mine ? "text-white/70" : "text-ink-3",
                            )}
                            dateTime={new Date(message.createdAt).toISOString()}
                          >
                            {timeLabel(message.createdAt)}
                          </time>
                        </p>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {thread.canWrite ? (
              <form
                onSubmit={send}
                noValidate
                className="flex items-center gap-2.5 border-t border-line px-4 py-3"
              >
                <label htmlFor="messagerie-saisie" className="sr-only">
                  Écrire à {peerName(thread)}
                </label>
                <input
                  id="messagerie-saisie"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={5000}
                  placeholder={`Écrire à ${peerName(thread).split(" ")[0]}…`}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-full border-[1.5px] border-line bg-card px-4 py-2.5 text-[14.5px] text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
                />
                <Btn
                  type="submit"
                  size="sm"
                  loading={sending}
                  disabled={!text.trim()}
                  aria-label="Envoyer"
                >
                  <Send aria-hidden="true" />
                  <span className="max-sm:sr-only">Envoyer</span>
                </Btn>
              </form>
            ) : (
              <p className="flex items-start gap-2.5 border-t border-line px-4 py-3.5 text-[13px] leading-relaxed text-ink-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                {thread.readOnlyReason ? READ_ONLY_LABEL[thread.readOnlyReason] : null}
              </p>
            )}
          </>
        ) : (
          <p className="m-auto px-6 py-16 text-center text-[13.5px] text-ink-3">
            Choisissez une conversation.
          </p>
        )}
      </section>
    </div>
  );
}
