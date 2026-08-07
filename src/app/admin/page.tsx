import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { BadgeCheck, CreditCard, Gavel, ShieldAlert, Undo2, Wallet } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { getApplicationStats } from "@/lib/trainer-application-review";
import { getDisputeStats, listManualRefundTasks } from "@/lib/dispute-review";
import { getReportStats } from "@/lib/reports";
import { getPayoutStats } from "@/lib/payouts";
import { getPayoutMethodStats } from "@/lib/payout-methods";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false },
};

const s = (n: number) => (n > 1 ? "s" : "");

/**
 * Une file à traiter : ce qui attend une décision, et le lien pour la prendre.
 * Le tableau de bord ne recompte rien lui-même — chaque chiffre vient de la
 * fonction de stats que sa propre page utilise déjà, pour qu'accueil et page
 * de destination ne puissent pas diverger.
 */
function QueueRow({
  icon,
  label,
  detail,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  detail: React.ReactNode;
  href: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-line-2 py-4 first:pt-0 last:border-b-0 last:pb-0">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-nk-sm bg-brand-tint text-brand [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-sm font-bold">{label}</b>
        <small className="text-[13px] text-ink-2">{detail}</small>
      </div>
      <Btn asChild size="sm" variant="o">
        <Link href={href}>Ouvrir</Link>
      </Btn>
    </li>
  );
}

export default async function AdminHomePage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  // Mêmes bornes que `navForSubRole` et que les gardes de chaque page : le
  // tableau de bord ne doit annoncer que des files réellement ouvrables.
  const role = auth.user.adminRole;
  const canModerate = role === "MODERATION" || role === "SUPER_ADMIN";
  const canFinance = role === "FINANCES" || role === "SUPER_ADMIN";

  const [applications, disputes, reports, payouts, payoutMethods, refundTasks] =
    await Promise.all([
      canModerate ? getApplicationStats() : null,
      canModerate ? getDisputeStats() : null,
      canModerate ? getReportStats() : null,
      canFinance ? getPayoutStats() : null,
      canFinance ? getPayoutMethodStats() : null,
      canFinance ? listManualRefundTasks("PENDING") : null,
    ]);

  return (
    <>
      <AdminHead
        title="Administration"
        lead={`Vous êtes connecté avec le sous-rôle ${role ?? "non défini"}.`}
      />

      {canModerate && applications && disputes && reports ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile tone="blue" value={applications.submitted} label={`candidature${s(applications.submitted)} à traiter`} />
            <StatTile tone="gold" value={disputes.open} label={`litige${s(disputes.open)} à prendre`} />
            <StatTile tone="clay" value={reports.open} label={`signalement${s(reports.open)} ouvert${s(reports.open)}`} />
            <StatTile tone="brand" value={applications.resubmissionPending} label="en attente du candidat" />
          </div>

          <AdminCard title="Modération" className="mb-6">
            <ul className="flex flex-col">
              <QueueRow
                icon={<BadgeCheck />}
                label="Validation des formateurs"
                href="/admin/validation-formateurs"
                detail={
                  applications.submitted > 0
                    ? `${applications.submitted} dossier${s(applications.submitted)} attend${applications.submitted > 1 ? "ent" : ""} votre examen.`
                    : "Aucun dossier en attente d'examen."
                }
              />
              <QueueRow
                icon={<Gavel />}
                label="Litiges"
                href="/admin/litiges"
                detail={
                  disputes.open + disputes.inReview > 0
                    ? `${disputes.open} à prendre, ${disputes.inReview} en examen.`
                    : "Aucun litige en cours."
                }
              />
              <QueueRow
                icon={<ShieldAlert />}
                label="Signalements"
                href="/admin/signalements"
                detail={
                  reports.open > 0
                    ? `${reports.open} signalement${s(reports.open)} ouvert${s(reports.open)}.`
                    : "Aucun signalement ouvert."
                }
              />
            </ul>
          </AdminCard>
        </>
      ) : null}

      {canFinance && payouts && payoutMethods && refundTasks ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile tone="blue" value={payouts.pendingReview} label={`retrait${s(payouts.pendingReview)} à examiner`} />
            <StatTile tone="gold" value={payoutMethods.pendingReview} label={`vérification${s(payoutMethods.pendingReview)} KYC en attente`} />
            <StatTile tone="clay" value={refundTasks.length} label={`remboursement${s(refundTasks.length)} à exécuter`} />
            <StatTile tone="brand" value={payoutMethods.blocked} label={`dossier${s(payoutMethods.blocked)} KYC bloqué${s(payoutMethods.blocked)}`} />
          </div>

          <AdminCard title="Finances" className="mb-6">
            <ul className="flex flex-col">
              <QueueRow
                icon={<Wallet />}
                label="Retraits"
                href="/admin/retraits"
                detail={
                  payouts.pendingReview > 0 ? (
                    <>
                      {payouts.pendingReview} demande{s(payouts.pendingReview)} à examiner
                      {payouts.slaBreaches > 0 ? (
                        <>
                          {" · "}
                          <b className="font-bold text-danger">
                            {payouts.slaBreaches} hors délai
                          </b>
                        </>
                      ) : null}
                      .
                    </>
                  ) : (
                    "Aucune demande de retrait à examiner."
                  )
                }
              />
              <QueueRow
                icon={<CreditCard />}
                label="Moyens de paiement"
                href="/admin/moyens-de-paiement"
                detail={
                  payoutMethods.pendingReview + payoutMethods.blocked > 0
                    ? `${payoutMethods.pendingReview} à vérifier, ${payoutMethods.blocked} bloqué${s(payoutMethods.blocked)}.`
                    : "Aucune vérification KYC en attente."
                }
              />
              <QueueRow
                icon={<Undo2 />}
                label="Remboursements"
                href="/admin/remboursements"
                detail={
                  refundTasks.length > 0
                    ? `${refundTasks.length} virement${s(refundTasks.length)} à exécuter à la main.`
                    : "Aucun remboursement manuel en file."
                }
              />
            </ul>
          </AdminCard>
        </>
      ) : null}

      {!canModerate && !canFinance ? (
        <AdminCard title="Accès" className="mb-6">
          <p className="text-[14px] leading-relaxed text-ink-2">
            Aucun sous-rôle ne vous donne accès à une file de traitement. Demandez à un
            Super-admin de vous attribuer le sous-rôle Modération ou Finances.
          </p>
        </AdminCard>
      ) : null}

      {/* Ce que cette phrase délimite : le tableau de bord ne montre que les
          **files** — ce qui a un arriéré chiffrable et réclame une décision. Il
          n'est pas un sommaire de l'espace d'administration.

          Elle disait « les autres rubriques sont des vues de consultation »,
          ce qui était faux pour le Super-admin : Paramètres, Administrateurs,
          Utilisateurs et Abonnements écrivent (tarifs et réglages, sous-rôles,
          sanctions, échéance soldée à la main). Ce n'était exact que sous le
          filtrage de la décision 7, qui retire ces quatre rubriques à un admin
          Modération. La distinction juste n'est pas lecture / écriture mais
          arriéré / pas d'arriéré : une file réclame, les autres écrans
          autorisent. */}
      <p className="rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
        Cette page ne montre que les files à traiter. Les autres rubriques de votre
        navigation n&apos;ont pas d&apos;arriéré : rien n&apos;y patiente, même là où vous
        pouvez agir.
      </p>
    </>
  );
}
