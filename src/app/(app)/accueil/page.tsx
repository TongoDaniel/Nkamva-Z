import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { listMyResources } from "@/lib/access";
import { visualOfMembership } from "@/lib/community-visual";
import { listAgenda } from "@/lib/lives";
import { listMyMemberships } from "@/lib/memberships";
import { trendingCourses, trendingSessions, trendingTrainers } from "@/lib/trending";
import { db } from "@/lib/db";
import type { ResourceItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";
import {
  buildCommunityTiles,
  buildEventItems,
  CommunitiesRow,
  JoinCommunityPrompt,
  LiveNowBanner,
  OwnedResourcesRow,
  TrendingCoursesRow,
  TrendingTrainersList,
} from "./blocs";
import { UpcomingEvents } from "./upcoming-events";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accueil",
  robots: { index: false },
};

/**
 * Un seul écart entre sections. Il dépendait de la section précédente — moins
 * après une rangée défilante, qui porte 16 px sous sa piste —, et l'accueil
 * d'un compte sans ressources collait les formateurs à 20 px des événements.
 * Les rangées rendent désormais ces 16 px elles-mêmes (`ROW_SECTION`).
 */
const SECTION = "mt-9 sm:mt-12";

/**
 * L'accueil d'un apprenant — arbitrage 142.
 * ==========================================================================
 * De haut en bas : une séance en cours s'il y en a une, ses communautés, les
 * événements à venir (les siens, et ceux des communautés en tendance), ses
 * ressources, puis ce qui se passe ailleurs — formateurs et ressources.
 *
 * Ce qui a quitté la page : les tuiles « 0 ressource achetée · 0 en cours » —
 * un zéro en gros n'apprend rien, et une carte rouvre ce qu'un chiffre ne fait
 * que compter — et la liste « Reprendre », fondue dans la rangée « Mes
 * ressources », où les commencées passent en tête.
 *
 * Aucune donnée inventée : un compte neuf voit l'invitation à rejoindre une
 * communauté, la tendance et le catalogue, et rien d'autre.
 *
 * Un formateur qui arrive ici est renvoyé vers `/formateur`, son accueil, qui
 * reçoit lui aussi le bloc Événements.
 * ==========================================================================
 */
export default async function AccueilPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;
  const userId = auth.user.id;

  // Son accueil est son espace. La redirection garde le paramètre d'erreur :
  // c'est ici que le middleware renvoie un compte non-admin qui a tenté
  // `/admin`, et le message doit survivre au saut.
  const { erreur } = await searchParams;
  if (auth.user.trainerId) {
    redirect(erreur ? `/formateur?erreur=${encodeURIComponent(erreur)}` : "/formateur");
  }

  // Tout part en une seule vague : ce qui coûte face à une base distante n'est
  // pas le nombre de requêtes, c'est la profondeur de cascade.
  const [mine, profile, agenda, memberships, trendingLives, trainers, courses] = await Promise.all([
    listMyResources(userId, "all", 1, 20),
    db.user.findUnique({
      where: { id: userId },
      select: { fullName: true, preferredName: true },
    }),
    listAgenda(userId, null),
    listMyMemberships(userId),
    trendingSessions({ viewerId: userId }),
    trendingTrainers({ limit: 4 }),
    trendingCourses({ viewerId: userId, limit: 10 }),
  ]);

  // Aucune lecture de plus pour les visuels : un apprenant n'a de séances que
  // dans les communautés dont il est membre, et ses adhésions portent déjà
  // bannière et portraits.
  const visuals = new Map(memberships.map((m) => [m.community.id, visualOfMembership(m)]));
  const [events, tiles] = await Promise.all([
    buildEventItems({ agenda, visuals, trending: trendingLives }),
    buildCommunityTiles(memberships),
  ]);

  // La maquette accueille par le prénom. `preferredName` prime quand il existe ;
  // sinon on prend le premier mot du nom complet, faute de champ dédié.
  const firstName =
    profile?.preferredName?.trim() || profile?.fullName?.trim().split(/\s+/)[0] || null;

  const liveNow = events.mine.find((event) => event.live) ?? null;
  const hasEvents = events.mine.length + events.trending.length > 0;

  const accessDenied =
    erreur === "acces-refuse" ? (
      <p
        role="alert"
        className="mb-6 rounded-nk border border-danger/30 bg-danger-tint px-5 py-4 text-[14px] font-semibold leading-relaxed text-danger sm:mb-8"
      >
        Vous n&apos;avez pas les droits nécessaires pour accéder à cette page.
      </p>
    ) : null;

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        title={firstName ? `Bonjour, ${firstName} !` : "Votre espace"}
        lead="Vos communautés, leurs prochains directs et vos ressources."
      />
      {accessDenied}

      {liveNow ? <LiveNowBanner event={liveNow} className="mt-3 sm:mt-4" /> : null}

      {tiles.length > 0 ? (
        <CommunitiesRow tiles={tiles} className="mt-4 sm:mt-6" />
      ) : (
        <JoinCommunityPrompt className="mt-4 sm:mt-6" />
      )}

      {hasEvents ? (
        <UpcomingEvents
          mine={events.mine}
          trending={events.trending}
          hasCommunities={memberships.length > 0}
          agendaHref="/mes-lives"
          exploreHref={routes.communities}
          className={SECTION}
        />
      ) : null}

      <OwnedResourcesRow items={mine.items as unknown as ResourceItem[]} className={SECTION} />
      <TrendingTrainersList trainers={trainers} className={SECTION} />
      <TrendingCoursesRow courses={courses} className={SECTION} />
    </div>
  );
}
