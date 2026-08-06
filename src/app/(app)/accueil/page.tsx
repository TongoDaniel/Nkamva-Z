import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Library, Receipt } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { EmptyState } from "@/components/nk/empty-state";
import { ResourceCard } from "@/components/nk/resource-card";
import { ProgressRing } from "@/components/nk/progress-ring";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { getAuthContext } from "@/lib/api";
import { listMyResources } from "@/lib/access";
import { searchCourses } from "@/lib/catalog";
import { db } from "@/lib/db";
import { consumptionPercent, isDownloadable, type CourseListItem, type ResourceItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accueil",
  robots: { index: false },
};

export default async function AccueilPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;

  // Le middleware renvoie ici quand un compte non-admin tente d'ouvrir `/admin`.
  // Sans ce message, la redirection ressemble à un clic perdu.
  const { erreur } = await searchParams;

  const [mine, suggestions, profile] = await Promise.all([
    listMyResources(auth.user.id, "all", 1, 20),
    searchCourses({ sort: "newest", page: 1, pageSize: 3 }),
    db.user.findUnique({
      where: { id: auth.user.id },
      select: { fullName: true, preferredName: true },
    }),
  ]);

  // La maquette accueille par le prénom. `preferredName` prime quand il existe ;
  // sinon on prend le premier mot du nom complet, faute de champ dédié.
  const firstName =
    profile?.preferredName?.trim() || profile?.fullName?.trim().split(/\s+/)[0] || null;

  const items = mine.items as unknown as ResourceItem[];
  const inProgress = items.filter((i) => i.isStarted && !i.accessSuspended).slice(0, 3);
  const suggested = (suggestions.items as unknown as CourseListItem[]).filter(
    (c) => !items.some((i) => i.course?.id === c.id),
  );

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title={firstName ? `Bonjour, ${firstName} !` : "Votre espace"}
        lead="Reprenez là où vous en étiez, ou découvrez de nouvelles ressources."
      />

      {erreur === "acces-refuse" ? (
        <p
          role="alert"
          className="mb-8 rounded-nk border border-danger/30 bg-danger-tint px-5 py-4 text-[14px] font-semibold leading-relaxed text-danger"
        >
          Vous n&apos;avez pas les droits nécessaires pour accéder à cette page.
        </p>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/mes-ressources"
          className="flex items-center gap-4 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm hover:border-ink-3"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand" aria-hidden="true">
            <Library className="size-5" />
          </span>
          <span>
            <b className="block font-display text-[26px] font-extrabold leading-none">
              {mine.counts.all}
            </b>
            <small className="text-[13px] text-ink-2">
              ressource{mine.counts.all > 1 ? "s" : ""} achetée{mine.counts.all > 1 ? "s" : ""}
            </small>
          </span>
          <ArrowRight className="ml-auto size-4 text-ink-3" aria-hidden="true" />
        </Link>
        <Link
          href="/mes-achats"
          className="flex items-center gap-4 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm hover:border-ink-3"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-tint text-info" aria-hidden="true">
            <Receipt className="size-5" />
          </span>
          <span>
            <b className="block font-display text-[26px] font-extrabold leading-none">
              {mine.counts.started}
            </b>
            <small className="text-[13px] text-ink-2">en cours de consultation</small>
          </span>
          <ArrowRight className="ml-auto size-4 text-ink-3" aria-hidden="true" />
        </Link>
      </div>

      <section aria-labelledby="reprendre" className="mb-10">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="reprendre" className="text-[17px] font-bold">
            Reprendre
          </h2>
          <Link href="/mes-ressources" className="text-[13px] font-bold text-brand">
            Tout voir
          </Link>
        </div>
        {inProgress.length === 0 ? (
          <EmptyState
            icon={<Library />}
            title="Rien en cours"
            description="Ouvrez une de vos ressources pour la retrouver ici la prochaine fois."
            action={
              <Btn asChild variant="o">
                <Link href="/mes-ressources">Mes ressources</Link>
              </Btn>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3.5">
            {inProgress.map((item) => {
              const course = item.course;
              if (!course) return null;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-4 rounded-nk-lg border border-line bg-card px-5 py-4 shadow-nk-sm"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand" aria-hidden="true">
                    <FormatGlyph format={course.format} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14.5px] font-bold">
                      <Link href={routes.course(course.slug)} className="text-ink hover:text-brand">
                        {course.title}
                      </Link>
                    </h3>
                    <p className="text-[12.5px] text-ink-2">{formatLabel(course.format)}</p>
                  </div>
                  <ProgressRing
                    percent={consumptionPercent(item.courseView, course.format, course.durationSeconds)}
                    downloaded={item.courseView?.downloaded ?? false}
                  />
                  {!isDownloadable(course.format) ? (
                    <Btn asChild size="sm" variant="o">
                      <Link href={`/mes-ressources/${course.id}`}>Reprendre</Link>
                    </Btn>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {suggested.length > 0 ? (
        <section aria-labelledby="suggestions">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="suggestions" className="text-[17px] font-bold">
              Nouveautés du catalogue
            </h2>
            <Link href={routes.catalog} className="text-[13px] font-bold text-brand">
              Tout le catalogue
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {suggested.map((course) => (
              <ResourceCard key={course.id} course={course} space="app" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
