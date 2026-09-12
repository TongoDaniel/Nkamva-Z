import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Library, Receipt, Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { listMyResources } from "@/lib/access";
import { searchCourses } from "@/lib/catalog";
import { listAgenda } from "@/lib/lives";
import { db } from "@/lib/db";
import type { CourseListItem, ResourceItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";
import { NextLives, Novelties, ResumeList, s } from "./blocs";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accueil",
  robots: { index: false },
};

/**
 * L'accueil d'un apprenant.
 * ==========================================================================
 * Cette page portait deux écrans : celui-ci, et le tableau de bord du
 * formateur, choisi selon le rôle. Le second est parti dans `/formateur`, qui
 * en tenait déjà une version plus maigre — un poste de travail ne se rend pas à
 * deux adresses. Un formateur qui arrive ici, par le logo ou par un ancien
 * lien, y est renvoyé.
 *
 * Les blocs communs aux deux accueils — « Reprendre », « Prochains directs »,
 * « Nouveautés » — vivent dans `blocs.tsx` : un formateur reste un apprenant,
 * et les deux écrans en ont besoin.
 * ==========================================================================
 */
export default async function AccueilPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;
  const userId = auth.user.id;

  // Son accueil est son espace. La redirection garde le paramètre d'erreur :
  // c'est ici que le middleware renvoie un compte non-admin qui a tenté
  // `/admin`, et le message doit survivre au saut.
  const { erreur } = await searchParams;
  if (auth.user.trainerId) {
    redirect(erreur ? `/formateur?erreur=${encodeURIComponent(erreur)}` : "/formateur");
  }

  // Tout part en une seule vague : ce qui coûte face à une base distante n'est
  // pas le nombre de requêtes, c'est la profondeur de cascade.
  const [mine, suggestions, profile, agenda] = await Promise.all([
    listMyResources(userId, "all", 1, 20),
    searchCourses({ sort: "newest", page: 1, pageSize: 6 }),
    db.user.findUnique({
      where: { id: userId },
      select: { fullName: true, preferredName: true },
    }),
    listAgenda(userId, null),
  ]);

  // La maquette accueille par le prénom. `preferredName` prime quand il existe ;
  // sinon on prend le premier mot du nom complet, faute de champ dédié.
  const firstName =
    profile?.preferredName?.trim() || profile?.fullName?.trim().split(/\s+/)[0] || null;

  const items = mine.items as unknown as ResourceItem[];
  const inProgress = items.filter((i) => i.isStarted && !i.accessSuspended).slice(0, 3);
  const suggested = (suggestions.items as unknown as CourseListItem[])
    .filter((c) => !items.some((i) => i.course?.id === c.id))
    .slice(0, 3);
  const nextLives = agenda.slice(0, 2);

  const accessDenied =
    erreur === "acces-refuse" ? (
      <p
        role="alert"
        className="mb-8 rounded-nk border border-danger/30 bg-danger-tint px-5 py-4 text-[14px] font-semibold leading-relaxed text-danger"
      >
        Vous n&apos;avez pas les droits nécessaires pour accéder à cette page.
      </p>
    ) : null;

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        title={firstName ? `Bonjour, ${firstName} !` : "Votre espace"}
        lead="Reprenez là où vous en étiez, ou découvrez de nouvelles ressources."
      />
      {accessDenied}

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
              ressource{s(mine.counts.all)} achetée{s(mine.counts.all)}
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

      <section aria-labelledby="reprendre" className="mb-7 sm:mb-10">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="reprendre" className="text-[17px] font-bold">
            Reprendre
          </h2>
          <Link href="/mes-ressources" className="nk-tap text-[13px] font-bold text-brand">
            Tout voir
          </Link>
        </div>
        {inProgress.length === 0 ? (
          <EmptyState
            icon={<Library />}
            title="Rien en cours"
            description="Ouvrez une de vos ressources pour la retrouver ici la prochaine fois."
            action={<BtnLink href="/mes-ressources" variant="o">Mes ressources</BtnLink>}
          />
        ) : (
          <ResumeList items={inProgress} />
        )}
      </section>

      <NextLives sessions={nextLives} />
      <Novelties courses={suggested} />
    </div>
  );
}
