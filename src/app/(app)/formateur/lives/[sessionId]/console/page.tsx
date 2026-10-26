import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { joinLiveSession } from "@/lib/lives";
import { LiveConsole } from "./live-console";

export const dynamic = "force-dynamic";

type Params = Promise<{ sessionId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sessionId } = await params;
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: { title: true },
  });
  return {
    title: session ? `Animer · ${session.title}` : "Session introuvable",
    robots: { index: false },
  };
}

export default async function ConsolePage({ params }: { params: Params }) {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const { sessionId } = await params;

  // La garde qui manquait au Lot 0 : animer une session suppose d'en être
  // l'hôte. Elle ne pouvait pas s'écrire tant que `LiveSession` n'existait pas —
  // la session de démonstration n'appartenait à personne.
  let room;
  try {
    room = await joinLiveSession(sessionId, auth.user.id);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "LIVE_SESSION_NOT_FOUND" || code === "LIVE_CANCELED") notFound();
    if (code === "NOT_MEMBER") redirect("/mes-lives");
    throw err;
  }
  if (!room.isHost) redirect(`/mes-lives/live/${sessionId}`);

  return (
    /*
      Arbitrage 147 — comme la salle de l'apprenant : plein écran sur téléphone,
      sans gouttière ni fil d'Ariane ; page ordinaire à partir de `lg`.
    */
    <div className="flex min-h-0 flex-1 flex-col lg:block lg:pb-16">
      <div className="hidden lg:block">
        <div className="nk-wrap">
          <PageHead
            crumbs={[
              { label: "Espace formateur", href: "/formateur" },
              { label: "Mes lives & agenda", href: "/mes-lives" },
              { label: room.title },
            ]}
            title={<span className="sr-only">Animer : {room.title}</span>}
          />
        </div>
      </div>
      <h1 className="sr-only lg:hidden">Animer : {room.title}</h1>
      {/* La gouttière de `nk-wrap`, à partir de `lg` seulement. */}
      <div className="flex min-h-0 flex-1 flex-col lg:mx-auto lg:block lg:w-full lg:max-w-[var(--container-wrap)] lg:px-7">
        <LiveConsole room={room} />
      </div>
    </div>
  );
}
