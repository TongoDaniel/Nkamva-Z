import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  Coins,
  FileEdit,
  Library,
  MessageSquare,
  Plus,
  Receipt,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { EmptyState } from "@/components/nk/empty-state";
import { ResourceCard } from "@/components/nk/resource-card";
import { ProgressRing } from "@/components/nk/progress-ring";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { LiveSessionRow } from "@/components/nk/live-row";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { getAuthContext } from "@/lib/api";
import { listMyResources } from "@/lib/access";
import { searchCourses } from "@/lib/catalog";
import { listTrainerCourses } from "@/lib/courses";
import { listAgenda, type AgendaSession } from "@/lib/lives";
import { countActivePaidMembers } from "@/lib/communities";
import { countUnreadMessages } from "@/lib/messaging";
import { getMySubscription } from "@/lib/subscriptions";
import { getTrainerStorage } from "@/lib/storage-tiers";
import { PAYOUT_MIN_AMOUNT_FCFA } from "@/lib/payouts";
import { walletTileLabel } from "../formateur/wallet-label";
import {
  countDisputesToContest,
  getSalesByCourse,
  getTrainerOverview,
  getTrainerWallet,
} from "@/lib/trainer-stats";
import { db } from "@/lib/db";
import { fmtFcfa, fmtNumber, fmtDate } from "@/lib/format";
import { readingPercent, type CourseListItem, type ResourceItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";
import { COURSE_STATUS } from "../formateur/ressources/course-status";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accueil",
  robots: { index: false },
};

const s = (n: number) => (n > 1 ? "s" : "");

// ==========================================================================
// Les pièces communes aux deux arrangements
// ==========================================================================
// Un formateur reste un apprenant : c'est la règle que la barre de navigation
// applique déjà (`app-shell.tsx`). Le tableau de bord ajoute, il ne remplace
// pas — « Reprendre » et « Nouveautés » sont donc les mêmes blocs des deux
// côtés, seulement placés différemment.

