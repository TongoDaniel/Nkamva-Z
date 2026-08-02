import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/nk/page-head";
import { DemoNotice } from "@/components/nk/demo-notice";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { LIVE_SESSIONS, REPLAYS, isLiveNow } from "@/features/demo/live-data";
import { AgendaPane } from "./agenda-pane";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes lives & agenda",
  robots: { index: false },
};

export default async function MesLivesPage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  // L'état « en direct » se calcule au rendu : la donnée de démonstration est
  // relative à maintenant, elle ne doit pas être figée à la construction.
  const sessions = [...LIVE_SESSIONS]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((session) => ({ ...session, live: isLiveNow(session) }));
  const replays = [...REPLAYS].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());

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
      <DemoNotice className="mt-4">
        Écran de démonstration : aucune session live n&apos;est encore modélisée. Les sessions et
        replays affichés sont fictifs.
      </DemoNotice>

      <AgendaPane sessions={sessions} replays={replays} />
    </div>
  );
}
