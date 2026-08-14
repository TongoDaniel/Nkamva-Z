import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { Avatar } from "@/components/nk/avatar";
import { getAuthContext } from "@/lib/api";
import {
  listSubscriptionCharges, getSubscriptionStats, SUBSCRIPTION_GRACE_DAYS,
} from "@/lib/subscriptions";
import { CADENCE_LABELS } from "@/lib/pricing";
import { fmtFcfa, fmtDate } from "@/lib/format";
import { SettleAction } from "./settle-action";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Abonnements",
  robots: { index: false },
};

const PAGE_SIZE = 20;
const TABS: Array<{ value: string; label: string }> = [
  { value: "DUE", label: "À régler" },
  { value: "SETTLED", label: "Réglées" },
  { value: "WAIVED", label: "Offertes" },
  { value: "all", label: "Toutes" },
];

const CHARGE_TONES: Record<string, "ok" | "warn" | "muted"> = {
  DUE: "warn",
  SETTLED: "ok",
  WAIVED: "muted",
};

const PROFILE_TONES: Record<string, "ok" | "warn" | "bad"> = {
  ACTIVE: "ok",
  PAST_DUE: "warn",
  SUSPENDED: "bad",
  CANCELED: "bad",
};

export default async function AbonnementsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  // Décision 7 — les abonnements relèvent de Finances.
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.statut) ? sp.statut! : "DUE";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listSubscriptionCharges({
      status: tab === "all" ? undefined : (tab as "DUE" | "SETTLED" | "WAIVED"),
      page,
      pageSize: PAGE_SIZE,
    }),
    getSubscriptionStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/abonnements?statut=${target}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <>
      <AdminHead
        title="Abonnements formateurs"
        lead="Une ligne par période facturée. Aucun prélèvement automatique n'existe : c'est le constat du règlement, ici, qui lève un impayé."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="gold" value={fmtFcfa(stats.dueTotalFcfa)} label={`${stats.due} période(s) à régler`} />
        <StatTile tone="clay" value={stats.nearSuspension} label="proches de la suspension" />
        <StatTile tone="blue" value={stats.suspended} label="formateurs suspendus" />
        <StatTile tone="brand" value={fmtFcfa(stats.settledTotalFcfa)} label="encaissé au total" />
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

      <AdminCard title={`${result.total} période${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Rien dans cet état"
            description="Aucune période d'abonnement ici pour le moment."
          />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((charge) => {
              const trainer = charge.trainerProfile.user;
              const name = trainer.fullName ?? trainer.email;
              const suspensionAt = charge.trainerProfile.subscriptionPastDueAt
                ? new Date(
                    charge.trainerProfile.subscriptionPastDueAt.getTime() +
                      SUBSCRIPTION_GRACE_DAYS * 86_400_000,
                  )
                : null;

              return (
                <li
                  key={charge.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">{name}</b>
                    <small className="block truncate text-[13px] text-ink-3">
                      {CADENCE_LABELS[charge.cadence]} · {fmtDate(charge.periodStart)} →{" "}
                      {fmtDate(charge.periodEnd)}
                      {charge.discountLabel ? ` · ${charge.discountLabel}` : ""}
                    </small>
                  </div>

                  <span className="text-right">
                    <b className="block font-display text-[15px] font-extrabold">
                      {charge.amountDueFcfa === 0 ? "Offerte" : fmtFcfa(charge.amountDueFcfa)}
                    </b>
                    {charge.discountFcfa > 0 ? (
                      <span className="text-[13px] text-ink-3">
                        remise {fmtFcfa(charge.discountFcfa)}
                      </span>
                    ) : null}
                  </span>

                  <StPill tone={CHARGE_TONES[charge.status] ?? "muted"}>
                    {charge.status === "DUE"
                      ? "À régler"
                      : charge.status === "SETTLED"
                        ? "Réglée"
                        : "Offerte"}
                  </StPill>

                  <StPill tone={PROFILE_TONES[charge.trainerProfile.subscriptionStatus] ?? "muted"}>
                    {charge.trainerProfile.subscriptionStatus}
                  </StPill>

                  {charge.status === "DUE" && suspensionAt ? (
                    <span className="text-[13px] text-ink-3">
                      suspension le {fmtDate(suspensionAt)}
                    </span>
                  ) : null}

                  {charge.status === "DUE" ? (
                    <SettleAction
                      chargeId={charge.id}
                      amountFcfa={charge.amountDueFcfa}
                      trainerName={name}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination des abonnements" className="flex flex-wrap justify-center gap-2 pt-5">
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
        Un formateur suspendu voit ses ressources retirées du catalogue, jamais l&apos;accès de
        ceux qui les ont achetées. Constater un règlement le remet en règle, mais{" "}
        <b className="font-bold text-ink-2">ne republie rien</b> : ses ressources sont sorties du
        catalogue sur décision, elles y reviennent sur décision.
      </p>
    </>
  );
}
