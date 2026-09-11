import type { Metadata } from "next";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { getMyCommunity } from "@/lib/communities";
import { CourseForm } from "../course-form";

export const metadata: Metadata = {
  title: "Nouvelle ressource",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function NouvelleRessourcePage() {
  // La communauté décide de l'option « incluse » : sans salon ouvert, ou son
  // rayon ressources éteint, l'option s'affiche mais reste désactivée, avec sa
  // raison. Lue ici plutôt que dans le formulaire, qui est un composant client.
  const auth = await getAuthContext();
  const community = auth?.user.trainerId ? await getMyCommunity(auth.user.trainerId) : null;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Espace formateur", href: "/formateur" },
          { label: "Mes publications", href: "/formateur/ressources" },
          { label: "Nouvelle ressource" },
        ]}
        title="Nouvelle ressource"
        lead="Décrivez ce que vous vendez. Vous pourrez tout modifier tant que la ressource n'est pas publiée — et même après."
      />
      <CourseForm
        mode="create"
        community={
          community ? { name: community.name, resourcesEnabled: community.resourcesEnabled } : null
        }
      />
    </div>
  );
}
