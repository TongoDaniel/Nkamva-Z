import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { EmptyState } from "@/components/nk/empty-state";
import { HeadingCount } from "@/components/nk/heading-count";
import { PageHead } from "@/components/nk/page-head";
import { Price, ResourceCard } from "@/components/nk/resource-card";
import { getAuthContext } from "@/lib/api";
import { listMyFavorites } from "@/lib/favorites";
import { fmtNumber } from "@/lib/format";
import { routesOf } from "@/lib/spaces";

const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vos favoris",
  description: "Ressources et communautés que vous avez mises de côté, à retrouver ici.",
  robots: { index: false },
};

/**
 * Une section vide pendant que l'autre ne l'est pas : une phrase, et le chemin
 * pour la remplir.
 *
 * Ce n'est plus un `EmptyState`. Chaque section en portait un — encadré en
 * pointillés, rond de 64 px, titre, paragraphe, bouton —, si bien qu'une page
 * sans aucun favori empilait **deux** encadrés identiques sous deux titres
 * suivis d'un « 0 » : près de mille pixels pour dire deux fois qu'il n'y avait
 * rien. `EmptyState` le dit lui-même : il est juste quand la page **est** vide,
 * et une phrase suffit quand il ne manque qu'une partie.
 */
function SectionVide({
  children,
  href,
  cta,
}: {
  children: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <p className="text-[14px] leading-relaxed text-ink-2">
      {children}{" "}
      <Link href={href} className="nk-tap font-bold text-brand hover:underline">
        {cta}
      </Link>
    </p>
  );
}

export default async function FavorisPage() {
  // Les favoris appartiennent à quelqu'un : sans session il n'y a rien à
  // montrer. Le middleware garde déjà la route ; ce doublon reste au cas où la
  // garde de navigation serait désactivée.
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/deconnexion?callbackUrl=/favoris");

  const { courses, communities } = await listMyFavorites(auth.user.id);

  // Rien du tout : la page **est** vide, et c'est le seul cas où l'encadré a sa
  // place — un seul, qui propose les deux chemins, au lieu de deux sections
  // coiffées d'un zéro.
  const rien = courses.length === 0 && communities.length === 0;

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: routes.home }, { label: "Favoris" }]}
        title="Vos favoris"
        lead="Ressources et communautés que vous avez mises de côté, à retrouver ici."
      />

      {rien ? (
        <EmptyState
          className="mt-6"
          title="Rien de mis de côté pour l'instant"
          description="Touchez le cœur d'une ressource ou d'une communauté pour la retrouver ici."
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <BtnLink href={routes.catalog}>Parcourir le catalogue</BtnLink>
              <BtnLink href={routes.communities} variant="o">
                Explorer les communautés
              </BtnLink>
            </div>
          }
        />
      ) : (
        <>
          <section className="mt-9" aria-labelledby="fav-ressources">
            <h2 id="fav-ressources" className="mb-5 text-[clamp(22px,2.4vw,28px)] font-extrabold">
              Ressources
              <HeadingCount n={courses.length} />
            </h2>
            {courses.length === 0 ? (
              <SectionVide href={routes.catalog} cta="Parcourir le catalogue">
                Aucune ressource en favori.
              </SectionVide>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {courses.map((course) => (
                  // `favorited` est vrai par construction : on est sur la liste
                  // des favoris. Le cœur part donc allumé.
                  <ResourceCard key={course.id} course={course} space="app" favoritable favorited />
                ))}
              </div>
            )}
          </section>

          <section className="mt-10 sm:mt-[52px]" aria-labelledby="fav-communautes">
            <h2 id="fav-communautes" className="mb-5 text-[clamp(22px,2.4vw,28px)] font-extrabold">
              Communautés
              <HeadingCount n={communities.length} />
            </h2>
            {communities.length === 0 ? (
              <SectionVide href={routes.communities} cta="Explorer les communautés">
                Aucune communauté en favori.
              </SectionVide>
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
                          href={routes.community(community.slug)}
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
                        <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                          <Users className="size-3.5" aria-hidden="true" />
                          {fmtNumber(community.membersCount)}
                        </span>
                        <span>
                          <Price amountFcfa={community.priceFcfa} className="text-[15px]" />
                          <small className="ml-1 text-[13px] font-semibold text-ink-3">/ mois</small>
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
