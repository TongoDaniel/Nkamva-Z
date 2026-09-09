// ==========================================================================
// Les blocs partagés par les deux accueils
// ==========================================================================
// Un formateur reste un apprenant, et depuis que son accueil **est** son
// espace (`/formateur`), les deux écrans ont besoin des mêmes pièces :
// « Reprendre », « Prochains directs », « Nouveautés » d'un côté, les bandeaux
// d'état, la file « À traiter » et le régime de démarrage de l'autre.
//
// Elles vivaient dans `accueil/page.tsx`, qui les rendait toutes les deux. Les
// sortir ici plutôt que les recopier : deux copies auraient divergé au premier
// correctif, et c'est exactement ce que `nav-entries.ts` a déjà appris pour la
// navigation.
//
// Module serveur : aucun `"use client"`, ces blocs ne font que rendre.
// ==========================================================================

import * as React from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { ResourceCard } from "@/components/nk/resource-card";
import { ProgressRing } from "@/components/nk/progress-ring";
import { StPill } from "@/components/nk/status-pill";
import { LiveSessionRow } from "@/components/nk/live-row";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import type { AgendaSession } from "@/lib/lives";
import { readingPercent, type CourseListItem, type ResourceItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

/** Le pluriel, partout pareil. */
export const s = (n: number) => (n > 1 ? "s" : "");

// ==========================================================================
// Les pièces communes aux deux arrangements
// ==========================================================================
// Un formateur reste un apprenant : c'est la règle que la barre de navigation
// applique déjà (`app-shell.tsx`). Le tableau de bord ajoute, il ne remplace
// pas — « Reprendre » et « Nouveautés » sont donc les mêmes blocs des deux
// côtés, seulement placés différemment.

/** Prochaines séances — celles qu'on anime et celles qu'on suit, même liste. */
export function NextLives({ sessions }: { sessions: AgendaSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <section aria-labelledby="prochains-directs">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="prochains-directs" className="text-[17px] font-bold">
          Prochains directs
        </h2>
        <Link href="/mes-lives" className="nk-tap text-[13px] font-bold text-brand">
          Mon agenda
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {sessions.map((session) => (
          <li key={session.id}>
            <LiveSessionRow session={session} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Les ressources commencées, en lignes compactes.
 *
 * L'anneau porte déjà la valeur en texte pour les lecteurs d'écran : la ligne
 * n'a donc pas de bouton « Reprendre » en plus du titre cliquable, qui serait
 * une seconde cible vers la même page.
 */
export function ResumeList({ items }: { items: ResourceItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const course = item.course;
        if (!course) return null;
        return (
          <li
            key={item.id}
            className="group relative flex items-center gap-3.5 rounded-nk-lg border border-line bg-card px-4 py-3.5 shadow-nk-sm transition duration-150 hover:border-brand focus-within:border-brand"
          >
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
              aria-hidden="true"
            >
              <FormatGlyph format={course.format} className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-bold">
                {/* Même motif que `ResourceCard` : le lien du titre est étendu
                    à toute la ligne par `after:inset-0`. Une seule cible, et le
                    nom accessible reste le titre. */}
                <Link
                  href={`/mes-ressources/${course.id}`}
                  className="text-ink after:absolute after:inset-0 after:content-[''] group-hover:text-brand"
                >
                  {course.title}
                </Link>
              </h3>
              <p className="truncate text-[13px] text-ink-2">{formatLabel(course.format)}</p>
            </div>
            <ProgressRing
              percent={readingPercent(
                item.courseView, course.format, course.durationSeconds, course.pageCount,
              )}
              downloaded={item.courseView?.downloaded ?? false}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Nouveautés du catalogue — jamais ses propres publications. */
export function Novelties({ courses }: { courses: CourseListItem[] }) {
  if (courses.length === 0) return null;
  return (
    <section aria-labelledby="suggestions" className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="suggestions" className="text-[17px] font-bold">
          Nouveautés du catalogue
        </h2>
        <Link href={routes.catalog} className="nk-tap text-[13px] font-bold text-brand">
          Tout le catalogue
        </Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((course, i) => (
          <ResourceCard key={course.id} course={course} space="app" eager={i === 0} />
        ))}
      </div>
    </section>
  );
}

// ==========================================================================
// Les pièces du tableau de bord formateur
// ==========================================================================

/**
 * Bandeau d'état. Deux au maximum sont rendus : au-delà, plus rien ne se
 * distingue et l'échéance d'abonnement se noie dans le quota de stockage.
 *
 * Pas de `role="alert"` : ce sont des états permanents, pas des annonces. Avec,
 * un lecteur d'écran réciterait l'échéance à chaque retour sur l'accueil.
 */
export const BANNER_TONES = {
  danger: "border-danger/30 bg-danger-tint text-danger",
  gold: "border-gold/30 bg-gold-tint text-gold-ink",
  clay: "border-clay/30 bg-clay-tint text-clay-ink",
  muted: "border-line bg-card text-ink-2",
} as const;

export interface StateBanner {
  key: string;
  tone: keyof typeof BANNER_TONES;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

/** Une file à traiter : ce qui réclame une action, et le lien pour la faire. */
export interface Task {
  key: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  href: string;
}

export function TaskRow({ task }: { task: Task }) {
  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-line-2 py-4 first:pt-0 last:border-b-0 last:pb-0">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-nk-sm bg-brand-tint text-brand [&_svg]:size-4"
        aria-hidden="true"
      >
        {task.icon}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-sm font-bold">{task.label}</b>
        <small className="text-[13px] text-ink-2">{task.detail}</small>
      </div>
      <BtnLink href={task.href} size="sm" variant="o">
        Ouvrir
      </BtnLink>
    </li>
  );
}

/** Une étape du régime de démarrage. */
export function StepRow({ done, label, detail, href }: { done: boolean; label: string; detail: string; href: string }) {
  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-line-2 py-4 first:pt-0 last:border-b-0 last:pb-0">
      <span
        className={
          done
            ? "grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white"
            : "grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-3"
        }
        aria-hidden="true"
      >
        {done ? <Check className="size-4" /> : <Circle className="size-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <b className={done ? "block text-sm font-bold text-ink-2 line-through" : "block text-sm font-bold"}>
          {label}
        </b>
        <small className="text-[13px] text-ink-2">{detail}</small>
      </div>
      {done ? (
        <StPill tone="ok">Fait</StPill>
      ) : (
        <BtnLink href={href} size="sm" variant="o">
          Ouvrir
        </BtnLink>
      )}
    </li>
  );
}
