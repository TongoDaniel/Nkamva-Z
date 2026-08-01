"use client";

import { useRouter } from "next/navigation";
import { CourseActions } from "../course-list";

/** Publier / archiver depuis l'en-tête de la fiche d'édition. */
export function CourseActionsBar({
  course,
}: {
  course: { id: string; title: string; status: string; salesCount: number };
}) {
  const router = useRouter();
  return <CourseActions course={course} onDone={() => router.refresh()} />;
}
