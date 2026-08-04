import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { listMyAgenda, listMyReplays } from "@/lib/lives";
import { AgendaPane } from "./agenda-pane";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes lives & agenda",
  robots: { index: false },
};

export default async function MesLivesPage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  // L'agenda ne montre que les communautés rejointes. Les replays vont plus
  // loin : ils incluent ceux d'une adhésion terminée quand la date du live tombe
  // dans une période passée (arbitrages 34 et 44).
  const [sessions, replays] = await Promise.all([
    listMyAgenda(auth.user.id),
    listMyReplays(auth.user.id),
  ]);

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Mes lives & agenda"
        lead="Vos sessions en direct et les replays de vos communautés."
        actions={
          <Btn asChild variant="o">
            <Link href="/communautes">Explorer les communautés</Link>
          </Btn>
        }
      />
      <AgendaPane sessions={sessions} replays={replays} />
    </div>
  );
}
