import type { Metadata } from "next";
import { AlertTriangle, MessageSquareOff, Settings, Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import { CommunityCard } from "@/components/nk/community-card";
import { getAuthContext } from "@/lib/api";
import { listMyMemberships } from "@/lib/memberships";
import { getMyCommunity } from "@/lib/communities";
import { presignDownload } from "@/lib/s3";
import { fmtDate } from "@/lib/format";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes communautés",
  robots: { index: false },
};

export default async function MesCommunautesPage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  // La sienne et celles qu'il suit sont désormais au même endroit : la barre
  // n'a qu'une case « Communauté », et un formateur qui anime un salon n'a pas
  // à le chercher ailleurs que là où il retrouve les autres.
  const [memberships, mienne] = await Promise.all([
    listMyMemberships(auth.user.id),
    auth.user.trainerId ? getMyCommunity(auth.user.trainerId) : null,
  ]);

  // Une URL signée par bannière déposée, toutes en parallèle. Elles expirent en
  // cinq minutes et ne survivent donc pas à ce rendu : c'est la raison pour
  // laquelle la recherche va rechercher les siennes au serveur plutôt que de
  // filtrer une liste déjà peinte (voir `community-search.tsx`).
  const keyed = [
    ...(mienne?.coverS3Key ? [[mienne.id, mienne.coverS3Key] as const] : []),
    ...memberships
      .filter((m) => m.community.coverS3Key)
      .map((m) => [m.community.id, m.community.coverS3Key!] as const),
  ];
  const covers = new Map(
    await Promise.all(keyed.map(async ([id, key]) => [id, await presignDownload(key)] as const)),
  );

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title={mienne ? "Communautés" : "Mes communautés"}
        lead={
          auth.user.trainerId
            ? "La vôtre, puis celles dont vous êtes membre. Une adhésion terminée n'y figure plus, mais les ressources reçues pendant votre passage restent dans votre espace."
            : "Les communautés dont vous êtes membre aujourd'hui. Une adhésion terminée n'y figure plus, mais les ressources reçues pendant votre passage restent dans votre espace."
        }
        // Même place que « Explorer le catalogue » sur `/mes-ressources` :
        // l'annuaire s'ouvre d'ici qu'on soit membre de dix communautés ou
        // d'aucune, pas seulement depuis l'état vide.
        actions={
          <BtnLink href={routes.communities} variant="o">Parcourir les communautés</BtnLink>
        }
      />

      {/*
        Le salon qu'on anime passe devant, et se distingue à l'œil : fond teinté,
        pastille sur la bannière, et un bouton qui mène à sa gestion — pas à sa
        fiche publique. L'ordre dit la hiérarchie ; sans lui, on chercherait sa
        propre communauté au milieu de celles qu'on suit.

        Il vit dans une grille aux mêmes colonnes que la liste du dessous, pour
        qu'une carte seule ait la largeur des autres plutôt que celle de l'écran.
      */}
      {mienne ? (
        <section aria-label="La communauté que j'anime" className="mt-6">
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            <CommunityCard
              community={{
                id: mienne.id,
                slug: mienne.slug,
                name: mienne.name,
                description: mienne.description,
                priceFcfa: mienne.priceFcfa,
                membersCount: mienne._count.subscriptions,
                includedCount: mienne._count.courseLinks,
                // Pas de nom de formateur sur sa propre carte : ce serait le sien.
                trainerName: null,
                coverUrl: covers.get(mienne.id) ?? null,
              }}
              href={routes.community(mienne.slug)}
              highlight
              eager
              badge={<StPill tone="ok">Ma communauté</StPill>}
              meta={mienne.visibility === "PUBLIC" ? "Ouverte à tous" : "Sur invitation"}
              action={
                <BtnLink href="/formateur/communaute" size="sm">
                  <Settings aria-hidden="true" />
                  Gérer
                </BtnLink>
              }
            />
          </div>
        </section>
      ) : null}

      {memberships.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Users />}
          title={
            mienne
              ? "Vous ne suivez aucune autre communauté"
              : "Vous n'êtes membre d'aucune communauté"
          }
          description="Chaque formateur anime la sienne : forum d'entraide, ressources incluses et sessions live."
        />
      ) : (
        <ul className="mt-6 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m, index) => (
            <li key={m.subscriptionId} className="flex">
              <CommunityCard
                community={{
                  id: m.community.id,
                  slug: m.community.slug,
                  name: m.community.name,
                  priceFcfa: m.community.priceFcfa,
                  membersCount: m.community.membersCount,
                  trainerName: m.community.trainerName,
                  coverUrl: covers.get(m.community.id) ?? null,
                }}
                href={routes.community(m.community.slug)}
                className="flex-1"
                eager={!mienne && index === 0}
                badge={
                  m.status === "PAST_DUE" ? (
                    <StPill tone="warn">
                      <AlertTriangle className="size-3.5" aria-hidden="true" /> Échéance à régler
                    </StPill>
                  ) : m.status === "BANNED" ? (
                    <StPill tone="muted">
                      <MessageSquareOff className="size-3.5" aria-hidden="true" /> Parole retirée
                    </StPill>
                  ) : m.canceledAt ? (
                    <StPill tone="muted">Résiliée</StPill>
                  ) : (
                    <StPill tone="ok">Membre</StPill>
                  )
                }
                meta={
                  <>
                    {m.canceledAt ? "Prend fin le " : "Prochaine échéance le "}
                    {fmtDate(m.periodEnd)}
                  </>
                }
                action={
                  <BtnLink
                    href={
                      m.status === "PAST_DUE"
                        ? `/adhesion/${m.community.slug}`
                        : `/mes-communautes/${m.community.slug}`
                    }
                    variant={m.status === "PAST_DUE" ? "p" : "o"}
                    size="sm"
                  >
                    {m.status === "PAST_DUE" ? "Régler" : "Ouvrir"}
                  </BtnLink>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
