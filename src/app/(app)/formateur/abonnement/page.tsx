import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { StatStrip } from "@/components/nk/stat-strip";
import { StPill } from "@/components/nk/status-pill";
import { InfoBox } from "@/components/nk/info-box";
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
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Mon abonnement" }]}
        title="Mon abonnement"
        lead="Votre formule, vos échéances et vos règlements. Le stockage supplémentaire est facturé avec l'abonnement, sur la même ligne."
      />

      {/*
        L'état, puis les quatre chiffres qui le détaillent, dans une seule carte.
        ======================================================================
        L'état en toutes lettres vient **en premier** : c'est la question que le
        formateur vient se poser. Il était rendu après quatre tuiles, donc sous
        la ligne de flottaison d'un téléphone.

        Et ces quatre tuiles s'empilaient une par ligne sous `sm` : près de
        400 px pour un prix, une date, un mot et un solde. Elles tiennent en une
        bande de deux colonnes, sous l'état qu'elles expliquent.
        ======================================================================
      */}
      <section
        aria-labelledby="etat-titre"
        className="mb-5 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:mb-8 sm:p-6"
      >
        <h2 id="etat-titre" className="sr-only">
          État de votre abonnement
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StPill tone={status.tone}>{status.label}</StPill>
          <span className="text-[13px] leading-relaxed text-ink-2">{status.help}</span>
        </p>

        <StatStrip
          bare
          className="mt-4"
          items={[
            {
              // « annuelle » s'accorde avec « formule », jamais avec « abonnement ».
              label: `formule ${CADENCE_LABELS[subscription.subscriptionCadence].toLowerCase()}`,
              value: fmtFcfa(subscription.subscriptionPriceFcfa ?? 0),
            },
            {
              label: ended
                ? "terme atteint"
                : canceled
                  ? "fin de votre abonnement"
                  : "prochaine échéance",
              value: fmtDate(subscription.subscriptionCurrentPeriodEnd) ?? "—",
            },
            {
              label: "prélèvement automatique",
              value: subscription.autoRenew ? "Activé" : "Désactivé",
            },
            {
              label: "solde disponible pour prélever",
              value: fmtFcfa(wallet.withdrawableFcfa),
            },
          ]}
        />
      </section>

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

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="grid gap-4 sm:gap-6">
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
            className="rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-6"
          >
            <h2
              id="historique-titre"
              className="mb-3.5 text-[15.5px] font-extrabold sm:text-[16.5px]"
            >
              Vos périodes
            </h2>

            {history.length === 0 ? (
              // Une phrase, pas un encadré : dans une carte parmi d'autres, un
              // état vide de 310 px coûte plus qu'il ne dit.
              <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-3">
                <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <b className="font-bold text-ink">Aucune période facturée.</b> Vos échéances
                  apparaîtront ici, réglées ou non.
                </span>
              </p>
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

        <aside className="lg:sticky lg:top-[88px]">
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
