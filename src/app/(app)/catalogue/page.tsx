import type { Metadata } from "next";
import { CatalogScreen, type CatalogSearchParams } from "@/components/screens/catalog-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Le catalogue",
  description:
    "Cours vidéo, guides et modèles créés par des formateurs africains. Payez à l'unité, en FCFA.",
  // Jumeau connecté de `/ressources` : c'est la version publique qui doit être
  // indexée, celle-ci n'est de toute façon pas atteignable sans session.
  robots: { index: false },
};

/** Catalogue de l'espace connecté. Son jumeau visiteur est `/ressources`. */
export default function CatalogueConnectePage({
  searchParams,
}: {
  searchParams: CatalogSearchParams;
}) {
  return <CatalogScreen searchParams={searchParams} space="app" />;
}
