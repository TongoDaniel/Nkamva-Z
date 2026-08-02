import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { DemoNotice } from "@/components/nk/demo-notice";
import { getAuthContext } from "@/lib/api";
import { replayById } from "@/features/demo/live-data";
import { ReplayPlayer } from "./replay-player";

export const dynamic = "force-dynamic";

type Params = Promise<{ replayId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { replayId } = await params;
  const replay = replayById(replayId);
  return { title: replay ? replay.title : "Replay introuvable", robots: { index: false } };
}

export default async function ReplayPage({ params }: { params: Params }) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { replayId } = await params;
  const replay = replayById(replayId);
  if (!replay) notFound();

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Mes lives", href: "/mes-lives" }, { label: replay.title }]}
        title={<span className="sr-only">{replay.title}</span>}
      />
      <DemoNotice className="mb-5">
        Écran de démonstration : aucun replay n&apos;est stocké. Le lecteur simule la progression.
      </DemoNotice>

      <ReplayPlayer replay={replay} />
    </div>
  );
}
