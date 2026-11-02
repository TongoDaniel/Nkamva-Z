import type { Metadata } from "next";
import { CourseScreen } from "@/components/screens/course-screen";
import { getPublicCourse } from "@/lib/catalog";
import type { CourseDetail } from "@/lib/dto";
import { courseJsonLd, jsonLdScript } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const course = (await getPublicCourse(slug)) as CourseDetail | null;
  if (!course) return { title: "Ressource introuvable" };
  return {
    title: course.title,
    description: course.blurb,
    openGraph: { title: course.title, description: course.blurb, type: "article" },
  };
}

/**
 * Fiche ressource de l'espace visiteur — l'URL partageable et indexable. Elle
 * porte la description schema.org de la ressource, pour les résultats
 * enrichis de cours.
 */
export default async function FicheRessourcePage({ params }: { params: Params }) {
  const { slug } = await params;
  const course = (await getPublicCourse(slug)) as CourseDetail | null;
  return (
    <>
      {course ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(courseJsonLd(course)) }}
        />
      ) : null}
      <CourseScreen slug={slug} space="public" />
    </>
  );
}
