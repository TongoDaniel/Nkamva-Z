"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Lock, Megaphone, Pin, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { ReportButton } from "@/components/nk/report-button";
import { useThreadFocus } from "@/components/layouts/shell-chrome";
import { api, ApiError } from "@/lib/client";
import { fmtListStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PaneConversation {
  id: string;
  kind: "DIRECT" | "GROUP";
  communitySlug: string;
  communityName: string;
  title: string;
  peer: { id: string; fullName: string | null; avatarUrl: string | null } | null;
  /** Photo de l'autre. Nulle pour un groupe, et nulle tant que personne n'en a posé. */
  avatarUrl: string | null;
  lastMessage: {
    body: string | null;
    createdAt: string | Date;
    mine: boolean;
    deleted: boolean;
    authorName: string | null;
  } | null;
  unreadCount: number;
  canWrite: boolean;
  readOnlyReason:
    | "MEMBERSHIP_ENDED"
    | "MEMBER_BANNED"
    | "ACCOUNT_RESTRICTED"
    | "MESSAGING_DISABLED"
    | null;
  pinned: boolean;
  pinnedBySystem: boolean;
}

export interface PaneThread extends PaneConversation {
  messages: Array<{
    id: string;
    body: string | null;
    createdAt: string | Date;
    mine: boolean;
    readAt: string | Date | null;
    deleted: boolean;
    announcement: boolean;
    authorName: string | null;
  }>;
}

/**
 * Les messages d'un fil fermé restent lisibles ; c'est la saisie qui disparaît.
 * Le motif change avec la forme : « le fil » n'a pas de sens dans un groupe.
 */
const READ_ONLY_LABEL: Record<
  NonNullable<PaneConversation["readOnlyReason"]>,
  { direct: string; group: string }
> = {
  // Arbitrages 39 et 129 — l'écriture cesse, la lecture reste. Le dire, plutôt
  // que de laisser une zone de saisie qui refuserait à l'envoi.
  MEMBERSHIP_ENDED: {
    direct:
      "Votre adhésion à cette communauté est terminée. Le fil reste lisible, et l'écriture reprendra si vous y revenez.",
    group:
      "Votre adhésion à cette communauté est terminée. Le groupe reste lisible, et vous y reprendrez la parole si vous y revenez.",
  },
  MEMBER_BANNED: {
    direct: "Vous ne prenez plus la parole dans cette communauté. Le fil reste lisible.",
    group: "Vous ne prenez plus la parole dans cette communauté. Le groupe reste lisible.",
  },
  ACCOUNT_RESTRICTED: {
    direct: "Votre compte est restreint : l'écriture est suspendue.",
    group: "Votre compte est restreint : l'écriture est suspendue.",
  },
  MESSAGING_DISABLED: {
    direct: "Les messages directs ne sont plus ouverts dans cette communauté.",
    group: "Le groupe n'est plus ouvert dans cette communauté.",
  },
};

/** Les trois filtres de l'arbitrage 130. Pas de « Privées » : il se déduit. */
const FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "unread", label: "Non lues" },
  { value: "groups", label: "Groupes" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

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

/** Le nom affiché : celui de l'autre pour un fil privé, celui du groupe sinon.
 *  Le serveur l'a déjà calculé — l'écran ne le reconstitue pas par cas. */
function peerName(conversation: PaneConversation): string {
  return conversation.title;
}

export function ConversationPane({
  conversations,
  initialThread,
}: {
  conversations: PaneConversation[];
  initialThread: PaneThread | null;
}) {
  const [thread, setThread] = React.useState<PaneThread | null>(initialThread);
  const [loading, setLoading] = React.useState(false);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [mobileThread, setMobileThread] = React.useState(false);

  // Un fil ouvert sur téléphone prend l'écran entier : la coquille retire son
  // en-tête sous `md` (voir `shell-chrome.tsx`). L'en-tête du fil, avec le nom
  // de l'autre et la flèche de retour, dit déjà où l'on est et comment en
  // sortir ; empiler les deux coûtait 63 px sur 812 pour rien.
  useThreadFocus(mobileThread);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [announcing, setAnnouncing] = React.useState(false);

  /*
    L'horodatage de la liste ne se rend qu'une fois monté.

    `fmtListStamp` lit le fuseau **du lecteur** et compare des jours
    calendaires. Le serveur, lui, tourne en UTC : à 23 h 50 à Douala, il
    écrirait « 22:50 » et le navigateur « Hier » — deux textes différents pour
    la même donnée, ce que React signale comme une divergence d'hydratation et,
    surtout, ce qui affiche brièvement une date fausse.

    La colonne a une largeur fixe : l'attente d'une image ne déplace rien.
  */
  const [monte, setMonte] = React.useState(false);
  React.useEffect(() => setMonte(true), []);
  const threadRef = React.useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  /** Clé du message en cours de rédaction. Remise à zéro une fois parti. */
  const clefEnvoi = React.useRef<string | null>(null);

  // Onglet masqué, rien ne part. C'est la lecture directe de la règle 11 du
  // §10.2 — « rien ne consomme de données sans demande » — et la plus grosse
  // économie du sondage : personne ne regarde, personne ne paie.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const suivre = () => setVisible(!document.hidden);
    suivre();
    document.addEventListener("visibilitychange", suivre);
    return () => document.removeEventListener("visibilitychange", suivre);
  }, []);

  // Le délai évite une requête par frappe — 300 ms est le temps d'une
  // hésitation, pas d'une pause. La clé de cache suit la valeur retardée, pas
  // celle du champ.
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const listKey = React.useMemo(
    () => ["conversations", filter, debounced] as const,
    [filter, debounced],
  );

  // Filtre et recherche repartent au serveur : la recherche couvre le corps des
  // messages (arbitrage 130), que le navigateur n'a pas.
  const { data: list = conversations } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filtre", filter);
      if (debounced) params.set("q", debounced);
      const { data } = await api.get<PaneConversation[]>(
        `/api/me/conversations?${params.toString()}`,
      );
      return data;
    },
    // La liste rendue par le serveur sert de première valeur, et seulement pour
    // l'état par défaut : un filtre ou une recherche demandent autre chose.
    initialData: filter === "all" && !debounced ? conversations : undefined,
    // §4.2 — 15 s sur une liste. Le groupe n'y change rien : ce qui coûte, c'est
    // la charge utile, pas la fréquence (voir le sondage du fil).
    refetchInterval: visible ? 15_000 : false,
    staleTime: 0,
  });

  const setList = React.useCallback(
    (maj: (courant: PaneConversation[]) => PaneConversation[]) => {
      queryClient.setQueryData<PaneConversation[]>(listKey, (courant) =>
        maj(courant ?? conversations),
      );
    },
    [queryClient, listKey, conversations],
  );

  // Sondage du fil ouvert — **incrémental**. On ne redemande que ce qui a été
  // posté après le dernier message qu'on tient. Sans cela, un groupe de deux
  // cents messages repartait en entier toutes les huit secondes.
  React.useEffect(() => {
    if (!thread || !visible) return;
    const id = setInterval(() => {
      const dernier = thread.messages.at(-1)?.createdAt;
      const depuis = dernier ? `?depuis=${encodeURIComponent(new Date(dernier).toISOString())}` : "";
      void api
        .get<PaneThread>(`/api/me/conversations/${thread.id}${depuis}`)
        .then(({ data }) => {
          setThread((courant) => {
            if (!courant || courant.id !== data.id) return courant;
            // Le résumé est toujours frais — droit d'écrire, non-lues, épingle ;
            // les messages, eux, s'ajoutent. Un identifiant déjà tenu n'est pas
            // rejoué : l'envoi optimiste peut avoir devancé le sondage.
            const connus = new Set(courant.messages.map((m) => m.id));
            const nouveaux = data.messages.filter((m) => !connus.has(m.id));
            return { ...data, messages: [...courant.messages, ...nouveaux] };
          });
        })
        .catch(() => {
          // Un sondage perdu se rattrape au suivant : rien à signaler.
        });
      // §4.2 — 8 s sur un fil.
    }, 8_000);
    return () => clearInterval(id);
  }, [thread, visible]);

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
    // La clé du message, tirée une fois et **conservée entre les tentatives**.
    // C'est tout le mécanisme : le délai client de 20 s annule la requête
    // pendant que le serveur committe, la personne renvoie, et la même clé
    // retombe sur la ligne déjà écrite au lieu d'en créer une seconde. Un
    // identifiant tiré à chaque essai n'aurait rien empêché du tout.
    if (!clefEnvoi.current) clefEnvoi.current = crypto.randomUUID();

    try {
      await api.post(`/api/me/conversations/${thread.id}`, {
        body,
        clientKey: clefEnvoi.current,
        ...(announcing ? { announcement: true } : {}),
      });
      const { data } = await api.get<PaneThread>(`/api/me/conversations/${thread.id}`);
      setThread(data);
      // Réordonner : le fil auquel on vient d'écrire remonte, sauf si une
      // épingle passe devant.
      setList((current) =>
        reorder(
          current.map((c) =>
            c.id === data.id ? { ...c, lastMessage: data.lastMessage, unreadCount: 0 } : c,
          ),
        ),
      );
      setText("");
      clefEnvoi.current = null;
      // L'annonce ne colle pas au message suivant : c'est un geste qu'on répète
      // rarement, et le laisser armé ferait notifier toute la communauté par
      // inadvertance.
      setAnnouncing(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Votre message n'est pas parti. Réessayez.",
      );
    } finally {
      setSending(false);
    }
  }

  /**
   * L'ordre de l'arbitrage 130, rejoué côté client après une épingle.
   *
   * Sans lui, la ligne changeait d'icône sans changer de place : le succès était
   * annoncé pendant que la liste montrait l'ancien état, ce que la règle 2 du
   * §10.2 interdit. Recharger la liste au serveur aurait coûté un aller-retour
   * pour un tri que le navigateur sait faire.
   */
  function reorder(rows: PaneConversation[]): PaneConversation[] {
    return [...rows].sort((a, b) => {
      if (a.pinnedBySystem !== b.pinnedBySystem) return a.pinnedBySystem ? -1 : 1;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });
  }

  /** Épingle personnelle. Celle du formateur sur son groupe ne bouge pas. */
  async function togglePin(conversation: PaneConversation) {
    if (conversation.pinnedBySystem) return;
    const next = !conversation.pinned;
    setList((current) =>
      reorder(current.map((c) => (c.id === conversation.id ? { ...c, pinned: next } : c))),
    );
    try {
      await api.patch(`/api/me/conversations/${conversation.id}/pin`, { pinned: next });
    } catch (err) {
      // Remettre l'épingle où elle était : l'écran ne doit jamais montrer un
      // état que la base ne porte pas.
      setList((current) =>
        reorder(current.map((c) => (c.id === conversation.id ? { ...c, pinned: !next } : c))),
      );
      toast.error(err instanceof ApiError ? err.message : "L'épingle n'a pas pu être posée.");
    }
  }

  return (
    /*
      `minmax(0, 1fr)` et non `1fr` : une piste `1fr` a pour plancher le
      **min-content** de ce qu'elle contient, et les lignes de cette liste ne
      se coupent pas (`truncate` pose `white-space: nowrap`). La piste se
      dimensionnait donc sur l'aperçu le plus long — 510 px dans un écran de
      375 — et poussait l'heure et la pastille de non-lues hors du cadre, où
      `overflow-hidden` les cachait sans rien dire.

      La rangée est déclarée pour la même raison, mais dans l'autre sens : sans
      `grid-rows-[minmax(0,1fr)]`, la rangée implicite vaut `auto` et se
      dimensionne sur le plus long des deux volets — la liste dépasserait le
      cadre au lieu de défiler dedans, et la saisie sortirait de l'écran.
    */
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-card md:grid-cols-[300px_minmax(0,1fr)]">
      <aside
        aria-label="Conversations"
        className={cn(
          "min-h-0 min-w-0 flex-col border-line md:flex md:border-r",
          mobileThread ? "hidden" : "flex",
        )}
      >
        <div className="shrink-0 border-b border-line px-3 py-2.5">
          <label htmlFor="messagerie-recherche" className="sr-only">
            Rechercher une personne, un groupe ou un message
          </label>
          <input
            id="messagerie-recherche"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="mb-2 w-full rounded-full border-[1.5px] border-line bg-paper px-3.5 py-1.5 text-[13.5px] text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          />
          <div role="group" aria-label="Filtrer les conversations" className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={cn(
                  "nk-tap rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors",
                  filter === f.value
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-ink-2 hover:border-ink-3",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {list.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13.5px] text-ink-3">
              {query.trim() ? "Rien ne correspond à cette recherche." : "Rien à afficher ici."}
            </li>
          ) : null}
          {list.map((conversation) => {
            const selected = conversation.id === thread?.id;
            const isGroup = conversation.kind === "GROUP";
            return (
              /*
                La ligne et son épingle sont deux enfants du `li`, côte à côte.
                L'épingle était auparavant en position absolue au-dessus de la
                ligne — deux boutons imbriqués n'étant pas du HTML valide, il
                fallait bien la sortir. Mais `nk-tap` posait `position: relative`
                et l'emportait sur `absolute` : l'épingle retombait dans le flux,
                au-dessus de la ligne, à gauche. Deux voisins dans une rangée
                règlent le problème sans dépendre d'un positionnement.
              */
              <li
                key={conversation.id}
                className={cn(
                  // Le fond porte la **ligne**, pas le bouton : sinon la colonne
                  // de l'épingle reste blanche et une couture verticale coupe la
                  // ligne sélectionnée en deux.
                  "flex items-stretch border-b border-line-2 transition-colors",
                  selected ? "bg-brand-tint/40" : "hover:bg-paper",
                )}
              >
                <button
                  type="button"
                  onClick={() => void select(conversation.id)}
                  aria-current={selected ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 pr-2 text-left"
                >
                  {/* Un groupe se distingue à l'œil avant d'être lu : coin carré
                      là où une personne a un rond. Ce qui remplit le carré
                      change — la photo du groupe si son formateur en a posé
                      une, le glyphe sinon —, la forme, elle, ne change pas :
                      c'est elle qui dit « plusieurs personnes ». */}
                  {isGroup ? (
                    <span
                      className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-nk-sm bg-brand-tint text-brand"
                      aria-hidden="true"
                    >
                      {conversation.avatarUrl ? (
                        <img
                          src={conversation.avatarUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Users className="size-4" />
                      )}
                    </span>
                  ) : (
                    <Avatar name={conversation.title} src={conversation.avatarUrl} />
                  )}
                  <span className="min-w-0 flex-1">
                    <b className="flex items-center gap-1.5 text-[14.5px] font-bold text-ink">
                      <span className="truncate">{conversation.title}</span>
                      {isGroup ? (
                        // Plancher typographique de l'arbitrage 116 : 13 px, y
                        // compris sur une pastille qu'on croit décorative — elle
                        // porte la seule distinction entre un groupe et une
                        // personne.
                        <span className="hidden shrink-0 rounded-full bg-line-2 px-1.5 text-[13px] font-semibold text-ink-3 md:inline">
                          groupe
                        </span>
                      ) : null}
                    </b>
                    <small className="block truncate text-[13px] text-ink-2">
                      {conversation.lastMessage
                        ? conversation.lastMessage.deleted
                          ? "Message retiré."
                          : `${
                              conversation.lastMessage.mine
                                ? "Vous : "
                                : isGroup && conversation.lastMessage.authorName
                                  ? `${conversation.lastMessage.authorName.split(" ")[0]} : `
                                  : ""
                            }${conversation.lastMessage.body}`
                        : isGroup
                          ? "Personne n'a encore écrit."
                          : conversation.communityName}
                    </small>
                  </span>
                  {/* Largeur fixe : sans elle, la colonne se dimensionne sur son
                      contenu, et « Hier » puis « 09/09/26 » feraient danser la
                      liste d'une ligne à l'autre. */}
                  <span className="flex w-[52px] shrink-0 flex-col items-end gap-1 self-start">
                    <time
                      className={cn(
                        "text-[13px] tabular-nums",
                        conversation.unreadCount > 0 ? "font-semibold text-brand" : "text-ink-3",
                      )}
                      dateTime={
                        conversation.lastMessage
                          ? new Date(conversation.lastMessage.createdAt).toISOString()
                          : undefined
                      }
                    >
                      {monte && conversation.lastMessage
                        ? fmtListStamp(conversation.lastMessage.createdAt)
                        : ""}
                    </time>
                    {conversation.unreadCount > 0 ? (
                      <span
                        className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[13px] font-bold leading-none text-white"
                        aria-label={`${conversation.unreadCount} message${conversation.unreadCount > 1 ? "s" : ""} non lu${conversation.unreadCount > 1 ? "s" : ""}`}
                      >
                        {/* Au-delà de 99, le nombre exact n'aide plus et casse
                            la pastille : la messagerie n'est pas un compteur. */}
                        {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </button>

                {/* Hors du bouton de sélection : deux boutons imbriqués ne sont
                    pas du HTML valide, et l'épingle ne doit pas ouvrir le fil. */}
                <button
                  type="button"
                  onClick={() => void togglePin(conversation)}
                  disabled={conversation.pinnedBySystem}
                  aria-label={
                    conversation.pinnedBySystem
                      ? `${conversation.title}, épinglé d'office`
                      : conversation.pinned
                        ? `Détacher ${conversation.title}`
                        : `Épingler ${conversation.title}`
                  }
                  className={cn(
                    // Une colonne à part, de la hauteur de la ligne : la cible
                    // fait 44 px de haut sans que l'icône grossisse, et sans
                    // `nk-tap` — dont le repère se battrait ici avec la mise en
                    // page plutôt que de la servir.
                    "grid w-11 shrink-0 place-items-center transition-colors",
                    conversation.pinnedBySystem
                      ? "cursor-default text-brand"
                      : conversation.pinned
                        ? "text-brand hover:bg-line-2"
                        : "text-ink-3/40 hover:bg-line-2 hover:text-ink-2",
                  )}
                >
                  {/* Une seule icône, pleine ou creuse. `PinOff` — l'épingle
                      barrée — annonçait une interdiction sur chaque ligne non
                      épinglée : trois barres rouges pour dire « rien de
                      spécial ». */}
                  <Pin
                    className={cn("size-4", conversation.pinned && "fill-current")}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section
        aria-label={thread ? `Conversation avec ${peerName(thread)}` : "Conversation"}
        className={cn("min-h-0 min-w-0 flex-col", mobileThread ? "flex" : "hidden md:flex")}
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
              <Avatar name={peerName(thread)} src={thread.avatarUrl} />
              <div className="min-w-0">
                <b className="block truncate text-[15px] font-bold">{peerName(thread)}</b>
                <small className="block truncate text-[13px] text-ink-2">
                  {thread.communityName}
                </small>
              </div>
            </header>

            <div
              ref={threadRef}
              className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain bg-paper px-4 py-5"
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
                        <p className="my-1.5 text-center text-[13px] font-semibold text-ink-3">
                          {dayLabel(message.createdAt)}
                        </p>
                      ) : null}
                      <div
                        className={cn(
                          "flex items-end gap-1",
                          message.mine ? "justify-end" : "justify-start",
                        )}
                      >
                        <p
                          className={cn(
                            "max-w-[min(78%,460px)] whitespace-pre-line rounded-nk px-4 py-2.5 text-[14.5px] leading-relaxed",
                            // Un message retiré ne reprend pas la couleur de
                            // son auteur : la bulle doit se lire comme un vide,
                            // pas comme un propos.
                            message.deleted
                              ? "border border-line bg-paper italic text-ink-3"
                              : message.announcement
                                ? "rounded-bl-sm border-[1.5px] border-brand bg-brand-tint text-ink"
                                : message.mine
                                  ? "rounded-br-sm bg-brand text-white"
                                  : "rounded-bl-sm border border-line bg-card text-ink",
                          )}
                        >
                          {/* Qui parle : inutile à deux, nécessaire dans un
                              groupe où chaque bulle vient de quelqu'un d'autre. */}
                          {thread.kind === "GROUP" && !message.mine && !message.deleted ? (
                            <b className="mb-0.5 block text-[13px] font-bold text-brand-dark">
                              {message.authorName ?? "Un membre"}
                            </b>
                          ) : null}
                          {message.announcement && !message.deleted ? (
                            <b className="mb-1 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-brand-dark">
                              <Megaphone className="size-3.5" aria-hidden="true" />
                              Annonce
                            </b>
                          ) : null}
                          {message.deleted ? "Ce message a été retiré." : message.body}
                          <time
                            className={cn(
                              "mt-1 block text-[13px]",
                              message.mine && !message.deleted && !message.announcement ? "text-white/70" : "text-ink-3",
                            )}
                            dateTime={new Date(message.createdAt).toISOString()}
                          >
                            {timeLabel(message.createdAt)}
                          </time>
                        </p>
                        {/* Un fil privé n'a pas de témoin : sans cette issue,
                            ce qui s'y dit d'inacceptable ne remonte nulle
                            part. Rien à signaler dans ses propres bulles, ni
                            dans celles que la Modération a déjà retirées. */}
                        {message.mine || message.deleted ? null : (
                          <ReportButton
                            variant="icon"
                            targetType="MESSAGE"
                            targetId={message.id}
                            name={peerName(thread)}
                            className="size-7 text-ink-3/70"
                          />
                        )}
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
                {/* Annoncer est un geste de formateur, et seulement dans son
                    groupe (arbitrage 128). `pinnedBySystem` dit exactement
                    cela : le groupe qu'on anime. */}
                {thread.kind === "GROUP" && thread.pinnedBySystem ? (
                  <button
                    type="button"
                    onClick={() => setAnnouncing((v) => !v)}
                    aria-pressed={announcing}
                    title="Annoncer : épingle le message et prévient tous les membres"
                    className={cn(
                      "nk-tap grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
                      announcing
                        ? "border-brand bg-brand text-white"
                        : "border-line text-ink-3 hover:border-ink-3 hover:text-ink-2",
                    )}
                  >
                    <Megaphone className="size-4" aria-hidden="true" />
                    <span className="sr-only">
                      {announcing ? "Ne pas annoncer ce message" : "Annoncer ce message"}
                    </span>
                  </button>
                ) : null}
                <label htmlFor="messagerie-saisie" className="sr-only">
                  Écrire dans {peerName(thread)}
                </label>
                <input
                  id="messagerie-saisie"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={5000}
                  placeholder={announcing ? "Votre annonce à tous les membres…" : thread.kind === "GROUP" ? `Écrire dans ${peerName(thread)}…` : `Écrire à ${peerName(thread).split(" ")[0]}…`}
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
                  <span className="sr-only sm:not-sr-only">Envoyer</span>
                </Btn>
              </form>
            ) : (
              <p className="flex items-start gap-2.5 border-t border-line px-4 py-3.5 text-[13px] leading-relaxed text-ink-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                {thread.readOnlyReason
                  ? READ_ONLY_LABEL[thread.readOnlyReason][
                      thread.kind === "GROUP" ? "group" : "direct"
                    ]
                  : null}
              </p>
            )}
          </>
        ) : (
          <p className="m-auto px-6 py-10 text-center text-[13.5px] text-ink-3 sm:py-16">
            Choisissez une conversation.
          </p>
        )}
      </section>
    </div>
  );
}
