import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/api";
import { checkCourseAccess } from "@/lib/access";
import { PageHead } from "@/components/nk/page-head";
import { CoursePlayer } from "./course-player";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lecture",
  robots: { index: false },
};

export default async function LecturePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/deconnexion");

  const access = await checkCourseAccess(courseId, auth.user.id);
  if (!access.granted) {
    // Achat absent ou accès suspendu : la liste porte déjà le message adapté.
    redirect("/mes-ressources");
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      slug: true,
      format: true,
      durationSeconds: true,
      pageCount: true,
      trainerProfile: { select: { user: { select: { fullName: true } } } },
    },
  });
  if (!course) notFound();

  const view = await db.courseView.findUnique({
    where: { courseId_learnerId: { courseId, learnerId: auth.user.id } },
    select: { watchedSeconds: true, lastPage: true, completedAt: true, downloaded: true },
  });

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Mes ressources", href: "/mes-ressources" }, { label: course.title }]}
        title={course.title}
        lead={
          course.trainerProfile?.user?.fullName
            ? `Par ${course.trainerProfile.user.fullName}`
            : undefined
        }
      />
      <CoursePlayer
        courseId={course.id}
        format={course.format}
        durationSeconds={course.durationSeconds}
        pageCount={course.pageCount}
        startAtSeconds={view?.watchedSeconds ?? 0}
        startAtPage={view?.lastPage ?? null}
        completed={Boolean(view?.completedAt)}
        downloaded={Boolean(view?.downloaded)}
      />
    </div>
  );
}
