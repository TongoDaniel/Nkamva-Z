import type { Metadata } from "next";
import { PageHead } from "@/components/nk/page-head";
import { DemoNotice } from "@/components/nk/demo-notice";
import { getAuthContext } from "@/lib/api";
import { CONVERSATIONS } from "@/features/demo/message-data";
import { ConversationPane } from "./conversation-pane";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Messagerie",
  robots: { index: false },
};

export default async function MessageriePage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Messages"
        lead="Vos échanges avec les formateurs des communautés que vous avez rejointes."
      />
      <DemoNotice className="mt-4">
        Écran de démonstration : aucune conversation n&apos;est encore modélisée. Les messages que
        vous écrivez restent affichés localement et ne partent pas.
      </DemoNotice>

      <ConversationPane conversations={CONVERSATIONS} />
    </div>
  );
}
