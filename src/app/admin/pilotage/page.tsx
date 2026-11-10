import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { getAuthContext } from "@/lib/api";
import { canOpen, hasAdminRole } from "@/lib/admin-roles";
import { MarketingForm } from "./marketing-form";
import { fmtFcfa, fmtNumber } from "@/lib/format";
import {
  MODEL_SCENARIOS, MODEL_TRAINER_BASE_TARGET, getBaseConversion, getModelMetrics, getQueueAges, monthKey, parsePeriod,
} from "@/lib/pilotage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pilotage du modèle",
  robots: { index: false },
};

function pct(v: number | null): string {
  return v === null ? "-" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function hours(v: number | null): string {
  if (v === null) return "-";
  if (v < 48) return `${fmtNumber(v)} h`;
  return `${fmtNumber(Math.round(v / 24))} j`;
}

const th = "py-2 pr-3 text-left text-[12px] font-bold uppercase tracking-[0.06em] text-ink-2";
const td = "py-2 pr-3 tabular-nums";

export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string }>;
}) {
  const auth = await getAuthContext();
  if (!canOpen(auth?.user, "pilotage")) redirect("/admin");

  const { du, au } = await searchParams;
  const period = parsePeriod(du, au);
  const [metrics, base, queues] = await Promise.all([
    getModelMetrics(period),
    getBaseConversion(),
    getQueueAges(),
  ]);
  const qs = `du=${period.months[0].key}&au=${period.months[period.months.length - 1].key}`;

  return (
    <>
      <AdminHead
        title="Pilotage du modèle"
        lead="Les chiffres qui distinguent les scénarios du modèle économique v1.1, mois par mois. Tout est recalculé à l'affichage depuis les données existantes."
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm">
        <label className="grid gap-1 text-[13px] font-bold">
          Du mois
          <input type="month" name="du" defaultValue={period.months[0].key} className="rounded-nk border border-line px-3 py-2 font-normal" />
        </label>
        <label className="grid gap-1 text-[13px] font-bold">
          Au mois
          <input
            type="month"
            name="au"
            defaultValue={period.months[period.months.length - 1].key}
            max={monthKey(new Date())}
            className="rounded-nk border border-line px-3 py-2 font-normal"
          />
        </label>
        <button type="submit" className="rounded-nk bg-brand px-4 py-2 text-[14px] font-bold text-white">
          Afficher
        </button>
        <div className="ml-auto flex flex-wrap gap-2 text-[13px] font-bold">
          {[
            ["recettes", "Recettes et indicateurs"],
            ["transactions", "Transactions"],
            ["files", "Files"],
          ].map(([type, label]) => (
            <a
              key={type}
              href={`/api/admin/pilotage/export?type=${type}&${qs}`}
              className="inline-flex items-center gap-1.5 rounded-nk border border-line px-3 py-2 hover:border-brand hover:text-brand"
            >
              <Download className="size-4" aria-hidden="true" /> {label} (CSV)
            </a>
          ))}
        </div>
      </form>

      <div className="grid gap-6">
        <AdminCard title="Le premier chiffre : la part de la base devenue active">
          <p className="text-[14px] leading-relaxed text-ink-2">
            {base.baseSize > 0 ? (
              <>
                <b className="text-[22px] text-ink">{pct(base.conversion)}</b> de la base de{" "}
                {fmtNumber(base.baseSize)} formateurs prospectés a déjà vendu ({fmtNumber(base.trainersWithASale)}{" "}
                formateurs). Scénarios : {MODEL_SCENARIOS.map((s) => `${s.label.toLowerCase()} ${pct(s.baseConversion)}`).join(", ")}.
              </>
            ) : (
              <>
                {fmtNumber(base.trainersWithASale)} formateurs ont déjà vendu, sur {fmtNumber(base.approvedTrainers)} validés.
                Pour afficher la part de la base devenue active, renseignez la taille de la base prospectée
                (objectif du modèle : {fmtNumber(MODEL_TRAINER_BASE_TARGET)} en mai 2027) dans{" "}
                <Link href="/admin/parametres" className="font-bold text-brand">Paramètres</Link>, réglage « pilotage.trainer_base_size ».
              </>
            )}
          </p>
        </AdminCard>

        <AdminCard title="Formateurs et apprenants, face aux scénarios">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={th}>Mois</th>
                  <th className={th}>Formateurs actifs</th>
                  <th className={th}>dont nouveaux</th>
                  <th className={th}>Départs</th>
                  <th className={th}>Ventes moyennes par actif</th>
                  <th className={th}>Apprenants actifs</th>
                  <th className={th}>Apprenants par actif</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line-2">
                    <td className="py-2 pr-3 font-bold">{m.label}</td>
                    <td className={td}>{fmtNumber(m.activeTrainers)}</td>
                    <td className={td}>{fmtNumber(m.newlyActiveTrainers)}</td>
                    <td className={td}>{pct(m.churnRate)}</td>
                    <td className={td}>{m.avgSalesPerActiveFcfa === null ? "-" : fmtFcfa(m.avgSalesPerActiveFcfa)}</td>
                    <td className={td}>{fmtNumber(m.activeLearners)}</td>
                    <td className={td}>{m.learnersPerActiveTrainer ?? "-"}</td>
                  </tr>
                ))}
                {MODEL_SCENARIOS.map((s) => (
                  <tr key={s.key} className="border-t border-line-2 text-ink-2">
                    <td className="py-2 pr-3 italic">Scénario {s.label.toLowerCase()}</td>
                    <td className={td}>{fmtNumber(s.activeTrainersNov2027)} en nov. 2027</td>
                    <td className={td}>+{s.newPerMonthFromMarch} par mois dès mars</td>
                    <td className={td}>{pct(s.churn)}</td>
                    <td className={td}>{fmtFcfa(s.avgSalesFcfa)}</td>
                    <td className={td}>-</td>
                    <td className={td}>{s.learnersPerTrainer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            Formateur actif : au moins une vente encaissée dans le mois. Départ : actif le mois précédent, sans vente ce
            mois-ci. Apprenant actif : a acheté ou assisté à un live dans le mois. Remboursements exclus.
          </p>
        </AdminCard>

        <AdminCard title="Recettes par source">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={th}>Mois</th>
                  <th className={th}>Commissions sur les ventes</th>
                  <th className={th}>Pro</th>
                  <th className={th}>Plans Community</th>
                  <th className={th}>Stockage</th>
                  <th className={th}>Autres abonnements</th>
                  <th className={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line-2">
                    <td className="py-2 pr-3 font-bold">{m.label}</td>
                    <td className={td}>{fmtFcfa(m.revenue.commissionsFcfa)}</td>
                    <td className={td}>{fmtFcfa(m.revenue.proFcfa)}</td>
                    <td className={td}>{fmtFcfa(m.revenue.communityPlansFcfa)}</td>
                    <td className={td}>{fmtFcfa(m.revenue.storageFcfa)}</td>
                    <td className={td}>{fmtFcfa(m.revenue.otherSubscriptionsFcfa)}</td>
                    <td className={`${td} font-bold`}>{fmtFcfa(m.revenue.totalFcfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            Les frais de paiement payés par l&apos;acheteur ne sont pas une recette : NKAMVA n&apos;y gagne rien. Les
            abonnements comptent au mois de leur règlement.
          </p>
        </AdminCard>

        <AdminCard title="Marketing payant">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={th}>Mois</th>
                  <th className={th}>Dépense</th>
                  <th className={th}>Nouveaux formateurs actifs</th>
                  <th className={th}>Coût par nouveau formateur actif</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line-2">
                    <td className="py-2 pr-3 font-bold">{m.label}</td>
                    <td className={td}>{m.marketingFcfa === null ? "non saisi" : fmtFcfa(m.marketingFcfa)}</td>
                    <td className={td}>{fmtNumber(m.newlyActiveTrainers)}</td>
                    <td className={td}>{m.marketingPerNewActiveFcfa === null ? "-" : fmtFcfa(m.marketingPerNewActiveFcfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasAdminRole(auth?.user, "PILOTAGE") ? (
            <div className="mt-4 border-t border-line-2 pt-4">
              <MarketingForm defaultMonth={monthKey(new Date())} />
            </div>
          ) : null}
        </AdminCard>

        <AdminCard title="Lives">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={th}>Mois</th>
                  <th className={th}>Lives</th>
                  <th className={th}>h-participants</th>
                  <th className={th}>Présents moyens</th>
                  <th className={th}>Dépassement estimé</th>
                  <th className={th}>Données estimées</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line-2">
                    <td className="py-2 pr-3 font-bold">{m.label}</td>
                    <td className={td}>{fmtNumber(m.lives.sessions)}</td>
                    <td className={td}>{fmtNumber(m.lives.participantHours)}</td>
                    <td className={td}>{m.lives.avgAttendees ?? "-"}</td>
                    <td className={td}>{fmtFcfa(m.lives.overrunFcfa)}</td>
                    <td className={td}>{m.lives.dataGb.toLocaleString("fr-FR")} Go</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            Estimations du modèle (LiveKit Ship : 2 500 h-participants incluses, ~34 FCFA au-delà en 360p ; 224,5 Mo par
            h-participant en vidéo, 22 Mo en audio), à remplacer par les mesures du live test.
          </p>
        </AdminCard>

        <AdminCard title="Ancienneté des dossiers dans les files">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={th}>File</th>
                  <th className={th}>Dossiers</th>
                  <th className={th}>Le plus ancien</th>
                  <th className={th}>Âge moyen</th>
                  <th className={th}>Hors délai</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.key} className="border-t border-line-2">
                    <td className="py-2 pr-3 font-bold">
                      <Link href={q.href} className="text-brand">{q.label}</Link>
                    </td>
                    <td className={td}>{fmtNumber(q.count)}</td>
                    <td className={td}>{hours(q.oldestHours)}</td>
                    <td className={td}>{hours(q.averageHours)}</td>
                    <td className={`${td} ${q.overdue ? "font-bold text-danger" : ""}`}>
                      {q.overdue === null ? "-" : `${fmtNumber(q.overdue)} (${q.slaLabel})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </div>
    </>
  );
}
