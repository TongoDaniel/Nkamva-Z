import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/api";
import { checkCourseAccess } from "@/lib/access";
import { Check } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Avatar } from "@/components/nk/avatar";
import { BtnLink } from "@/components/nk/button-link";
import { userAvatarSrc } from "@/lib/avatars";
import { routesOf } from "@/lib/spaces";
import { coverImageUrl } from "@/components/nk/cover";
import { CoursePlayer } from "./course-player";

/** Espace connecté : le profil du formateur s'ouvre dans la coquille applicative. */
const routes = routesOf("app");

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
      coverS3Key: true,
      durationSeconds: true,
      pageCount: true,
      blurb: true,
      description: true,
      learnPoints: true,
      includes: true,
      trainerProfile: {
        select: {
          id: true,
          slogan: true,
          user: {
            select: { id: true, fullName: true, avatarUrl: true, avatarS3Key: true },
          },
        },
      },
    },
  });
  if (!course) notFound();

  const view = await db.courseView.findUnique({
    where: { courseId_learnerId: { courseId, learnerId: auth.user.id } },
    select: { watchedSeconds: true, lastPage: true, completedAt: true, downloaded: true },
  });

  const trainer = course.trainerProfile;
  const trainerName = trainer?.user?.fullName ?? "Formateur NKAMVA";

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
        title={course.title}
        poster={coverImageUrl(course)}
        format={course.format}
        durationSeconds={course.durationSeconds}
        pageCount={course.pageCount}
        // Bornée à la durée connue : la progression affichait « 3 h 07 sur
        // 4 min » quand la position enregistrée dépassait le fichier en place.
        startAtSeconds={
          course.durationSeconds
            ? Math.min(view?.watchedSeconds ?? 0, course.durationSeconds)
            : (view?.watchedSeconds ?? 0)
        }
        startAtPage={view?.lastPage ?? null}
        completed={Boolean(view?.completedAt)}
        downloaded={Boolean(view?.downloaded)}
      />

      {/*
        Ce que la fiche de vente disait de la ressource, redit là où on la lit
        (revue du 16 novembre 2026). L'écran ne portait que le lecteur et la
        progression : une fois la ressource achetée, sa description, son plan
        et ce qu'elle contient n'étaient plus lisibles que sur sa page de
        vente, où l'on retombait sur un prix déjà payé.
      */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <section
          aria-labelledby="a-propos"
          className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm sm:p-7"
        >
          <h2 id="a-propos" className="mb-3 text-[19px] font-extrabold">
            À propos de cette ressource
          </h2>
          <p className="mb-3 text-[15px] font-semibold leading-relaxed text-ink text-pretty">
            {course.blurb}
          </p>
          {course.description
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="mb-3 text-[15px] leading-relaxed text-ink-2 text-pretty">
                {para}
              </p>
            ))}

          {course.learnPoints.length > 0 ? (
            <>
              <h3 className="mb-3 mt-6 border-t border-line-2 pt-6 text-[16px] font-extrabold">
                Ce que vous apprendrez
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-6">
                {course.learnPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-[14.5px] leading-snug">
                    <span
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line bg-card text-brand"
                      aria-hidden="true"
                    >
                      <Check className="size-3.5" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {course.includes.length > 0 ? (
            <>
              <h3 className="mb-3 mt-6 border-t border-line-2 pt-6 text-[16px] font-extrabold">
                Ce qui est inclus
              </h3>
              <ul className="grid gap-2.5">
                {course.includes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[14.5px] leading-snug">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {trainer ? (
          <aside
            aria-label="Le formateur"
            className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
          >
            <div className="flex items-center gap-3.5">
              <Avatar
                name={trainerName}
                src={userAvatarSrc(trainer.user)}
                size="lg"
                alt={`Photo de ${trainerName}`}
              />
              <div className="min-w-0">
                <b className="block text-[15.5px] font-extrabold">{trainerName}</b>
                {trainer.slogan ? (
                  <small className="block text-[13px] leading-snug text-ink-2">
                    {trainer.slogan}
                  </small>
                ) : null}
              </div>
            </div>
            <BtnLink href={routes.trainer(trainer.id)} variant="o" size="sm" block className="mt-5">
              Voir son profil et ses ressources
            </BtnLink>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
