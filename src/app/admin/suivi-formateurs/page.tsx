import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { getAuthContext } from "@/lib/api";
import { canOpen, hasAdminRole } from "@/lib/admin-roles";
import { fmtDate, fmtFcfa, fmtNumber } from "@/lib/format";
import { FUNNEL_LABELS, getSalesFollowUp, listTrainersWithoutSale, NO_SALE_CONTACT_AFTER_DAYS } from "@/lib/trainer-follow-up";
import { TrainerNoteForm } from "./note-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suivi des formateurs",
  robots: { index: false },
};

const th = "py-2 pr-3 text-left text-[12px] font-bold uppercase tracking-[0.06em] text-ink-2";

/**
 * Plan d'action 1.4 et 1.7. Le service client y trouve les formateurs restés
 * sans vente 30 jours après leur validation ; le commercial, l'entonnoir, les
 * fondateurs et ceux qui approchent du seuil Pro. Chacun note ce qu'il a fait.
 */
export default async function SuiviFormateursPage() {
  const auth = await getAuthContext();
  if (!canOpen(auth?.user, "trainerFollowUp")) redirect("/admin");
  const isSupport = hasAdminRole(auth?.user, "SUPPORT");
  const isSales = hasAdminRole(auth?.user, "SALES");

  const [withoutSale, sales] = await Promise.all([
    isSupport ? listTrainersWithoutSale() : Promise.resolve([]),
    isSales ? getSalesFollowUp() : Promise.resolve(null),
  ]);

  return (
    <>
      <AdminHead
        title="Suivi des formateurs"
        lead="Garder le formateur qui ne vend pas encore, et accompagner celui qui grandit."
      />

      <div className="grid gap-6">
        {isSupport ? (
          <AdminCard title={`Sans vente ${NO_SALE_CONTACT_AFTER_DAYS} jours après leur validation (${fmtNumber(withoutSale.length)})`}>
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
              Le modèle prévoit de contacter chacun : aider à publier une première ressource, à fixer un prix, à partager
              son lien. Notez le contact pour que personne ne soit appelé deux fois.
            </p>
            {withoutSale.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">Aucun formateur à contacter.</p>
            ) : (
              <ul className="grid gap-3">
                {withoutSale.map((t) => (
                  <li key={t.trainerId} className="rounded-nk border border-line p-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link href={`/admin/clients/${t.userId}`} className="text-[14.5px] font-bold text-brand">
                        {t.name}
                      </Link>
                      <span className="text-[13px] text-ink-2">{t.email}</span>
                      {t.phone ? <span className="text-[13px] text-ink-2">{t.phone}</span> : null}
                      <span className="text-[13px] text-ink-3">
                        validé il y a {fmtNumber(t.daysSinceApproval)} jours · {fmtNumber(t.publishedCourses)} ressource
                        {t.publishedCourses > 1 ? "s" : ""} publiée{t.publishedCourses > 1 ? "s" : ""}
                        {t.founder ? " · fondateur" : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {t.lastContact
                        ? `Dernier contact le ${fmtDate(t.lastContact.createdAt)} : ${t.lastContact.body}`
                        : "Pas encore contacté."}
                    </p>
                    <div className="mt-2">
                      <TrainerNoteForm trainerId={t.trainerId} kind="SUPPORT_CONTACT" label="Ce qui a été dit" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        ) : null}

        {sales ? (
          <>
            <AdminCard title="Entonnoir des formateurs">
              <dl className="grid gap-3 sm:grid-cols-4">
                {(Object.keys(FUNNEL_LABELS) as Array<keyof typeof FUNNEL_LABELS>).map((stage) => (
                  <div key={stage} className="rounded-nk border border-line p-3">
                    <dt className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-2">{FUNNEL_LABELS[stage]}</dt>
                    <dd className="mt-1 text-[22px] font-extrabold">{fmtNumber(sales.funnel[stage])}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
                La prospection se fait hors de l&apos;application : notez-la sur chaque formateur. Les candidatures se
                lisent ici, mais se valident par la Modération (règle 4).
              </p>
            </AdminCard>

            <AdminCard title={`Proches du seuil Pro (${fmtFcfa(sales.breakEvenFcfa)} par mois)`}>
              {sales.nearPro.length === 0 ? (
                <p className="text-[13.5px] text-ink-3">Aucun formateur au-dessus de 70 % du seuil le mois dernier.</p>
              ) : (
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr>
                      <th className={th}>Formateur</th>
                      <th className={th}>Ventes du mois dernier</th>
                      <th className={th}>Fondateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.nearPro.map((t) => (
                      <tr key={t.trainerId} className="border-t border-line-2">
                        <td className="py-2 pr-3 font-bold">{t.name}</td>
                        <td className="py-2 pr-3 tabular-nums">{fmtFcfa(t.lastMonthSalesFcfa)}</td>
                        <td className="py-2 pr-3">{t.founder ? "Oui" : "Non"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminCard>

            <AdminCard title={`Formateurs validés (${fmtNumber(sales.trainers.length)}), dont ${fmtNumber(sales.founders.length)} fondateurs`}>
              <ul className="grid gap-3">
                {sales.trainers.map((t) => (
                  <li key={t.trainerId} className="rounded-nk border border-line p-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[14.5px] font-bold">{t.name}</span>
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[12px] font-bold text-brand">{FUNNEL_LABELS[t.stage]}</span>
                      <span className="text-[13px] text-ink-3">
                        validé le {fmtDate(t.approvedAt)}
                        {t.firstResourceAt ? ` · 1re ressource le ${fmtDate(t.firstResourceAt)}` : ""}
                        {t.firstSaleAt ? ` · 1re vente le ${fmtDate(t.firstSaleAt)}` : ""}
                        {t.founder ? " · fondateur" : ""}
                        {t.plan === "PRO" ? " · Pro" : ""}
                      </span>
                    </div>
                    {t.lastNote ? (
                      <p className="mt-1 text-[13px] text-ink-2">
                        Dernière note ({fmtDate(t.lastNote.createdAt)}) : {t.lastNote.body}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <TrainerNoteForm trainerId={t.trainerId} kind="SALES_NOTE" label="Note de suivi" />
                    </div>
                  </li>
                ))}
              </ul>
            </AdminCard>

            {sales.pendingApplications.length ? (
              <AdminCard title={`Candidatures en attente (${fmtNumber(sales.pendingApplications.length)})`}>
                <ul className="grid gap-1 text-[13.5px]">
                  {sales.pendingApplications.map((a) => (
                    <li key={a.id}>
                      {a.name}
                      {a.submittedAt ? <span className="text-ink-3"> · déposée le {fmtDate(a.submittedAt)}</span> : null}
                    </li>
                  ))}
                </ul>
              </AdminCard>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
