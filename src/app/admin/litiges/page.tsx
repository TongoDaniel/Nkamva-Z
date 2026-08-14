import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gavel, Inbox } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { Avatar } from "@/components/nk/avatar";
import { getAuthContext } from "@/lib/api";
import { listDisputes, getDisputeStats } from "@/lib/dispute-review";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { DISPUTE_STATUS, REASON_LABELS } from "./dispute-status";
import type { DisputeStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Litiges",
  robots: { index: false },
};

const PAGE_SIZE = 20;
const TABS = [
  { value: "OPEN", label: "À prendre" },
  { value: "IN_REVIEW", label: "En examen" },
  { value: "WAITING_LEARNER", label: "Attente apprenant" },
  { value: "RESOLVED_REFUNDED", label: "Remboursés" },
  { value: "RESOLVED_REJECTED", label: "Écartés" },
  { value: "all", label: "Tous" },
];

export default async function AdminLitigesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.adminRole || !["MODERATION", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.status) ? sp.status! : "OPEN";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listDisputes({
      status: status === "all" ? undefined : (status as DisputeStatus),
      page,
      pageSize: PAGE_SIZE,
    }),
    getDisputeStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/litiges?status=${target}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <>
      <AdminHead
        title="Litiges"
        lead="Les dossiers dont l'activité est la plus ancienne remontent en premier."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="blue" value={stats.open} label="à prendre en charge" />
        <StatTile tone="brand" value={stats.inReview} label="en examen" />
        <StatTile tone="gold" value={stats.waitingLearner} label="en attente de l'apprenant" />
        <StatTile tone="clay" value={stats.refunded} label="remboursés" />
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

      <AdminCard title={`${result.total} dossier${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Rien à traiter ici" description="Aucun dossier dans cet état." />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((dispute) => {
              const state = DISPUTE_STATUS[dispute.status];
              const name = dispute.learner.fullName ?? dispute.learner.email;
              const unread = dispute.messages.length;
              return (
                <li
                  key={dispute.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">
                      {dispute.purchase.course?.title ?? "Ressource retirée"}
                    </b>
                    <small className="block truncate text-[13px] text-ink-3">
                      {name} · {REASON_LABELS[dispute.reason] ?? dispute.reason}
                    </small>
                  </div>
                  <StPill tone={state.tone}>{state.label}</StPill>
                  {unread > 0 ? (
                    <span className="rounded-full bg-gold px-2 py-0.5 text-[13px] font-extrabold text-[#241a02]">
                      {unread} non lu{unread > 1 ? "s" : ""}
                    </span>
                  ) : null}
                  <span className="whitespace-nowrap text-[13px] text-ink-2">
                    {fmtFcfa(dispute.disputedAmountFcfa)}
                  </span>
                  <span className="whitespace-nowrap text-[13px] text-ink-3">
                    {fmtDate(dispute.lastActivityAt)}
                  </span>
                  <BtnLink href={`/admin/litiges/${dispute.id}`} variant="o" size="sm">
                      <Gavel aria-hidden="true" />
                      Examiner
                  </BtnLink>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination des litiges" className="flex justify-center gap-2 pt-5">
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
