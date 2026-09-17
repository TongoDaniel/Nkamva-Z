import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Users, GraduationCap } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { HeadingCount } from "@/components/nk/heading-count";
import { EmptyState } from "@/components/nk/empty-state";
import { PageHead } from "@/components/nk/page-head";
import { Price, ResourceCard } from "@/components/nk/resource-card";
import { Avatar } from "@/components/nk/avatar";
import { searchEverything, SEARCH_MIN_LENGTH } from "@/lib/search";
import { fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Recherche : ${q}` : "Recherche",
    // Une page de résultats n'a rien à faire dans un index.
    robots: { index: false },
  };
}

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = await searchEverything(q ?? "");
  const tooShort = (q ?? "").trim().length > 0 && (q ?? "").trim().length < SEARCH_MIN_LENGTH;

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Recherche" }]}
        title={results.query ? `Résultats pour « ${results.query} »` : "Recherche"}
        lead="Ressources, formateurs et communautés, en une seule requête."
      />

      <form action="/recherche" className="mt-6 flex max-w-[540px] gap-2">
        <label htmlFor="q" className="sr-only">
          Votre recherche
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={results.query}
          placeholder="Un sujet, un formateur, une communauté…"
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-5 py-2.5 text-base text-ink outline-none focus-visible:border-brand md:text-[14.5px]"
        />
        <Btn type="submit">Chercher</Btn>
      </form>

      {tooShort ? (
        <p className="mt-6 text-[14px] text-ink-2">
          Saisissez au moins {SEARCH_MIN_LENGTH} caractères.
        </p>
      ) : !results.query ? null : results.total === 0 ? (
        <EmptyState
          className="mt-9"
          icon={<SearchX />}
          title="Aucun résultat"
          description="Essayez un autre terme, ou parcourez le catalogue."
          action={
            <BtnLink href="/ressources" variant="o">Voir le catalogue</BtnLink>
          }
        />
      ) : (
        <div className="mt-9 flex flex-col gap-[52px]">
          {results.courses.length > 0 ? (
            <section aria-labelledby="res-ressources">
              <h2 id="res-ressources" className="mb-5 text-[clamp(20px,2.2vw,26px)] font-extrabold">
                Ressources
                <HeadingCount n={results.courses.length} />
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.courses.map((course) => (
                  <ResourceCard key={course.id} course={course} space="public" />
                ))}
              </div>
            </section>
          ) : null}

          {results.trainers.length > 0 ? (
            <section aria-labelledby="res-formateurs">
              <h2 id="res-formateurs" className="mb-5 text-[clamp(20px,2.2vw,26px)] font-extrabold">
                Formateurs
                <HeadingCount n={results.trainers.length} />
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.trainers.map((trainer) => {
                  const name = trainer.fullName ?? "Formateur NkamVa";
                  return (
                    <article
                      key={trainer.id}
                      className="flex items-center gap-3.5 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm"
                    >
                      <Avatar name={name} src={trainer.avatarUrl} alt={`Photo de ${name}`} />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[15px] font-extrabold">
                          <Link href={`/formateurs/${trainer.id}`} className="text-ink hover:text-brand">
                            {name}
                          </Link>
                        </h3>
                        {trainer.slogan ? (
                          <p className="truncate text-[13px] text-ink-2">{trainer.slogan}</p>
                        ) : null}
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-3">
                          <GraduationCap className="size-3.5" aria-hidden="true" />
                          {trainer.publishedCount} ressource{trainer.publishedCount > 1 ? "s" : ""}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {results.communities.length > 0 ? (
            <section aria-labelledby="res-communautes">
              <h2 id="res-communautes" className="mb-5 text-[clamp(20px,2.2vw,26px)] font-extrabold">
                Communautés
                <HeadingCount n={results.communities.length} />
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.communities.map((community) => (
                  <article
                    key={community.id}
                    className="flex flex-col gap-2 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm"
                  >
                    <h3 className="text-[15px] font-extrabold">
                      <Link
                        href={`/communautes/${community.slug}`}
                        className="text-ink hover:text-brand"
                      >
                        {community.name}
                      </Link>
                    </h3>
                    {community.description ? (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-ink-2">
                        {community.description}
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between border-t border-line-2 pt-3">
                      <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                        <Users className="size-3.5" aria-hidden="true" />
                        {fmtNumber(community.membersCount)}
                      </span>
                      <Price amountFcfa={community.priceFcfa} className="text-[14px]" />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
