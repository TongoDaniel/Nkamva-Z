import type { Metadata } from "next";
import { Library, MessagesSquare, Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { StatTile } from "@/components/nk/stat-tile";
import { getAuthContext } from "@/lib/api";
import { getMyCommunity, listCommunityMembers } from "@/lib/communities";
import { listCommunityInvitations } from "@/lib/invitations";
import { presignDownload } from "@/lib/s3";
import { communityAvatarSrc } from "@/lib/avatars";
import { fmtNumber } from "@/lib/format";
import { CommunityForm, VisibilityToggle, type CommunityFormValues } from "./community-form";
import { CommunityCoverUploader } from "./cover-uploader";
import { AvatarPanel } from "@/components/screens/avatar-panel";
import { CommunityTabs } from "./community-tabs";
import { InvitationsPanel } from "./invitations-panel";
import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ma communauté",
  robots: { index: false },
};

const ONGLETS = ['publique', 'salons', 'invitations', 'membres'] as const;
type Onglet = (typeof ONGLETS)[number];

export default async function MaCommunautePage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  // `?onglet=invitations` — ce que pointent les notifications d'invitation.
  // Une valeur inconnue retombe sur la fiche publique : une URL bricolée ne
  // doit pas produire un écran vide.
  const { onglet } = await searchParams;
  const initialTab: Onglet = (ONGLETS as readonly string[]).includes(onglet ?? '')
    ? (onglet as Onglet)
    : 'publique';

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

  // L'URL signée expire au bout de cinq minutes : elle est produite à chaque
  // rendu, jamais mise en cache.
  const coverUrl = community.coverS3Key ? await presignDownload(community.coverS3Key) : null;

  const initial: CommunityFormValues = {
    name: community.name,
    description: community.description ?? "",
    rules: community.rules ?? "",
    priceFcfa: String(community.priceFcfa),
    forumEnabled: community.forumEnabled,
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
          <BtnLink href={`/mes-communautes/${community.slug}`} variant="o">Ouvrir la communauté</BtnLink>
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

      {/* Les tuiles restent au-dessus des onglets : c'est l'état de santé du
          salon, pas le contenu d'une rubrique. */}
      <CommunityTabs
        initialTab={initialTab}
        membersCount={members.length}
        publique={
          <>
            <CommunityCoverUploader
              communityId={community.id}
              currentKey={community.coverS3Key}
              previewUrl={coverUrl}
            />

            {/* Deux images, deux usages : la bannière est une affiche en 16:9
                sur la fiche du salon, la photo est le rond qui porte le groupe
                en tête de la messagerie. L'une ne se rogne pas en l'autre. */}
            <AvatarPanel
              endpoint={`/api/trainer/communities/${community.id}/avatar`}
              kind="group"
              name={community.name}
              src={communityAvatarSrc(community)}
              title="Photo du groupe"
              subtitle="Le rond qui porte votre communauté dans la messagerie de ses membres."
              storageNote="Elle compte dans votre stockage."
            />

            <CommunityForm
              mode="edit"
              communityId={community.id}
              slug={community.slug}
              initial={initial}
              sections={["identity"]}
              heading={{
                title: "Ce que lit un visiteur",
                lead: "Le nom, la présentation, les règles et le prix tels qu'ils apparaissent sur la fiche publique et dans l'annuaire.",
              }}
            />

            {/* Après le formulaire, et non avant : on décide de fermer un salon
                une fois qu'on a vu ce qu'il montre. */}
            <VisibilityToggle communityId={community.id} visibility={community.visibility} />
          </>
        }
        salons={
          <CommunityForm
            mode="edit"
            communityId={community.id}
            initial={initial}
            sections={["salons"]}
            heading={{
              title: "Comment le salon fonctionne",
              lead: "Ce que vos membres peuvent y faire une fois entrés. Chaque salon s'ouvre et se ferme sans rien effacer.",
            }}
          />
        }
        invitationsCount={invitations.filter((row) => row.status === "PENDING").length}
        invitations={
          <InvitationsPanel
            communityId={community.id}
            isPrivate={community.visibility === "PRIVATE"}
            initial={invitations.map((row) => ({
              ...row,
              expiresAt: row.expiresAt.toISOString(),
            }))}
          />
        }
        membres={
          <MembersPanel
            communityId={community.id}
            messagingEnabled={community.messagingEnabled}
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
        }
      />
    </div>
  );
}
