import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, MessageSquareOff, Settings, Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import { Avatar } from "@/components/nk/avatar";
import { getAuthContext } from "@/lib/api";
import { listMyMemberships } from "@/lib/memberships";
import { getMyCommunity } from "@/lib/communities";
import { communityAvatarSrc } from "@/lib/avatars";
import { fmtDate, fmtFcfa, fmtNumber } from "@/lib/format";
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
        photo carrée, et un bouton qui mène à sa gestion — pas à sa fiche
        publique. L'ordre dit la hiérarchie ; sans lui, on chercherait sa propre
        communauté au milieu de celles qu'on suit.
      */}
      {mienne ? (
        <section
          aria-label="La communauté que j'anime"
          className="mt-6 flex flex-wrap items-center gap-5 rounded-nk-lg border-[1.5px] border-brand/30 bg-brand-tint/40 p-5"
        >
          {communityAvatarSrc(mienne) ? (
            <img
              src={communityAvatarSrc(mienne)!}
              alt=""
              className="size-[42px] shrink-0 rounded-nk-sm object-cover"
            />
          ) : (
            <span
              className="grid size-[42px] shrink-0 place-items-center rounded-nk-sm bg-brand-tint text-brand"
              aria-hidden="true"
            >
              <Users className="size-5" />
            </span>
          )}

          <div className="min-w-[240px] flex-1">
            <p className="text-[13px] font-bold uppercase tracking-wide text-brand-dark">
              Ma communauté
            </p>
            <h2 className="mt-0.5 text-[16.5px] font-bold leading-tight">
              <Link href={routes.community(mienne.slug)} className="hover:text-brand">
                {mienne.name}
              </Link>
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">
              {fmtNumber(mienne._count.subscriptions)} membre
              {mienne._count.subscriptions > 1 ? "s" : ""} ·{" "}
              {mienne.visibility === "PUBLIC" ? "Ouverte à tous" : "Sur invitation"} ·{" "}
              {fmtFcfa(mienne.priceFcfa)} / mois
            </p>
          </div>

          <BtnLink href="/formateur/communaute" size="sm">
            <Settings aria-hidden="true" />
            Gérer
          </BtnLink>
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
        <ul className="mt-6 grid gap-4">
          {memberships.map((m) => (
            <li
              key={m.subscriptionId}
              className="flex flex-wrap items-center gap-5 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm"
            >
              <Avatar name={m.community.trainerName ?? m.community.name} size="md" />

              <div className="min-w-[240px] flex-1">
                <h2 className="text-[16.5px] font-bold leading-tight">
                  <Link href={routes.community(m.community.slug)} className="hover:text-brand">
                    {m.community.name}
                  </Link>
                </h2>
                <p className="mt-1 text-[13px] text-ink-2">
                  {m.community.trainerName ? `Animée par ${m.community.trainerName} · ` : ""}
                  {fmtNumber(m.community.membersCount)} membres ·{" "}
                  {fmtFcfa(m.community.priceFcfa)} / mois
                </p>
              </div>

              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                {m.status === "PAST_DUE" ? (
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
                )}
                <span className="text-[13px] text-ink-3">
                  {m.canceledAt ? "Prend fin le " : "Prochaine échéance le "}
                  {fmtDate(m.periodEnd)}
                </span>
              </div>

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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
