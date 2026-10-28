import type { Metadata } from "next";
import { userAvatarSrc } from "@/lib/avatars";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Lock } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { SanctionActions } from "./sanction-actions";
import { EmptyState } from "@/components/nk/empty-state";
import { Avatar } from "@/components/nk/avatar";
import { getAuthContext } from "@/lib/api";
import { listUsers, getUserStats } from "@/lib/users-review";
import { fmtDate } from "@/lib/format";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Utilisateurs",
  robots: { index: false },
};

const PAGE_SIZE = 20;

const TABS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "LEARNER", label: "Apprenants" },
  { value: "TRAINER", label: "Formateurs" },
  { value: "ADMIN", label: "Administrateurs" },
  { value: "suspended", label: "Suspendus" },
];

const ROLE_LABELS: Record<string, string> = {
  LEARNER: "Apprenant",
  TRAINER: "Formateur",
  ADMIN: "Administrateur",
};

export default async function UtilisateursPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  // Décision 7 — Finances a une **lecture seule** sur les utilisateurs, le
  // Super-admin a tout. Modération n'est pas citée : elle n'y a pas accès.
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }
  // Finances lit, le Super-admin agit : les actions de sanction ne sont rendues
  // que pour lui.
  const isSuperAdmin = auth.user.adminRole === "SUPER_ADMIN";

  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.role) ? sp.role! : "all";
  const search = sp.q?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listUsers({
      role: tab === "all" || tab === "suspended" ? undefined : (tab as Role),
      suspended: tab === "suspended" ? true : undefined,
      search,
      page,
      pageSize: PAGE_SIZE,
    }),
    getUserStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/utilisateurs?role=${target}${search ? `&q=${encodeURIComponent(search)}` : ""}${
      targetPage > 1 ? `&page=${targetPage}` : ""
    }`;

  return (
    <>
      <AdminHead
        title="Utilisateurs"
        lead="L'annuaire des comptes actifs. Consultation seule : aucune action n'est exposée ici."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="brand" value={stats.learners} label="apprenants" />
        <StatTile tone="blue" value={stats.trainers} label="formateurs" />
        <StatTile tone="gold" value={stats.suspended} label="comptes suspendus" />
        <StatTile tone="clay" value={stats.pendingDeletion} label="suppressions demandées" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav aria-label="Filtrer par rôle" className="min-w-0 max-w-full">
          <ul className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1">
            {TABS.map((t) => (
              <li key={t.value}>
                <Link
                  href={href(t.value)}
                  aria-current={t.value === tab ? "page" : undefined}
                  className={
                    t.value === tab
                      ? "block whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-paper"
                      : "block whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-bold text-ink-2 hover:text-ink"
                  }
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Recherche en GET : l'URL reste partageable entre administrateurs. */}
        <form action="/admin/utilisateurs" className="flex w-full items-center gap-2 sm:w-auto">
          <input type="hidden" name="role" value={tab} />
          <label htmlFor="q" className="sr-only">
            Rechercher un compte
          </label>
          <input
            id="q"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Nom ou adresse e-mail"
            className="w-full rounded-full border-[1.5px] border-line bg-card px-4 py-2 text-base text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25 sm:w-[240px] sm:text-[13px]"
          />
        </form>
      </div>

      <AdminCard title={`${result.total} compte${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Aucun compte"
            description={search ? "Aucun compte ne correspond à cette recherche." : "Rien dans cette catégorie."}
          />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((user) => {
              const name = user.fullName ?? user.preferredName ?? user.email;
              return (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} src={userAvatarSrc(user)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">{name}</b>
                    <small className="block truncate text-[13px] text-ink-3">{user.email}</small>
                  </div>

                  <span className="text-[13px] font-bold text-ink-2">
                    {ROLE_LABELS[user.role] ?? user.role}
                    {user.adminRole ? ` · ${user.adminRole}` : ""}
                  </span>

                  {user.sanctionLevel === "BANNED" ? (
                    <StPill tone="bad">Exclu</StPill>
                  ) : user.sanctionLevel === "RESTRICTED" ? (
                    <StPill tone="warn">Restreint</StPill>
                  ) : user.deletionRequestedAt ? (
                    <StPill tone="warn">Suppression demandée</StPill>
                  ) : user.emailVerifiedAt ? (
                    <StPill tone="ok">Actif</StPill>
                  ) : (
                    <StPill tone="muted">E-mail non vérifié</StPill>
                  )}

                  <span className="text-[13px] text-ink-2">
                    Inscrit le {fmtDate(user.createdAt)}
                  </span>

                  {isSuperAdmin ? (
                    <SanctionActions
                      userId={user.id}
                      userName={name}
                      level={user.sanctionLevel}
                      isSuperAdmin={isSuperAdmin}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination des comptes" className="flex flex-wrap justify-center gap-2 pt-5">
            {Array.from({ length: Math.min(pages, 12) }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={href(tab, p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={
                  p === page
                    ? "grid size-9 place-items-center rounded-nk-sm bg-ink text-[13px] font-bold text-paper"
                    : "grid size-9 place-items-center rounded-nk-sm border border-line bg-card text-[13px] font-bold text-ink-2 hover:border-ink-3"
                }
              >
                {p}
              </Link>
            ))}
          </nav>
        ) : null}
      </AdminCard>

      <p className="mt-5 text-[13px] leading-relaxed text-ink-3">
        Une restriction écarte la parole sans retirer l&apos;accès. Une exclusion coupe la
        connexion et retire les ressources déjà payées : elle est réservée au Super-admin, et
        sa levée aussi. Changer un rôle reste impossible depuis cet écran.
      </p>
    </>
  );
}
