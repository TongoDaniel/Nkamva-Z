import { AdminHead } from "@/components/layouts/admin-shell";
import { Skeleton, SkeletonRegion } from "@/components/nk/skeleton";

/**
 * Squelette du journal d'audit.
 *
 * Le seul écran de l'administration qui justifie un squelette : sa charge de
 * navigation pèse 11 ko compressés, contre 4 de médiane sur les 56 routes
 * mesurées le 10 août 2026 — c'est aussi la plus lourde de la console.
 * Ailleurs, le trait de `NavLink` suffit à dire que le clic est parti, et un
 * squelette ne ferait que clignoter sur des attentes trop courtes.
 *
 * Le titre et le chapô ne sont pas esquissés : ils sont écrits en dur dans la
 * page, donc connus d'avance. Les afficher tout de suite dit *où l'on arrive*
 * pendant que le reste se charge — un bloc gris à leur place ne dirait rien.
 */
export default function Loading() {
  return (
    <>
      <AdminHead
        title="Journal d'audit"
        lead="Toutes les actions des trois rôles y sont écrites, dans la transaction qui les produit. Rien ne s'y modifie ni ne s'y efface."
      />

      <SkeletonRegion label="Chargement du journal d'audit">
        {/* Les quatre compteurs, à leur gabarit réel. */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-nk-lg border border-line bg-card p-5">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        </div>

        {/* La barre de filtres par domaine. */}
        <div className="mb-5 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        {/* Les entrées : une ligne dense, comme le tableau qu'elles remplacent. */}
        <div className="overflow-hidden rounded-nk-lg border border-line bg-card">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-line-2 px-5 py-3.5 last:border-b-0"
            >
              <Skeleton className="h-4 w-28 shrink-0" />
              <Skeleton className="h-4 w-40 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </>
  );
}
