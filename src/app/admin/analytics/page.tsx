import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Coins, ShieldAlert, Users } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { getPlatformOverview } from "@/lib/analytics";
import { fmtFcfa, fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0">
      <dt className="text-[13px] text-ink-2">{label}</dt>
      <dd className="text-[14px] font-bold text-ink">{children}</dd>
    </div>
  );
}

export default async function AnalyticsPage() {
  const auth = await getAuthContext();
  // Décision 7 — cette vue croise modération et finances. Elle est donc
  // réservée au Super-admin : Finances y verrait des chiffres de modération
  // que son périmètre lui refuse ailleurs.
  if (auth?.user.adminRole !== "SUPER_ADMIN") redirect("/admin");

  const overview = await getPlatformOverview();

  return (
    <>
      <AdminHead
        title="Vue d'ensemble"
        lead="Agrégé depuis les données existantes, sans collecte dédiée. Chaque chiffre est recalculé à l'affichage : aucun compteur n'est stocké, donc rien ne peut dériver."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Users />}
          tone="brand"
          value={fmtNumber(overview.users.learners + overview.users.trainers)}
          label={`comptes · ${overview.users.newLast30Days} sur 30 jours`}
        />
        <StatTile
          icon={<BookOpen />}
          tone="blue"
          value={fmtNumber(overview.catalog.published)}
          label="ressources publiées"
        />
        <StatTile
          icon={<Coins />}
          tone="gold"
          value={fmtFcfa(overview.sales.grossFcfa)}
          label={`encaissé · ${fmtFcfa(overview.sales.last30DaysFcfa)} sur 30 jours`}
        />
        <StatTile
          icon={<ShieldAlert />}
          tone="clay"
          value={fmtNumber(
            overview.moderation.openReports +
              overview.moderation.openDisputes +
              overview.moderation.pendingApplications,
          )}
          label="dossiers ouverts, tous domaines"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard title="Comptes">
          <dl>
            <Row label="Apprenants">{fmtNumber(overview.users.learners)}</Row>
            <Row label="Formateurs">{fmtNumber(overview.users.trainers)}</Row>
            <Row label="Administrateurs">{fmtNumber(overview.users.admins)}</Row>
            <Row label="Inscrits sur 30 jours">{fmtNumber(overview.users.newLast30Days)}</Row>
          </dl>
        </AdminCard>

        <AdminCard title="Catalogue">
          <dl>
            <Row label="Publiées">{fmtNumber(overview.catalog.published)}</Row>
            <Row label="Brouillons">{fmtNumber(overview.catalog.draft)}</Row>
            <Row label="Retirées">{fmtNumber(overview.catalog.archived)}</Row>
            <Row label="Communautés">{fmtNumber(overview.catalog.communities)}</Row>
          </dl>
        </AdminCard>

        <AdminCard title="Ventes et revenus">
          <dl>
            <Row label="Ventes encaissées">{fmtNumber(overview.sales.count)}</Row>
            <Row label="Montant encaissé">{fmtFcfa(overview.sales.grossFcfa)}</Row>
            <Row label="Part NkamVa">{fmtFcfa(overview.sales.platformShareFcfa)}</Row>
            <Row label="Sur 30 jours">{fmtFcfa(overview.sales.last30DaysFcfa)}</Row>
          </dl>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            Remboursements exclus. Les parts sont celles snapshotées à la vente : un changement
            de taux ne réécrit pas le passé.
          </p>
        </AdminCard>

        <AdminCard title="Charge de travail">
          <dl>
            <Row label="Signalements à instruire">
              <Link href="/admin/signalements" className="text-brand">
                {fmtNumber(overview.moderation.openReports)}
              </Link>
            </Row>
            <Row label="Litiges en cours">
              <Link href="/admin/litiges" className="text-brand">
                {fmtNumber(overview.moderation.openDisputes)}
              </Link>
            </Row>
            <Row label="Candidatures à traiter">
              <Link href="/admin/validation-formateurs" className="text-brand">
                {fmtNumber(overview.moderation.pendingApplications)}
              </Link>
            </Row>
            <Row label="Retraits à instruire">
              <Link href="/admin/retraits" className="text-brand">
                {fmtNumber(overview.payouts.pendingReview)}
              </Link>
            </Row>
          </dl>
        </AdminCard>

        <AdminCard title="Retraits">
          <dl>
            <Row label="Immobilisé, pas encore débité">
              {fmtFcfa(overview.payouts.inFlightFcfa)}
            </Row>
            <Row label="Versé au total">{fmtFcfa(overview.payouts.paidFcfa)}</Row>
          </dl>
        </AdminCard>

        <AdminCard title="Formateurs par revenu net">
          {overview.topTrainers.length === 0 ? (
            <EmptyState
              icon={<Coins />}
              title="Aucune vente"
              description="Le classement apparaîtra dès la première vente encaissée."
            />
          ) : (
            <ol className="flex flex-col">
              {overview.topTrainers.map((trainer, i) => (
                <li
                  key={trainer.trainerId}
                  className="flex flex-wrap items-center gap-3 border-b border-line-2 py-2.5 last:border-b-0"
                >
                  <span className="w-5 shrink-0 text-[12.5px] font-bold text-ink-3">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                    {trainer.name}
                  </span>
                  <span className="text-[12.5px] text-ink-3">
                    {fmtNumber(trainer.salesCount)} vente{trainer.salesCount > 1 ? "s" : ""}
                  </span>
                  <span className="text-[13.5px] font-bold">{fmtFcfa(trainer.netRevenueFcfa)}</span>
                </li>
              ))}
            </ol>
          )}
        </AdminCard>
      </div>
    </>
  );
}
