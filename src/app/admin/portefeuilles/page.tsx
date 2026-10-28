import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock, Wallet } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { getWalletOverview } from "@/lib/wallet-reconciliation";
import { fmtDate, fmtFcfa, fmtNumber } from "@/lib/format";
import { ReconcileButton } from "./reconcile-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portefeuilles",
  robots: { index: false },
};

const FIELD_LABELS: Record<string, string> = {
  reservedBalance: "Solde réservé",
  pendingPayoutBalance: "Retraits en cours",
};

export default async function PortefeuillesPage() {
  const auth = await getAuthContext();
  // Décision 7 — Finances **voit** les écarts, puisque c'est elle que le job
  // alerte ; seul le Super-admin **corrige**. Les deux routes exigent déjà le
  // Super-admin : cet écran ne fait qu'accorder l'affichage avec elles, plutôt
  // que de montrer à Finances un bouton qui lui renverrait un 403.
  const role = auth?.user.adminRole;
  if (role !== "SUPER_ADMIN" && role !== "FINANCES") redirect("/admin");
  const canCorrect = role === "SUPER_ADMIN";

  const { rows, checked, discrepancyCount, reconciliations } = await getWalletOverview();

  const negatives = rows.filter((r) => r.withdrawable < 0).length;
  const totalWithdrawable = rows.reduce((sum, r) => sum + r.withdrawable, 0);

  return (
    <>
      <AdminHead
        title="Portefeuilles"
        lead="Les soldes des formateurs, et les écarts entre le solde stocké et le solde recalculé. Rien n'est réparé automatiquement : la détection alerte, la correction est un acte explicite et tracé."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="brand" value={fmtNumber(checked)} label="portefeuilles" />
        {/* Ton fixe, et non conditionnel : c'est le nombre qui alarme, pas la
            couleur. Un ton qui bascule ferait aussi tomber à trois les quatre
            teintes distinctes d'une rangée de tuiles — la convention du
            back-office, vérifiée par `scripts/snapshot-admin.ts`. */}
        <StatTile
          tone="clay"
          value={fmtNumber(discrepancyCount)}
          label={`écart${discrepancyCount > 1 ? "s" : ""} de solde`}
        />
        <StatTile
          tone="gold"
          value={fmtNumber(negatives)}
          label={`solde${negatives > 1 ? "s" : ""} retirable${negatives > 1 ? "s" : ""} négatif${negatives > 1 ? "s" : ""}`}
        />
        <StatTile tone="blue" value={fmtFcfa(totalWithdrawable)} label="retirable au total" />
      </div>

      {discrepancyCount > 0 ? (
        <AdminCard title={`${discrepancyCount} écart${discrepancyCount > 1 ? "s" : ""} à instruire`} className="mb-6">
          <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
            Un écart signifie que le solde stocké ne correspond plus à la somme des
            réservations actives ou des versements en cours.{" "}
            <b className="font-bold text-ink">Corriger n&apos;explique pas l&apos;écart</b> : la
            cause se cherche dans le journal d&apos;audit du portefeuille avant, pas après.
            {canCorrect ? null : (
              <>
                {" "}
                La correction est réservée au Super-admin : signalez-lui cet écran.
              </>
            )}
          </p>
          <ul className="flex flex-col">
            {rows
              .filter((row) => row.discrepancies.length > 0)
              .flatMap((row) =>
                row.discrepancies.map((d) => (
                  <li
                    key={`${d.walletId}-${d.field}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-2 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm font-bold">{row.trainerName}</b>
                      <small className="text-[13px] text-ink-3">
                        {FIELD_LABELS[d.field] ?? d.field} · stocké {fmtFcfa(d.storedValue)} ·
                        recalculé {fmtFcfa(d.expectedValue)}
                      </small>
                    </div>
                    <StPill tone="bad">
                      {d.delta > 0 ? "+" : ""}
                      {fmtFcfa(d.delta)}
                    </StPill>
                    {canCorrect ? (
                      <ReconcileButton
                        walletId={d.walletId}
                        trainerName={row.trainerName}
                        field={d.field}
                        storedValue={d.storedValue}
                        expectedValue={d.expectedValue}
                        delta={d.delta}
                      />
                    ) : null}
                  </li>
                )),
              )}
          </ul>
        </AdminCard>
      ) : null}

      <AdminCard title="Soldes" className="mb-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Wallet />}
            title="Aucun portefeuille"
            description="Un portefeuille est créé au premier encaissement d'un formateur."
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => (
              <li
                key={row.walletId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line-2 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm font-bold">{row.trainerName}</b>
                  <small className="text-[13px] text-ink-3">
                    Solde {fmtFcfa(row.balance)} · réservé {fmtFcfa(row.reservedBalance)} · retraits
                    en cours {fmtFcfa(row.pendingPayoutBalance)}
                  </small>
                </div>
                {row.discrepancies.length > 0 ? (
                  <StPill tone="bad">
                    {row.discrepancies.length} écart{row.discrepancies.length > 1 ? "s" : ""}
                  </StPill>
                ) : null}
                {row.negativeSince ? (
                  <StPill tone="warn">Négatif depuis le {fmtDate(row.negativeSince)}</StPill>
                ) : null}
                <b
                  className={
                    row.withdrawable < 0
                      ? "whitespace-nowrap text-sm font-extrabold text-danger"
                      : "whitespace-nowrap text-sm font-extrabold"
                  }
                >
                  {fmtFcfa(row.withdrawable)}
                  <small className="ml-1 font-semibold text-ink-3">retirable</small>
                </b>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      {reconciliations.length > 0 ? (
        <AdminCard title="Corrections passées">
          <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
            Chaque correction est conservée avec son motif et son auteur. C&apos;est ce qui
            permet, des mois plus tard, d&apos;expliquer pourquoi un solde a bougé sans vente ni
            retrait.
          </p>
          <ul className="flex flex-col">
            {reconciliations.map((r) => (
              <li
                key={r.id}
                className="border-b border-line-2 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <b className="text-sm font-bold">{r.trainerName}</b>
                  <span className="text-[13px] text-ink-2">
                    {FIELD_LABELS[r.field] ?? r.field}
                  </span>
                  <span className="text-[13px] font-bold">
                    {fmtFcfa(r.previousValue)} → {fmtFcfa(r.newValue)}
                  </span>
                  <StPill tone={r.delta > 0 ? "info" : "warn"}>
                    {r.delta > 0 ? "+" : ""}
                    {fmtFcfa(r.delta)}
                  </StPill>
                  <span className="ml-auto whitespace-nowrap text-[13px] text-ink-3">
                    {fmtDate(r.createdAt)}
                    {r.reconciledBy ? ` · ${r.reconciledBy}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.reason}</p>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}

      <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-ink-3">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Le solde retirable vaut le solde moins les montants réservés par un litige et les
        retraits déjà engagés. Un solde négatif est autorisé (décision 13) ; passé soixante
        jours, il alerte Finances.
      </p>
    </>
  );
}
