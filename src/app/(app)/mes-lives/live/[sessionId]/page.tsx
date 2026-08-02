import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { DemoNotice } from "@/components/nk/demo-notice";
import { getAuthContext } from "@/lib/api";
import { liveSessionById, isLiveNow } from "@/features/demo/live-data";
import { LiveRoom } from "./live-room";

export const dynamic = "force-dynamic";

type Params = Promise<{ sessionId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sessionId } = await params;
  const session = liveSessionById(sessionId);
  return { title: session ? session.title : "Session introuvable", robots: { index: false } };
}

export default async function LivePage({ params }: { params: Params }) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { sessionId } = await params;
  const session = liveSessionById(sessionId);
  if (!session) notFound();

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Mes lives", href: "/mes-lives" },
          { label: session.title },
        ]}
        title={<span className="sr-only">{session.title}</span>}
      />
      <DemoNotice className="mb-5">
        Écran de démonstration : la diffusion temps réel n&apos;est pas raccordée. Les commandes
        réagissent, mais rien n&apos;est émis ni enregistré.
      </DemoNotice>

      <LiveRoom session={session} live={isLiveNow(session)} />
    </div>
  );
}
