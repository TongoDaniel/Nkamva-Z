"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Filter, PlayCircle } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { Tabs } from "@/components/nk/tabs";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { ProgressRing } from "@/components/nk/progress-ring";
import { EmptyState } from "@/components/nk/empty-state";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { fmtDuration } from "@/lib/format";
import { readingPercent, isDownloadable, type ResourceItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

function ResourceActions({ item }: { item: ResourceItem }) {
  const [pending, setPending] = React.useState(false);
  const course = item.course;
  if (!course) return null;

  if (item.accessSuspended) {
    return (
      <p className="max-w-[220px] rounded-xl border border-line bg-card border-l-4 border-l-danger px-3.5 py-2.5 text-[13px] font-semibold text-danger rounded-l-sm">
        Accès suspendu le temps d&apos;un litige.
      </p>
    );
  }

  const onDownload = async () => {
    setPending(true);
    try {
      const { data } = await api.get<{ url: string }>(
        `/api/me/resources/${course.id}/content`,
      );
      // Le marquage alimente CourseView.downloaded, dont dépend la règle de
      // remboursement : il doit précéder l'ouverture du fichier.
      await api.post(`/api/me/resources/${course.id}/download`);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Le téléchargement a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  };

  /*
    Chaque ressource mène désormais à son écran de lecture, y compris les
    formats téléchargeables.

    Elle n'y menait pas : un format téléchargeable n'offrait que « Télécharger »,
    si bien que le visualiseur PDF du lot 7 n'avait **aucun point d'entrée**, et
    que le marqueur « terminé » d'une archive était inatteignable. Le
    téléchargement direct reste là, en action secondaire — il ne demande
    toujours qu'un clic.
  */
  const telechargeable = isDownloadable(course.format);
  const libelle =
    course.format === "pdf" ? (item.isStarted ? "Reprendre" : "Lire en ligne")
    : telechargeable ? "Ouvrir"
    : item.isStarted ? "Reprendre" : "Commencer";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <BtnLink href={`/mes-ressources/${course.id}`} size="sm" className="nk-tap">
        <PlayCircle aria-hidden="true" />
        {libelle}
      </BtnLink>
      {telechargeable ? (
        <Btn size="sm" variant="o" className="nk-tap" loading={pending} onClick={onDownload}>
          <Download aria-hidden="true" />
          Télécharger
        </Btn>
      ) : null}
    </div>
  );
}

export function ResourceList({
  items,
  filter,
  counts,
}: {
  items: ResourceItem[];
  filter: "all" | "started" | "unstarted";
  counts: { all: number; started: number; unstarted: number };
}) {
  const router = useRouter();

  return (
    <>
      <Tabs
        label="Filtrer mes ressources"
        panelId="mes-ressources-liste"
        value={filter}
        onValueChange={(value) =>
          router.push(value === "all" ? "/mes-ressources" : `/mes-ressources?filter=${value}`)
        }
        items={[
          { value: "all", label: "Toutes", count: counts.all },
          { value: "started", label: "Consultées", count: counts.started },
          { value: "unstarted", label: "À ouvrir", count: counts.unstarted },
        ]}
        className="mt-6"
      />

      <div id="mes-ressources-liste" className="flex flex-col gap-3.5">
        {items.length === 0 ? (
          <EmptyState
            icon={<Filter />}
            title="Rien dans ce filtre"
            description="Changez d'onglet pour voir vos autres ressources."
          />
        ) : (
          items.map((item) => {
            const course = item.course;
            if (!course) return null;
            const percent = readingPercent(
              item.courseView, course.format, course.durationSeconds, course.pageCount,
            );
            const duration = fmtDuration(course.durationSeconds);

            // La position atteinte, dite dans l'unité du format (F3.1).
            const view = item.courseView;
            const reprise =
              course.format === "video" && view?.watchedSeconds
                ? `Reprendre à ${fmtDuration(view.watchedSeconds)}`
                : course.format === "pdf" && view?.lastPage
                  ? `Reprendre page ${view.lastPage}${course.pageCount ? ` sur ${course.pageCount}` : ""}`
                  : view?.completedAt
                    ? "Marquée comme terminée"
                    : null;
            const trainerName = course.trainerProfile?.user?.fullName;

            return (
              <article
                key={item.id}
                className="flex flex-wrap items-center gap-4.5 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm"
              >
                <span
                  className="grid size-16 shrink-0 place-items-center rounded-xl border border-line bg-card text-brand"
                  aria-hidden="true"
                >
                  <FormatGlyph format={course.format} className="size-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold uppercase tracking-[0.04em] text-brand-dark">
                    {formatLabel(course.format)}
                    {duration ? ` · ${duration}` : ""}
                    {course.pageCount ? ` · ${course.pageCount} pages` : ""}
                  </p>
                  {/*
                    Où l'on s'est arrêté, en toutes lettres. L'anneau seul dit
                    un pourcentage ; il ne dit pas qu'on reprendra page 12, et
                    c'est cette phrase-là qui donne envie de rouvrir (F3.1).
                  */}
                  {reprise ? (
                    <p className="order-3 text-[13px] font-semibold text-ink-2">{reprise}</p>
                  ) : null}
                  <h2 className="text-[15.5px] font-bold leading-tight">
                    <Link href={routes.course(course.slug)} className="text-ink hover:text-brand">
                      {course.title}
                    </Link>
                  </h2>
                  {trainerName ? (
                    <p className="text-[13px] text-ink-2">Par {trainerName}</p>
                  ) : null}
                  {/*
                    F3.11 — une ressource incluse dit d'où elle vient, et ouvre
                    directement cette communauté. « Mes communautés » reste la
                    vue dédiée ; elle ne doit simplement plus être le seul
                    endroit d'où l'on retrouve la communauté d'une ressource.
                  */}
                  {item.community ? (
                    <p className="text-[13px] text-ink-2">
                      Incluse dans{" "}
                      <Link
                        href={`/mes-communautes/${item.community.slug}`}
                        className="nk-tap font-semibold text-brand hover:underline"
                      >
                        {item.community.name}
                      </Link>
                    </p>
                  ) : null}
                </div>

                <ProgressRing
                  percent={percent}
                  downloaded={item.courseView?.downloaded ?? false}
                />
                <ResourceActions item={item} />
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
