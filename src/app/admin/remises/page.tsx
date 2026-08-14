// Registre des remises — arbitrage 105.
//
// Ouvert à **Finances**, qui accorde les remises (décision 60) et devait
// jusqu'ici s'en remettre à sa mémoire : le journal d'audit, seul endroit où
// une remise laissait une trace lisible, est réservé au Super-admin
// (décision 7). Un registre métier n'est pas un journal d'audit — le premier se
// consulte pour travailler, le second pour contrôler.
//
// **Consultation seule.** On accorde une remise depuis la tarification, on ne
// la retouche pas ici : une remise déjà appliquée est snapshotée sur
// l'abonnement (décision 57), la modifier après coup ne changerait rien à ce
// qui a été facturé et laisserait croire le contraire.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketPercent } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { listDiscountRegister } from "@/lib/pricing";
import { fmtFcfa, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Remises",
  robots: { index: false },
};

const KIND_LABELS: Record<string, string> = {
  CAMPAIGN: "Campagne",
  TRAINER: "Remise nominative",
  PROMO_CODE: "Code promo",
};

export default async function RemisesPage() {
  const auth = await getAuthContext();
  // Décision 60 — Finances accorde les remises, elle doit donc les relire.
  // La Modération n'a rien à faire dans les finances (décision 7).
  const role = auth?.user.adminRole;
  if (role !== "FINANCES" && role !== "SUPER_ADMIN") redirect("/admin");

  const rows = await listDiscountRegister();
  const now = new Date();

  const isActive = (r: (typeof rows)[number]) =>
    r.validFrom <= now &&
    (!r.validUntil || r.validUntil > now) &&
    (r.maxUses === null || r.usedCount < r.maxUses);

  const active = rows.filter(isActive);
  const nominatives = rows.filter((r) => r.kind === "TRAINER");

  return (
    <>
      <AdminHead
        title="Remises"
        lead="Ce qui a été accordé, par qui, et pour quel motif. Consultation seule."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Remises actives" value={String(active.length)} tone="brand" />
        <StatTile label="Nominatives" value={String(nominatives.length)} tone="gold" />
        <StatTile label="Enregistrées" value={String(rows.length)} tone="blue" />
      </div>

      <AdminCard title="Registre">
        {rows.length === 0 ? (
          <EmptyState
            icon={<TicketPercent aria-hidden="true" />}
            title="Aucune remise accordée"
            description="Les campagnes, remises nominatives et codes promo apparaîtront ici dès la première."
          />
        ) : (
          <>
            <ul className="flex flex-col">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1.5 border-b border-line-2 py-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="w-[130px] shrink-0 text-[13px] font-bold text-ink-2">
                      {KIND_LABELS[r.kind] ?? r.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                      {r.label}
                      {r.code ? (
                        <code className="ml-2 rounded bg-paper px-1.5 py-0.5 font-mono text-[13px] text-ink-3">
                          {r.code}
                        </code>
                      ) : null}
                    </span>
                    <span className="text-[13.5px] font-bold">−{fmtFcfa(r.amountFcfa)}</span>
                    {r.maxUses !== null ? (
                      <span className="text-[13px] tabular-nums text-ink-3">
                        {r.usedCount}/{r.maxUses}
                      </span>
                    ) : null}
                    {isActive(r) ? (
                      <StPill tone="ok">Active</StPill>
                    ) : (
                      <StPill tone="muted">Inactive</StPill>
                    )}
                  </div>

                  <p className="text-[13px] leading-relaxed text-ink-3">
                    Accordée le {fmtDate(r.createdAt)}
                    {r.grantedBy ? ` par ${r.grantedBy.name ?? r.grantedBy.email}` : ""}
                    {r.trainer ? ` · pour ${r.trainer.name ?? r.trainer.email}` : ""}
                    {r.validUntil ? ` · jusqu'au ${fmtDate(r.validUntil)}` : ""}
                  </p>

                  {/* Une remise nominative contourne la grille : son motif est
                      exigé à la création (décision 62), et c'est ici qu'il sert. */}
                  {r.reason ? (
                    <p className="rounded-nk-sm bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                      {r.reason}
                    </p>
                  ) : r.kind === "TRAINER" ? (
                    <p className="text-[13px] text-ink-3">Aucun motif enregistré.</p>
                  ) : null}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
              Cumul : <b className="font-bold text-ink-2">la plus favorable l&apos;emporte</b>{" "}
              (arbitrage 65). Trois remises ne s&apos;empilent pas — l&apos;addition mènerait un
              abonnement à zéro sans que personne l&apos;ait décidé.
            </p>
          </>
        )}
      </AdminCard>
    </>
  );
}
