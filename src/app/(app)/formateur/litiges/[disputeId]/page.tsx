import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { StPill } from "@/components/nk/status-pill";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { getTrainerDispute } from "@/lib/trainer-disputes";
import { fmtDate, fmtFcfa } from "@/lib/format";
import {
  TRAINER_DISPUTE_STATUS,
  TRAINER_REASON_LABELS,
  RESERVATION_LABELS,
  TICKET_STATUS,
} from "../status";
import { ContestForm } from "../contest-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Litige sur une ressource",
  robots: { index: false },
};

export default async function TrainerDisputePage({
  params,
}: {
  params: Promise<{ disputeId: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const { disputeId } = await params;
  const dispute = await getTrainerDispute(disputeId, auth.user.trainerId);
  if (!dispute) notFound();

  const state = TRAINER_DISPUTE_STATUS[dispute.status];
  const openTicket = dispute.tickets.find((t) => t.status === "OPEN");

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Espace formateur", href: "/formateur" },
          { label: "Litiges", href: "/formateur/litiges" },
          { label: dispute.purchase.course?.title ?? "Litige" },
        ]}
        title={dispute.purchase.course?.title ?? "Ressource retirée"}
        lead={
          <span className="flex flex-wrap items-center gap-3.5">
            <StPill tone={state.tone}>{state.label}</StPill>
            <span>{TRAINER_REASON_LABELS[dispute.reason] ?? dispute.reason}</span>
            <span>Ouvert le {fmtDate(dispute.openedAt)}</span>
          </span>
        }
      />

      <div className="grid items-start gap-6 pt-2 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <p className="mb-5 rounded-nk bg-brand-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-brand-dark">
            {state.help}
          </p>

          <section
            aria-label="Vos éléments"
            className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm sm:p-6"
          >
            <h2 className="mb-1.5 text-[16.5px] font-extrabold">Apporter des éléments</h2>
            <p className="mb-5 text-[13.5px] leading-relaxed text-ink-2">
              Si vous estimez la contestation infondée, transmettez à la modération ce qui
              l&apos;atteste. Vos éléments ne sont pas communiqués à l&apos;acheteur.
            </p>

            {dispute.tickets.length > 0 ? (
              <ol className="mb-6 flex flex-col gap-3.5">
                {dispute.tickets.map((ticket) => {
                  const ticketState = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.OPEN;
                  return (
                    <li key={ticket.id} className="rounded-nk border border-line p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <StPill tone={ticketState.tone}>{ticketState.label}</StPill>
                        <span className="text-[12px] text-ink-3">{fmtDate(ticket.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">
                        {ticket.reason}
                      </p>
                      {ticket.resolutionNote ? (
                        <p className="mt-3 border-t border-line-2 pt-3 text-[13.5px] leading-relaxed text-ink-2">
                          <b className="text-ink">Réponse de la modération :</b>{" "}
                          {ticket.resolutionNote}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {openTicket ? (
              <p className="flex items-start gap-2.5 rounded-nk bg-gold-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-gold-ink">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Vos éléments sont en cours d&apos;examen. Vous pourrez en apporter d&apos;autres
                une fois la modération vous avoir répondu.
              </p>
            ) : (
              <ContestForm disputeId={dispute.id} />
            )}
          </section>
        </div>

        <aside
          aria-label="Le dossier"
          className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
        >
          <h2 className="mb-4 text-[16.5px] font-extrabold">Le dossier</h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Motif déclaré</dt>
              <dd className="text-right font-bold">
                {TRAINER_REASON_LABELS[dispute.reason] ?? dispute.reason}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Montant contesté</dt>
              <dd className="font-bold">{fmtFcfa(dispute.disputedAmountFcfa)}</dd>
            </div>
            {dispute.resolvedAt ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Décision</dt>
                <dd className="font-bold">{fmtDate(dispute.resolvedAt)}</dd>
              </div>
            ) : null}
          </dl>

          {dispute.fundReservations.length > 0 ? (
            <div className="mt-5 border-t border-line-2 pt-4">
              <h3 className="mb-3 text-[13px] font-bold">Vos fonds</h3>
              <dl className="grid gap-2.5 text-sm">
                {dispute.fundReservations.map((reservation, i) => (
                  <div key={i} className="grid gap-1.5">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-2">État</dt>
                      <dd className="font-bold">
                        {RESERVATION_LABELS[reservation.status] ?? reservation.status}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-2">Montant concerné</dt>
                      <dd className="font-bold">{fmtFcfa(reservation.reservedAmountFcfa)}</dd>
                    </div>
                    {reservation.debitedAmount > 0 ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-2">Débité</dt>
                        <dd className="font-bold text-danger">
                          {fmtFcfa(reservation.debitedAmount)}
                        </dd>
                      </div>
                    ) : null}
                    {reservation.releasedAmount > 0 ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-2">Rendu</dt>
                        <dd className="font-bold text-brand-dark">
                          {fmtFcfa(reservation.releasedAmount)}
                        </dd>
                      </div>
                    ) : null}
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <p className="mt-5 border-t border-line-2 pt-4 text-[12.5px] leading-relaxed text-ink-3">
            L&apos;identité de l&apos;acheteur et le détail qu&apos;il a rédigé ne vous sont pas
            communiqués.
          </p>

          {dispute.purchase.course ? (
            <Btn asChild variant="o" size="sm" block className="mt-4">
              <Link href={`/formateur/ressources`}>Mes publications</Link>
            </Btn>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
