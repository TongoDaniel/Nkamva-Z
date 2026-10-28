"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Hint } from "@/components/nk/hint";
import { SettingCard, SettingRow } from "@/components/nk/setting-card";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/format";

const CADENCE_LABELS: Record<string, string> = {
  MONTHLY: "Mensuelle",
  YEARLY: "Annuelle",
};

/**
 * Les trois réglages que le formateur n'avait aucun moyen de toucher :
 * `pendingCadence` (décision 52), le prélèvement automatique (arbitrage 8) et
 * la résiliation (arbitrage 1). Les trois champs existaient en base ; rien ne
 * les écrivait.
 */
export function SubscriptionSettings({
  cadence,
  pendingCadence,
  autoRenew,
  canceled,
  ended,
  periodEnd,
  activePaidMembers,
}: {
  cadence: string;
  pendingCadence: string | null;
  autoRenew: boolean;
  canceled: boolean;
  ended: boolean;
  periodEnd: string | null;
  /** Membres payants encore abonnés : ils bloquent la résiliation (arbitrage 2). */
  activePaidMembers: number;
}) {
  const other = cadence === "MONTHLY" ? "YEARLY" : "MONTHLY";

  const update = useAction(
    async (payload: { cadence?: string; autoRenew?: boolean }) => {
      await api.patch("/api/trainer/subscription", payload);
    },
    { success: "Vos réglages sont enregistrés.", error: "La modification n'a pas abouti." },
  );

  const cancel = useAction(
    async () => {
      await api.del("/api/trainer/subscription");
    },
    { success: "Votre résiliation est enregistrée.", error: "La résiliation n'a pas abouti." },
  );

  const resume = useAction(
    async () => {
      await api.post("/api/trainer/subscription");
    },
    { success: "Votre abonnement se poursuit.", error: "La reprise n'a pas abouti." },
  );

  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!cancel.pending) setConfirming(false);
  }, [cancel.pending]);

  // Un espace au terme n'a plus de réglage à offrir : il se rouvre en payant.
  if (ended) return null;

  return (
    <SettingCard
      title="Réglages de votre abonnement"
      hint={
        <Hint label="Quand un changement de formule prend effet">
          Une modification de formule prend effet à votre prochaine échéance. La période en
          cours n&apos;est ni écourtée, ni recalculée.
        </Hint>
      }
    >
      {/* Ce qui **est déjà décidé** reste écrit — un changement en attente est un
          état, pas une explication ; ce qui décrit la possibilité passe au ⓘ
          (arbitrages 138 et 140). */}
      <SettingRow
        title={`Formule ${CADENCE_LABELS[cadence].toLowerCase()}`}
        description={
          pendingCadence
            ? `Vous passerez en formule ${CADENCE_LABELS[pendingCadence].toLowerCase()} le ${fmtDate(periodEnd)}.`
            : undefined
        }
        hint={
          pendingCadence ? null : (
            <Hint label="Ce que change une formule">
              Vous pouvez passer en formule {CADENCE_LABELS[other].toLowerCase()} ; le changement
              prendra effet le {fmtDate(periodEnd)}.
            </Hint>
          )
        }
        action={
          <Btn
            variant="o"
            loading={update.pending}
            disabled={canceled}
            onClick={() => void update.run({ cadence: pendingCadence ? cadence : other })}
          >
            {pendingCadence ? "Annuler le changement" : `Passer en ${CADENCE_LABELS[other].toLowerCase()}`}
          </Btn>
        }
      />

      <SettingRow
        title="Prélèvement automatique"
        hint={
          <Hint label="Comment l'échéance est réglée">
            {autoRenew
              ? "Votre échéance est prélevée sur votre solde disponible. Si le solde n'y suffit pas, rien n'est prélevé et l'opération est retentée chaque nuit."
              : "Votre échéance n'est pas prélevée : vous la réglez vous-même, par carte ou mobile money. Une dette laissée à la résiliation reste, elle, retenue sur votre solde."}
          </Hint>
        }
        action={
          <Btn
            variant={autoRenew ? "o" : "p"}
            loading={update.pending}
            disabled={canceled}
            onClick={() => void update.run({ autoRenew: !autoRenew })}
          >
            {autoRenew ? "Désactiver" : "Activer"}
          </Btn>
        }
      />

      {canceled ? (
        <SettingRow
          title="Résiliation enregistrée"
          description={`Votre abonnement prendra fin le ${fmtDate(periodEnd)}. Vous pouvez revenir sur cette décision jusqu'à cette date.`}
          action={
            <Btn variant="p" loading={resume.pending} onClick={() => void resume.run()}>
              Poursuivre mon abonnement
            </Btn>
          }
        />
      ) : activePaidMembers > 0 ? (
        <SettingRow
          danger
          title="Résilier mon abonnement"
          description={`${activePaidMembers} personne(s) sont abonnées à votre communauté. Fermez-la d'abord : leurs adhésions s'éteindront à leur terme (un mois au plus), et vous pourrez alors résilier.`}
          action={
            <Btn variant="o" asChild>
              <a href="/formateur/communaute">Ouvrir ma communauté</a>
            </Btn>
          }
        />
      ) : confirming ? (
        <SettingRow
          danger
          title="Confirmer la résiliation"
          description={`Votre abonnement courra jusqu'au ${fmtDate(periodEnd)} : rien n'est coupé d'ici là, et la période entamée n'est pas remboursée. Au terme, vos ressources sortiront du catalogue et les sessions programmées après cette date seront annulées.`}
          action={
            <span className="flex flex-wrap items-center gap-3">
              <Btn variant="danger" loading={cancel.pending} onClick={() => void cancel.run()}>
                Résilier
              </Btn>
              <button
                type="button"
                className="text-[13px] font-bold text-ink-2 underline"
                onClick={() => setConfirming(false)}
              >
                Annuler
              </button>
            </span>
          }
        />
      ) : (
        <SettingRow
          danger
          title="Résilier mon abonnement"
          description="À effet à la fin de la période en cours. Rien n'est coupé avant, et la période entamée n'est pas remboursée au prorata."
          action={
            <Btn variant="o" onClick={() => setConfirming(true)}>
              Résilier
            </Btn>
          }
        />
      )}
    </SettingCard>
  );
}
