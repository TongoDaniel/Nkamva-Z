import type { Metadata } from "next";
import { CourseScreen } from "@/components/screens/course-screen";
import { getPublicCourse } from "@/lib/catalog";
import type { CourseDetail } from "@/lib/dto";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const course = (await getPublicCourse(slug)) as CourseDetail | null;
  if (!course) return { title: "Ressource introuvable" };
  return { title: course.title, description: course.blurb, robots: { index: false } };
}

/**
 * Fiche ressource de l'espace connecté. Son jumeau visiteur, `/ressources/…`,
 * reste l'URL à partager : celle-ci renvoie un visiteur vers la connexion.
 */
export default async function FicheRessourceConnectePage({ params }: { params: Params }) {
  const { slug } = await params;
  return <CourseScreen slug={slug} space="app" />;
}
