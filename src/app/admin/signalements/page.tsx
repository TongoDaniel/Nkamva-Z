import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, ScanSearch } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { Btn } from "@/components/nk/button";
import { Avatar } from "@/components/nk/avatar";
import { getAuthContext } from "@/lib/api";
import { listReports, getReportStats } from "@/lib/reports";
import { fmtDate } from "@/lib/format";
import { REPORT_STATUS, TARGET_LABELS, REASON_LABELS } from "./status";
import type { ReportStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signalements",
  robots: { index: false },
};

const PAGE_SIZE = 20;
const TABS: Array<{ value: string; label: string }> = [
  { value: "OPEN", label: "À instruire" },
  { value: "UPHELD", label: "Retenus" },
  { value: "DISMISSED", label: "Rejetés" },
  { value: "all", label: "Tous" },
];

export default async function SignalementsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  // Décision 7 — les signalements relèvent de la Modération. Finances n'y a
  // aucun accès, symétrique de son monopole sur les moyens de paiement.
  if (!auth?.user.adminRole || !["MODERATION", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.statut) ? sp.statut! : "OPEN";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listReports({
      status: tab === "all" ? undefined : (tab as ReportStatus),
      page,
      pageSize: PAGE_SIZE,
    }),
    getReportStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/signalements?statut=${target}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <>
      <AdminHead
        title="Signalements"
        lead="Les plus anciens en premier. Retenir un signalement retire la ressource du catalogue ; les personnes qui l'ont achetée gardent leur accès."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="gold" value={stats.open} label="à instruire" />
        <StatTile tone="clay" value={stats.upheld} label="retenus" />
        <StatTile tone="blue" value={stats.dismissed} label="rejetés" />
        <StatTile
          tone="brand"
          value={stats.openByTarget.COURSE ?? 0}
          label="ressources visées, en attente"
        />
      </div>

      <nav aria-label="Filtrer par statut" className="mb-5">
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

      <AdminCard title={`${result.total} signalement${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Rien à instruire ici"
            description="Aucun signalement dans cet état pour le moment."
          />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((report) => {
              const state = REPORT_STATUS[report.status];
              const name = report.reporter.fullName ?? report.reporter.email;
              return (
                <li
                  key={report.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">
                      {TARGET_LABELS[report.targetType] ?? report.targetType} ·{" "}
                      {REASON_LABELS[report.reason] ?? report.reason}
                    </b>
                    <small className="block truncate text-[12.3px] text-ink-3">
                      Signalé par {name}
                      {report.detail ? ` — ${report.detail}` : ""}
                    </small>
                  </div>
                  <StPill tone={state.tone}>{state.label}</StPill>
                  <span className="text-[12.5px] text-ink-2">{fmtDate(report.createdAt)}</span>
                  <Btn asChild variant="o" size="sm">
                    <Link href={`/admin/signalements/${report.id}`}>
                      <ScanSearch aria-hidden="true" />
                      Instruire
                    </Link>
                  </Btn>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination des signalements" className="flex flex-wrap justify-center gap-2 pt-5">
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
    </>
  );
}
