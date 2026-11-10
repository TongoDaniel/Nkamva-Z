import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { getAuthContext } from "@/lib/api";
import { canOpen } from "@/lib/admin-roles";
import { fmtDate, fmtNumber } from "@/lib/format";
import { monthKey, parsePeriod } from "@/lib/pilotage";
import { getTrends } from "@/lib/trends";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tendances",
  robots: { index: false },
};

const th = "py-2 pr-3 text-left text-[12px] font-bold uppercase tracking-[0.06em] text-ink-2";

/**
 * Plan d'action 1.7 : ce dont la Communication a besoin pour écrire, sans
 * donnée personnelle ni montant : des comptes, des titres et des noms publics.
 */
export default async function TendancesPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string }>;
}) {
  const auth = await getAuthContext();
  if (!canOpen(auth?.user, "trends")) redirect("/admin");
  const { du, au } = await searchParams;
  const period = parsePeriod(du, au);
  const trends = await getTrends(period);

  const ranking = (title: string, rows: typeof trends.mostViewed, unit: string) => (
    <AdminCard title={title}>
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Rien sur la période.</p>
      ) : (
        <ol className="grid gap-1.5">
          {rows.map((r, i) => (
            <li key={r.slug} className="flex flex-wrap items-baseline gap-x-3 border-b border-line-2 py-1.5 text-[13.5px] last:border-b-0">
              <span className="w-5 font-bold text-ink-3">{i + 1}</span>
              <a href={`/ressources/${r.slug}`} className="min-w-0 flex-1 font-bold text-brand">{r.title}</a>
              <span className="text-ink-2">{r.trainer} · {r.category}</span>
              <span className="font-bold tabular-nums">{fmtNumber(r.count)} {unit}</span>
            </li>
          ))}
        </ol>
      )}
    </AdminCard>
  );

  return (
    <>
      <AdminHead
        title="Tendances"
        lead="Ce qui se lit, ce qui se vend, qui arrive. Sans donnée personnelle ni montant : de quoi écrire les contenus de la semaine."
      />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm">
        <label className="grid gap-1 text-[13px] font-bold">
          Du mois
          <input type="month" name="du" defaultValue={period.months[0].key} className="rounded-nk border border-line px-3 py-2 font-normal" />
        </label>
        <label className="grid gap-1 text-[13px] font-bold">
          Au mois
          <input type="month" name="au" defaultValue={period.months[period.months.length - 1].key} max={monthKey(new Date())} className="rounded-nk border border-line px-3 py-2 font-normal" />
        </label>
        <button type="submit" className="rounded-nk bg-brand px-4 py-2 text-[14px] font-bold text-white">Afficher</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        {ranking("Ressources les plus consultées", trends.mostViewed, "lecteurs")}
        {ranking("Ressources les plus vendues", trends.mostSold, "ventes")}

        <AdminCard title="Croissance de l'audience">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr>
                <th className={th}>Mois</th>
                <th className={th}>Nouveaux comptes</th>
                <th className={th}>dont apprenants</th>
                <th className={th}>Formateurs validés</th>
              </tr>
            </thead>
            <tbody>
              {trends.audience.map((m) => (
                <tr key={m.key} className="border-t border-line-2">
                  <td className="py-2 pr-3 font-bold">{m.label}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmtNumber(m.newAccounts)}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmtNumber(m.newLearners)}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmtNumber(m.newTrainers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminCard>

        <AdminCard title="Filières">
          {trends.categories.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Aucune ressource publiée.</p>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr>
                  <th className={th}>Filière</th>
                  <th className={th}>Ressources publiées</th>
                  <th className={th}>Ventes sur la période</th>
                </tr>
              </thead>
              <tbody>
                {trends.categories.map((c) => (
                  <tr key={c.category} className="border-t border-line-2">
                    <td className="py-2 pr-3 font-bold">{c.category}</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtNumber(c.published)}</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtNumber(c.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>

        <AdminCard title="Nouveaux formateurs">
          {trends.newTrainers.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Aucun sur la période.</p>
          ) : (
            <ul className="grid gap-2 text-[13.5px]">
              {trends.newTrainers.map((t, i) => (
                <li key={`${t.name}-${i}`} className="border-b border-line-2 pb-2 last:border-b-0">
                  <b>{t.name}</b>
                  {t.slogan ? <span className="text-ink-2"> · {t.slogan}</span> : null}
                  <span className="text-ink-3"> · validé le {fmtDate(t.approvedAt)}</span>
                  {t.domains.length ? <p className="text-[12.5px] text-ink-3">{t.domains.join(", ")}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </>
  );
}
