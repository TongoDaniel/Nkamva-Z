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
import { listPayoutMethods, getPayoutMethodStats } from "@/lib/payout-methods";
import { METHOD_STATUS, NATURE_LABELS, OPERATOR_LABELS, hoursSince, formatAge } from "./status";
import type { PayoutMethodVerificationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moyens de paiement",
  robots: { index: false },
};

const PAGE_SIZE = 20;
const TABS: Array<{ value: string; label: string }> = [
  { value: "PENDING_REVIEW", label: "À instruire" },
  { value: "BLOCKED", label: "Escalades" },
  { value: "VERIFIED", label: "Vérifiés" },
  { value: "REJECTED", label: "Refusés" },
  { value: "all", label: "Tous" },
];

export default async function MoyensDePaiementPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  // Décision 20 — Modération n'a aucun accès aux moyens de paiement, symétrique
  // de la décision 7 qui lui réserve les pièces d'identité.
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.status) ? sp.status! : "PENDING_REVIEW";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listPayoutMethods({
      status: status === "all" ? undefined : (status as PayoutMethodVerificationStatus),
      page,
      pageSize: PAGE_SIZE,
    }),
    getPayoutMethodStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/moyens-de-paiement?status=${target}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <>
      <AdminHead
        title="Moyens de paiement"
        lead="Les dossiers les plus anciens en premier. Aucune vérification n'est déclarative : on compare au nom légal relevé sur la pièce d'identité."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="gold" value={stats.pendingReview} label="à instruire" />
        <StatTile
          tone="clay"
          value={stats.slaBreaches}
          label={`hors délai (> ${stats.slaHours} h)`}
        />
        <StatTile tone="blue" value={stats.blocked} label="escalades ouvertes" />
        <StatTile tone="brand" value={stats.verified} label="vérifiés" />
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

      <AdminCard title={`${result.total} moyen${result.total > 1 ? "s" : ""} de paiement`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Rien à instruire ici"
            description="Aucun moyen de paiement dans cet état pour le moment."
          />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((method) => {
              const state = METHOD_STATUS[method.verificationStatus] ?? {
                label: method.verificationStatus,
                tone: "muted" as const,
                help: "",
              };
              const name = method.trainerProfile.user.fullName ?? method.trainerProfile.user.email;
              const age = hoursSince(method.createdAt);
              const late = method.verificationStatus === "PENDING_REVIEW" && age > stats.slaHours;

              return (
                <li
                  key={method.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">{name}</b>
                    <small className="block truncate text-[12.3px] text-ink-3">
                      {NATURE_LABELS[method.accountNature]} ·{" "}
                      {method.type === "BANK_IBAN"
                        ? "Virement bancaire"
                        : (method.mobileOperator && OPERATOR_LABELS[method.mobileOperator]) ??
                          "Mobile money"}
                    </small>
                  </div>
                  <StPill tone={state.tone}>{state.label}</StPill>
                  <span
                    className={
                      late
                        ? "text-[12.5px] font-bold text-danger"
                        : "text-[12.5px] text-ink-2"
                    }
                  >
                    {late ? "Hors délai · " : ""}
                    {formatAge(age)}
                  </span>
                  <Btn asChild variant="o" size="sm">
                    <Link href={`/admin/moyens-de-paiement/${method.id}`}>
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
          <nav aria-label="Pagination des moyens de paiement" className="flex justify-center gap-2 pt-5">
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
