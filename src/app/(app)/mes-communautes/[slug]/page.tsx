import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Library, Lock, Radio } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { ResourceCard } from "@/components/nk/resource-card";
import { getAuthContext } from "@/lib/api";
import { getCommunitySpace } from "@/lib/community-space";
import { getPublicCommunity } from "@/lib/communities";
import { CommunityFeed } from "./community-feed";

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
    redirect(`/auth/connexion?callbackUrl=${encodeURIComponent(`/mes-communautes/${slug}`)}`);
  }

  let space;
  try {
    space = await getCommunitySpace(slug, auth.user.id);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    // Qui n'est pas membre n'atterrit pas sur une page d'erreur : la fiche
    // publique lui dit ce qu'est cette communauté et comment y entrer.
    if (code === "NOT_MEMBER") redirect(`/communautes/${slug}`);
    if (code === "COMMUNITY_NOT_FOUND") notFound();
    throw err;
  }

  // Les ressources incluses sont déjà servies par la fiche publique : l'espace
  // les reprend telles quelles plutôt que d'en faire une seconde lecture.
  const included = space.resourcesEnabled ? await getPublicCommunity(slug) : null;

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
            ? "Vous animez cette communauté : vos annonces s'adressent à tous ses membres."
            : `Animée par ${space.trainerName ?? "votre formateur"}.`
        }
      />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_320px]">
        <CommunityFeed
          slug={slug}
          canSpeak={space.canSpeak}
          mutedReason={space.mutedReason}
          isTrainer={space.isTrainer}
          forumEnabled={space.forumEnabled}
          broadcastEnabled={space.broadcastEnabled}
          announcements={space.announcements}
          discussions={space.discussions}
        />

        <aside className="grid gap-5 lg:sticky lg:top-[86px]">
          {included && included.courses.length > 0 ? (
            <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
                <Library className="size-4 text-brand" aria-hidden="true" />
                Ressources incluses
              </h2>
              <div className="mt-4 grid gap-4">
                {included.courses.slice(0, 3).map((course) => (
                  <ResourceCard key={course.id} course={course} />
                ))}
              </div>
              {included.courses.length > 3 ? (
                <Btn asChild variant="o" size="sm" block className="mt-4">
                  <Link href="/mes-ressources">
                    Voir les {included.courses.length} ressources
                  </Link>
                </Btn>
              ) : null}
            </section>
          ) : null}

          {space.eventsEnabled ? (
            <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
                <Radio className="size-4 text-brand" aria-hidden="true" />
                Sessions live
              </h2>
              {/* Les lives attendent le choix d'un transport temps réel : mieux
                  vaut le dire que d'afficher un agenda qui ne se remplira pas. */}
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                Les sessions en direct de cette communauté ne sont pas encore ouvertes.
              </p>
            </section>
          ) : null}

          <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
            <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
              <Lock className="size-4 text-ink-3" aria-hidden="true" />
              Espace réservé
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              Ce qui se dit ici n&apos;est visible que des membres. Quitter la communauté
              ferme l&apos;accès au fil, mais vous gardez les ressources reçues pendant
              votre adhésion.
            </p>
            <Btn asChild variant="o" size="sm" block className="mt-4">
              <Link href={`/communautes/${slug}`}>Gérer mon adhésion</Link>
            </Btn>
          </section>
        </aside>
      </div>
    </div>
  );
}
