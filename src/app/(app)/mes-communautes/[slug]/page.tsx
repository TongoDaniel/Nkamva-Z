import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CreditCard, Lock } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { ResourceCard } from "@/components/nk/resource-card";
import { getAuthContext } from "@/lib/api";
import { getCommunitySpace } from "@/lib/community-space";
import { getPublicCommunity } from "@/lib/communities";
import { listCommunityLives } from "@/lib/lives";
import { getMembership } from "@/lib/memberships";
import { MembershipPanel } from "@/components/screens/membership-panel";
import { fmtFcfa } from "@/lib/format";
import { CommunityFeed } from "./community-feed";
import { OpenConversation } from "./open-conversation";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const community = await getPublicCommunity(slug);
  return { title: community?.name ?? "Communauté", robots: { index: false } };
}

export default async function EspaceCommunautePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const auth = await getAuthContext();
  if (!auth) {
    redirect(`/auth/deconnexion?callbackUrl=${encodeURIComponent(`/mes-communautes/${slug}`)}`);
  }

  let space;
  try {
    space = await getCommunitySpace(slug, auth.user.id);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    // Qui n'est pas membre n'atterrit pas sur une page d'erreur : la fiche
    // publique lui dit ce qu'est cette communauté et comment y entrer.
    if (code === "NOT_MEMBER") redirect(routes.community(slug));
    if (code === "COMMUNITY_NOT_FOUND") notFound();
    throw err;
  }

  // Les ressources incluses sont déjà servies par la fiche publique : l'espace
  // les reprend telles quelles plutôt que d'en faire une seconde lecture.
  // Le lecteur est indispensable ici : sans lui, une communauté privée rendrait
  // `null` et l'onglet « Incluses » disparaîtrait pour ses propres membres.
  const included = space.resourcesEnabled
    ? await getPublicCommunity(slug, auth.user.id)
    : null;
  const includedCourses = included?.courses ?? [];

  // Les séances de cette communauté-là. `/mes-lives` continue de les réunir
  // toutes : ce salon ne remplace pas l'agenda, il évite d'y renvoyer pour
  // savoir si l'animateur a programmé quelque chose.
  const lives = space.eventsEnabled
    ? await listCommunityLives(space.communityId, space.isTrainer)
    : { sessions: [], replays: [] };

  // L'adhésion du lecteur, gérée sur place. L'animateur n'en a pas : il n'adhère
  // pas à sa propre communauté (voir `initiateMembershipPayment`), et la lecture
  // lui rendrait `null` de toute façon.
  const membership = space.isTrainer
    ? null
    : await getMembership(space.communityId, auth.user.id);

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Mes communautés", href: "/mes-communautes" },
          { label: space.name },
        ]}
        title={space.name}
        lead={
          space.isTrainer
            ? "Vous animez cette communauté : ses ressources incluses et ses séances se règlent ici, ses échanges dans son groupe."
            : `Animée par ${space.trainerName ?? "votre formateur"}.`
        }
      />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <CommunityFeed
          community={{ id: space.communityId, name: space.name }}
          isTrainer={space.isTrainer}
          forumEnabled={space.forumEnabled}
          resourcesEnabled={space.resourcesEnabled}
          eventsEnabled={space.eventsEnabled}
          sessions={lives.sessions}
          replays={lives.replays}
          resourcesCount={includedCourses.length}
          // La grille part d'ici : `ResourceCard` reste un composant serveur, et
          // les objets qu'il lit ne franchiraient pas la frontière client.
          resources={
            <div className="grid gap-[18px] sm:grid-cols-2">
              {includedCourses.map((course) => (
                <ResourceCard key={course.id} course={course} space="app" />
              ))}
            </div>
          }
        />

        <aside className="grid gap-5 lg:sticky lg:top-[86px]">
          {/* Le pavé « Sessions live » vivait ici, avec une phrase en dur qui
              annonçait des directs « pas encore ouverts ». Le transport temps
              réel est livré depuis : les séances sont un salon du fil, à côté des
              annonces, et non une note dans la marge. */}

          {/* Résilier, se raviser, régler une échéance : sur place. Le bouton
              « Gérer mon adhésion » qui vivait plus bas renvoyait sur la fiche
              publique — on quittait son espace pour aboutir sur la page qui vend
              l'adhésion, afin de la résilier. Le formateur n'a pas ce pavé : il
              n'adhère pas à sa propre communauté. */}
          {membership ? (
            <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
                <CreditCard className="size-4 text-brand" aria-hidden="true" />
                Mon adhésion
              </h2>
              <p className="mt-1 text-[13px] text-ink-3">
                {fmtFcfa(space.priceFcfa)} / mois · résiliable à tout moment
              </p>
              <MembershipPanel
                slug={slug}
                priceFcfa={space.priceFcfa}
                isOwner={false}
                inCommunity
                membership={{
                  status: membership.status,
                  periodEnd: membership.periodEnd.toISOString(),
                  canceledAt: membership.canceledAt?.toISOString() ?? null,
                  dueAmountFcfa: membership.dueAmountFcfa,
                  gracePeriodEndsAt: membership.gracePeriodEndsAt?.toISOString() ?? null,
                }}
              />
            </section>
          ) : null}

          <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
            <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
              <Lock className="size-4 text-ink-3" aria-hidden="true" />
              Espace réservé
            </h2>
            {/* L'animateur n'adhère pas à sa propre communauté (voir
                `initiateMembershipPayment`) : lui proposer de gérer une adhésion
                qu'il n'a pas, ou de quitter un salon qui lui appartient, n'a
                aucun sens. Sa sortie, c'est la gestion du salon. */}
            {space.isTrainer ? (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                  Ce qui se dit ici n&apos;est visible que de vos membres. Vous animez
                  cette communauté : elle vous appartient, vous n&apos;y adhérez pas.
                </p>
                <div className="mt-4 grid gap-2">
                  <BtnLink href="/formateur/communaute" variant="o" size="sm" block>
                    Gérer ma communauté
                  </BtnLink>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                  Ce qui se dit ici n&apos;est visible que des membres. Quitter la
                  communauté ferme l&apos;accès au fil, mais vous gardez les ressources
                  reçues pendant votre adhésion.
                </p>
                <div className="mt-4 grid gap-2">
                  {/* Le formateur n'ouvre pas de fil avec lui-même : côté animateur,
                      une conversation naît toujours de celle d'un membre. */}
                  {space.messagingEnabled ? <OpenConversation slug={slug} /> : null}
                  {/* La fiche publique reste atteignable — elle porte la
                      présentation, les règles et le formateur — mais elle n'est
                      plus le passage obligé pour résilier. */}
                  <BtnLink href={routes.community(slug)} variant="t" size="sm" block>
                    Voir la fiche publique
                  </BtnLink>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
