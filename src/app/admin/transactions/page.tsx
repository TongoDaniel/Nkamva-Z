import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { listAllPurchases, getPurchaseStats } from "@/lib/purchases";
import { fmtFcfa, fmtDate } from "@/lib/format";
import type { PaymentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transactions",
  robots: { index: false },
};

const PAGE_SIZE = 20;

const TABS: Array<{ value: string; label: string }> = [
  { value: "SUCCEEDED", label: "Encaissées" },
  { value: "PENDING", label: "En attente" },
  { value: "FAILED", label: "Échouées" },
  { value: "refunded", label: "Remboursées" },
  { value: "all", label: "Toutes" },
];

const STATUS_TONES: Record<string, "ok" | "warn" | "bad" | "muted"> = {
  SUCCEEDED: "ok",
  PENDING: "warn",
  FAILED: "bad",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  // Décision 7 — les transactions relèvent de Finances. Modération n'y a aucun
  // accès, symétrique de son monopole sur les pièces d'identité.
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.statut) ? sp.statut! : "SUCCEEDED";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listAllPurchases({
      providerStatus:
        tab === "all" || tab === "refunded" ? undefined : (tab as PaymentStatus),
      refunded: tab === "refunded" ? true : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    getPurchaseStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/transactions?statut=${target}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <>
      <AdminHead
        title="Transactions"
        lead="Les achats encaissés, avec la répartition figée au moment de la vente. Ce registre lit ce qui a été snapshoté ; il ne recalcule rien."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="brand" value={fmtFcfa(stats.grossFcfa)} label="encaissé, hors remboursés" />
        <StatTile tone="gold" value={fmtFcfa(stats.platformShareFcfa)} label="part NkamVa" />
        <StatTile tone="blue" value={fmtFcfa(stats.trainerShareFcfa)} label="part formateurs" />
        <StatTile
          tone="clay"
          value={fmtFcfa(stats.refundedFcfa)}
          label={`remboursé · ${stats.refundedCount} vente${stats.refundedCount > 1 ? "s" : ""}`}
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

      <AdminCard title={`${result.total} transaction${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Aucune transaction"
            description="Rien dans cet état pour le moment."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[13px] font-bold uppercase tracking-wide text-ink-3">
                  <th scope="col" className="py-2 pr-4">Date</th>
                  <th scope="col" className="py-2 pr-4">Acheteur</th>
                  <th scope="col" className="py-2 pr-4">Objet</th>
                  <th scope="col" className="py-2 pr-4 text-right">Montant</th>
                  <th scope="col" className="py-2 pr-4 text-right">Part NkamVa</th>
                  <th scope="col" className="py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-line-2 last:border-b-0">
                    <td className="py-3 pr-4 text-[13px] text-ink-2">
                      {fmtDate(purchase.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="block max-w-[22ch] truncate text-[13.5px] font-bold">
                        {purchase.learner.fullName ?? purchase.learner.email}
                      </span>
                      <span className="block max-w-[22ch] truncate text-[13px] text-ink-3">
                        {purchase.trainerProfile.user.fullName ??
                          purchase.trainerProfile.user.email}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="block max-w-[28ch] truncate text-[13px]">
                        {purchase.course?.title ??
                          (purchase.community ? `Communauté · ${purchase.community.name}` : "—")}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-[13.5px] font-bold">
                      {fmtFcfa(purchase.amountFcfa)}
                    </td>
                    <td className="py-3 pr-4 text-right text-[13px] text-ink-2">
                      {fmtFcfa(purchase.platformShareFcfa)}
                      <span className="ml-1 text-[13px] text-ink-3">
                        {Math.round(purchase.commissionRate * 100)} %
                      </span>
                    </td>
                    <td className="py-3">
                      {purchase.refundedAt ? (
                        <StPill tone="muted">Remboursée</StPill>
                      ) : (
                        <StPill tone={STATUS_TONES[purchase.providerStatus] ?? "muted"}>
                          {purchase.providerStatus}
                        </StPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination des transactions" className="flex flex-wrap justify-center gap-2 pt-5">
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
