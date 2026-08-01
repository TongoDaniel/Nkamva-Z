import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { getDisputeForReview } from "@/lib/dispute-review";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DISPUTE_STATUS,
  REFUND_STATUS,
  REASON_LABELS,
  SOURCE_LABELS,
  RESERVATION_STATUS,
} from "../dispute-status";
import { DisputeActions } from "./review-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Examen d'un litige",
  robots: { index: false },
};

const DAY = 86_400_000;

const AUTHOR_LABEL: Record<string, string> = {
  LEARNER: "Apprenant",
  SUPPORT: "Support",
  SYSTEM: "Automatique",
};

export default async function DisputeReviewPage({
  params,
}: {
  params: Promise<{ disputeId: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.adminRole || !["MODERATION", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const { disputeId } = await params;
  const dispute = await getDisputeForReview(disputeId);
  if (!dispute) notFound();

  const state = DISPUTE_STATUS[dispute.status];
  const snapshot = dispute.consumptionSnapshot;
  const learnerName = dispute.learner.fullName ?? dispute.learner.email;

  // Le barème s'apprécie tel qu'il était à l'ouverture : c'est à cet instant
  // que le droit de l'apprenant s'est constitué.
  const withinWindow =
    (dispute.openedAt.getTime() - dispute.purchase.createdAt.getTime()) / DAY <= 14;
  const withinConsumption =
    !snapshot || (!snapshot.downloaded && (!snapshot.ruleApplies || snapshot.consumptionPercent < 30));
  const withinPolicy = withinWindow && withinConsumption;

  return (
    <>
      <Btn asChild variant="t" size="sm" className="mb-4">
        <Link href="/admin/litiges">
          <ArrowLeft aria-hidden="true" />
          Retour à la file
        </Link>
      </Btn>

      <AdminHead
        title={dispute.purchase.course?.title ?? "Ressource retirée"}
        lead={
          <span className="flex flex-wrap items-center gap-3.5">
            <StPill tone={state.tone}>{state.label}</StPill>
            {dispute.refundStatus ? (
              <StPill tone={REFUND_STATUS[dispute.refundStatus]?.tone ?? "muted"}>
                {REFUND_STATUS[dispute.refundStatus]?.label ?? dispute.refundStatus}
              </StPill>
            ) : null}
            <span>{learnerName}</span>
            <span>{fmtFcfa(dispute.disputedAmountFcfa)}</span>
          </span>
        }
        actions={
          <DisputeActions
            disputeId={dispute.id}
            status={dispute.status}
            updatedAt={dispute.updatedAt.toISOString()}
            disputedAmountFcfa={dispute.disputedAmountFcfa}
            withinPolicy={withinPolicy}
            isSuperAdmin={auth.user.adminRole === "SUPER_ADMIN"}
            providerDisputeActive={dispute.purchase.providerDisputeActive}
          />
        }
      />

      {!withinPolicy ? (
        <p className="mb-5 flex items-start gap-2.5 rounded-nk bg-gold-tint px-5 py-4 text-[13.5px] leading-relaxed text-gold-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Dossier hors barème :{" "}
            {!withinWindow
              ? "ouvert plus de 14 jours après l'achat"
              : snapshot?.downloaded
                ? "la ressource avait été téléchargée"
                : `${snapshot?.consumptionPercent} % consultés à l'ouverture`}
            . Un remboursement suppose une dérogation motivée par un super-administrateur.
          </span>
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr] xl:items-start">
        <div className="grid gap-5">
          <AdminCard title="Fil de la contestation">
            <ol className="flex flex-col gap-3.5">
              {dispute.messages.map((message) => {
                const fromSupport = message.authorRole === "SUPPORT";
                return (
                  <li
                    key={message.id}
                    className={cn("flex flex-col gap-1", fromSupport ? "items-end" : "items-start")}
                  >
                    <span className="text-[12px] font-semibold text-ink-3">
                      {AUTHOR_LABEL[message.authorRole]} · {fmtDate(message.createdAt)}
                    </span>
                    <p
                      className={cn(
                        "max-w-[80%] whitespace-pre-line rounded-nk px-4 py-3 text-[14px] leading-relaxed",
                        fromSupport
                          ? "rounded-br-sm bg-ink text-paper"
                          : message.authorRole === "SYSTEM"
                            ? "border border-line bg-paper text-ink-2"
                            : "rounded-bl-sm border border-line bg-paper text-ink",
                      )}
                    >
                      {message.body}
                    </p>
                  </li>
                );
              })}
            </ol>
          </AdminCard>

          <AdminCard title="Historique des décisions">
            {dispute.reviewEvents.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">Aucune décision enregistrée.</p>
            ) : (
              <ol className="flex flex-col gap-3.5">
                {dispute.reviewEvents.map((event, i) => (
                  <li key={i} className="border-l-2 border-line-2 pl-4">
                    <b className="block text-[13.5px]">
                      {DISPUTE_STATUS[event.fromStatus]?.label ?? event.fromStatus} →{" "}
                      {DISPUTE_STATUS[event.toStatus]?.label ?? event.toStatus}
                    </b>
                    <small className="block text-[12.3px] text-ink-3">{fmtDate(event.createdAt)}</small>
                    {event.note ? (
                      <small className="mt-1 block text-[12.5px] leading-relaxed text-ink-2">
                        {event.note}
                      </small>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </AdminCard>
        </div>

        <div className="grid gap-5">
          <AdminCard title="Le dossier">
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Origine</dt>
                <dd className="text-right font-bold">{SOURCE_LABELS[dispute.source] ?? dispute.source}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Motif</dt>
                <dd className="text-right font-bold">{REASON_LABELS[dispute.reason] ?? dispute.reason}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Achat du</dt>
                <dd className="font-bold">{fmtDate(dispute.purchase.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Ouvert le</dt>
                <dd className="font-bold">{fmtDate(dispute.openedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Moyen de paiement</dt>
                <dd className="font-bold">
                  {dispute.purchase.provider === "STRIPE" ? "Carte bancaire" : "Mobile money"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Accès apprenant</dt>
                <dd className="font-bold">
                  {dispute.purchase.accessSuspended ? "Suspendu" : "Actif"}
                </dd>
              </div>
            </dl>

            {dispute.reasonDetail ? (
              <div className="mt-4 border-t border-line-2 pt-4">
                <h3 className="mb-1.5 text-[13px] font-bold">Détail rédigé par l&apos;apprenant</h3>
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">
                  {dispute.reasonDetail}
                </p>
                <p className="mt-2 text-[12px] text-ink-3">
                  Ce détail n&apos;est jamais transmis au formateur.
                </p>
              </div>
            ) : null}
          </AdminCard>

          <AdminCard title="Consommation figée à l'ouverture">
            {snapshot ? (
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-2">Format</dt>
                  <dd className="font-bold">{snapshot.courseFormat}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-2">Part consultée</dt>
                  <dd className="font-bold">
                    {snapshot.downloaded ? "Téléchargée" : `${snapshot.consumptionPercent} %`}
                  </dd>
                </div>
                {snapshot.ruleApplies && snapshot.courseDurationSeconds ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-2">Visionné</dt>
                    <dd className="font-bold">
                      {Math.round((snapshot.watchedSeconds ?? 0) / 60)} min sur{" "}
                      {Math.round(snapshot.courseDurationSeconds / 60)} min
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-2">Règle des 30 %</dt>
                  <dd className="font-bold">
                    {snapshot.ruleApplies ? "Applicable" : "Sans objet (téléchargeable)"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-[13.5px] text-ink-3">Aucun constat enregistré.</p>
            )}
          </AdminCard>

          <AdminCard title="Fonds">
            {dispute.fundReservations.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">Aucune réservation.</p>
            ) : (
              <ul className="grid gap-3 text-sm">
                {dispute.fundReservations.map((reservation) => (
                  <li key={reservation.id} className="grid gap-1.5">
                    <div className="flex justify-between gap-3">
                      <span className="text-ink-2">État</span>
                      <b>{RESERVATION_STATUS[reservation.status] ?? reservation.status}</b>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-ink-2">Gelé</span>
                      <b>{fmtFcfa(reservation.reservedAmountFcfa)}</b>
                    </div>
                    {reservation.debitedAmount > 0 ? (
                      <div className="flex justify-between gap-3">
                        <span className="text-ink-2">Débité</span>
                        <b>{fmtFcfa(reservation.debitedAmount)}</b>
                      </div>
                    ) : null}
                    {reservation.releasedAmount > 0 ? (
                      <div className="flex justify-between gap-3">
                        <span className="text-ink-2">Rendu</span>
                        <b>{fmtFcfa(reservation.releasedAmount)}</b>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {dispute.manualRefundTask ? (
              <p className="mt-4 border-t border-line-2 pt-4 text-[12.5px] leading-relaxed text-ink-2">
                Remboursement à exécuter à la main chez {dispute.manualRefundTask.provider} —{" "}
                {fmtFcfa(dispute.manualRefundTask.refundAmountFcfa)}. Il figure dans la file des
                finances.
              </p>
            ) : null}

            {dispute.overrideJustification ? (
              <p className="mt-4 rounded-nk bg-gold-tint px-4 py-3 text-[12.5px] leading-relaxed text-gold-ink">
                <b>Dérogation au barème :</b> {dispute.overrideJustification}
              </p>
            ) : null}
          </AdminCard>
        </div>
      </div>
    </>
  );
}
