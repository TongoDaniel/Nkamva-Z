"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CornerDownRight, MessageSquareOff, Pin, Trash2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Tabs } from "@/components/nk/tabs";
import { Chip } from "@/components/nk/chip";
import { Avatar } from "@/components/nk/avatar";
import { EmptyState } from "@/components/nk/empty-state";
import { ReportButton } from "@/components/nk/report-button";
import { api, ApiError } from "@/lib/client";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 5000;

interface Author {
  id: string;
  fullName: string | null;
  isTrainer: boolean;
}

interface Reply {
  id: string;
  body: string | null;
  createdAt: string | Date;
  author: Author;
  deleted: boolean;
  mine: boolean;
}

export interface FeedPost {
  id: string;
  kind: "ANNOUNCEMENT" | "DISCUSSION";
  body: string | null;
  pinned: boolean;
  createdAt: string | Date;
  repliesCount: number;
  author: Author;
  deleted: boolean;
  mine: boolean;
  canDelete: boolean;
  replies: Reply[];
}

/**
 * Les deux salons de l'espace membre. Le formateur parle dans les annonces, les
 * membres se répondent dans le forum — et tout le monde peut réagir sous une
 * annonce, y compris forum fermé : le salon désactivé est celui des discussions
 * entre membres, pas le droit de répondre à l'animateur.
 *
 * Rien n'est optimiste ici, à la différence du cœur des favoris : un message
 * qui apparaît puis disparaît parce que le serveur l'a refusé serait pire que
 * l'attente d'une réponse.
 */
