import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { getAuthContext } from "@/lib/api";
import { fxCoverage } from "@/lib/fx";
import { countryName } from "@/lib/markets";
import { countryFromPawaPay } from "@/lib/pawapay";
import { fmtDate } from "@/lib/format";
import { FxRateRow } from "./fx-rate-row";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Taux de change",
  robots: { index: false },
};

/** Montant témoin : l'ordre de grandeur d'une ressource du catalogue. */
const SAMPLE_FCFA = 15_000;

export default async function TauxDeChangePage() {
  const auth = await getAuthContext();
  // Même porte que la grille tarifaire : un taux décide de ce que paie
  // réellement un apprenant, Finances et Super-admin y ont accès.
  if (auth?.user.adminRole !== "SUPER_ADMIN" && auth?.user.adminRole !== "FINANCES") {
    redirect("/admin");
  }

  const coverage = await fxCoverage();
  const open = coverage.filter((c) => c.unitsPerXaf !== null).length;

  return (
    <>
      <AdminHead
        title="Taux de change"
        lead="Les prix sont en FCFA ; le mobile money encaisse dans la devise du pays. Un taux manquant ferme le pays au lieu d'en inventer un."
      />

      <AdminCard title="Zone franc">
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Le franc CFA d&apos;Afrique centrale (XAF) et celui de l&apos;Ouest (XOF) sont à parité
          fixe : <b>1 XAF = 1 XOF</b>. Ces pays — Cameroun, Congo, Gabon, Côte d&apos;Ivoire,
          Sénégal, Bénin, Burkina Faso — encaissent le montant affiché, sans conversion et sans
          taux à administrer. Ils n&apos;apparaissent donc pas ci-dessous.
        </p>
      </AdminCard>

      <AdminCard
        title={`Autres devises — ${open} ouverte${open > 1 ? "s" : ""} sur ${coverage.length}`}
      >
        {coverage.length === 0 ? (
          <p className="text-[13.5px] text-ink-2">
            Aucune devise à administrer : la configuration du compte de paiement n&apos;a pas pu
            être lue. Vérifiez <b>Intégrations</b> avant de conclure que le fournisseur ne sert
            que la zone franc.
          </p>
        ) : (
          <dl>
            {coverage.map((row) => (
              <FxRateRow
                key={row.currency}
                currency={row.currency}
                countries={row.countries.map((alpha3) => {
                  const alpha2 = countryFromPawaPay(alpha3);
                  return alpha2 ? countryName(alpha2) : alpha3;
                })}
                unitsPerXaf={row.unitsPerXaf}
                sample={SAMPLE_FCFA}
              />
            ))}
          </dl>
        )}
      </AdminCard>

      <AdminCard title="Ce que ce réglage engage">
        <ul className="grid gap-2 text-[13px] leading-relaxed text-ink-2">
          <li>
            <b className="text-ink">Un taux faux ne casse rien de visible.</b> Il mésestime
            simplement toutes les ventes du pays concerné, jusqu&apos;à ce que quelqu&apos;un
            compare un relevé. Le montant témoin affiché sous chaque devise est là pour rendre une
            virgule mal placée évidente à l&apos;œil.
          </li>
          <li>
            <b className="text-ink">Un remboursement ne rejoue pas le taux du jour.</b> Il rend ce
            qui a été prélevé, relu sur la transaction d&apos;origine : changer un taux
            n&apos;altère aucun achat déjà passé.
          </li>
          <li>
            <b className="text-ink">Aucun flux externe.</b> Ces valeurs sont saisies à la main,
            volontairement : un service de taux injoignable arrêterait les paiements.
          </li>
        </ul>
        {coverage.some((c) => c.updatedAt) ? (
          <p className="mt-3 text-[12px] text-ink-3">
            Dernière modification :{" "}
            {fmtDate(
              coverage
                .map((c) => c.updatedAt)
                .filter((d): d is Date => d !== null)
                .sort((a, b) => b.getTime() - a.getTime())[0],
            )}
          </p>
        ) : null}
      </AdminCard>
    </>
  );
}
