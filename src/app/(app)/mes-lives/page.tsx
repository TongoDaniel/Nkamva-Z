import type { Metadata } from "next";
import { PlayCircle, Radio, Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { StatTile } from "@/components/nk/stat-tile";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { listAgenda, listMyReplays, REPLAY_RETENTION_MONTHS } from "@/lib/lives";
import { fmtNumber } from "@/lib/format";
import { AgendaPane } from "./agenda-pane";
// Partagé avec le salon « Sessions » d'une communauté, d'où sa place hors de
// cette route.
import { ScheduleLive } from "@/components/screens/schedule-live";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes lives & agenda",
  robots: { index: false },
};

/**
 * L'agenda unique des directs — celui qu'on anime et celui qu'on suit.
 *
 * Cet écran a remplacé la paire `/mes-lives` + `/formateur/lives`. Les deux
 * partageaient déjà la même liste de replays, tirée du même appel avec le même
 * argument, sans jamais dire de quelle communauté chaque ligne venait : côté
 * formateur, « Replays produits » comptait aussi ceux des communautés où il
 * n'est qu'abonné. La distinction est maintenant portée par la donnée
 * (`mine`), ce qui la rend affichable au lieu d'être devinée par la route.
 *
 * Il vit du côté apprenant parce qu'un apprenant sans profil formateur doit
 * pouvoir l'ouvrir, ce que `/formateur/*` interdit. Les blocs propres à
 * l'animation n'apparaissent donc que si `trainerId` existe.
 */
export default async function MesLivesPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  // `?onglet=replays` — ce que pointent la notification de purge et le renvoi
  // depuis une communauté. Sans adresse, les replays n'étaient atteignables
  // qu'en cliquant un onglet, et rien ne pouvait y mener.
  const { onglet } = await searchParams;
  const auth = await getAuthContext();
  if (!auth) return null;
  const trainerId = auth.user.trainerId ?? null;

  // L'agenda ne montre que les communautés rejointes et celles qu'on anime. Les
  // replays vont plus loin : ils incluent ceux d'une adhésion terminée quand la
  // date du live tombe dans une période passée (arbitrages 34 et 44).
  const [sessions, replays, communities] = await Promise.all([
    listAgenda(auth.user.id, trainerId),
    listMyReplays(auth.user.id),
    // Un live appartient à une communauté (arbitrage 32) : sans communauté
    // ouverte, il n'y a rien à programmer, et le formulaire le dit.
    trainerId
      ? db.community.findMany({
          where: { trainerId, status: "active", eventsEnabled: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const hosted = sessions.filter((s) => s.mine);
  const myReplays = replays.filter((r) => r.mine);
  const registered = hosted.reduce((total, s) => total + s.attendees, 0);

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Mes lives & agenda"
        lead={
          trainerId
            ? "Les séances que vous animez, celles de vos communautés, et tous leurs replays."
            : "Vos sessions en direct et les replays de vos communautés."
        }
        actions={
          trainerId ? (
            <ScheduleLive communities={communities} />
          ) : (
            <BtnLink href={routes.communities} variant="o">Explorer les communautés</BtnLink>
          )
        }
      />

      {/* Les trois tuiles ne comptent que ce que l'utilisateur anime — c'est là
          que se logeait le chiffre faux d'avant la fusion. */}
      {trainerId ? (
        <div className="my-8 grid gap-4 sm:grid-cols-3">
          <StatTile
            icon={<Radio />}
            tone="brand"
            value={hosted.length}
            label={`session${hosted.length > 1 ? "s" : ""} à animer`}
          />
          <StatTile
            icon={<Users />}
            tone="blue"
            value={fmtNumber(registered)}
            label="inscriptions cumulées"
          />
          <StatTile
            icon={<PlayCircle />}
            tone="gold"
            value={myReplays.length}
            label={`replay${myReplays.length > 1 ? "s" : ""} que vous avez produit${myReplays.length > 1 ? "s" : ""}`}
          />
        </div>
      ) : null}

      <AgendaPane
        sessions={sessions}
        replays={replays}
        isTrainer={Boolean(trainerId)}
        exploreHref={routes.communities}
        initialTab={onglet === "replays" ? "replays" : "upcoming"}
      />

      {/* Arbitrages 38, 51 et 55, requalifiés : l'enregistrement n'est pas une
          option, le replay porte la date du live, et le téléchargement est un
          droit uniforme — il n'y a pas de case « téléchargeable » par session.
          Ne pas en ajouter. */}
      {trainerId ? (
        <p className="mt-10 rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
          Chaque live que vous animez est enregistré automatiquement : vous n&apos;avez rien à
          déclencher, et le replay porte la date de la séance, pas celle de sa mise en ligne.
          Tout membre de la communauté peut le télécharger. Chaque enregistrement est conservé{" "}
          {REPLAY_RETENTION_MONTHS} mois, puis supprimé — vous serez prévenu un mois avant, et
          l&apos;espace vous sera rendu.
        </p>
      ) : null}
    </div>
  );
}
