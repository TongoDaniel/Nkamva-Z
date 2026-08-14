import type { Metadata } from "next";
import { CalendarClock, CreditCard, RefreshCw, Wallet } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { InfoBox } from "@/components/nk/info-box";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { getMySubscription, SUBSCRIPTION_GRACE_DAYS } from "@/lib/subscriptions";
import { getSubscriptionPaymentState } from "@/lib/subscription-payment";
import { getTrainerWallet } from "@/lib/trainer-stats";
import { countActivePaidMembers } from "@/lib/communities";
import { CADENCE_LABELS } from "@/lib/pricing";
import { payableProvidersForUser } from "@/lib/fx";
import { fmtFcfa, fmtDate } from "@/lib/format";
import { db } from "@/lib/db";
import { SubscriptionSettings } from "./subscription-settings";
import { PaymentPanel } from "./payment-panel";
import { SUBSCRIPTION_STATUS } from "./status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon abonnement",
  robots: { index: false },
};

export default async function AbonnementPage() {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;
  const trainerId = auth.user.trainerId;

  const [subscription, payment, wallet, paidMembers, providers, history] = await Promise.all([
    getMySubscription(trainerId),
    getSubscriptionPaymentState(trainerId),
    getTrainerWallet(trainerId),
    countActivePaidMembers(trainerId),
    payableProvidersForUser(auth.user.id),
    db.subscriptionCharge.findMany({
      where: { trainerId },
      orderBy: { periodStart: "desc" },
      take: 12,
      select: {
        id: true, periodStart: true, periodEnd: true, cadence: true,
        amountDueFcfa: true, storageFcfa: true, status: true, settledAt: true,
      },
    }),
  ]);
  if (!subscription) return null;

  const status = SUBSCRIPTION_STATUS[subscription.subscriptionStatus];
  const canceled = subscription.subscriptionCanceledAt !== null;
  const ended = subscription.subscriptionStatus === "CANCELED";

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Mon abonnement" }]}
        title="Mon abonnement"
        lead="Votre formule, vos échéances et vos règlements. Le stockage supplémentaire est facturé avec l'abonnement, sur la même ligne."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<CreditCard />}
          tone="brand"
          value={fmtFcfa(subscription.subscriptionPriceFcfa ?? 0)}
          // « annuelle » s'accorde avec « formule », jamais avec « abonnement ».
          label={`formule ${CADENCE_LABELS[subscription.subscriptionCadence].toLowerCase()}`}
        />
        <StatTile
          icon={<CalendarClock />}
          tone="blue"
          value={fmtDate(subscription.subscriptionCurrentPeriodEnd) ?? "—"}
          label={ended ? "terme atteint" : canceled ? "fin de votre abonnement" : "prochaine échéance"}
        />
        <StatTile
          icon={<RefreshCw />}
          tone={subscription.autoRenew ? "brand" : "clay"}
          value={subscription.autoRenew ? "Activé" : "Désactivé"}
          label="prélèvement automatique"
        />
        <StatTile
          icon={<Wallet />}
          tone="gold"
          value={fmtFcfa(wallet.withdrawableFcfa)}
          label="solde disponible pour prélever"
        />
      </div>

      {/*
        L'état d'abord, et en toutes lettres : c'est la question que le formateur
        vient se poser, et le portefeuille n'y répondait que lorsqu'il devait de
        l'argent.
      */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StPill tone={status.tone}>{status.label}</StPill>
        <span className="text-[13px] text-ink-2">{status.help}</span>
      </div>

      {subscription.dueTotalFcfa > 0 && subscription.suspensionAt && !ended ? (
        <InfoBox className="border border-gold/40 bg-gold-tint text-ink">
          <b>Votre abonnement est à régler : {fmtFcfa(subscription.dueTotalFcfa)}.</b> Sans
          règlement d&apos;ici au {fmtDate(subscription.suspensionAt)}, vos ressources sortiront du
          catalogue. Rien de ce qui a déjà été acheté n&apos;est touché.
        </InfoBox>
      ) : null}

      {canceled && !ended ? (
        <InfoBox className="border border-line bg-paper text-ink">
          <b>Votre abonnement prend fin le {fmtDate(subscription.subscriptionCurrentPeriodEnd)}.</b>{" "}
          D&apos;ici là, rien ne change : vous vendez, vous publiez, vous animez. Au terme, vos
          ressources sortiront du catalogue et votre espace restera ouvert le temps de retirer votre
          solde et de clore vos litiges.
        </InfoBox>
      ) : null}

      {ended ? (
        <InfoBox className="border border-line bg-paper text-ink">
          <b>Votre abonnement a pris fin.</b> Votre espace reste ouvert pour retirer votre solde,
          suivre vos litiges et consulter vos factures. Les personnes qui ont acheté vos ressources
          y accèdent toujours. Vous pouvez rouvrir votre espace à tout moment en réglant un nouvel
          abonnement — sans repasser par une candidature.
        </InfoBox>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="grid gap-6">
          <SubscriptionSettings
            cadence={subscription.subscriptionCadence}
            pendingCadence={subscription.pendingCadence}
            autoRenew={subscription.autoRenew}
            canceled={canceled}
            ended={ended}
            periodEnd={subscription.subscriptionCurrentPeriodEnd?.toISOString() ?? null}
            activePaidMembers={paidMembers}
          />

          <section
            aria-labelledby="historique-titre"
            className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
          >
            <h2 id="historique-titre" className="mb-4 text-[16.5px] font-extrabold">
              Vos périodes
            </h2>

            {history.length === 0 ? (
              <EmptyState
                icon={<CalendarClock />}
                title="Aucune période facturée"
                description="Vos échéances apparaîtront ici, réglées ou non."
              />
            ) : (
              <ul className="grid gap-3">
                {history.map((charge) => {
                  const tone =
                    charge.status === "SETTLED" ? "ok" : charge.status === "WAIVED" ? "info" : "warn";
                  const label =
                    charge.status === "SETTLED"
                      ? "Réglée"
                      : charge.status === "WAIVED"
                        ? "Offerte"
                        : "À régler";
                  return (
                    <li
                      key={charge.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-nk-lg border border-line px-4 py-3.5"
                    >
                      <span className="min-w-0">
                        <b className="block font-display text-[16px] font-extrabold text-ink">
                          {fmtFcfa(charge.amountDueFcfa)}
                        </b>
                        <span className="text-[13px] text-ink-3">
                          Du {fmtDate(charge.periodStart)} au {fmtDate(charge.periodEnd)}
                          {charge.storageFcfa > 0
                            ? ` · dont ${fmtFcfa(charge.storageFcfa)} de stockage`
                            : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <StPill tone={tone}>{label}</StPill>
                        {charge.settledAt ? (
                          <span className="mt-0.5 block text-[13px] text-ink-3">
                            le {fmtDate(charge.settledAt)}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid gap-6 lg:sticky lg:top-[88px]">
          <PaymentPanel
            amountFcfa={payment?.amountFcfa ?? 0}
            pending={payment?.pending ?? false}
            lastFailureCode={payment?.lastFailureCode ?? null}
            ended={ended}
            withdrawableFcfa={wallet.withdrawableFcfa}
            autoRenew={subscription.autoRenew}
            graceDays={SUBSCRIPTION_GRACE_DAYS}
            providers={providers}
          />
        </aside>
      </div>
    </div>
  );
}
