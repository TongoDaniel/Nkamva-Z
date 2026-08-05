import type { Metadata } from "next";
import Link from "next/link";
import { Library, MessagesSquare, Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { StatTile } from "@/components/nk/stat-tile";
import { getAuthContext } from "@/lib/api";
import { getMyCommunity, listCommunityMembers } from "@/lib/communities";
import { listCommunityInvitations } from "@/lib/invitations";
import { fmtNumber } from "@/lib/format";
import { CommunityForm, VisibilityToggle, type CommunityFormValues } from "./community-form";
import { InvitationsPanel } from "./invitations-panel";
import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ma communauté",
  robots: { index: false },
};

export default async function MaCommunautePage() {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const community = await getMyCommunity(auth.user.trainerId);
  // Les invitations sont chargées côté serveur : le panneau s'affiche rempli,
  // sans attendre une seconde requête après hydratation.
  const [invitations, members] = community
    ? await Promise.all([
        listCommunityInvitations(community.id, auth.user.id, 1, 50).then((r) => r.items),
        listCommunityMembers(community.id, auth.user.trainerId),
      ])
    : [[], []];

  // Aucun salon : l'écran est le formulaire d'ouverture, pas un état vide avec
  // un bouton qui mènerait ailleurs. Ouvrir une communauté est un formulaire
  // court, il n'a pas besoin de sa propre page.
  if (!community) {
    return (
      <div className="nk-wrap pb-16">
        <PageHead
          crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Ma communauté" }]}
          title="Ouvrir votre communauté"
          lead="Un salon d'abonnés, au-delà de la vente à l'unité : un fil de discussion, des annonces, des ressources incluses et des sessions en direct. Vous fixez le prix mensuel."
        />
        <CommunityForm mode="create" />
      </div>
    );
  }

  const initial: CommunityFormValues = {
    name: community.name,
    description: community.description ?? "",
    rules: community.rules ?? "",
    priceFcfa: String(community.priceFcfa),
    forumEnabled: community.forumEnabled,
    broadcastEnabled: community.broadcastEnabled,
    messagingEnabled: community.messagingEnabled,
    resourcesEnabled: community.resourcesEnabled,
    eventsEnabled: community.eventsEnabled,
  };

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Ma communauté" }]}
        title={community.name}
        lead="Sa visibilité, ses invitations, ses membres et ses réglages."
        actions={
          <Btn asChild variant="o">
            <Link href={`/mes-communautes/${community.slug}`}>Ouvrir le salon</Link>
          </Btn>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={<Users />}
          value={fmtNumber(community._count.subscriptions)}
          label={`membre${community._count.subscriptions > 1 ? "s" : ""} actif${community._count.subscriptions > 1 ? "s" : ""}`}
        />
        <StatTile
          icon={<Library />}
          value={community._count.courseLinks}
          label={`ressource${community._count.courseLinks > 1 ? "s" : ""} incluse${community._count.courseLinks > 1 ? "s" : ""}`}
          tone="blue"
        />
        <StatTile
          icon={<MessagesSquare />}
          value={community.messagesPerDay}
          label="messages / jour"
          tone="gold"
        />
      </div>

      <VisibilityToggle communityId={community.id} visibility={community.visibility} />

      <InvitationsPanel
        communityId={community.id}
        isPrivate={community.visibility === "PRIVATE"}
        initial={invitations.map((row) => ({
          ...row,
          expiresAt: row.expiresAt.toISOString(),
        }))}
      />

      <MembersPanel
        communityId={community.id}
        initial={members.map((row) => ({
          learnerId: row.learnerId,
          fullName: row.fullName,
          status: row.status,
          periodEnd: row.periodEnd.toISOString(),
          bannedReason: row.bannedReason,
          canceledAt: row.canceledAt?.toISOString() ?? null,
          viaInvitation: row.viaInvitation,
        }))}
      />

      <CommunityForm
        mode="edit"
        communityId={community.id}
        slug={community.slug}
        initial={initial}
      />
    </div>
  );
}
