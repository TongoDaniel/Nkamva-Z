import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { joinLiveSession } from "@/lib/lives";
import { LiveRoom } from "./live-room";

export const dynamic = "force-dynamic";

type Params = Promise<{ sessionId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sessionId } = await params;
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: { title: true },
  });
  return { title: session ? session.title : "Session introuvable", robots: { index: false } };
}

export default async function LivePage({ params }: { params: Params }) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { sessionId } = await params;

  // La garde d'accès est celle de l'adhésion (arbitrage 32) : `joinLiveSession`
  // la porte, et enregistre la présence au passage. Qui n'est pas membre est
  // renvoyé à la fiche de la communauté plutôt qu'à une page d'erreur.
  let session;
  try {
    session = await joinLiveSession(sessionId, auth.user.id);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "LIVE_SESSION_NOT_FOUND" || code === "LIVE_CANCELED") notFound();
    if (code === "NOT_MEMBER") redirect("/mes-lives");
    throw err;
  }

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Mes lives", href: "/mes-lives" },
          { label: session.title },
        ]}
        title={<span className="sr-only">{session.title}</span>}
      />
      <LiveRoom room={session} />
    </div>
  );
}
