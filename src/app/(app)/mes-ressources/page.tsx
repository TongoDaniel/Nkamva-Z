import type { Metadata } from "next";
import Link from "next/link";
import { Library } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { listMyResources } from "@/lib/access";
import type { ResourceItem } from "@/lib/dto";
import { ResourceList } from "./resource-list";

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

  // `listMyResources` filtre après pagination : les compteurs par onglet sont
  // donc calculés sur la page courante, pas sur l'ensemble (voir rapport).
  const result = await listMyResources(auth.user.id, filter, 1, PAGE_SIZE);
  const items = result.items as unknown as ResourceItem[];

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Mes ressources"
        lead="Tout ce que vous avez acheté, avec votre progression. L'accès est à vie."
        actions={
          <Btn asChild variant="o">
            <Link href="/ressources">Parcourir le catalogue</Link>
          </Btn>
        }
      />

      {result.total === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Library />}
          title="Aucune ressource pour l'instant"
          description="Les cours, guides et modèles que vous achetez apparaissent ici, définitivement."
          action={
            <Btn asChild>
              <Link href="/ressources">Découvrir le catalogue</Link>
            </Btn>
          }
        />
      ) : (
        <ResourceList items={items} filter={filter} total={result.total} />
      )}
    </div>
  );
}
