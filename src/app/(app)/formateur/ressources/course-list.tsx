"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, Filter, Send, SquarePen } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Tabs } from "@/components/nk/tabs";
import { StPill } from "@/components/nk/status-pill";
import { Modal } from "@/components/nk/modal";
import { EmptyState } from "@/components/nk/empty-state";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { fmtDate, fmtDuration, fmtFcfa, fmtNumber } from "@/lib/format";
import { COURSE_STATUS } from "./course-status";

export interface TrainerCourseRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  format: string;
  category: string;
  priceFcfa: number;
  durationSeconds: number | null;
  updatedAt: string;
  salesCount: number;
  netRevenueFcfa: number;
}

/** Publication et archivage — les deux transitions exposées par le Lot 4. */
export function CourseActions({
  course,
  onDone,
}: {
  course: Pick<TrainerCourseRow, "id" | "title" | "status" | "salesCount">;
  onDone: () => void;
}) {
  const [pending, setPending] = React.useState<null | "publish" | "archive">(null);
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  const run = async (action: "publish" | "archive") => {
    setPending(action);
    try {
      await api.post(`/api/trainer/courses/${course.id}/${action}`);
      toast.success(
        action === "publish"
          ? "Ressource publiée. Elle est visible au catalogue."
          : "Ressource archivée. Elle quitte le catalogue.",
      );
      setConfirmArchive(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action a échoué. Réessayez.");
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      {course.status !== "published" ? (
        <Btn size="sm" loading={pending === "publish"} onClick={() => void run("publish")}>
          <Send aria-hidden="true" />
          Publier
        </Btn>
      ) : null}

      {course.status !== "archived" ? (
        <Btn
          variant="o"
          size="sm"
          onClick={() => setConfirmArchive(true)}
          aria-label={`Archiver ${course.title}`}
        >
          <Archive aria-hidden="true" />
          Archiver
        </Btn>
      ) : null}

      <Modal
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archiver cette ressource ?"
        description={
          course.salesCount > 0
            ? `« ${course.title} » quitte le catalogue et ne peut plus être achetée. Les ${fmtNumber(course.salesCount)} personnes qui l'ont déjà achetée gardent leur accès à vie.`
            : `« ${course.title} » quitte le catalogue et ne peut plus être achetée.`
        }
        footer={
          <>
            <Btn variant="danger" loading={pending === "archive"} onClick={() => void run("archive")}>
              Archiver
            </Btn>
            <Btn variant="o" onClick={() => setConfirmArchive(false)}>
              Annuler
            </Btn>
          </>
        }
      />
    </>
  );
}

export function TrainerCourseList({
  rows,
  status,
}: {
  rows: TrainerCourseRow[];
  status: string;
}) {
  const router = useRouter();
  const visible = status === "all" ? rows : rows.filter((r) => r.status === status);
  const countOf = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <>
      <Tabs
        label="Filtrer mes publications"
        panelId="publications-liste"
        value={status}
        onValueChange={(value) =>
          router.push(
            value === "all" ? "/formateur/ressources" : `/formateur/ressources?status=${value}`,
          )
        }
        items={[
          { value: "all", label: "Toutes", count: rows.length },
          { value: "published", label: "Publiées", count: countOf("published") },
          { value: "draft", label: "Brouillons", count: countOf("draft") },
          { value: "archived", label: "Archivées", count: countOf("archived") },
        ]}
        className="mt-6"
      />

      <div id="publications-liste" className="flex flex-col gap-3.5">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Filter />}
            title="Rien dans ce filtre"
            description="Changez d'onglet pour voir vos autres ressources."
          />
        ) : (
          visible.map((course) => {
            const state = COURSE_STATUS[course.status] ?? COURSE_STATUS.draft;
            const duration = fmtDuration(course.durationSeconds);
            return (
              <article
                key={course.id}
                className="flex flex-wrap items-center gap-4.5 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm"
              >
                <span
                  className="grid size-16 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
                  aria-hidden="true"
                >
                  <FormatGlyph format={course.format} className="size-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[15.5px] font-bold leading-tight">
                    <Link
                      href={`/formateur/ressources/${course.id}`}
                      className="text-ink hover:text-brand"
                    >
                      {course.title}
                    </Link>
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-2">
                    <StPill tone={state.tone}>{state.label}</StPill>
                    <span>
                      {formatLabel(course.format)}
                      {duration ? ` · ${duration}` : ""}
                    </span>
                    <span>{fmtFcfa(course.priceFcfa)}</span>
                    <span>Mis à jour le {fmtDate(course.updatedAt)}</span>
                  </p>
                </div>

                <dl className="flex gap-6 text-center">
                  <div>
                    <dd className="font-display text-[17px] font-extrabold">
                      {fmtNumber(course.salesCount)}
                    </dd>
                    <dt className="text-[12px] text-ink-3">Ventes</dt>
                  </div>
                  <div>
                    <dd className="font-display text-[17px] font-extrabold">
                      {fmtNumber(course.netRevenueFcfa)}
                    </dd>
                    <dt className="text-[12px] text-ink-3">Net (FCFA)</dt>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2">
                  <Btn asChild variant="o" size="sm">
                    <Link href={`/formateur/ressources/${course.id}`}>
                      <SquarePen aria-hidden="true" />
                      Modifier
                    </Link>
                  </Btn>
                  {course.status === "published" ? (
                    <Btn asChild variant="t" size="sm">
                      <Link href={`/ressources/${course.slug}`}>
                        <ExternalLink aria-hidden="true" />
                        <span className="sr-only">Voir la fiche publique de </span>
                        Voir
                      </Link>
                    </Btn>
                  ) : null}
                  <CourseActions course={course} onDone={() => router.refresh()} />
                </div>
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
