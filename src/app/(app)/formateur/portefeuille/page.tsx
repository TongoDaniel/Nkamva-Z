import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, CreditCard, Lock, Plus, Wallet } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { InfoBox } from "@/components/nk/info-box";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { computeKycScore } from "@/lib/kyc";
import { getTrainerWallet } from "@/lib/trainer-stats";
import {
  listMyPayoutMethods,
  getWithdrawableMethod,
  getPayoutReviewSlaHours,
} from "@/lib/payout-methods";
import { listMyPayouts, PAYOUT_MIN_AMOUNT_FCFA, IN_FLIGHT_PAYOUT_STATUSES } from "@/lib/payouts";
import { getMySubscription } from "@/lib/subscriptions";
import { getTrainerStorage } from "@/lib/storage-tiers";
import { fmtFcfa, fmtDate } from "@/lib/format";
import { KycPanel } from "./kyc-panel";
import { StoragePanel } from "./storage-panel";
import { PayoutRequestForm } from "./payout-request-form";
import { MicroDepositForm } from "./micro-deposit-form";
import {
  payoutStatuses,
  payoutMethodStatuses,
  ACCOUNT_NATURE_LABELS,
  describeMethod,
} from "./payout-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portefeuille",
  robots: { index: false },
};

export default async function PortefeuillePage() {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;
  const trainerId = auth.user.trainerId;

  const [wallet, kyc, methods, payouts, withdrawable, subscription, storage, slaHours] =
    await Promise.all([
      getTrainerWallet(trainerId),
      computeKycScore(trainerId),
      listMyPayoutMethods(trainerId),
      listMyPayouts(trainerId, 1, 20),
      getWithdrawableMethod(trainerId),
      getMySubscription(trainerId),
      getTrainerStorage(trainerId),
      getPayoutReviewSlaHours(),
    ]);

  // Le délai annoncé au formateur est celui que Finances se donne : les deux
  // ne peuvent pas diverger, sinon l'écran promet ce que la file ne tient pas.
  const PAYOUT_STATUS = payoutStatuses(slaHours);
  const PAYOUT_METHOD_STATUS = payoutMethodStatuses(slaHours);

  const active = methods.find((m) => m.isActive) ?? null;
  const archived = methods.filter((m) => !m.isActive);
  const inFlight = payouts.items.find((p) =>
    IN_FLIGHT_PAYOUT_STATUSES.includes(p.status),
  );

  // Un seul message de blocage à la fois, dans l'ordre où le formateur peut y
  // remédier : d'abord ce qui dépend de lui, ensuite ce qui dépend du temps.
  const blocker = inFlight
    ? {
        title: "Un retrait est déjà en cours",
        body: `Votre demande de ${fmtFcfa(inFlight.amountFcfa)} doit être instruite avant que vous puissiez en formuler une autre.`,
        action: null,
      }
    : withdrawable.reason === "PAYOUT_METHOD_MISSING"
      ? {
          title: "Aucun moyen de paiement enregistré",
          body: "Enregistrez le compte sur lequel vous voulez être payé. Il sera vérifié avant votre premier retrait.",
          action: { href: "/formateur/portefeuille/moyen-de-paiement", label: "Enregistrer un compte" },
        }
      : withdrawable.reason === "PAYOUT_METHOD_NOT_VERIFIED"
        ? {
            title: "Votre moyen de paiement n'est pas encore vérifié",
            body: "La vérification est en cours. Vous serez notifié dès qu'elle aboutit.",
            action: null,
          }
        : withdrawable.reason === "PAYOUT_METHOD_CARENCE"
          ? {
              title: "Délai de sécurité en cours",
              body: `Tout compte nouvellement enregistré ou modifié attend 72 h avant de pouvoir recevoir un retrait${active?.carenceUntil ? `, soit jusqu'au ${fmtDate(active.carenceUntil)}` : ""}. Cette attente protège votre solde si votre compte était compromis.`,
              action: null,
            }
          : wallet.withdrawableFcfa < PAYOUT_MIN_AMOUNT_FCFA
            ? {
                title: "Montant retirable insuffisant",
                body: `Le retrait minimum est de ${fmtFcfa(PAYOUT_MIN_AMOUNT_FCFA)}. Votre montant retirable est de ${fmtFcfa(wallet.withdrawableFcfa)}.`,
                action: null,
              }
            : null;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Portefeuille" }]}
        title="Portefeuille"
        lead="Votre solde, votre score de confiance et vos retraits. Le solde est crédité à chaque vente réellement encaissée."
        actions={
          active ? null : (
            <BtnLink href="/formateur/portefeuille/moyen-de-paiement">
                <Plus aria-hidden="true" />
                Enregistrer un compte
            </BtnLink>
          )
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Wallet />}
          tone="brand"
          value={fmtFcfa(wallet.balanceFcfa)}
          label="solde crédité"
        />
        <StatTile
          icon={<Lock />}
          tone="clay"
          value={fmtFcfa(wallet.reservedFcfa)}
          label="réservé par des litiges"
        />
        <StatTile
          icon={<ArrowDownToLine />}
          tone="gold"
          value={fmtFcfa(wallet.pendingPayoutFcfa)}
          label="retrait en cours"
        />
        <StatTile
          icon={<CreditCard />}
          tone="blue"
          value={fmtFcfa(wallet.withdrawableFcfa)}
          label="montant retirable"
        />
      </div>

      {/*
        Un impayé se découvrait jusqu'ici par une seule notification, qui pouvait
        passer inaperçue — et la sanction, elle, retire les ressources du
        catalogue (décision 68). Elle doit être visible là où le formateur
        regarde son argent.
      */}
      {subscription && subscription.dueTotalFcfa > 0 ? (
        <InfoBox
          className={
            subscription.subscriptionStatus === "SUSPENDED"
              ? "border border-danger/30 bg-danger/5 text-ink"
              : "border border-gold/40 bg-gold-tint text-ink"
          }
        >
          {subscription.subscriptionStatus === "SUSPENDED" ? (
            <>
              <b>Vos ressources sont retirées du catalogue.</b> Votre abonnement reste impayé
              ({fmtFcfa(subscription.dueTotalFcfa)}). Vos apprenants continuent d&apos;accéder à
              ce qu&apos;ils ont acheté ; vous ne pouvez plus publier ni téléverser tant que
              la situation n&apos;est pas régularisée.
            </>
          ) : (
            <>
              <b>Votre abonnement est à régler : {fmtFcfa(subscription.dueTotalFcfa)}.</b>{" "}
              {subscription.suspensionAt ? (
                <>
                  Sans règlement d&apos;ici au {fmtDate(subscription.suspensionAt)}, vos
                  ressources sortiront du catalogue. Rien de ce qui a déjà été acheté n&apos;est
                  touché.
                </>
              ) : null}
            </>
          )}
        </InfoBox>
      ) : null}

      {wallet.withdrawableFcfa < 0 ? (
        <InfoBox className="border border-danger/30 bg-danger/5 text-ink">
          <b>Votre montant retirable est négatif.</b> Un remboursement a été prélevé sur un
          solde déjà engagé. Aucun retrait n&apos;est possible tant qu&apos;il ne revient pas
          au-dessus de zéro ; vos prochaines ventes l&apos;apurent automatiquement.
          {wallet.negativeSince ? <> Depuis le {fmtDate(wallet.negativeSince)}.</> : null}
        </InfoBox>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="grid gap-6">
          <section
            aria-labelledby="moyen-titre"
            className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="moyen-titre" className="text-[16.5px] font-extrabold">
                Moyen de paiement
              </h2>
              {active ? (
                <Link
                  href="/formateur/portefeuille/moyen-de-paiement"
                  className="text-[13px] font-bold text-brand"
                >
                  Le remplacer
                </Link>
              ) : null}
            </div>

            {active ? (
              <>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <b className="text-[14.5px] font-bold text-ink">{describeMethod(active)}</b>
                  <StPill tone={PAYOUT_METHOD_STATUS[active.verificationStatus]?.tone}>
                    {PAYOUT_METHOD_STATUS[active.verificationStatus]?.label ?? active.verificationStatus}
                  </StPill>
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
                  {ACCOUNT_NATURE_LABELS[active.accountNature]} ·{" "}
                  {PAYOUT_METHOD_STATUS[active.verificationStatus]?.help}
                </p>

                {active.rejectionReason ? (
                  <p className="mt-3 rounded-xl bg-danger/5 px-4 py-3 text-[12.5px] leading-relaxed text-ink">
                    <b className="font-bold">Motif du refus.</b> {active.rejectionReason}
                  </p>
                ) : null}

                {active.carenceUntil && new Date(active.carenceUntil) > new Date() ? (
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
                    Délai de sécurité de 72 h en cours jusqu&apos;au {fmtDate(active.carenceUntil)}.
                  </p>
                ) : null}

                {active.verificationMethod === "MICRO_DEPOSIT" &&
                active.verificationStatus === "PENDING_REVIEW" ? (
                  <MicroDepositForm
                    payoutMethodId={active.id}
                    reference={active.microDepositReference}
                  />
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={<CreditCard />}
                title="Aucun compte enregistré"
                description="Vous serez payé sur le compte que vous enregistrez ici. Il est vérifié avant tout versement, et le vôtre seul est accepté."
                action={
                  <BtnLink href="/formateur/portefeuille/moyen-de-paiement">
                      Enregistrer un compte
                  </BtnLink>
                }
              />
            )}

            {archived.length > 0 ? (
              <details className="mt-5 border-t border-line pt-4">
                <summary className="cursor-pointer text-[13px] font-bold text-ink-2">
                  Comptes précédents ({archived.length})
                </summary>
                <ul className="mt-3 grid gap-2">
                  {archived.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3"
                    >
                      <span>{describeMethod(m)}</span>
                      <span>Remplacé le {fmtDate(m.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          <StoragePanel storage={storage} />

          <section
            aria-labelledby="retraits-titre"
            className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
          >
            <h2 id="retraits-titre" className="mb-4 text-[16.5px] font-extrabold">
              Vos retraits
            </h2>

            {payouts.items.length === 0 ? (
              <EmptyState
                icon={<ArrowDownToLine />}
                title="Aucun retrait pour l'instant"
                description="Vos demandes de retrait et leur suivi apparaîtront ici."
              />
            ) : (
              <ul className="grid gap-3">
                {payouts.items.map((p) => {
                  const status = PAYOUT_STATUS[p.status] ?? {
                    label: p.status,
                    tone: "muted" as const,
                    help: "",
                  };
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-nk-lg border border-line px-4 py-3.5"
                    >
                      <span className="min-w-0">
                        <b className="block font-display text-[16px] font-extrabold text-ink">
                          {fmtFcfa(p.amountFcfa)}
                        </b>
                        <span className="text-[12.5px] text-ink-3">
                          Demandé le {fmtDate(p.createdAt)}
                        </span>
                      </span>
                      <span className="text-right">
                        <StPill tone={status.tone}>{status.label}</StPill>
                        <span className="mt-0.5 block max-w-[38ch] text-[12px] leading-relaxed text-ink-3">
                          {p.status === "REJECTED" && p.rejectionReason
                            ? p.rejectionReason
                            : status.help}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid gap-6 lg:sticky lg:top-[88px]">
          <section
            aria-labelledby="retrait-titre"
            className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
          >
            <h2 id="retrait-titre" className="mb-4 text-[16.5px] font-extrabold">
              Demander un retrait
            </h2>

            {blocker ? (
              <>
                <p className="text-[13.5px] font-bold text-ink">{blocker.title}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{blocker.body}</p>
                {blocker.action ? (
                  <BtnLink href={blocker.action.href} block className="mt-4">
                    {blocker.action.label}
                  </BtnLink>
                ) : null}
              </>
            ) : (
              <PayoutRequestForm
                withdrawableFcfa={wallet.withdrawableFcfa}
                minimumFcfa={PAYOUT_MIN_AMOUNT_FCFA}
              />
            )}
          </section>

          <KycPanel kyc={kyc} />
        </aside>
      </div>
    </div>
  );
}
