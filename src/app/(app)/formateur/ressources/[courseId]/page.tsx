import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import { StatTile } from "@/components/nk/stat-tile";
import { Cover, coverImageUrl, formatLabel } from "@/components/nk/cover";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/api";
import { getSalesByCourse } from "@/lib/trainer-stats";
import { trainerStorage } from "@/lib/courses";
import { fmtDuration, fmtNumber } from "@/lib/format";
import { CourseForm, type CourseFormValues } from "../course-form";
import { CourseActions } from "../course-list";
import { CoverUploader } from "./cover-uploader";
import { ContentUploader } from "./content-uploader";
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
  const storage = await trainerStorage(auth.user.trainerId!);
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
              <BtnLink href={`/ressources/${course.slug}`} variant="o">
                <ExternalLink aria-hidden="true" />
                Voir la fiche publique
              </BtnLink>
            ) : null}
            <CourseActions
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatTile value={fmtNumber(sales?.salesCount ?? 0)} label="ventes confirmées" tone="brand" />
        <StatTile
          value={fmtNumber(sales?.netRevenueFcfa ?? 0)}
          suffix="FCFA"
          label="revenus nets sur cette ressource"
          tone="clay"
        />
      </div>

      {/* Les fichiers vivent dans la colonne latérale du formulaire : hors de
          celle-ci, ce panneau haut étirait la rangée des chiffres clés. */}
      <CourseForm
        mode="edit"
        courseId={course.id}
        initial={initial}
        aside={
          <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
            <h2 className="mb-4 text-[16.5px] font-extrabold">Couverture</h2>
            {/* C'est ici que le formateur juge son dépôt : ce panneau montrait
                la couverture générée quoi qu'il ait envoyé. */}
            <div className="mb-3.5 overflow-hidden rounded-nk">
              <Cover
                category={course.category}
                format={course.format}
                typeLabel={formatLabel(course.format).toUpperCase()}
                imageUrl={coverImageUrl(course)}
              />
            </div>
            <CoverUploader courseId={course.id} currentKey={course.coverS3Key} />

            <div className="mt-6 border-t border-line-2 pt-6">
              <h2 className="mb-4 text-[16.5px] font-extrabold">Contenu de la ressource</h2>
              <ContentUploader
                courseId={course.id}
                currentKey={course.contentS3Key}
                currentSizeBytes={course.contentSizeBytes === null ? null : Number(course.contentSizeBytes)}
                remainingBytes={storage.remainingBytes}
                sold={course.obligationAt !== null}
              />
            </div>
          </section>
        }
      />
    </div>
  );
}
