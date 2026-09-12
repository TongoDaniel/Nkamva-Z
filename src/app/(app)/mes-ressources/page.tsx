import type { Metadata } from "next";
import { Library, BookOpen, PlayCircle, Inbox } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { StatTile } from "@/components/nk/stat-tile";
import { BtnLink } from "@/components/nk/button-link";
import { getAuthContext } from "@/lib/api";
import { listMyResources } from "@/lib/access";
import type { ResourceItem } from "@/lib/dto";
import { ResourceList } from "./resource-list";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes ressources",
  robots: { index: false },
};

const PAGE_SIZE = 20;

export default async function MesRessourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { filter: rawFilter } = await searchParams;
  const filter =
    rawFilter === "started" || rawFilter === "unstarted" ? rawFilter : ("all" as const);

  const result = await listMyResources(auth.user.id, filter, 1, PAGE_SIZE);
  const items = result.items as unknown as ResourceItem[];
  const { counts } = result;

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        title="Mes ressources"
        lead="Vos ressources achetées et celles incluses dans vos communautés, au même endroit. L'accès est à vie."
        actions={
          <BtnLink href={routes.catalog} variant="o">Explorer le catalogue</BtnLink>
        }
      />

      {counts.all > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* « acquises » et non « achetées » : la liste réunit désormais les
              deux façons d'y avoir droit (F3.11). */}
          <StatTile icon={<BookOpen />} value={counts.all} label="acquises" />
          <StatTile
            icon={<PlayCircle />}
            value={counts.started}
            label="consultées"
            tone="blue"
          />
          <StatTile icon={<Inbox />} value={counts.unstarted} label="à ouvrir" tone="gold" />
        </div>
      ) : null}

      {counts.all === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Library />}
          title="Aucune ressource pour l'instant"
          description="Les cours, guides et modèles que vous achetez apparaissent ici, définitivement."
          action={
            <BtnLink href={routes.catalog}>Découvrir le catalogue</BtnLink>
          }
        />
      ) : (
        <ResourceList items={items} filter={filter} counts={counts} />
      )}
    </div>
  );
}
