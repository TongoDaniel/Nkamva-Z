import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, Users } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { EmptyState } from "@/components/nk/empty-state";
import { PageHead } from "@/components/nk/page-head";
import { Price, ResourceCard } from "@/components/nk/resource-card";
import { getAuthContext } from "@/lib/api";
import { listMyFavorites } from "@/lib/favorites";
import { fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vos favoris",
  description: "Ressources et communautés que vous avez mises de côté, à retrouver ici.",
  robots: { index: false },
};

function Count({ n }: { n: number }) {
  return (
    <Chip tone="muted" className="ml-2 align-middle font-display">
      {n}
    </Chip>
  );
}

export default async function FavorisPage() {
  // Les favoris appartiennent à quelqu'un : sans session il n'y a rien à
  // montrer. Le lien étant visible dans la barre publique, la redirection porte
  // le retour pour ne pas perdre l'intention.
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/connexion?callbackUrl=/favoris");

  const { courses, communities } = await listMyFavorites(auth.user.id);

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Favoris" }]}
        title="Vos favoris"
        lead="Ressources et communautés que vous avez mises de côté, à retrouver ici."
      />

      <section className="mt-9" aria-labelledby="fav-ressources">
        <h2 id="fav-ressources" className="mb-5 text-[clamp(22px,2.4vw,28px)] font-extrabold">
          Ressources
          <Count n={courses.length} />
        </h2>
        {courses.length === 0 ? (
          <EmptyState
            icon={<Heart />}
            title="Aucune ressource en favori"
            description="Touchez le cœur sur une ressource du catalogue pour la retrouver ici."
            action={
              <Btn asChild variant="o">
                <Link href="/ressources">Parcourir le catalogue</Link>
              </Btn>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              // `favorited` est vrai par construction : on est sur la liste des
              // favoris. Le cœur part donc allumé.
              <ResourceCard key={course.id} course={course} favoritable favorited />
            ))}
          </div>
        )}
      </section>

      <section className="mt-[52px]" aria-labelledby="fav-communautes">
        <h2 id="fav-communautes" className="mb-5 text-[clamp(22px,2.4vw,28px)] font-extrabold">
          Communautés
          <Count n={communities.length} />
        </h2>
        {communities.length === 0 ? (
          <EmptyState
            icon={<Heart />}
            title="Aucune communauté en favori"
            description="Mettez de côté les communautés qui vous intéressent pour les comparer plus tard."
            action={
              <Btn asChild variant="o">
                <Link href="/communautes">Explorer les communautés</Link>
              </Btn>
            }
          />
        ) : (
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {communities.map((community) => (
              <article
                key={community.id}
                className="flex flex-col overflow-hidden rounded-nk border border-line bg-card shadow-nk-sm"
              >
                <div className="h-[88px] bg-gradient-to-br from-navy to-info" />
                <div className="flex flex-1 flex-col gap-2 px-5 py-4">
                  <h3 className="text-[16px] font-extrabold leading-tight">
                    <Link
                      href={`/communautes/${community.slug}`}
                      className="text-ink hover:text-brand"
                    >
                      {community.name}
                    </Link>
                  </h3>
                  {community.trainerName ? (
                    <p className="text-[13px] font-semibold text-ink-2">
                      Animée par {community.trainerName}
                    </p>
                  ) : null}
                  {community.description ? (
                    <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">
                      {community.description}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between border-t border-line-2 pt-3.5">
                    <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      <Users className="size-3.5" aria-hidden="true" />
                      {fmtNumber(community.membersCount)}
                    </span>
                    <span>
                      <Price amountFcfa={community.priceFcfa} className="text-[15px]" />
                      <small className="ml-1 text-xs font-semibold text-ink-3">/ mois</small>
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