/** Prochaines séances — celles qu'on anime et celles qu'on suit, même liste. */
function NextLives({ sessions }: { sessions: AgendaSession[] }) {
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
function ResumeList({ items }: { items: ResourceItem[] }) {
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
function Novelties({ courses }: { courses: CourseListItem[] }) {
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
const BANNER_TONES = {
  danger: "border-danger/30 bg-danger-tint text-danger",
  gold: "border-gold/30 bg-gold-tint text-gold-ink",
  clay: "border-clay/30 bg-clay-tint text-clay-ink",
  muted: "border-line bg-card text-ink-2",
} as const;

interface StateBanner {
  key: string;
  tone: keyof typeof BANNER_TONES;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

/** Une file à traiter : ce qui réclame une action, et le lien pour la faire. */
interface Task {
  key: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  href: string;
}

function TaskRow({ task }: { task: Task }) {
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
function StepRow({ done, label, detail, href }: { done: boolean; label: string; detail: string; href: string }) {
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

// ==========================================================================

export default async function AccueilPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;
  const userId = auth.user.id;
  const trainerId = auth.user.trainerId ?? null;

  // Le middleware renvoie ici quand un compte non-admin tente d'ouvrir `/admin`.
  // Sans ce message, la redirection ressemble à un clic perdu.
  const { erreur } = await searchParams;

  // Tout part en une seule vague : ce qui coûte face à une base distante n'est
  // pas le nombre de requêtes, c'est la profondeur de cascade.
  const [mine, suggestions, profile, agenda, trainer] = await Promise.all([
    listMyResources(userId, "all", 1, 20),
    // Six et non trois : les publications du formateur lui-même sont retirées
    // plus bas, et un filtre appliqué après la pagination viderait la rangée.
    searchCourses({ sort: "newest", page: 1, pageSize: 6 }),
    db.user.findUnique({
      where: { id: userId },
      select: { fullName: true, preferredName: true },
    }),
    listAgenda(userId, trainerId),
    trainerId ? loadTrainerPanel(trainerId, userId) : null,
  ]);

  // La maquette accueille par le prénom. `preferredName` prime quand il existe ;
  // sinon on prend le premier mot du nom complet, faute de champ dédié.
  const firstName =
    profile?.preferredName?.trim() || profile?.fullName?.trim().split(/\s+/)[0] || null;

  const items = mine.items as unknown as ResourceItem[];
  const inProgress = items.filter((i) => i.isStarted && !i.accessSuspended).slice(0, 3);
  const suggested = (suggestions.items as unknown as CourseListItem[])
    .filter((c) => !items.some((i) => i.course?.id === c.id))
    // Un formateur voyait sa propre ressource proposée à l'achat parmi les
    // nouveautés : le filtre ci-dessus écarte ce qu'il a **acheté**, pas ce
    // qu'il a **publié**.
    .filter((c) => c.trainerProfile.id !== trainerId)
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

  // ------------------------------------------------------------------
  // Arrangement apprenant — inchangé, sauf l'agenda qui s'y ajoute.
  // ------------------------------------------------------------------
  if (!trainer) {
    return (
      <div className="nk-wrap pb-16">
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

        <section aria-labelledby="reprendre" className="mb-10">
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

  // ------------------------------------------------------------------
  // Arrangement formateur — le poste de pilotage
  // ------------------------------------------------------------------
  const { overview, wallet, subscription, storage, activeMembers, disputesToContest, unreadMessages, courses, sales } =
    trainer;

  // Deux états refusent l'écriture (décision 68 et arbitrage 5) : proposer
  // « Publier » mènerait alors droit à un refus.
  const canWrite =
    subscription?.subscriptionStatus !== "SUSPENDED" &&
    subscription?.subscriptionStatus !== "CANCELED";

  // --- Bandeaux, par priorité décroissante ---
  const banners: StateBanner[] = [];
  if (subscription?.subscriptionStatus === "CANCELED") {
    banners.push({
      key: "canceled",
      tone: "muted",
      title: "Votre espace est en état de solde",
      detail:
        "Vous ne publiez plus et n'animez plus. Il reste ouvert pour retirer votre solde, suivre vos litiges et consulter vos factures.",
      href: "/formateur/abonnement",
      cta: "Mon abonnement",
    });
  } else if (subscription?.subscriptionStatus === "SUSPENDED") {
    banners.push({
      key: "suspended",
      tone: "danger",
      title: "Abonnement suspendu — vos ressources sont retirées du catalogue",
      detail:
        "Celles et ceux qui les ont achetées y accèdent toujours. Le règlement de l'échéance les remet en vente.",
      href: "/formateur/abonnement",
      cta: "Régler",
    });
  }
  if (wallet.negativeSince) {
    banners.push({
      key: "negative",
      tone: "danger",
      title: "Votre solde est négatif",
      detail: `Depuis le ${fmtDate(wallet.negativeSince)}. Aucun retrait n'est possible tant qu'il n'est pas revenu à l'équilibre.`,
      href: "/formateur/portefeuille",
      cta: "Portefeuille",
    });
  }
  if (subscription?.subscriptionStatus === "PAST_DUE") {
    banners.push({
      key: "past-due",
      tone: "gold",
      title: `Échéance à régler — ${fmtFcfa(subscription.dueTotalFcfa)}`,
      detail: subscription.suspensionAt
        ? `Vos ressources restent en vente jusqu'au ${fmtDate(subscription.suspensionAt)}.`
        : "Vos ressources restent en vente pour l'instant.",
      href: "/formateur/abonnement",
      cta: "Régler",
    });
  }
  if (storage.quotaBytes > 0 && storage.usedBytes / storage.quotaBytes >= 0.9) {
    banners.push({
      key: "storage",
      tone: "clay",
      title: "Votre stockage est presque plein",
      detail: `${Math.round((storage.usedBytes / storage.quotaBytes) * 100)} % du quota est occupé. Au-delà, aucun téléversement ne passe.`,
      href: "/formateur/portefeuille",
      cta: "Ajouter un palier",
    });
  }
  const shownBanners = banners.slice(0, 2);

  // --- Files à traiter ---
  const tasks: Task[] = [];
  if (overview.draftCount > 0) {
    tasks.push({
      key: "drafts",
      icon: <FileEdit />,
      label: `${overview.draftCount} brouillon${s(overview.draftCount)} à publier`,
      detail: "Ils ne sont visibles de personne tant qu'ils ne sont pas publiés.",
      href: "/formateur/ressources",
    });
  }
  if (disputesToContest > 0) {
    tasks.push({
      key: "disputes",
      icon: <Scale />,
      label: `${disputesToContest} litige${s(disputesToContest)} sans contestation`,
      detail: "La modération décidera sans votre version tant que vous n'aurez rien déposé.",
      href: "/formateur/litiges",
    });
  }
  if (wallet.withdrawableFcfa >= PAYOUT_MIN_AMOUNT_FCFA) {
    tasks.push({
      key: "payout",
      icon: <Wallet />,
      label: `${fmtFcfa(wallet.withdrawableFcfa)} retirables`,
      detail: "Au-dessus du minimum de retrait. Le virement passe par un compte vérifié.",
      href: "/formateur/portefeuille",
    });
  }
  if (unreadMessages > 0) {
    tasks.push({
      key: "messages",
      icon: <MessageSquare />,
      label: `${unreadMessages} message${s(unreadMessages)} non lu${s(unreadMessages)}`,
      detail: "Des apprenants attendent une réponse.",
      href: "/messagerie",
    });
  }

  // Régime de démarrage : aucune ressource publiée. Une rangée de zéros ne dit
  // rien à qui n'a pas encore commencé — la liste des étapes, si.
  const starting = overview.publishedCount === 0;

  // --- Vos publications : les mieux vendues, plus le brouillon le plus récent ---
  const ranked = [...courses]
    .map((c) => ({
      course: c,
      salesCount: sales.get(c.id)?.salesCount ?? 0,
      netFcfa: sales.get(c.id)?.netRevenueFcfa ?? 0,
    }))
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 3);
  // `listTrainerCourses` trie par création décroissante : le premier brouillon
  // rencontré est le plus récent.
  const latestDraft = courses.find((c) => c.status === "draft");
  const shownCourses =
    latestDraft && !ranked.some((r) => r.course.id === latestDraft.id)
      ? [...ranked, { course: latestDraft, salesCount: 0, netFcfa: 0 }]
      : ranked;
  const maxSales = Math.max(1, ...shownCourses.map((r) => r.salesCount));

  const lead =
    tasks.length === 0
      ? "Rien ne vous attend aujourd'hui."
      : tasks.length === 1
        ? "Une chose vous attend aujourd'hui."
        : `${tasks.length} choses vous attendent aujourd'hui.`;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title={firstName ? `Bonjour, ${firstName} !` : "Votre espace"}
        lead={lead}
        actions={
          canWrite ? (
            <BtnLink href="/formateur/ressources/nouvelle">
              <Plus aria-hidden="true" />
              Publier une ressource
            </BtnLink>
          ) : null
        }
      />

      {accessDenied}

      {shownBanners.length > 0 ? (
        <section aria-labelledby="etat-du-compte" className="mb-8 flex flex-col gap-3">
          <h2 id="etat-du-compte" className="sr-only">
            État de votre compte
          </h2>
          {shownBanners.map((banner) => (
            <div
              key={banner.key}
              className={`flex flex-wrap items-center gap-4 rounded-nk-lg border px-5 py-4 ${BANNER_TONES[banner.tone]}`}
            >
              <div className="min-w-0 flex-1">
                <b className="block text-[14px] font-bold">{banner.title}</b>
                <small className="block text-[13px] leading-relaxed opacity-90">{banner.detail}</small>
              </div>
              <BtnLink href={banner.href} size="sm" variant="o">
                {banner.cta}
              </BtnLink>
            </div>
          ))}
        </section>
      ) : null}

      {starting ? (
        <section
          aria-labelledby="demarrage"
          className="mb-8 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm"
        >
          <h2 id="demarrage" className="mb-1 text-[17px] font-bold">
            Vos premiers pas
          </h2>
          <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
            Vos chiffres apparaîtront ici dès votre première publication.
          </p>
          <ul className="flex flex-col">
            <StepRow
              done={overview.courseCount > 0}
              label="Créer une ressource"
              detail="Vous fixez le format, le contenu et le prix, en FCFA."
              href="/formateur/ressources/nouvelle"
            />
            <StepRow
              done={overview.publishedCount > 0}
              label="La publier au catalogue"
              detail="Un brouillon n'est visible de personne tant qu'il n'est pas publié."
              href="/formateur/ressources"
            />
            <StepRow
              done={activeMembers > 0}
              label="Accueillir votre premier membre"
              detail="Le salon d'abonnés, ses invitations et ses réglages."
              href="/formateur/communaute"
            />
          </ul>
        </section>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={<TrendingUp />}
            tone="brand"
            value={fmtNumber(overview.salesCount)}
            label={`vente${s(overview.salesCount)} confirmée${s(overview.salesCount)}`}
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
          <StatTile
            icon={<Users />}
            tone="blue"
            value={fmtNumber(activeMembers)}
            label={`membre${s(activeMembers)} actif${s(activeMembers)}`}
          />
        </div>
      )}

      {/* Colonne principale : l'activité de formateur, datée, donc prioritaire.
          Colonne latérale : l'apprenante, compacte mais jamais absente. */}
      <div className="grid gap-8 xl:grid-cols-3">
        <div className="flex flex-col gap-10 xl:col-span-2">
          <section aria-labelledby="a-traiter">
            <h2 id="a-traiter" className="mb-4 text-[17px] font-bold">
              À traiter
            </h2>
            {tasks.length === 0 ? (
              <p className="rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
                Rien n&apos;attend de décision de votre part : pas de brouillon en
                souffrance, pas de litige sans réponse, pas de message non lu.
              </p>
            ) : (
              <ul className="flex flex-col rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm">
                {tasks.map((task) => (
                  <TaskRow key={task.key} task={task} />
                ))}
              </ul>
            )}
          </section>

          {shownCourses.length > 0 ? (
            <section aria-labelledby="publications">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 id="publications" className="text-[17px] font-bold">
                  Vos publications
                </h2>
                <Link href="/formateur/ressources" className="nk-tap text-[13px] font-bold text-brand">
                  Tout gérer
                </Link>
              </div>
              <ul className="flex flex-col gap-3">
                {shownCourses.map(({ course, salesCount, netFcfa }) => {
                  const status = COURSE_STATUS[course.status] ?? COURSE_STATUS.draft;
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
                        vente{s(salesCount)} · {fmtFcfa(netFcfa)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-10">
          <NextLives sessions={nextLives} />

          <section aria-labelledby="reprendre">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="reprendre" className="text-[17px] font-bold">
                Reprendre
              </h2>
              <Link href="/mes-ressources" className="nk-tap text-[13px] font-bold text-brand">
                Tout voir
              </Link>
            </div>
            {inProgress.length === 0 ? (
              <p className="rounded-nk-lg border-[1.5px] border-dashed border-line bg-card/40 px-5 py-6 text-center text-[13px] leading-relaxed text-ink-2">
                Rien en cours.{" "}
                <Link href={routes.catalog} className="font-bold text-brand">
                  Explorer le catalogue
                </Link>
              </p>
            ) : (
              <ResumeList items={inProgress} />
            )}
          </section>
        </aside>
      </div>

      <Novelties courses={suggested} />
    </div>
  );
}

/**
 * Tout ce que le tableau de bord lit du côté formateur, en une seule vague.
 *
 * Les agrégats viennent des fonctions que les pages de destination utilisent
 * déjà : l'accueil ne recompte rien, donc il ne peut pas les contredire.
 */
async function loadTrainerPanel(trainerId: string, userId: string) {
  const [
    overview,
    wallet,
    subscription,
    storage,
    activeMembers,
    disputesToContest,
    unreadMessages,
    courses,
    sales,
  ] = await Promise.all([
    getTrainerOverview(trainerId),
    getTrainerWallet(trainerId),
    getMySubscription(trainerId),
    getTrainerStorage(trainerId),
    countActivePaidMembers(trainerId),
    countDisputesToContest(trainerId),
    countUnreadMessages(userId, trainerId),
    listTrainerCourses(trainerId),
    getSalesByCourse(trainerId),
  ]);

  return {
    overview,
    wallet,
    subscription,
    storage,
    activeMembers,
    disputesToContest,
    unreadMessages,
    courses,
    sales,
  };
}
