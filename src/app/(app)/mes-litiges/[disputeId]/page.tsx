import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Lock } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { StPill } from "@/components/nk/status-pill";
import { BtnLink } from "@/components/nk/button-link";
import { ReportButton } from "@/components/nk/report-button";
import { getAuthContext } from "@/lib/api";
import { getMyDispute, REASON_LABELS } from "@/lib/disputes";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DISPUTE_STATUS } from "../dispute-status";
import { ReplyForm } from "./reply-form";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suivi d'une contestation",
  robots: { index: false },
};

const CLOSED = ["RESOLVED_REFUNDED", "RESOLVED_REJECTED", "RESOLVED_AUTO"];

const AUTHOR_LABEL: Record<string, string> = {
  LEARNER: "Vous",
  SUPPORT: "Support NkamVa",
  SYSTEM: "Message automatique",
};

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ disputeId: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { disputeId } = await params;
  const dispute = await getMyDispute(disputeId, auth.user.id);
  if (!dispute) notFound();

  const state = DISPUTE_STATUS[dispute.status];
  const closed = CLOSED.includes(dispute.status);
  const course = dispute.purchase.course;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Mes achats", href: "/mes-achats" },
          { label: "Mes contestations", href: "/mes-litiges" },
          { label: course?.title ?? "Contestation" },
        ]}
        title={course?.title ?? "Contestation"}
        lead={
          <span className="flex flex-wrap items-center gap-3.5">
            <StPill tone={state.tone}>{state.label}</StPill>
            <span>Ouverte le {fmtDate(dispute.openedAt)}</span>
            <span>{fmtFcfa(dispute.disputedAmountFcfa)}</span>
          </span>
        }
      />

      <div className="grid items-start gap-6 pt-2 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <p className="mb-5 rounded-nk bg-brand-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-brand-dark">
            {state.help}
          </p>

          {dispute.status === "WAITING_LEARNER" && dispute.learnerDeadlineAt ? (
            <p className="mb-5 flex items-start gap-2.5 rounded-nk bg-gold-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-gold-ink">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Sans réponse de votre part avant le {fmtDate(dispute.learnerDeadlineAt)}, le
                dossier sera clos et votre accès à la ressource rétabli.
              </span>
            </p>
          ) : null}

          {dispute.resolutionNote ? (
            <p className="mb-5 rounded-nk border border-line bg-card px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-2">
              <b className="text-ink">Décision du support :</b> {dispute.resolutionNote}
            </p>
          ) : null}

          <section
            aria-label="Fil de la contestation"
            className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm sm:p-6"
          >
            <h2 className="mb-4 text-[16.5px] font-extrabold">Échanges</h2>

            {dispute.messages.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">Aucun message pour l&apos;instant.</p>
            ) : (
              <ol className="flex flex-col gap-3.5">
                {dispute.messages.map((message) => {
                  const mine = message.authorRole === "LEARNER";
                  return (
                    <li
                      key={message.id}
                      className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
                    >
                      <span className="text-[13px] font-semibold text-ink-3">
                        {AUTHOR_LABEL[message.authorRole] ?? message.authorRole} ·{" "}
                        {fmtDate(message.createdAt)}
                      </span>
                      <div className="flex max-w-[80%] items-end gap-1">
                        <p
                          className={cn(
                            "whitespace-pre-line rounded-nk px-4 py-3 text-[14px] leading-relaxed",
                            mine
                              ? "rounded-br-sm bg-ink text-paper"
                              : message.authorRole === "SYSTEM"
                                ? "border border-line bg-paper text-ink-2"
                                : "rounded-bl-sm border border-line bg-paper text-ink",
                          )}
                        >
                          {message.body}
                        </p>
                        {/* Le support instruit le dossier, il n'est pas
                            au-dessus des règles. Rien à signaler sur ses
                            propres messages, ni sur ceux que la plateforme
                            écrit elle-même. */}
                        {mine || message.authorRole === "SYSTEM" ? null : (
                          <ReportButton
                            variant="icon"
                            targetType="DISPUTE_MESSAGE"
                            targetId={message.id}
                            className="size-7 text-ink-3/70"
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {closed ? (
              <p className="mt-5 flex items-center gap-2 border-t border-line-2 pt-5 text-[13px] font-semibold text-ink-3">
                <Lock className="size-4" aria-hidden="true" />
                Ce dossier est clos : le fil n&apos;accepte plus de message.
              </p>
            ) : (
              <ReplyForm disputeId={dispute.id} />
            )}
          </section>
        </div>

        <aside
          aria-label="Détail du dossier"
          className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
        >
          <h2 className="mb-4 text-[16.5px] font-extrabold">Le dossier</h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Motif</dt>
              <dd className="text-right font-bold">{REASON_LABELS[dispute.reason]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Montant contesté</dt>
              <dd className="font-bold">{fmtFcfa(dispute.disputedAmountFcfa)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Achat du</dt>
              <dd className="font-bold">{fmtDate(dispute.purchase.createdAt)}</dd>
            </div>
            {dispute.consumptionSnapshot ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Consultation relevée</dt>
                <dd className="font-bold">
                  {dispute.consumptionSnapshot.downloaded
                    ? "Téléchargée"
                    : `${dispute.consumptionSnapshot.consumptionPercent} %`}
                </dd>
              </div>
            ) : null}
            {dispute.resolvedAt ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Décision</dt>
                <dd className="font-bold">{fmtDate(dispute.resolvedAt)}</dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-5 border-t border-line-2 pt-4 text-[13px] leading-relaxed text-ink-3">
            {dispute.purchase.accessSuspended
              ? "Votre accès à la ressource est suspendu le temps de l'examen."
              : "Votre accès à la ressource est actif."}
          </p>

          {course ? (
            <BtnLink href={routes.course(course.slug)} variant="o" size="sm" block className="mt-4">
              Voir la ressource
            </BtnLink>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
