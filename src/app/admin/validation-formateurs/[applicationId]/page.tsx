import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, FileWarning } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { getApplicationDetail } from "@/lib/trainer-application-review";
import { MAX_RESUBMISSIONS } from "@/lib/trainer-applications";
import { fmtDate, fmtNumber } from "@/lib/format";
import { APPLICATION_STATUS, DOCUMENT_STATUS, DOCUMENT_LABELS } from "../status";
import { ReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Examen d'une candidature",
  robots: { index: false },
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.adminRole || !["MODERATION", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const { applicationId } = await params;
  const application = await getApplicationDetail(applicationId);
  if (!application) notFound();

  const state = APPLICATION_STATUS[application.status];
  const candidateName = application.user.fullName ?? application.user.email;

  return (
    <>
      <Btn asChild variant="t" size="sm" className="mb-4">
        <Link href="/admin/validation-formateurs">
          <ArrowLeft aria-hidden="true" />
          Retour à la file
        </Link>
      </Btn>

      <AdminHead
        title={candidateName}
        lead={
          <span className="flex flex-wrap items-center gap-3.5">
            <StPill tone={state.tone}>{state.label}</StPill>
            <span>{application.user.email}</span>
            {application.submittedAt ? (
              <span>Soumis le {fmtDate(application.submittedAt)}</span>
            ) : null}
          </span>
        }
        actions={
          <ReviewActions
            applicationId={application.id}
            status={application.status}
            updatedAt={application.updatedAt.toISOString()}
            candidateName={candidateName}
            isSuperAdmin={auth.user.adminRole === "SUPER_ADMIN"}
            maxResubmissions={MAX_RESUBMISSIONS}
            documents={application.documents.map((d) => ({
              id: d.id,
              type: d.type,
              status: d.status,
              resubmissionCount: d.resubmissionCount,
            }))}
          />
        }
      />

      {application.status === "REJECTED" && application.finalRejectionReason ? (
        <p className="mb-5 rounded-nk bg-danger-tint px-5 py-4 text-[13.5px] leading-relaxed text-danger">
          <b>Motif du refus :</b> {application.finalRejectionReason}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr] xl:items-start">
        <div className="grid gap-5">
          <AdminCard title="Présentation du candidat">
            {application.slogan ? (
              <p className="mb-3 text-[15px] font-bold">{application.slogan}</p>
            ) : null}
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink-2">
              {application.description ?? "Aucune présentation fournie."}
            </p>
            <dl className="mt-5 grid gap-2.5 border-t border-line-2 pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Domaines</dt>
                <dd className="text-right font-bold">
                  {application.domains.length ? application.domains.join(", ") : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Expérience</dt>
                <dd className="font-bold">
                  {application.experienceYears ? `${application.experienceYears} ans` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Site</dt>
                <dd className="font-bold">
                  {application.websiteUrl ? (
                    <a
                      href={application.websiteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand hover:text-brand-dark"
                    >
                      {application.websiteUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Compte créé</dt>
                <dd className="font-bold">{fmtDate(application.user.createdAt)}</dd>
              </div>
            </dl>
          </AdminCard>

          <AdminCard title="Pièces justificatives">
            <ul className="flex flex-col">
              {application.documents.map((document) => {
                const docState = DOCUMENT_STATUS[document.status];
                return (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center gap-3.5 border-b border-line-2 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <b className="block text-[14px]">
                        {DOCUMENT_LABELS[document.type] ?? document.type}
                      </b>
                      <small className="block truncate text-[12.3px] text-ink-3">
                        {document.originalFileName ?? document.mimeType}
                        {document.sizeBytes ? ` · ${fmtNumber(Math.round(document.sizeBytes / 1024))} Ko` : ""}
                        {document.resubmissionCount > 0
                          ? ` · renvoi ${document.resubmissionCount}/${MAX_RESUBMISSIONS}`
                          : ""}
                      </small>
                      {document.rejectionReason ? (
                        <small className="mt-1 block text-[12.3px] text-danger">
                          Motif : {document.rejectionReason}
                        </small>
                      ) : null}
                    </div>
                    <StPill tone={docState.tone}>{docState.label}</StPill>
                    {document.purgedAt ? (
                      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
                        <FileWarning className="size-4" aria-hidden="true" />
                        Effacée
                      </span>
                    ) : (
                      <Btn asChild variant="o" size="sm">
                        {/* Nouvel onglet : la redirection mène au stockage, pas à l'application. */}
                        <a
                          href={`/api/admin/trainer-applications/${application.id}/documents/${document.id}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <ExternalLink aria-hidden="true" />
                          Ouvrir
                        </a>
                      </Btn>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
              Chaque ouverture est journalisée. Les pièces sont effacées 90 jours après la
              décision.
            </p>
          </AdminCard>
        </div>

        <AdminCard title="Historique des décisions">
          {application.reviewEvents.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Aucune décision enregistrée.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {application.reviewEvents.map((event, i) => (
                <li key={i} className="border-l-2 border-line-2 pl-4">
                  <b className="block text-[13.5px]">
                    {APPLICATION_STATUS[event.fromStatus]?.label ?? event.fromStatus} →{" "}
                    {APPLICATION_STATUS[event.toStatus]?.label ?? event.toStatus}
                  </b>
                  <small className="block text-[12.3px] text-ink-3">
                    {fmtDate(event.createdAt)}
                  </small>
                  {event.reason ? (
                    <small className="mt-1 block text-[12.5px] leading-relaxed text-ink-2">
                      {event.reason}
                    </small>
                  ) : null}
                  {event.rejectedDocIds.length > 0 ? (
                    <small className="mt-1 block text-[12.3px] text-ink-3">
                      {event.rejectedDocIds.length} pièce
                      {event.rejectedDocIds.length > 1 ? "s" : ""} refusée
                      {event.rejectedDocIds.length > 1 ? "s" : ""}
                    </small>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </AdminCard>
      </div>
    </>
  );
}