export function CommunityFeed({
  slug,
  canSpeak,
  mutedReason,
  isTrainer,
  forumEnabled,
  broadcastEnabled,
  announcements,
  discussions,
}: {
  slug: string;
  canSpeak: boolean;
  mutedReason: "BANNED" | "RESTRICTED" | null;
  isTrainer: boolean;
  forumEnabled: boolean;
  broadcastEnabled: boolean;
  announcements: FeedPost[];
  discussions: FeedPost[];
}) {
  const router = useRouter();
  const salons = [
    broadcastEnabled && { value: "ANNOUNCEMENT", label: "Annonces", count: announcements.length },
    forumEnabled && { value: "DISCUSSION", label: "Fil de discussion", count: discussions.length },
  ].filter(Boolean) as Array<{ value: string; label: string; count: number }>;

  const [salon, setSalon] = React.useState(salons[0]?.value ?? "DISCUSSION");
  const posts = salon === "ANNOUNCEMENT" ? announcements : discussions;

  // Écrire un billet n'est ouvert que là où le salon l'autorise : une annonce
  // appartient à l'animateur, une discussion à tout membre qui a la parole.
  const canPost = canSpeak && (salon === "ANNOUNCEMENT" ? isTrainer && broadcastEnabled : forumEnabled);

  if (salons.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareOff />}
        title="Aucun salon ouvert"
        description="L'animateur de cette communauté n'a activé ni les annonces ni le fil de discussion."
      />
    );
  }

  return (
    <div className="min-w-0">
      {salons.length > 1 ? (
        <Tabs
          items={salons}
          value={salon}
          onValueChange={setSalon}
          label="Salons de la communauté"
          panelId="salon-panel"
        />
      ) : null}

      <div id="salon-panel" className="mt-5 grid gap-4">
        {mutedReason ? (
          <p className="flex items-start gap-2.5 rounded-nk border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            <MessageSquareOff className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <span>
              {mutedReason === "BANNED" ? (
                <>
                  <b className="text-ink">Vous ne prenez plus la parole ici.</b> Vous continuez
                  de lire la communauté et d&apos;accéder à ses ressources.
                </>
              ) : (
                <>
                  <b className="text-ink">Votre compte est restreint.</b> Vous conservez
                  l&apos;accès en lecture, l&apos;écriture est suspendue.
                </>
              )}
            </span>
          </p>
        ) : null}

        {canPost ? (
          <Composer
            slug={slug}
            kind={salon as "ANNOUNCEMENT" | "DISCUSSION"}
            onDone={() => router.refresh()}
          />
        ) : null}

        {posts.length === 0 ? (
          <EmptyState
            icon={<MessageSquareOff />}
            title={salon === "ANNOUNCEMENT" ? "Aucune annonce" : "Le fil est vide"}
            description={
              salon === "ANNOUNCEMENT"
                ? "L'animateur n'a encore rien annoncé."
                : "Personne n'a encore lancé de discussion. Ce peut être vous."
            }
          />
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              slug={slug}
              post={post}
              canSpeak={canSpeak}
              isTrainer={isTrainer}
              onDone={() => router.refresh()}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Composer({
  slug,
  kind,
  onDone,
}: {
  slug: string;
  kind: "ANNOUNCEMENT" | "DISCUSSION";
  onDone: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    try {
      await api.post(`/api/communities/${encodeURIComponent(slug)}/posts`, { kind, body });
      setBody("");
      onDone();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Votre message n'a pas été publié. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm"
    >
      <label htmlFor={`composer-${kind}`} className="sr-only">
        {kind === "ANNOUNCEMENT" ? "Écrire une annonce" : "Lancer une discussion"}
      </label>
      <textarea
        id={`composer-${kind}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_LENGTH}
        rows={3}
        placeholder={
          kind === "ANNOUNCEMENT"
            ? "Annoncer quelque chose à toute la communauté…"
            : "Poser une question, partager une trouvaille…"
        }
        className="w-full resize-y rounded-nk border border-line bg-paper px-3.5 py-2.5 text-[14.5px] leading-relaxed outline-none placeholder:text-ink-3 focus-visible:border-brand"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-3">
          {body.length > MAX_LENGTH - 500 ? `${body.length} / ${MAX_LENGTH}` : ""}
        </span>
        <Btn type="submit" size="sm" loading={pending} disabled={!body.trim()}>
          {kind === "ANNOUNCEMENT" ? "Publier l'annonce" : "Publier"}
        </Btn>
      </div>
    </form>
  );
}

function PostCard({
  slug,
  post,
  canSpeak,
  isTrainer,
  onDone,
}: {
  slug: string;
  post: FeedPost;
  canSpeak: boolean;
  isTrainer: boolean;
  onDone: () => void;
}) {
  const [replying, setReplying] = React.useState(false);
  const [reply, setReply] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function run(action: () => Promise<unknown>, failure: string) {
    setPending(true);
    try {
      await action();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <article
      className={cn(
        "rounded-nk-lg border bg-card p-5 shadow-nk-sm",
        post.pinned ? "border-brand" : "border-line",
      )}
    >
      <header className="flex items-center gap-3">
        <Avatar name={post.author.fullName ?? "Membre"} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold leading-tight">
            {post.author.fullName ?? "Membre"}
            {post.author.isTrainer ? (
              <Chip tone="brand" className="font-display">
                Animateur
              </Chip>
            ) : null}
            {post.pinned ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand">
                <Pin className="size-3.5" aria-hidden="true" /> Épinglé
              </span>
            ) : null}
          </p>
          <p className="text-[12.5px] text-ink-3">{fmtRelative(post.createdAt)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Une issue pour le lecteur, pas une action sur son propre message :
              retirer ce qu'on a écrit se fait par la corbeille, pas en
              saisissant la modération. */}
          {!post.deleted && !post.mine ? (
            <ReportButton
              variant="icon"
              targetType="COMMUNITY_POST"
              targetId={post.id}
              name={post.author.fullName ?? undefined}
            />
          ) : null}
          {isTrainer && !post.deleted ? (
            <button
              type="button"
              disabled={pending}
              aria-label={post.pinned ? "Détacher ce message" : "Épingler ce message"}
              onClick={() =>
                run(
                  () => api.patch(`/api/communities/${encodeURIComponent(slug)}/posts/${post.id}`),
                  "L'épinglage n'a pas abouti.",
                )
              }
              className="grid size-8 place-items-center rounded-full text-ink-3 transition hover:bg-paper hover:text-brand disabled:opacity-50"
            >
              <Pin className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          {post.canDelete ? (
            <button
              type="button"
              disabled={pending}
              aria-label="Retirer ce message"
              onClick={() =>
                run(
                  () => api.del(`/api/communities/${encodeURIComponent(slug)}/posts/${post.id}`),
                  "Le retrait n'a pas abouti.",
                )
              }
              className="grid size-8 place-items-center rounded-full text-ink-3 transition hover:bg-danger-tint hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <p
        className={cn(
          "mt-3 whitespace-pre-line text-[14.5px] leading-[1.65]",
          post.deleted ? "italic text-ink-3" : "text-ink-2",
        )}
      >
        {post.deleted ? "Ce message a été retiré." : post.body}
      </p>

      {post.replies.length > 0 ? (
        <ul className="mt-4 grid gap-3 border-t border-line-2 pt-4">
          {post.replies.map((r) => (
            <li key={r.id} className="flex gap-3">
              <CornerDownRight
                className="mt-1 size-4 shrink-0 text-ink-3"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold">
                  {r.author.fullName ?? "Membre"}
                  {r.author.isTrainer ? (
                    <Chip tone="brand" className="font-display">
                      Animateur
                    </Chip>
                  ) : null}
                  <span className="font-normal text-[12px] text-ink-3">
                    {fmtRelative(r.createdAt)}
                  </span>
                </p>
                <p
                  className={cn(
                    "mt-0.5 whitespace-pre-line text-[14px] leading-relaxed",
                    r.deleted ? "italic text-ink-3" : "text-ink-2",
                  )}
                >
                  {r.deleted ? "Réponse retirée." : r.body}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {!r.deleted && !r.mine ? (
                  <ReportButton
                    variant="icon"
                    targetType="COMMUNITY_POST_REPLY"
                    targetId={r.id}
                    name={r.author.fullName ?? undefined}
                    className="size-7"
                  />
                ) : null}
                {!r.deleted && isTrainer ? (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label="Retirer cette réponse"
                    onClick={() =>
                      run(
                        () =>
                          api.del(`/api/communities/${encodeURIComponent(slug)}/reponses/${r.id}`),
                        "Le retrait n'a pas abouti.",
                      )
                    }
                    className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {canSpeak && !post.deleted ? (
        replying ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              void run(async () => {
                await api.post(
                  `/api/communities/${encodeURIComponent(slug)}/posts/${post.id}`,
                  { body: reply },
                );
                setReply("");
                setReplying(false);
              }, "Votre réponse n'a pas été publiée.");
            }}
            className="mt-4 border-t border-line-2 pt-4"
          >
            <label htmlFor={`reply-${post.id}`} className="sr-only">
              Répondre
            </label>
            <textarea
              id={`reply-${post.id}`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={MAX_LENGTH}
              rows={2}
              autoFocus
              placeholder="Votre réponse…"
              className="w-full resize-y rounded-nk border border-line bg-paper px-3.5 py-2.5 text-[14px] leading-relaxed outline-none placeholder:text-ink-3 focus-visible:border-brand"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Btn type="button" variant="t" size="sm" onClick={() => setReplying(false)}>
                Annuler
              </Btn>
              <Btn type="submit" size="sm" loading={pending} disabled={!reply.trim()}>
                Répondre
              </Btn>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="mt-3 cursor-pointer text-[13px] font-bold text-brand hover:underline"
          >
            Répondre
          </button>
        )
      ) : null}
    </article>
  );
}
