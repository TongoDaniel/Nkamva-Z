import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, CreditCard, Plus } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";

import { StPill } from "@/components/nk/status-pill";
import { InfoBox } from "@/components/nk/info-box";
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
import { walletTileLabel } from "../wallet-label";
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
          // Court : le bouton dit le geste, et la section « Moyen de paiement »
          // explique le reste quelques centimètres plus bas. Trois lignes ici
          // paraphrasaient ce qui s'y trouve déjà.
          body: "Il sera vérifié avant votre premier retrait.",
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
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Portefeuille" }]}
        title="Portefeuille"
        lead="Votre solde, votre score de confiance et vos retraits. Le solde est crédité à chaque vente réellement encaissée."
        // Le solde dit combien ; il ne dit pas d'où. Le renvoi vaut quel que
        // soit l'état du compte de versement.
        //
        // « Enregistrer un compte » a quitté cet en-tête : le même bouton
        // paraissait **trois fois** sur l'écran d'un formateur qui n'a pas
        // encore de compte de versement — ici, dans le bloc de retrait, et dans
        // la section du moyen de paiement. Il n'en reste qu'un, dans le bloc de
        // retrait, là où le geste est demandé.
        actions={<BtnLink href="/formateur/ventes" variant="o">Mes ventes</BtnLink>}
      />

      {/*
        Le solde, et le geste qu'il commande, dans une seule carte.
        ======================================================================
        Quatre tuiles de même taille s'empilaient ici — solde crédité, réservé,
        retrait en cours, montant retirable — sur quatre rangées entières dès
        qu'on lisait l'écran sur un téléphone. Trois d'entre elles affichaient
        « 0 FCFA » et pesaient autant que celle qui compte.

        Une seule compte vraiment : **ce qu'on peut retirer maintenant**. Elle
        prend la taille du titre, et les trois autres deviennent ce qu'elles
        sont — l'explication de l'écart entre le solde et ce montant. Sans
        elles, un retirable plus petit que le solde serait incompréhensible
        (c'est déjà la raison d'être de `walletTileLabel`).

        Le formulaire de retrait la rejoint : il vivait dans la colonne
        latérale, donc **sous** le stockage et l'historique sur téléphone —
        l'action pour laquelle on ouvre cette page arrivait en cinquième.
        ======================================================================
      */}
      <section
        aria-labelledby="solde-titre"
        className="mb-5 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:mb-8 sm:p-6 lg:flex lg:items-start lg:gap-8"
      >
        <div className="lg:min-w-0 lg:flex-1">
          <h2
            id="solde-titre"
            className="text-[13px] font-bold uppercase tracking-wide text-ink-3"
          >
            Montant retirable
          </h2>
          <p className="mt-1 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] sm:text-[36px]">
            {fmtFcfa(wallet.withdrawableFcfa)}
          </p>
          <p className="mt-1.5 text-[13px] text-ink-3">{walletTileLabel(wallet)}</p>

          {/* L'écart, en trois nombres. Même source que les tuiles d'avant,
              même ordre : ce qui est entré, ce qui est gelé, ce qui est parti. */}
          <dl className="mt-4 grid grid-cols-3 gap-x-3 border-t border-line-2 pt-3.5 text-[13px]">
            {[
              { label: "Crédité", value: wallet.balanceFcfa },
              { label: "Litiges", value: wallet.reservedFcfa },
              { label: "Retrait en cours", value: wallet.pendingPayoutFcfa },
            ].map((item) => (
              // Chaque paire dans son bloc, et non trois `dt` suivis de trois
              // `dd` : au sens du langage, cela disait que ces trois termes
              // partagent ces trois définitions. `justify-between` garde les
              // valeurs alignées quand un libellé passe à la ligne.
              <div key={item.label} className="flex min-w-0 flex-col justify-between gap-1">
                <dt className="text-ink-3">{item.label}</dt>
                <dd className="font-display font-bold text-ink">{fmtFcfa(item.value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-5 border-t border-line-2 pt-5 lg:mt-0 lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          {blocker ? (
            <>
              <p className="text-[13.5px] font-bold text-ink">{blocker.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{blocker.body}</p>
              {blocker.action ? (
                <BtnLink href={blocker.action.href} block className="mt-4">
                  <Plus aria-hidden="true" />
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
        </div>
      </section>

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

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="grid gap-4 sm:gap-6">
          <section
            aria-labelledby="moyen-titre"
            className="rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-6"
          >
            <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="moyen-titre" className="text-[15.5px] font-extrabold sm:text-[16.5px]">
                Moyen de paiement
              </h2>
              {/* Un lien, pas un bouton : le geste est le même qu'avec un compte
                  actif, et le bloc de retrait porte déjà l'appel à l'action. */}
              <Link
                href="/formateur/portefeuille/moyen-de-paiement"
                className="nk-tap text-[13px] font-bold text-brand"
              >
                {active ? "Le remplacer" : "En enregistrer un"}
              </Link>
            </div>

            {active ? (
              <>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <b className="text-[14.5px] font-bold text-ink">{describeMethod(active)}</b>
                  <StPill tone={PAYOUT_METHOD_STATUS[active.verificationStatus]?.tone}>
                    {PAYOUT_METHOD_STATUS[active.verificationStatus]?.label ?? active.verificationStatus}
                  </StPill>
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                  {ACCOUNT_NATURE_LABELS[active.accountNature]} ·{" "}
                  {PAYOUT_METHOD_STATUS[active.verificationStatus]?.help}
                </p>

                {active.rejectionReason ? (
                  <p className="mt-3 rounded-xl bg-danger/5 px-4 py-3 text-[13px] leading-relaxed text-ink">
                    <b className="font-bold">Motif du refus.</b> {active.rejectionReason}
                  </p>
                ) : null}

                {active.carenceUntil && new Date(active.carenceUntil) > new Date() ? (
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
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
              // Sans encadré ni bouton : l'état vide occupait une carte entière
              // pour une phrase, et son bouton était le troisième du même écran.
              // Le lien du titre suffit, et le bloc de retrait porte l'action.
              <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-3">
                <CreditCard className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                <span>
                  <b className="font-bold text-ink">Aucun compte enregistré.</b> Vous serez payé
                  sur le compte que vous enregistrez ici. Il est vérifié avant tout versement, et
                  le vôtre seul est accepté.
                </span>
              </p>
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
                      className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-3"
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
            className="rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-6"
          >
            <h2
              id="retraits-titre"
              className="mb-3.5 text-[15.5px] font-extrabold sm:text-[16.5px]"
            >
              Vos retraits
            </h2>

            {payouts.items.length === 0 ? (
              // Une phrase, pas un encadré : l'état vide occupait 310 px — une
              // grande icône, un titre, une description — pour dire qu'il n'y a
              // rien. Sur un téléphone, c'était la moitié d'un écran de vide.
              <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-3">
                <ArrowDownToLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <b className="font-bold text-ink">Aucun retrait pour l&apos;instant.</b> Vos
                  demandes et leur suivi apparaîtront ici.
                </span>
              </p>
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
                        <span className="text-[13px] text-ink-3">
                          Demandé le {fmtDate(p.createdAt)}
                        </span>
                      </span>
                      <span className="text-right">
                        <StPill tone={status.tone}>{status.label}</StPill>
                        <span className="mt-0.5 block max-w-[38ch] text-[13px] leading-relaxed text-ink-3">
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

        <aside className="lg:sticky lg:top-[88px]">
          <KycPanel kyc={kyc} />
        </aside>
      </div>
    </div>
  );
}
