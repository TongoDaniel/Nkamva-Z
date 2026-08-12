"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  BadgeCheck,
  MessageSquare,
  Receipt,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Btn } from "@/components/nk/button";
import { EmptyState } from "@/components/nk/empty-state";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * L'icône se déduit du préfixe du `type` : les familles sont stables
 * (`DISPUTE_*`, `PAYOUT_*`, `TRAINER_*`) alors que les types eux-mêmes
 * s'ajoutent au fil des lots. Une nouvelle valeur retombe sur la cloche plutôt
 * que de casser l'affichage.
 */
function iconFor(type: string) {
  if (type.startsWith("DISPUTE_") || type === "CHARGEBACK_RECEIVED") return <ShieldAlert />;
  if (type.startsWith("PAYOUT_")) return <Wallet />;
  if (type.startsWith("TRAINER_") || type === "ID_CARD") return <BadgeCheck />;
  if (type.includes("REFUND") || type.includes("DEBIT")) return <Receipt />;
  if (type.includes("MESSAGE")) return <MessageSquare />;
  return <Bell />;
}

function Row({ item, onRead }: { item: NotificationItem; onRead: (id: string) => void }) {
  const unread = !item.readAt;
  const content = (
    <>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-[18px]",
          unread ? "bg-brand-tint text-brand" : "bg-line-2 text-ink-3",
        )}
        aria-hidden="true"
      >
        {iconFor(item.type)}
      </span>
      <span className="min-w-0 flex-1">
        <b className={cn("block text-[15px] leading-snug", unread ? "text-ink" : "text-ink-2")}>
          {item.title}
        </b>
        <small className="mt-0.5 block text-[13.5px] leading-relaxed text-ink-2">{item.body}</small>
        <small className="mt-1 block text-[12.5px] text-ink-3">{fmtRelative(item.createdAt)}</small>
      </span>
      {unread ? (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
          aria-label="Non lue"
          role="img"
        />
      ) : null}
    </>
  );

  const className = cn(
    "flex w-full items-start gap-3.5 rounded-nk border px-4 py-3.5 text-left transition-colors",
    unread ? "border-brand-tint-2 bg-card" : "border-line bg-card",
  );

  if (item.link) {
    return (
      <Link href={item.link} className={cn(className, "hover:border-ink-3")} onClick={() => onRead(item.id)}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cn(className, unread ? "cursor-pointer hover:border-ink-3" : "cursor-default")}
      onClick={() => unread && onRead(item.id)}
    >
      {content}
    </button>
  );
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const [rows, setRows] = React.useState(items);

  React.useEffect(() => setRows(items), [items]);

  const unreadCount = rows.filter((r) => !r.readAt).length;

  const mark = useAction(
    (id?: string) => api.post("/api/me/notifications/read", id ? { id } : {}),
    {
      success: null,
      error: "Le marquage n'a pas pu être enregistré.",
      // Retour à ce que le serveur a dit en dernier, plutôt qu'à un instantané
      // local : c'est la seule version dont on soit sûr.
      onError: () => setRows(items),
    },
  );

  // Marquage optimiste : la pastille disparaît au clic, sans attendre le
  // serveur. En cas d'échec on remet l'état d'avant plutôt que de laisser
  // croire à une lecture enregistrée.
  const markRead = (id?: string) => {
    const now = new Date().toISOString();
    setRows((current) =>
      current.map((r) => (!r.readAt && (!id || r.id === id) ? { ...r, readAt: now } : r)),
    );
    void mark.run(id);
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        icon={<Bell />}
        title="Aucune notification"
        description="Les suites données à vos achats et à vos contestations s'afficheront ici."
      />
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-2" aria-live="polite">
          {unreadCount > 0
            ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
            : "Tout est lu"}
        </p>
        {unreadCount > 0 ? (
          <Btn variant="o" size="sm" loading={mark.pending} onClick={() => markRead()}>
            Tout marquer comme lu
          </Btn>
        ) : null}
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((item) => (
          <li key={item.id}>
            <Row item={item} onRead={(id) => markRead(id)} />
          </li>
        ))}
      </ul>
    </>
  );
}
