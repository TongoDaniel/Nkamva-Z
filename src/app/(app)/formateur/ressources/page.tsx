import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { listTrainerCourses } from "@/lib/courses";
import { getSalesByCourse } from "@/lib/trainer-stats";
import { TrainerCourseList, type TrainerCourseRow } from "./course-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes publications",
  robots: { index: false },
};

export default async function TrainerCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const { status: rawStatus } = await searchParams;
  const status = ["published", "draft", "archived"].includes(rawStatus ?? "")
    ? (rawStatus as string)
    : "all";

  // Le filtre est appliqué à l'affichage : les compteurs par onglet doivent
  // porter sur l'ensemble, pas sur la vue courante.
  const [courses, sales] = await Promise.all([
    listTrainerCourses(auth.user.trainerId),
    getSalesByCourse(auth.user.trainerId),
  ]);

  const rows: TrainerCourseRow[] = courses.map((course) => ({
    id: course.id,
    slug: course.slug,
    title: course.title,
    status: course.status,
    format: course.format,
    category: course.category,
    priceFcfa: course.priceFcfa,
    durationSeconds: course.durationSeconds,
    updatedAt: course.updatedAt.toISOString(),
    salesCount: sales.get(course.id)?.salesCount ?? 0,
    netRevenueFcfa: sales.get(course.id)?.netRevenueFcfa ?? 0,
  }));

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Mes publications" }]}
        title="Mes publications"
        lead="Gérez vos ressources, suivez leurs ventes et préparez vos prochains contenus."
        actions={
          <Btn asChild>
            <Link href="/formateur/ressources/nouvelle">
              <Plus aria-hidden="true" />
              Publier une ressource
            </Link>
          </Btn>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<BookOpen />}
          title="Aucune ressource pour l'instant"
          description="Créez votre première ressource : vous fixez le format, le contenu et le prix, en FCFA."
          action={
            <Btn asChild>
              <Link href="/formateur/ressources/nouvelle">Créer une ressource</Link>
            </Btn>
          }
        />
      ) : (
        <TrainerCourseList rows={rows} status={status} />
      )}
    </div>
  );
}
