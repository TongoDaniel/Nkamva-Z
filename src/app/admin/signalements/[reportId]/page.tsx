import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { BtnLink } from "@/components/nk/button-link";
import { getAuthContext } from "@/lib/api";
import { getReportDetail } from "@/lib/reports";
import { fmtDate } from "@/lib/format";
import { ResolveActions } from "./resolve-actions";
import {
  REPORT_STATUS,
  TARGET_LABELS,
  REASON_LABELS,
  HIDEABLE_TARGETS,
  REMOVAL_LABELS,
} from "../status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instruire un signalement",
  robots: { index: false },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0">
      <dt className="w-full shrink-0 text-[12.5px] font-bold text-ink-3 sm:w-[200px]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] text-ink">{children}</dd>
    </div>
  );
}

export default async function SignalementDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.adminRole || !["MODERATION", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }
  const { reportId } = await params;

  const report = await getReportDetail(reportId).catch(() => null);
  if (!report) notFound();

  const state = REPORT_STATUS[report.status];
  const reporterName = report.reporter.fullName ?? report.reporter.email;
  const hideable = HIDEABLE_TARGETS.includes(report.targetType) && report.target.exists;
  // Deux façons d'être déjà retiré : une ressource archivée, un message effacé
  // de son fil — par la Modération avant, ou par son auteur pendant.
  const alreadyHidden = report.target.courseStatus === "archived" || report.target.removed === true;
  const removal = REMOVAL_LABELS[report.targetType];

  return (
    <>
      <AdminHead
        title={`${TARGET_LABELS[report.targetType] ?? report.targetType} — ${
          REASON_LABELS[report.reason] ?? report.reason
        }`}
        lead={<>Signalé le {fmtDate(report.createdAt)} par {reporterName}</>}
        actions={
          <BtnLink href="/admin/signalements" variant="o" size="sm">
              <ArrowLeft aria-hidden="true" />
              Retour à la file
          </BtnLink>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StPill tone={state.tone}>{state.label}</StPill>
        <span className="text-[13px] text-ink-2">{state.help}</span>
      </div>

      {report.siblingCount > 0 ? (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-nk-lg border border-line bg-gold-tint p-5">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">
            <b className="font-extrabold text-ink">
              {report.siblingCount} autre{report.siblingCount > 1 ? "s" : ""} signalement
              {report.siblingCount > 1 ? "s" : ""}
            </b>{" "}
            vise{report.siblingCount > 1 ? "nt" : ""} le même objet. Trois plaintes sur la même
            ressource ne se jugent pas comme une seule.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="grid gap-6">
          <AdminCard title="Ce qui est signalé">
            <dl>
              <Row label="Type">{TARGET_LABELS[report.targetType] ?? report.targetType}</Row>
              <Row label="Objet">
                {report.target.exists ? (
                  report.target.href ? (
                    <Link href={report.target.href} className="font-bold text-brand" target="_blank">
                      {report.target.label}
                    </Link>
                  ) : (
                    report.target.label
                  )
                ) : (
                  <span className="text-ink-3">{report.target.label}</span>
                )}
              </Row>
              {report.target.courseStatus ? (
                <Row label="État de la ressource">
                  {alreadyHidden ? (
                    <StPill tone="muted">Déjà retirée du catalogue</StPill>
                  ) : (
                    <StPill tone="ok">Publiée</StPill>
                  )}
                </Row>
              ) : report.target.removed !== undefined ? (
                <Row label="État du message">
                  {report.target.removed ? (
                    <StPill tone="muted">Déjà retiré du fil</StPill>
                  ) : (
                    <StPill tone="ok">Toujours lisible</StPill>
                  )}
                </Row>
              ) : null}
              <Row label="Motif">{REASON_LABELS[report.reason] ?? report.reason}</Row>
              {report.detail ? <Row label="Précisions">{report.detail}</Row> : null}
              <Row label="Auteur du signalement">{reporterName}</Row>
            </dl>

            {!report.target.exists ? (
              <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
                L&apos;objet visé n&apos;est plus consultable. Le signalement reste instruisible :
                il documente ce qui s&apos;est passé, même si la cible a disparu.
              </p>
            ) : null}
          </AdminCard>

          {report.status !== "OPEN" ? (
            <AdminCard title="Décision">
              <dl>
                <Row label="Issue">{state.label}</Row>
                {report.reviewedBy ? (
                  <Row label="Instruit par">
                    {report.reviewedBy.fullName ?? report.reviewedBy.email}
                    {report.reviewedAt ? ` · ${fmtDate(report.reviewedAt)}` : ""}
                  </Row>
                ) : null}
                <Row label="Cible retirée">{report.targetHidden ? "Oui" : "Non"}</Row>
                {report.decisionNote ? <Row label="Motivation">{report.decisionNote}</Row> : null}
              </dl>
            </AdminCard>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-6">
          <AdminCard title="Instruire">
            <ResolveActions
              reportId={report.id}
              status={report.status}
              updatedAt={report.updatedAt.toISOString()}
              hideable={hideable && !alreadyHidden}
              removalAction={removal?.action ?? ""}
              removalEffect={removal?.effect ?? ""}
            />
          </AdminCard>
        </aside>
      </div>
    </>
  );
}
