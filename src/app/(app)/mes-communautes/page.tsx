import type { Metadata } from "next";
import { PageHead } from "@/components/nk/page-head";
import { CommunityBrowser } from "@/components/nk/community-browser";
import { getAuthContext } from "@/lib/api";
import { listMyMemberships } from "@/lib/memberships";
import { getMyCommunity, hiddenCommunityIdsFor, listPublicCommunities } from "@/lib/communities";
import { presignDownload } from "@/lib/s3";
import { fmtDate } from "@/lib/format";
import { COMMUNITIES_PAGE_SIZE } from "@/lib/search-limits";
import { routesOf } from "@/lib/spaces";
import { MyCommunities, type MyCommunityItem } from "./my-communities";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes communautés",
  robots: { index: false },
};

export default async function MesCommunautesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;

  // Le terme est lu ici, et non au montage du composant : la première page de
  // la découverte est rendue par le serveur, et un lien de recherche partagé
  // doit arriver sur ses résultats plutôt que sur la liste entière.
  const { q } = await searchParams;
  const terme = (q ?? "").trim();

  // La sienne et celles qu'il suit sont au même endroit : la barre n'a qu'une
  // case « Communauté », et un formateur qui anime un salon n'a pas à le
  // chercher ailleurs que là où il retrouve les autres.
  const [memberships, mienne, exclus] = await Promise.all([
    listMyMemberships(auth.user.id),
    auth.user.trainerId ? getMyCommunity(auth.user.trainerId) : null,
    hiddenCommunityIdsFor(auth.user.id, auth.user.trainerId),
  ]);

  const decouverte = await listPublicCommunities({
    search: terme || undefined,
    excludeIds: exclus,
    pageSize: COMMUNITIES_PAGE_SIZE,
  });

  // Une URL signée par bannière déposée, toutes en parallèle — celles de ses
  // communautés comme celles de la première page de la découverte. Elles
  // expirent en cinq minutes et ne survivent donc pas à ce rendu : c'est la
  // raison pour laquelle la découverte redemande ses pages au serveur au lieu
  // de filtrer une liste déjà peinte (voir `CommunityBrowser`).
  const keyed = [
    ...(mienne?.coverS3Key ? [[mienne.id, mienne.coverS3Key] as const] : []),
    ...memberships
      .filter((m) => m.community.coverS3Key)
      .map((m) => [m.community.id, m.community.coverS3Key!] as const),
    ...decouverte.items.filter((c) => c.coverS3Key).map((c) => [c.id, c.coverS3Key!] as const),
  ];
  const covers = new Map(
    await Promise.all(keyed.map(async ([id, key]) => [id, await presignDownload(key)] as const)),
  );

  // Sa communauté ouvre la grille, les adhésions suivent. L'ordre dit la
  // hiérarchie ; sans lui, on chercherait sa propre communauté au milieu de
  // celles qu'on suit.
  const miennes: MyCommunityItem[] = [
    ...(mienne
      ? [
          {
            card: {
              id: mienne.id,
              slug: mienne.slug,
              name: mienne.name,
              description: mienne.description,
              priceFcfa: mienne.priceFcfa,
              // La colonne, comme partout ailleurs : elle est recomptée à
              // chaque changement d'adhésion, et deux nombres sous la même
              // idée sur un seul écran étaient exactement le défaut d'avant.
              membersCount: mienne.membersCount,
              includedCount: mienne._count.courseLinks,
              // Pas de nom de formateur sur sa propre carte : ce serait le sien.
              trainerName: null,
              coverUrl: covers.get(mienne.id) ?? null,
            },
            href: routes.community(mienne.slug),
            own: true,
            visibilityLabel: mienne.visibility === "PUBLIC" ? "Ouverte à tous" : "Sur invitation",
          } satisfies MyCommunityItem,
        ]
      : []),
    ...memberships.map(
      (m): MyCommunityItem => ({
        card: {
          id: m.community.id,
          slug: m.community.slug,
          name: m.community.name,
          priceFcfa: m.community.priceFcfa,
          membersCount: m.community.membersCount,
          trainerName: m.community.trainerName,
          coverUrl: covers.get(m.community.id) ?? null,
        },
        href: routes.community(m.community.slug),
        own: false,
        membership: {
          status: m.status,
          canceled: Boolean(m.canceledAt),
          dueLabel: `${m.canceledAt ? "Prend fin le " : "Prochaine échéance le "}${fmtDate(m.periodEnd)}`,
          actionHref:
            m.status === "PAST_DUE"
              ? `/adhesion/${m.community.slug}`
              : `/mes-communautes/${m.community.slug}`,
          actionLabel: m.status === "PAST_DUE" ? "Régler" : "Ouvrir",
          urgent: m.status === "PAST_DUE",
        },
      }),
    ),
  ];

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title={mienne ? "Communautés" : "Mes communautés"}
        lead={
          auth.user.trainerId
            ? "La vôtre, puis celles dont vous êtes membre. Une adhésion terminée n'y figure plus, mais les ressources reçues pendant votre passage restent dans votre espace."
            : "Les communautés dont vous êtes membre aujourd'hui. Une adhésion terminée n'y figure plus, mais les ressources reçues pendant votre passage restent dans votre espace."
        }
      />

      {/* Plus d'état vide entre les deux blocs : il annonçait « vous ne suivez
          aucune autre communauté » à quelqu'un qui venait d'en voir une, et
          coupait en deux une grille qui n'a pas de raison de l'être. Quand la
          personne n'a aucune communauté, cette section ne rend rien du tout et
          c'est la découverte qui porte la page. */}
      <MyCommunities items={miennes} />

      {/*
        Découvrir les autres, sans quitter la page. La liste se parcourt par
        pages dès l'arrivée — la recherche n'y sert qu'à affiner.

        Elle ne rend jamais une communauté qu'on anime ou dont on est déjà
        membre : elles sont juste au-dessus, et la même carte deux fois sur un
        écran n'informe personne. L'exclusion est demandée par cet écran et
        dérivée du serveur, jamais reçue du navigateur.
      */}
      <section aria-labelledby="nk-decouvrir" className="mt-12 border-t border-line-2 pt-8">
        <h2 id="nk-decouvrir" className="text-[18px] font-extrabold">
          Découvrir d&apos;autres communautés
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">
          Cherchez par nom, par thème, ou par un mot de la description.
        </p>
        <CommunityBrowser
          space="app"
          excludeMine
          initialTerm={terme}
          initial={{
            items: decouverte.items.map((c) => ({
              id: c.id,
              slug: c.slug,
              name: c.name,
              description: c.description,
              priceFcfa: c.priceFcfa,
              membersCount: c.membersCount,
              includedCount: c.includedCount,
              trainerName: c.trainer.fullName ?? "Formateur NkamVa",
              coverUrl: covers.get(c.id) ?? null,
            })),
            total: decouverte.total,
            page: decouverte.page,
            pageSize: decouverte.pageSize,
          }}
          empty={
            <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
              {miennes.length > 0
                ? "Vous suivez déjà toutes les communautés ouvertes."
                : "Aucune communauté n'est ouverte pour l'instant. Revenez bientôt."}
            </p>
          }
        />
      </section>
    </div>
  );
}
