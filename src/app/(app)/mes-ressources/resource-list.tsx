"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Filter, PlayCircle } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Tabs } from "@/components/nk/tabs";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { ProgressRing } from "@/components/nk/progress-ring";
import { EmptyState } from "@/components/nk/empty-state";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { fmtDuration } from "@/lib/format";
import { consumptionPercent, isDownloadable, type ResourceItem } from "@/lib/dto";

function ResourceActions({ item }: { item: ResourceItem }) {
  const [pending, setPending] = React.useState(false);
  const course = item.course;
  if (!course) return null;

  if (item.accessSuspended) {
    return (
      <p className="max-w-[220px] rounded-xl bg-danger-tint px-3.5 py-2.5 text-[12.5px] font-semibold text-danger">
        Accès suspendu le temps d&apos;un litige.
      </p>
    );
  }

  if (isDownloadable(course.format)) {
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

    return (
      <Btn size="sm" loading={pending} onClick={onDownload}>
        <Download aria-hidden="true" />
        Télécharger
      </Btn>
    );
  }

  return (
    <Btn asChild size="sm">
      <Link href={`/mes-ressources/${course.id}`}>
        <PlayCircle aria-hidden="true" />
        {item.isStarted ? "Reprendre" : "Commencer"}
      </Link>
    </Btn>
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
            const percent = consumptionPercent(item.courseView, course.format, course.durationSeconds);
            const duration = fmtDuration(course.durationSeconds);
            const trainerName = course.trainerProfile?.user?.fullName;

            return (
              <article
                key={item.id}
                className="flex flex-wrap items-center gap-4.5 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm"
              >
                <span
                  className="grid size-16 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
                  aria-hidden="true"
                >
                  <FormatGlyph format={course.format} className="size-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-brand-dark">
                    {formatLabel(course.format)}
                    {duration ? ` · ${duration}` : ""}
                  </p>
                  <h2 className="text-[15.5px] font-bold leading-tight">
                    <Link href={`/ressources/${course.slug}`} className="text-ink hover:text-brand">
                      {course.title}
                    </Link>
                  </h2>
                  {trainerName ? (
                    <p className="text-[13px] text-ink-2">Par {trainerName}</p>
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
