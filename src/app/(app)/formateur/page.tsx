import type { ComponentType } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  Coins,
  CreditCard,
  Library,
  Plus,
  Radio,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { getAuthContext } from "@/lib/api";
import { listTrainerCourses } from "@/lib/courses";
import { getTrainerOverview, getSalesByCourse, getTrainerWallet } from "@/lib/trainer-stats";
import { getTrainerVisibility } from "@/lib/trainers";
import { fmtFcfa, fmtNumber } from "@/lib/format";
import { COURSE_STATUS } from "./ressources/course-status";
import { TRAINER_SECTIONS } from "./sections";
import { VisibilityNotice } from "./visibility-notice";
import { walletTileLabel } from "./wallet-label";

export const dynamic = "force-dynamic";

/**
 * Les icônes des sections, attachées ici : `sections.ts` est lu des deux côtés
 * de la frontière serveur/client et ne peut donc pas en porter.
 */
const SECTION_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/formateur/ressources": Library,
  "/formateur/communaute": Users,
  "/mes-lives": Radio,
  "/formateur/portefeuille": Wallet,
  "/formateur/abonnement": CreditCard,
  "/formateur/litiges": Scale,
};

export const metadata: Metadata = {
  title: "Espace formateur",
  robots: { index: false },
};

export default async function FormateurPage() {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;
  const trainerId = auth.user.trainerId;

  const [overview, courses, sales, wallet, visibility] = await Promise.all([
    getTrainerOverview(trainerId),
    listTrainerCourses(trainerId),
    getSalesByCourse(trainerId),
    getTrainerWallet(trainerId),
    getTrainerVisibility(trainerId),
  ]);

  const best = [...courses]
    .map((c) => ({ course: c, sales: sales.get(c.id)?.salesCount ?? 0 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 4);
  const maxSales = Math.max(1, ...best.map((b) => b.sales));

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Espace formateur"
        lead="Vos publications, vos ventes et votre solde, calculés sur les achats réellement encaissés."
        actions={
          <BtnLink href="/formateur/ressources/nouvelle">
              <Plus aria-hidden="true" />
              Publier une ressource
          </BtnLink>
        }
      />

      {/* Avant les chiffres : un formateur invisible des visiteurs doit
          l'apprendre en arrivant, pas après avoir lu son solde. */}
      {visibility ? <VisibilityNotice visibility={visibility} /> : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<BookOpen />}
          tone="blue"
          value={overview.courseCount}
          label={`ressource${overview.courseCount > 1 ? "s" : ""} · ${overview.publishedCount} publiée${overview.publishedCount > 1 ? "s" : ""}`}
        />
        <StatTile
          icon={<TrendingUp />}
          tone="brand"
          value={fmtNumber(overview.salesCount)}
          label="ventes confirmées"
        />
        <StatTile
          icon={<Coins />}
          tone="clay"
          value={fmtNumber(overview.netRevenueFcfa)}
          suffix="FCFA"
          label="revenus nets cumulés"
        />
        <StatTile
          icon={<Wallet />}
          tone="gold"
          value={fmtNumber(wallet.withdrawableFcfa)}
          suffix="FCFA"
          label={walletTileLabel(wallet)}
        />
      </div>

      <section aria-labelledby="sections" className="mb-10">
        <h2 id="sections" className="mb-4 text-[17px] font-bold">
          Gérer votre activité
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TRAINER_SECTIONS.map((section) => {
            const Icon = SECTION_ICONS[section.href] ?? BookOpen;
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="group flex h-full items-start gap-4 rounded-nk-lg border border-line bg-card px-5 py-4 shadow-nk-sm transition duration-150 hover:border-brand hover:shadow-nk"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
                    aria-hidden="true"
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="flex items-center gap-1.5 text-[14.5px] font-bold text-ink group-hover:text-brand">
                      {section.label}
                      <ChevronRight
                        className="size-4 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
                        aria-hidden="true"
                      />
                    </b>
                    <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">
                      {section.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="meilleures" className="mb-10">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="meilleures" className="text-[17px] font-bold">
            Vos ressources
          </h2>
          <Link href="/formateur/ressources" className="nk-tap text-[13px] font-bold text-brand">
            Tout gérer
          </Link>
        </div>

        {courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="Aucune ressource pour l'instant"
            description="Créez votre première ressource : vous fixez le format, le contenu et le prix, en FCFA."
            action={
              <BtnLink href="/formateur/ressources/nouvelle">Créer une ressource</BtnLink>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {best.map(({ course, sales: salesCount }) => {
              const status = COURSE_STATUS[course.status] ?? COURSE_STATUS.draft;
              const net = sales.get(course.id)?.netRevenueFcfa ?? 0;
              return (
                <li
                  key={course.id}
                  className="group relative flex flex-wrap items-center gap-4 rounded-nk-lg border border-line bg-card px-5 py-4 shadow-nk-sm transition duration-150 hover:border-brand hover:shadow-nk focus-within:border-brand focus-within:shadow-nk"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
                    aria-hidden="true"
                  >
                    <FormatGlyph format={course.format} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14.5px] font-bold">
                      {/* Même motif que `ResourceCard` : le lien du titre est
                          étendu à toute la ligne par `after:inset-0`. Une seule
                          cible cliquable, et le nom accessible reste le titre —
                          ce qu'une ligne entière transformée en lien perdrait. */}
                      <Link
                        href={`/formateur/ressources/${course.id}`}
                        className="text-ink after:absolute after:inset-0 after:content-[''] group-hover:text-brand"
                      >
                        {course.title}
                      </Link>
                    </h3>
                    <p className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
                      <StPill tone={status.tone}>{status.label}</StPill>
                      <span>{formatLabel(course.format)}</span>
                      <span>{fmtFcfa(course.priceFcfa)}</span>
                    </p>
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line-2"
                      aria-hidden="true"
                    >
                      <i
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${Math.round((salesCount / maxSales) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-right text-[13px] text-ink-2">
                    <b className="block font-display text-[17px] font-extrabold text-ink">
                      {fmtNumber(salesCount)}
                    </b>
                    vente{salesCount > 1 ? "s" : ""} · {fmtFcfa(net)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="flex flex-wrap items-center justify-between gap-3 rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
        <span>
          Votre solde est crédité à chaque vente confirmée. Les retraits passent par un
          compte vérifié et votre score de confiance.
        </span>
        <Link href="/formateur/portefeuille" className="nk-tap font-bold text-brand">
          Ouvrir le portefeuille
        </Link>
      </p>
    </div>
  );
}
