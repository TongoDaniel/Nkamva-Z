import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { getLiveSessionCard, WAITING_ROOM_OPENS_MINUTES } from "@/lib/lives";
import { SessionCard } from "./session-card";

export const dynamic = "force-dynamic";

type Params = Promise<{ sessionId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sessionId } = await params;
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: { title: true },
  });
  return { title: session ? session.title : "Séance introuvable", robots: { index: false } };
}

/**
 * La fiche d'une séance — ce qu'on lit avant d'y entrer.
 *
 * Revue du 16 novembre 2026. La salle (`/mes-lives/live/…`) y renvoie tant que
 * la salle d'attente n'est pas ouverte : lire le programme d'une séance ne doit
 * pas y inscrire une présence. La fiche reste lisible ensuite, et propose
 * d'entrer dès que la salle s'ouvre.
 */
export default async function SeancePage({ params }: { params: Params }) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { sessionId } = await params;

  let card;
  try {
    card = await getLiveSessionCard(sessionId, auth.user.id);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "LIVE_SESSION_NOT_FOUND" || code === "LIVE_CANCELED") notFound();
    if (code === "NOT_MEMBER") redirect("/mes-lives");
    throw err;
  }

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Mes lives", href: "/mes-lives" }, { label: card.title }]}
        title={card.title}
        lead={`${card.community.name} · animé par ${card.host.name}`}
      />
      <SessionCard card={card} opensMinutes={WAITING_ROOM_OPENS_MINUTES} />
    </div>
  );
}
