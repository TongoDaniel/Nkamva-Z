import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { DemoNotice } from "@/components/nk/demo-notice";
import { getAuthContext } from "@/lib/api";
import { liveSessionById, isLiveNow } from "@/features/demo/live-data";
import { LiveConsole } from "./live-console";

export const dynamic = "force-dynamic";

type Params = Promise<{ sessionId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sessionId } = await params;
  const session = liveSessionById(sessionId);
  return {
    title: session ? `Animer — ${session.title}` : "Session introuvable",
    robots: { index: false },
  };
}

export default async function ConsolePage({ params }: { params: Params }) {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const { sessionId } = await params;
  const session = liveSessionById(sessionId);
  if (!session) notFound();

  // Il manque ici la garde qui compte : animer une session suppose d'en être
  // l'hôte. Elle ne peut pas s'écrire tant que `LiveSession` n'existe pas — la
  // session de démonstration n'appartient à personne.

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Espace formateur", href: "/formateur" },
          { label: "Mes sessions", href: "/formateur/lives" },
          { label: session.title },
        ]}
        title={<span className="sr-only">Animer : {session.title}</span>}
      />
      <DemoNotice className="mb-5">
        Écran de démonstration : la diffusion temps réel n&apos;est pas raccordée. Couper un micro,
        donner la parole ou écrire dans le salon modifie l&apos;affichage, mais n&apos;atteint aucun
        participant.
      </DemoNotice>

      <LiveConsole session={session} live={isLiveNow(session)} />
    </div>
  );
}
