import type { Metadata } from "next";
import { CatalogScreen, type CatalogSearchParams } from "@/components/screens/catalog-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Le catalogue",
  description:
    "Cours vidéo, guides et modèles créés par des formateurs africains. Payez à l'unité, en FCFA.",
};

/** Catalogue de l'espace visiteur. Son jumeau connecté est `/catalogue`. */
export default function CataloguePage({ searchParams }: { searchParams: CatalogSearchParams }) {
  return <CatalogScreen searchParams={searchParams} space="public" />;
}
