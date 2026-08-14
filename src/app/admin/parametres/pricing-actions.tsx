"use client";

import * as React from "react";
import { Plus, Tag } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { Field } from "@/components/nk/input";
import { actionErrorMessage, useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/** Demain, au format d'un `<input type="date">`. */
function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Poser un tarif et accorder une réduction. Les deux portent une date d'effet :
 * décision 59, une bascule ne s'applique jamais à l'instant du clic, et jamais
 * au passé.
 */
export function PricingActions() {
  const [dialog, setDialog] = React.useState<null | "tariff" | "discount">(null);
  const action = useKeyedAction();
  // Un seul emplacement d'erreur, partagé par le contrôle local et l'API : les
  // deux s'affichent au même endroit dans la modale, et une seule est vraie à
  // la fois. Le toast du hook est donc neutralisé (`error: null`).
  const [error, setError] = React.useState<string | null>(null);

  // Deux natures de tarif partagent la grille (arbitrage 69). Elles sont bornées
  // séparément côté service : poser un prix de palier ne clôt pas l'abonnement
  // en vigueur.
  const [tariffKind, setTariffKind] = React.useState<"SUBSCRIPTION" | "STORAGE_TIER">(
    "SUBSCRIPTION",
  );
  const [cadence, setCadence] = React.useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [amount, setAmount] = React.useState("");
  const [validFrom, setValidFrom] = React.useState(tomorrow());
  const [label, setLabel] = React.useState("");
  const storageTier = tariffKind === "STORAGE_TIER";

  const [kind, setKind] = React.useState<"CAMPAIGN" | "TRAINER" | "PROMO_CODE">("CAMPAIGN");
  const [discountLabel, setDiscountLabel] = React.useState("");
  const [discountAmount, setDiscountAmount] = React.useState("");
  const [code, setCode] = React.useState("");
  const [trainerId, setTrainerId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [validUntil, setValidUntil] = React.useState("");

  const onApiError = (err: unknown) =>
    setError(actionErrorMessage(err, "L'enregistrement a échoué."));

  function submitTariff() {
    setError(null);
    const value = Number.parseInt(amount, 10);
    if (!Number.isFinite(value) || value < 0) {
      setError("Le montant doit être un entier positif ou nul. Zéro vaut gratuité.");
      return;
    }
    void action.run(
      "tariff",
      () =>
        api.post("/api/admin/pricing/tariffs", {
          kind: tariffKind,
          cadence,
          amountFcfa: value,
          validFrom: new Date(`${validFrom}T00:00:00`).toISOString(),
          ...(label.trim() ? { label: label.trim() } : {}),
        }),
      {
        success: storageTier ? "Prix du palier enregistré." : "Tarif d'abonnement enregistré.",
        error: null,
        onError: onApiError,
        onSuccess: () => {
          setDialog(null);
          setAmount("");
          setLabel("");
        },
      },
    );
  }

  function submitDiscount() {
    setError(null);
    const value = Number.parseInt(discountAmount, 10);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Une réduction est un montant en FCFA, strictement positif.");
      return;
    }
    void action.run(
      "discount",
      () =>
        api.post("/api/admin/pricing/discounts", {
          kind,
          label: discountLabel.trim(),
          amountFcfa: value,
          ...(kind === "PROMO_CODE" ? { code: code.trim().toUpperCase() } : {}),
          ...(kind === "TRAINER" ? { trainerId: trainerId.trim(), reason: reason.trim() } : {}),
          validFrom: new Date(`${validFrom}T00:00:00`).toISOString(),
          ...(validUntil ? { validUntil: new Date(`${validUntil}T00:00:00`).toISOString() } : {}),
        }),
      {
        success: "Réduction enregistrée.",
        error: null,
        onError: onApiError,
        onSuccess: () => {
          setDialog(null);
          setDiscountLabel("");
          setDiscountAmount("");
          setCode("");
          setTrainerId("");
          setReason("");
        },
      },
    );
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Btn size="sm" onClick={() => setDialog("tariff")}>
          <Plus aria-hidden="true" />
          Poser un tarif
        </Btn>
        <Btn size="sm" variant="o" onClick={() => setDialog("discount")}>
          <Tag aria-hidden="true" />
          Accorder une réduction
        </Btn>
      </div>

      <Modal
        open={dialog === "tariff"}
        onOpenChange={(open) => setDialog(open ? "tariff" : null)}
        title="Poser un tarif"
        description="Il prend effet à la date choisie, et s'applique à chaque formateur à son propre renouvellement."
        footer={
          <>
            <Btn loading={action.isRunning("tariff")} onClick={submitTariff}>
              Enregistrer
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        {error ? (
          <p className="mb-4 rounded-xl bg-danger/5 px-4 py-3 text-[13px] font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <div className="mb-[18px]">
          <label htmlFor="tariff-kind" className="mb-1.5 block text-[13.5px] font-bold text-ink">
            Ce que ce tarif facture
          </label>
          <select
            id="tariff-kind"
            value={tariffKind}
            onChange={(e) => setTariffKind(e.target.value as typeof tariffKind)}
            className="w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          >
            <option value="SUBSCRIPTION">Abonnement formateur</option>
            <option value="STORAGE_TIER">Palier de stockage (50 Go)</option>
          </select>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
            {storageTier
              ? "Le palier se facture avec l'abonnement, à sa cadence. Tant qu'aucun prix n'est posé, un palier ne facture rien."
              : "Les deux grilles sont indépendantes : poser l'une ne clôt pas l'autre."}
          </p>
        </div>

        <div className="mb-[18px]">
          <label htmlFor="cadence" className="mb-1.5 block text-[13.5px] font-bold text-ink">
            Cadence
          </label>
          <select
            id="cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as "MONTHLY" | "YEARLY")}
            className="w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          >
            <option value="MONTHLY">Mensuelle</option>
            <option value="YEARLY">Annuelle</option>
          </select>
        </div>

        <Field
          label={storageTier ? "Prix d'un palier (FCFA)" : "Montant (FCFA)"}
          type="number"
          inputMode="numeric"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={
            storageTier
              ? "Prix d'une tranche de 50 Go, à cette cadence. Zéro rend les paliers gratuits."
              : "Zéro vaut gratuité — c'est ainsi qu'on ouvre une période de lancement."
          }
        />
        <Field
          label="Date d'effet"
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
          hint="Jamais dans le passé : un tarif ne réécrit pas une période facturée."
        />
        <Field
          label="Libellé"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={storageTier ? "Palier 50 Go" : "Gratuité de lancement"}
        />
      </Modal>

      <Modal
        open={dialog === "discount"}
        onOpenChange={(open) => setDialog(open ? "discount" : null)}
        title="Accorder une réduction"
        description="Trois canaux, un seul résultat : le montant consenti. La plus favorable l'emporte, elles ne s'additionnent jamais."
        footer={
          <>
            <Btn loading={action.isRunning("discount")} disabled={discountLabel.trim().length < 3} onClick={submitDiscount}>
              Enregistrer
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        {error ? (
          <p className="mb-4 rounded-xl bg-danger/5 px-4 py-3 text-[13px] font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <div className="mb-[18px]">
          <label htmlFor="kind" className="mb-1.5 block text-[13.5px] font-bold text-ink">
            Canal
          </label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          >
            <option value="CAMPAIGN">Campagne — valable pour tous</option>
            <option value="TRAINER">Remise nominative — un formateur</option>
            <option value="PROMO_CODE">Code promo — saisi à la souscription</option>
          </select>
        </div>

        <Field
          label="Libellé"
          value={discountLabel}
          onChange={(e) => setDiscountLabel(e.target.value)}
          placeholder="Rentrée 2026"
        />
        <Field
          label="Montant retiré (FCFA)"
          type="number"
          inputMode="numeric"
          min={1}
          value={discountAmount}
          onChange={(e) => setDiscountAmount(e.target.value)}
          hint="Un montant, pas un pourcentage : deux réductions se comparent alors sans ambiguïté d'arrondi."
        />

        {kind === "PROMO_CODE" ? (
          <Field
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="RENTREE26"
            hint="Valable à la souscription uniquement, jamais au renouvellement."
          />
        ) : null}

        {kind === "TRAINER" ? (
          <>
            <Field
              label="Identifiant du formateur"
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              placeholder="UUID du profil formateur"
            />
            <Field
              label="Motif"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Geste commercial après incident de facturation"
              hint="Obligatoire : une remise nominative contourne la grille, elle doit rester auditable."
            />
          </>
        ) : null}

        <Field
          label="Valable à partir du"
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
        />
        <Field
          label="Jusqu'au"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          hint="Facultatif. Sans date de fin, la réduction court indéfiniment."
        />
      </Modal>
    </>
  );
}
