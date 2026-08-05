import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { getPublicCommunity } from "@/lib/communities";
import { getMembership } from "@/lib/memberships";
import { getAuthContext } from "@/lib/api";
import { AdhesionForm } from "./adhesion-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rejoindre la communauté",
  robots: { index: false },
};

export default async function AdhesionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await getAuthContext();
  if (!auth) redirect(`/auth/connexion?callbackUrl=${encodeURIComponent(`/adhesion/${slug}`)}`);

  const community = await getPublicCommunity(slug, auth.user.id);
  if (!community) notFound();

  // Déjà membre et à jour : rien à payer, on ne fait pas traverser le tunnel.
  // Une adhésion en impayé, elle, a précisément quelque chose à y faire.
  const membership = await getMembership(community.id, auth.user.id);
  if (membership && membership.status !== "PAST_DUE") redirect(`/communautes/${slug}`);

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Communautés", href: "/communautes" },
          { label: community.name, href: `/communautes/${slug}` },
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
        slug={slug}
        name={community.name}
        priceFcfa={community.priceFcfa}
        membersCount={community.membersCount}
        includedCount={community.includedCount}
        trainerName={community.trainer.fullName}
        dueAmountFcfa={membership?.dueAmountFcfa ?? null}
      />
    </div>
  );
}
