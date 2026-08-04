import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { getReplay } from "@/lib/lives";
import { ReplayPlayer } from "./replay-player";

export const dynamic = "force-dynamic";

type Params = Promise<{ replayId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { replayId } = await params;
  const replay = await db.replay.findUnique({ where: { id: replayId }, select: { title: true } });
  return { title: replay ? replay.title : "Replay introuvable", robots: { index: false } };
}

export default async function ReplayPage({ params }: { params: Params }) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { replayId } = await params;

  // L'accès croise la date du live et les périodes d'adhésion (arbitrages 34,
  // 44 et 48). `getReplay` porte la règle ; ici on ne fait qu'en traduire le
  // refus en 404 — dire « vous n'y avez pas droit » révélerait son existence.
  let replay;
  try {
    replay = await getReplay(replayId, auth.user.id);
  } catch {
    notFound();
  }

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Mes lives", href: "/mes-lives" }, { label: replay.title }]}
        title={<span className="sr-only">{replay.title}</span>}
      />
      <ReplayPlayer replay={replay} />
    </div>
  );
}
