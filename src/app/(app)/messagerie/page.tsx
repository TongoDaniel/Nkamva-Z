import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { getAuthContext } from "@/lib/api";
import { listMyConversations, getConversation, ensureCommunityGroup } from "@/lib/messaging";
import { db } from "@/lib/db";
import { ConversationPane } from "./conversation-pane";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Messagerie",
  robots: { index: false },
};

export default async function MessageriePage({
  searchParams,
}: {
  searchParams: Promise<{ fil?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { fil } = await searchParams;

  // Le groupe de sa propre communauté est créé au premier passage plutôt que par
  // une migration : une communauté ouverte demain aurait eu besoin du même
  // geste, et une migration ne l'aurait pas couverte.
  if (auth.user.trainerId) {
    const community = await db.community.findFirst({
      where: { trainerId: auth.user.trainerId, status: "active" },
      select: { id: true },
    });
    if (community) await ensureCommunityGroup(community.id);
  }
  // Idem pour les communautés rejointes : le groupe naît à la première visite
  // de l'un de ses membres, quel qu'il soit.
  const joined = await db.communitySubscription.findMany({
    where: { learnerId: auth.user.id, community: { status: "active" } },
    select: { communityId: true },
    distinct: ["communityId"],
  });
  await Promise.all(joined.map((s) => ensureCommunityGroup(s.communityId)));

  const conversations = await listMyConversations(auth.user.id, auth.user.trainerId);

  // Le fil demandé — celui d'une notification — est chargé côté serveur ; les
  // autres se chargent à la sélection. Tout charger d'un coup ferait grossir la
  // page avec le nombre de communautés rejointes.
  const initialId = fil && conversations.some((c) => c.id === fil) ? fil : conversations[0]?.id;
  const initialThread = initialId
    ? await getConversation(initialId, auth.user.id, auth.user.trainerId)
    : null;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Messages"
        lead={
          auth.user.trainerId
            ? "Le groupe de votre communauté, vos échanges privés avec ses membres, et les communautés que vous suivez."
            : "Les groupes de vos communautés et vos échanges privés avec leurs formateurs, au même endroit."
        }
      />

      {conversations.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<MessageSquare />}
          title="Aucune conversation"
          description="Rejoindre une communauté ouvre son groupe et un fil privé avec son formateur. L'achat d'une ressource à l'unité n'en ouvre aucun."
          action={
            <BtnLink href={routes.communities} size="lg">Voir les communautés</BtnLink>
          }
        />
      ) : (
        <ConversationPane conversations={conversations} initialThread={initialThread} />
      )}
    </div>
  );
}
