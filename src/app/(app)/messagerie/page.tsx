import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { getAuthContext } from "@/lib/api";
import { listMyConversations, getConversation } from "@/lib/messaging";
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
            ? "Vos échanges avec les membres de votre communauté et avec les formateurs que vous suivez."
            : "Vos échanges avec les formateurs des communautés que vous avez rejointes."
        }
      />

      {conversations.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<MessageSquare />}
          title="Aucune conversation"
          description="Échanger avec un formateur suppose d'être membre de sa communauté : l'achat d'une ressource à l'unité n'ouvre pas de fil."
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
