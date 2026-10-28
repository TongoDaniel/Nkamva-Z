"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, Filter, Send, SquarePen } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { Tabs } from "@/components/nk/tabs";
import { StPill } from "@/components/nk/status-pill";
import { Modal } from "@/components/nk/modal";
import { EmptyState } from "@/components/nk/empty-state";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
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

/**
 * Publication et archivage — les deux transitions exposées par le Lot 4.
 *
 * Les deux actions rafraîchissent le rendu serveur : `useAction` s'en charge,
 * ce qui rend inutile l'ancienne prop `onDone`, que les deux appelants
 * remplissaient de la même façon.
 */
export function CourseActions({
  course,
}: {
  course: Pick<TrainerCourseRow, "id" | "title" | "status" | "salesCount">;
}) {
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  const publish = useAction(() => api.post(`/api/trainer/courses/${course.id}/publish`), {
    success: "Ressource publiée. Elle est visible au catalogue.",
  });

  const archive = useAction(() => api.post(`/api/trainer/courses/${course.id}/archive`), {
    success: "Ressource archivée. Elle quitte le catalogue.",
    // Fermée dans la transition : la modale disparaît au moment où la liste
    // rafraîchie arrive, et non sur une ligne encore marquée « Publiée ».
    onSuccess: () => setConfirmArchive(false),
  });

  return (
    <>
      {course.status !== "published" ? (
        <Btn size="sm" loading={publish.pending} onClick={() => void publish.run()}>
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
            <Btn variant="danger" loading={archive.pending} onClick={() => void archive.run()}>
              Archiver
            </Btn>
            {/* Neutralisé pendant l'archivage : refermer la modale en cours de
                route laisserait l'action se terminer sans rien à l'écran. */}
            <Btn variant="o" disabled={archive.pending} onClick={() => setConfirmArchive(false)}>
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
              /*
                Grille à deux colonnes sur téléphone, rangée d'un seul tenant dès
                `sm`. En `flex-wrap`, l'icône (64 px), les deux chiffres (123 px)
                et les gestes se partageaient la première ligne : il restait
                **74 px** au titre et à ses métadonnées, qui s'enroulaient sur
                149 px de haut à eux seuls. La ligne mesurait 394 px — la moitié
                d'un écran pour une ressource. L'icône tient la première colonne,
                tout le reste la seconde, et les deux rangées du bas traversent.
              */
              <article
                key={course.id}
                className="group relative grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 rounded-nk-lg border border-line bg-card px-4 py-4 shadow-nk-sm transition duration-150 hover:border-brand hover:shadow-nk focus-within:border-brand sm:flex sm:flex-wrap sm:items-center sm:gap-4.5 sm:px-5 sm:py-4.5"
              >
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-card text-brand sm:size-16"
                  aria-hidden="true"
                >
                  <FormatGlyph format={course.format} className="size-5 sm:size-6" />
                </span>

                <div className="min-w-0 sm:flex-1">
                  <h2 className="text-[15.5px] font-bold leading-tight">
                    {/* Le lien du titre couvre la ligne (`after:inset-0`), comme
                        dans `ResourceCard` : une seule cible pour ouvrir la
                        ressource, et le nom accessible reste le titre. Le bouton
                        « Modifier » qui menait **à la même adresse** a été retiré :
                        deux cibles pour une destination, dont une qui coûtait
                        108 px de large sur la rangée la plus serrée du produit. */}
                    <Link
                      href={`/formateur/ressources/${course.id}`}
                      className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
                    >
                      {course.title}
                    </Link>
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-2">
                    <StPill tone={state.tone}>{state.label}</StPill>
                    <span>
                      {formatLabel(course.format)}
                      {duration ? ` · ${duration}` : ""}
                    </span>
                    <span>{fmtFcfa(course.priceFcfa)}</span>
                    <span>Mis à jour le {fmtDate(course.updatedAt)}</span>
                  </p>
                </div>

                <dl className="col-span-2 flex gap-6 text-center sm:col-auto">
                  <div>
                    <dd className="font-display text-[17px] font-extrabold">
                      {fmtNumber(course.salesCount)}
                    </dd>
                    <dt className="text-[13px] text-ink-3">Ventes</dt>
                  </div>
                  <div>
                    <dd className="font-display text-[17px] font-extrabold">
                      {fmtNumber(course.netRevenueFcfa)}
                    </dd>
                    <dt className="text-[13px] text-ink-3">Net (FCFA)</dt>
                  </div>
                </dl>

                {/* `relative` : ces gestes sont posés **au-dessus** du voile du
                    lien de titre, comme le cœur de `ResourceCard` le fait avec
                    son `z-[3]`. Sans cela, un clic sur « Archiver » ouvrirait
                    l'éditeur. */}
                <div className="relative col-span-2 flex flex-wrap gap-2 sm:col-auto">
                  {course.status === "published" ? (
                    <BtnLink href={`/ressources/${course.slug}`} variant="t" size="sm">
                        <ExternalLink aria-hidden="true" />
                        <span className="sr-only">Voir la fiche publique de </span>
                        Voir
                    </BtnLink>
                  ) : null}
                  <CourseActions course={course} />
                </div>
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
