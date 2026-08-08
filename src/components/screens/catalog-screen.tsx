import { Suspense } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { ResourceCard } from "@/components/nk/resource-card";
import { ResourceCardSkeleton } from "@/components/nk/skeleton";
import { EmptyState } from "@/components/nk/empty-state";
import { Btn } from "@/components/nk/button";
import { formatLabel } from "@/components/nk/cover";
import { CatalogFilters, CatalogToolbar, type Facet } from "./catalog-controls";
import { searchCourses, getCategories, getFormats } from "@/lib/catalog";
import { favoritedCourseIds } from "@/lib/favorites";
import { getAuthContext } from "@/lib/api";
import { routesOf, type Space } from "@/lib/spaces";
import type { CourseListItem } from "@/lib/dto";

const PAGE_SIZE = 9;
const SORTS = ["popular", "newest", "price_asc", "price_desc"] as const;

export type CatalogSearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

async function CatalogBody({
  searchParams,
  space,
}: {
  searchParams: CatalogSearchParams;
  space: Space;
}) {
  const routes = routesOf(space);
  const sp = await searchParams;
  const rawSort = one(sp.sort);
  const sort = (SORTS as readonly string[]).includes(rawSort ?? "")
    ? (rawSort as (typeof SORTS)[number])
    : "newest";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const query = {
    search: one(sp.search),
    category: one(sp.category),
    format: one(sp.format),
    level: one(sp.level),
    sort,
    page,
    pageSize: PAGE_SIZE,
  };

  const [result, categories, formats] = await Promise.all([
    searchCourses(query),
    getCategories(),
    getFormats(),
  ]);

  const items = result.items as unknown as CourseListItem[];

  // Mettre de côté suppose un compte : le cœur n'existe que dans l'espace
  // connecté. Dans l'espace visiteur il ne pouvait rien enregistrer et ne
  // rendait qu'un message d'erreur au clic.
  const auth = space === "app" ? await getAuthContext() : null;
  const favorited = auth
    ? await favoritedCourseIds(auth.user.id, items.map((c) => c.id))
    : new Set<string>();

  const categoryFacets: Facet[] = categories.map((c) => ({ value: c, label: c }));
  const formatFacets: Facet[] = formats.map((f) => ({ value: f, label: formatLabel(f) }));
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      const v = one(value);
      if (v && key !== "page") next.set(key, v);
    }
    if (target > 1) next.set("page", String(target));
    const q = next.toString();
    return q ? `${routes.catalog}?${q}` : routes.catalog;
  };

  return (
    <div className="grid items-start gap-8 pt-6 min-[900px]:grid-cols-[262px_1fr]">
      <CatalogFilters categories={categoryFacets} formats={formatFacets} />
      <section aria-label="Résultats du catalogue">
        <CatalogToolbar
          categories={categoryFacets}
          formats={formatFacets}
          total={result.total}
        />

        {items.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="Aucune ressource trouvée"
            description="Essayez d'élargir votre recherche ou de retirer un filtre."
            action={
              <Btn asChild variant="o">
                <Link href={routes.catalog}>Réinitialiser les filtres</Link>
              </Btn>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((course) => (
              <ResourceCard
                key={course.id}
                course={course}
                space={space}
                favoritable={Boolean(auth)}
                favorited={favorited.has(course.id)}
              />
            ))}
          </div>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination du catalogue" className="mt-9 flex justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
              .map((p, i, arr) => (
                <span key={p} className="flex items-center gap-2">
                  {i > 0 && p - arr[i - 1] > 1 ? (
                    <span className="text-ink-3" aria-hidden="true">
                      …
                    </span>
                  ) : null}
                  <Link
                    href={pageHref(p)}
                    aria-current={p === page ? "page" : undefined}
                    aria-label={`Page ${p}`}
                    className={
                      p === page
                        ? "nk-tap relative grid size-10 place-items-center rounded-full bg-ink text-sm font-bold text-paper"
                        : "nk-tap relative grid size-10 place-items-center rounded-full border border-line bg-card text-sm font-bold text-ink-2 hover:border-ink-3"
                    }
                  >
                    {p}
                  </Link>
                </span>
              ))}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function CatalogFallback() {
  return (
    <div className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <ResourceCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Corps du catalogue, rendu à l'identique dans l'espace visiteur et connecté. */
export function CatalogScreen({
  searchParams,
  space,
}: {
  searchParams: CatalogSearchParams;
  space: Space;
}) {
  const routes = routesOf(space);
  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[routes.catalogParent, { label: "Le catalogue" }]}
        title="Le catalogue"
        lead="Cours vidéo, guides et modèles créés par des formateurs africains. Payez à l'unité, en FCFA — la ressource reste à vous, à vie."
      />
      <Suspense fallback={<CatalogFallback />}>
        <CatalogBody searchParams={searchParams} space={space} />
      </Suspense>
    </div>
  );
}
