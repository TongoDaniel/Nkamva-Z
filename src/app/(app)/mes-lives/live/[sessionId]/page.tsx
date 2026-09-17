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
    /*
      Arbitrage 147 — sur téléphone, la salle **est** l'écran : pas de gouttière,
      pas de fil d'Ariane, rien qui défile. La coquille lui donne la hauteur de
      la fenêtre (`app-shell.tsx`), cette colonne la distribue. À partir de `lg`,
      on retrouve une page ordinaire, avec sa gouttière et son fil.
    */
    <div className="flex min-h-0 flex-1 flex-col lg:block lg:pb-16">
      <div className="hidden lg:block">
        <div className="nk-wrap">
          <PageHead
            crumbs={[
              { label: "Mes lives", href: "/mes-lives" },
              { label: session.title },
            ]}
            title={<span className="sr-only">{session.title}</span>}
          />
        </div>
      </div>
      {/* Le titre reste annoncé sur téléphone, où le fil d'Ariane ne l'est plus. */}
      <h1 className="sr-only lg:hidden">{session.title}</h1>
      {/* La gouttière de `nk-wrap`, à partir de `lg` seulement : sur téléphone,
          la salle va d'un bord à l'autre. */}
      <div className="flex min-h-0 flex-1 flex-col lg:mx-auto lg:block lg:w-full lg:max-w-[var(--container-wrap)] lg:px-7">
        <LiveRoom room={session} />
      </div>
    </div>
  );
}
