import type { Metadata } from "next";
import { PageHead } from "@/components/nk/page-head";
import { CourseForm } from "../course-form";

export const metadata: Metadata = {
  title: "Nouvelle ressource",
  robots: { index: false },
};

export default function NouvelleRessourcePage() {
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
      <CourseForm mode="create" />
    </div>
  );
}
