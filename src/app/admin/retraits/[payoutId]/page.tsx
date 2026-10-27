import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, Minus, TriangleAlert } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { BtnLink } from "@/components/nk/button-link";
import { getAuthContext } from "@/lib/api";
import { getPayoutDetail, PAYOUT_MIN_AMOUNT_FCFA } from "@/lib/payouts";
import { withdrawableBalance } from "@/lib/wallet";
import { KYC_THRESHOLD_VERIFIED } from "@/lib/kyc";
import { fmtFcfa, fmtDate } from "@/lib/format";
import { ReviewActions } from "./review-actions";
import { PAYOUT_STATUS, PAYOUT_METHOD_TYPE_LABELS, KYC_CRITERIA_LABELS } from "../status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instruire un retrait",
  robots: { index: false },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0">
      <dt className="w-full shrink-0 text-[13px] font-bold text-ink-3 sm:w-[220px]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] text-ink">{children}</dd>
    </div>
  );
}

export default async function RetraitDetailPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }
  const { payoutId } = await params;

  const payout = await getPayoutDetail(payoutId).catch(() => null);
  if (!payout) notFound();

  const isSuperAdmin = auth.user.adminRole === "SUPER_ADMIN";
  const state = PAYOUT_STATUS[payout.status] ?? {
    label: payout.status,
    tone: "muted" as const,
    help: "",
  };
  const trainer = payout.trainerProfile.user;
  const name = trainer.fullName ?? trainer.email;
  const wallet = payout.trainerProfile.wallet;
  const withdrawable = wallet ? withdrawableBalance(wallet) : 0;

  // Le snapshot KYC est figé à la demande : c'est lui qui a décidé de la voie
  // (auto-approbation ou revue), pas le score d'aujourd'hui.
  const criteria = (payout.kycCriteriaSnapshot ?? {}) as Record<string, boolean>;

  return (
    <>
      <AdminHead
        title={fmtFcfa(payout.amountFcfa)}
        lead={
          <>
            {name} · demandé le {fmtDate(payout.submittedAt)}
          </>
        }
        actions={
          <BtnLink href="/admin/retraits" variant="o" size="sm">
              <ArrowLeft aria-hidden="true" />
              Retour à la file
          </BtnLink>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StPill tone={state.tone}>{state.label}</StPill>
        <span className="text-[13px] text-ink-2">{state.help}</span>
      </div>

      {payout.isFirstPayout ? (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-nk-lg border border-line bg-card border-l-4 border-l-gold p-5 rounded-l-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <b className="block text-[14.5px] font-extrabold text-ink">Premier retrait</b>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
              Décision 25 — le premier retrait passe toujours en revue manuelle, quel que soit le
              score. L&apos;auto-approbation à partir de {KYC_THRESHOLD_VERIFIED} points ne
              s&apos;applique qu&apos;aux suivants.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="grid gap-6">
          {/*
            Le solde est lu maintenant, pas au moment de la demande : c'est ce
            qui compte pour décider. `approvePayout` le re-vérifie de toute
            façon et refuse si le solde retirable est devenu négatif.
          */}
          <AdminCard title="Solde du formateur, à cet instant">
            <dl>
              <Row label="Solde crédité">{fmtFcfa(wallet?.balance ?? 0)}</Row>
              <Row label="Réservé par des litiges">{fmtFcfa(wallet?.reservedBalance ?? 0)}</Row>
              <Row label="Immobilisé par des retraits">
                {fmtFcfa(wallet?.pendingPayoutBalance ?? 0)}
                <span className="ml-2 text-[13px] text-ink-3">
                  dont {fmtFcfa(payout.amountFcfa)} pour cette demande
                </span>
              </Row>
              <Row label="Retirable">
                <b className={withdrawable < 0 ? "font-extrabold text-danger" : "font-extrabold"}>
                  {fmtFcfa(withdrawable)}
                </b>
              </Row>
              {wallet?.negativeSince ? (
                <Row label="Solde négatif depuis">
                  <span className="font-bold text-danger">{fmtDate(wallet.negativeSince)}</span>
                </Row>
              ) : null}
            </dl>

            {withdrawable < 0 ? (
              <p className="mt-4 rounded-xl bg-danger/5 px-4 py-3 text-[13px] leading-relaxed text-ink">
                <b className="font-extrabold">Le solde retirable est négatif.</b> Décision 13 — un
                remboursement a été prélevé sur un solde déjà engagé. Aucune approbation
                n&apos;est possible tant qu&apos;il n&apos;est pas revenu au-dessus de zéro ; les
                ventes suivantes l&apos;apurent.
              </p>
            ) : null}
          </AdminCard>

          <AdminCard title="Score de confiance au moment de la demande">
            <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
              Ce score est <b className="font-bold text-ink">figé à la demande</b>, pas recalculé :
              c&apos;est lui qui a décidé de la voie suivie, et la décision doit rester auditable
              même si le formateur évolue ensuite.
            </p>
            <dl>
              <Row label="Score">
                <b className="font-display text-[18px] font-extrabold">
                  {payout.kycScoreSnapshot ?? "—"}
                </b>
                <span className="ml-1 text-[13px] text-ink-3">sur 100</span>
                {payout.kycBadgeSnapshot ? (
                  <span className="ml-3 text-[13px] text-ink-2">{payout.kycBadgeSnapshot}</span>
                ) : null}
              </Row>
              <Row label="Critères">
                <ul className="grid gap-1.5">
                  {Object.entries(KYC_CRITERIA_LABELS).map(([key, label]) => {
                    const met = criteria[key] === true;
                    return (
                      <li key={key} className="flex items-center gap-2 text-[13px]">
                        <span
                          className={
                            met
                              ? "grid size-4 shrink-0 place-items-center rounded-full border border-line bg-card text-brand"
                              : "grid size-4 shrink-0 place-items-center rounded-full border border-line bg-card text-ink-3"
                          }
                          aria-hidden="true"
                        >
                          {met ? <Check className="size-2.5" /> : <Minus className="size-2.5" />}
                        </span>
                        <span className={met ? "text-ink" : "text-ink-3"}>{label}</span>
                        <span className="sr-only">{met ? "acquis" : "non acquis"}</span>
                      </li>
                    );
                  })}
                </ul>
              </Row>
              {payout.carenceHolds ? (
                <Row label="Délai de sécurité">
                  <span className="font-bold text-gold-ink">
                    En cours au moment de la demande — l&apos;auto-approbation était exclue.
                  </span>
                </Row>
              ) : null}
            </dl>
          </AdminCard>

          <AdminCard title="Moyen de paiement">
            <dl>
              <Row label="Type">
                {PAYOUT_METHOD_TYPE_LABELS[payout.payoutMethod.type] ?? payout.payoutMethod.type}
              </Row>
              {payout.payoutMethod.type === "BANK_IBAN" ? (
                <Row label="IBAN">
                  <span className="font-mono text-[13.5px]">{payout.payoutMethod.iban}</span>
                </Row>
              ) : (
                <Row label="Numéro">
                  <span className="font-mono text-[13.5px]">{payout.payoutMethod.mobilePhone}</span>
                </Row>
              )}
              <Row label="Nom légal vérifié">
                {payout.trainerProfile.verifiedLegalName ?? (
                  <span className="text-danger">absent</span>
                )}
              </Row>
              <Row label="Dossier du moyen de paiement">
                <Link
                  href={`/admin/moyens-de-paiement/${payout.payoutMethod.id}`}
                  className="font-bold text-brand"
                >
                  Ouvrir la fiche de vérification
                </Link>
              </Row>
            </dl>
          </AdminCard>

          {payout.status === "PAID" || payout.status === "FAILED" ? (
            <AdminCard title="Versement">
              <dl>
                {payout.paidAt ? <Row label="Versé le">{fmtDate(payout.paidAt)}</Row> : null}
                {payout.providerReference ? (
                  <Row label="Référence du virement">
                    <span className="font-mono text-[13.5px]">{payout.providerReference}</span>
                  </Row>
                ) : null}
                {payout.failedAt ? <Row label="Échec le">{fmtDate(payout.failedAt)}</Row> : null}
                {payout.failureReason ? (
                  <Row label="Motif de l'échec">{payout.failureReason}</Row>
                ) : null}
              </dl>
            </AdminCard>
          ) : null}

          {payout.rejectionReason ? (
            <AdminCard title="Motif du rejet">
              <p className="text-[13.5px] leading-relaxed text-ink-2">{payout.rejectionReason}</p>
            </AdminCard>
          ) : null}

          <AdminCard title="Historique">
            {payout.reviewEvents.length === 0 ? (
              <p className="text-[13px] text-ink-3">Aucune transition enregistrée.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {payout.reviewEvents.map((event) => (
                  <li key={event.id} className="border-b border-line-2 pb-3 last:border-b-0 last:pb-0">
                    <p className="text-[13.5px]">
                      <b className="font-bold">
                        {PAYOUT_STATUS[event.fromStatus]?.label ?? event.fromStatus} →{" "}
                        {PAYOUT_STATUS[event.toStatus]?.label ?? event.toStatus}
                      </b>
                      <span className="ml-2 text-[13px] text-ink-3">
                        {event.actorRole} · {fmtDate(event.createdAt)}
                      </span>
                    </p>
                    {event.note ? (
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{event.note}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </AdminCard>
        </div>

        <aside className="lg:sticky lg:top-6">
          <AdminCard title="Décision">
            <ReviewActions
              payoutId={payout.id}
              status={payout.status}
              amountFcfa={payout.amountFcfa}
              updatedAt={payout.updatedAt.toISOString()}
              isSuperAdmin={isSuperAdmin}
              withdrawableFcfa={withdrawable}
              minimumFcfa={PAYOUT_MIN_AMOUNT_FCFA}
            />
          </AdminCard>
        </aside>
      </div>
    </>
  );
}
