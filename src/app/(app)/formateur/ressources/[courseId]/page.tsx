import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { StPill } from "@/components/nk/status-pill";
import { StatTile } from "@/components/nk/stat-tile";
import { Cover, formatLabel } from "@/components/nk/cover";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/api";
import { getSalesByCourse } from "@/lib/trainer-stats";
import { fmtDuration, fmtNumber } from "@/lib/format";
import { CourseForm, type CourseFormValues } from "../course-form";
import { CourseActionsBar } from "./course-actions-bar";
import { CoverUploader } from "./cover-uploader";
import { COURSE_STATUS } from "../course-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modifier une ressource",
  robots: { index: false },
};

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const course = await db.course.findUnique({ where: { id: courseId } });
  // Même règle que l'API : une ressource d'un autre formateur est introuvable,
  // pas « interdite » — on ne confirme pas son existence.
  if (!course || course.trainerId !== auth.user.trainerId) notFound();

  const sales = (await getSalesByCourse(auth.user.trainerId)).get(course.id);
  const state = COURSE_STATUS[course.status] ?? COURSE_STATUS.draft;

  const initial: CourseFormValues = {
    title: course.title,
    blurb: course.blurb,
    description: course.description,
    category: course.category,
    format: course.format,
    level: course.level ?? "",
    priceFcfa: String(course.priceFcfa),
    durationMinutes: course.durationSeconds ? String(Math.round(course.durationSeconds / 60)) : "",
    lessonsCount: course.lessonsCount ? String(course.lessonsCount) : "",
    learnPoints: course.learnPoints.length ? course.learnPoints : [""],
    includes: course.includes.length ? course.includes : [""],
  };

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Espace formateur", href: "/formateur" },
          { label: "Mes publications", href: "/formateur/ressources" },
          { label: course.title },
        ]}
        title={course.title}
        lead={
          <span className="flex flex-wrap items-center gap-3.5">
            <StPill tone={state.tone}>{state.label}</StPill>
            <span>
              {formatLabel(course.format)}
              {course.durationSeconds ? ` · ${fmtDuration(course.durationSeconds)}` : ""}
            </span>
            <span className="text-ink-3">/{course.slug}</span>
          </span>
        }
        actions={
          <>
            {course.status === "published" ? (
              <Btn asChild variant="o">
                <Link href={`/ressources/${course.slug}`}>
                  <ExternalLink aria-hidden="true" />
                  Voir la fiche publique
                </Link>
              </Btn>
            ) : null}
            <CourseActionsBar
              course={{
                id: course.id,
                title: course.title,
                status: course.status,
                salesCount: sales?.salesCount ?? 0,
              }}
            />
          </>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile value={fmtNumber(sales?.salesCount ?? 0)} label="ventes confirmées" tone="brand" />
        <StatTile
          value={fmtNumber(sales?.netRevenueFcfa ?? 0)}
          suffix="FCFA"
          label="revenus nets sur cette ressource"
          tone="clay"
        />
        <div className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
          <h2 className="mb-3 text-[13.5px] font-bold">Couverture</h2>
          <div className="mb-3 overflow-hidden rounded-nk">
            <Cover
              category={course.category}
              format={course.format}
              typeLabel={formatLabel(course.format).toUpperCase()}
            />
          </div>
          <CoverUploader courseId={course.id} currentKey={course.coverS3Key} />
        </div>
      </div>

      <CourseForm mode="edit" courseId={course.id} initial={initial} />
    </div>
  );
}
