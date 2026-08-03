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
import { listPayouts, getPayoutStats, PAYOUT_REVIEW_SLA_HOURS } from "@/lib/payouts";
import { fmtFcfa } from "@/lib/format";
import { PAYOUT_STATUS, PAYOUT_METHOD_TYPE_LABELS, hoursSince, formatAge } from "./status";
import type { PayoutStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Retraits",
  robots: { index: false },
};

const PAGE_SIZE = 20;
const TABS: Array<{ value: string; label: string }> = [
  { value: "IN_REVIEW", label: "À instruire" },
  { value: "APPROVED", label: "À virer" },
  { value: "AUTO_APPROVED", label: "Auto-approuvés" },
  { value: "FAILED", label: "En échec" },
  { value: "PAID", label: "Versés" },
  { value: "REJECTED", label: "Rejetés" },
  { value: "all", label: "Tous" },
];

export default async function RetraitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  // Décision 20 — Modération n'a aucun accès aux finances.
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.status) ? sp.status! : "IN_REVIEW";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listPayouts({
      status: status === "all" ? undefined : (status as PayoutStatus),
      page,
      pageSize: PAGE_SIZE,
    }),
    getPayoutStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/retraits?status=${target}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <>
      <AdminHead
        title="Retraits"
        lead="Les demandes les plus anciennes en premier. Le solde du formateur n'est débité qu'au moment où le versement est constaté."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="gold" value={stats.pendingReview} label="à instruire" />
        <StatTile
          tone="clay"
          value={stats.slaBreaches}
          label={`hors délai (> ${PAYOUT_REVIEW_SLA_HOURS} h)`}
        />
        <StatTile
          tone="blue"
          value={fmtFcfa(stats.inFlightTotalFcfa)}
          label="immobilisé, pas encore débité"
        />
        <StatTile tone="brand" value={fmtFcfa(stats.paidTotalFcfa)} label="versé au total" />
      </div>

      <nav aria-label="Filtrer par statut" className="mb-5">
        <ul className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1">
          {TABS.map((tab) => (
            <li key={tab.value}>
              <Link
                href={href(tab.value)}
                aria-current={tab.value === status ? "page" : undefined}
                className={
                  tab.value === status
                    ? "block whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-paper"
                    : "block whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-bold text-ink-2 hover:text-ink"
                }
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <AdminCard title={`${result.total} demande${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Rien à instruire ici"
            description="Aucune demande de retrait dans cet état pour le moment."
          />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((payout) => {
              const state = PAYOUT_STATUS[payout.status] ?? {
                label: payout.status,
                tone: "muted" as const,
                help: "",
              };
              const name = payout.trainerProfile.user.fullName ?? payout.trainerProfile.user.email;
              const age = hoursSince(payout.submittedAt);
              const late = payout.status === "IN_REVIEW" && age > PAYOUT_REVIEW_SLA_HOURS;

              return (
                <li
                  key={payout.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">{name}</b>
                    <small className="block truncate text-[12.3px] text-ink-3">
                      {PAYOUT_METHOD_TYPE_LABELS[payout.payoutMethod.type] ?? payout.payoutMethod.type}
                      {payout.isFirstPayout ? " · premier retrait" : ""}
                    </small>
                  </div>
                  <b className="font-display text-[16px] font-extrabold">
                    {fmtFcfa(payout.amountFcfa)}
                  </b>
                  <StPill tone={state.tone}>{state.label}</StPill>
                  <span
                    className={late ? "text-[12.5px] font-bold text-danger" : "text-[12.5px] text-ink-2"}
                  >
                    {late ? "Hors délai · " : ""}
                    {formatAge(age)}
                  </span>
                  <Btn asChild variant="o" size="sm">
                    <Link href={`/admin/retraits/${payout.id}`}>
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
          <nav aria-label="Pagination des retraits" className="flex justify-center gap-2 pt-5">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={href(status, p)}
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
