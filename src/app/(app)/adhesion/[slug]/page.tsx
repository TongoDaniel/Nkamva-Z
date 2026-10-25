import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { Lock, PenLine } from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { EmptyState } from "@/components/nk/empty-state";
import { PageHead } from "@/components/nk/page-head";
import { getPublicCommunity } from "@/lib/communities";
import { getMembership } from "@/lib/memberships";
import { getAuthContext } from "@/lib/api";
import { payableProvidersForUser } from "@/lib/fx";
import { AdhesionForm } from "./adhesion-form";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");


export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rejoindre la communauté",
  robots: { index: false },
};

export default async function AdhesionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invitation?: string }>;
}) {
  const { slug } = await params;
  const { invitation } = await searchParams;
  const auth = await getAuthContext();
  // Le jeton suit la redirection de connexion : sans lui, quelqu'un qui arrive
  // par une invitation payante et doit d'abord se connecter reviendrait dans un
  // tunnel ordinaire, et son adhésion ne serait attribuée à personne.
  if (!auth) {
    const back = invitation
      ? `/adhesion/${slug}?invitation=${encodeURIComponent(invitation)}`
      : `/adhesion/${slug}`;
    redirect(`/auth/deconnexion?callbackUrl=${encodeURIComponent(back)}`);
  }

  const community = await getPublicCommunity(slug, auth.user.id);
  if (!community) notFound();

  // Déjà membre et à jour : rien à payer, on ne fait pas traverser le tunnel.
  // Une adhésion en impayé, elle, a précisément quelque chose à y faire.
  const membership = await getMembership(community.id, auth.user.id);
  if (membership && membership.status !== "PAST_DUE") redirect(routes.community(slug));

  // `initiateMembershipPayment` refuse déjà l'adhésion à sa propre communauté
  // (`CANNOT_JOIN_OWN_COMMUNITY`), et la fiche le dit par `MembershipPanel` —
  // mais le tunnel, lui, déroulait encore son formulaire jusqu'au refus. Même
  // état que le tunnel d'achat d'une ressource dont on est l'auteur.
  if (auth.user.trainerId && auth.user.trainerId === community.trainer.id) {
    return (
      <div className="nk-wrap pb-10 sm:pb-16">
        <PageHead
          crumbs={[
            { label: "Communautés", href: routes.communities },
            { label: community.name, href: routes.community(slug) },
            { label: "Votre communauté" },
          ]}
          title="Vous animez cette communauté"
        />
        <EmptyState
          icon={<PenLine />}
          title="Cette communauté est la vôtre"
          description="Vous l'animez, vous n'y adhérez pas : vous paieriez une commission sur votre propre argent."
          action={
            <BtnLink href="/formateur/communaute" size="lg">
              Gérer ma communauté
            </BtnLink>
          }
        />
      </div>
    );
  }

  // Formateur suspendu (M3) : on n'entre plus, mais un membre en impayé règle
  // toujours son mois. Même règle que `initiateMembershipPayment`, dite avant le
  // formulaire plutôt qu'après le clic sur « Payer ».
  if (!membership && !community.acceptsMembers) {
    return (
      <div className="nk-wrap pb-10 sm:pb-16">
        <PageHead
          crumbs={[
            { label: "Communautés", href: routes.communities },
            { label: community.name, href: routes.community(slug) },
            { label: "Adhésion" },
          ]}
          title="Adhésions fermées"
        />
        <EmptyState
          icon={<Lock />}
          title="Cette communauté n'accueille pas de nouveaux membres"
          description="Les adhésions sont fermées pour le moment. Revenez plus tard, ou découvrez d'autres communautés."
          action={
            <BtnLink href={routes.communities} size="lg">
              Voir les communautés
            </BtnLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[
          { label: "Communautés", href: routes.communities },
          { label: community.name, href: routes.community(slug) },
          { label: membership ? "Règlement" : "Adhésion" },
        ]}
        title={membership ? "Régler votre adhésion" : "Rejoindre la communauté"}
        lead={
          membership
            ? "Le mois en cours est resté impayé. Le régler prolonge votre adhésion sans en décaler l'échéance."
            : "Abonnement mensuel, en FCFA. Résiliable à tout moment : le mois entamé reste servi jusqu'à son terme."
        }
      />
      <AdhesionForm
        providers={await payableProvidersForUser(auth.user.id)}
        slug={slug}
        name={community.name}
        priceFcfa={community.priceFcfa}
        membersCount={community.membersCount}
        includedCount={community.includedCount}
        trainerName={community.trainer.fullName}
        dueAmountFcfa={membership?.dueAmountFcfa ?? null}
        invitation={invitation ?? null}
      />
    </div>
  );
}
