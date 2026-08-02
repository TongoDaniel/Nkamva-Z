import type { Metadata } from "next";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { listMyNotifications } from "@/lib/notification";
import { NotificationList, type NotificationItem } from "./notification-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false },
};

export default async function NotificationsPage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  const rows = await listMyNotifications(auth.user.id);
  const items: NotificationItem[] = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Notifications"
        lead="Les suites données à vos achats, vos contestations et votre compte."
      />
      <NotificationList items={items} />
    </div>
  );
}
