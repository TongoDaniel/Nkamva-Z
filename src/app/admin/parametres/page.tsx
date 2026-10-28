import type { Metadata } from "next";
import type { PlanCadence, PlatformTariff, TariffKind } from "@prisma/client";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { getAuthContext } from "@/lib/api";
import { getCurrentTariffs, listTariffs, listDiscounts, CADENCE_LABELS } from "@/lib/pricing";
import { getCurrentStorageTierTariffs, STORAGE_TIER_BYTES } from "@/lib/storage-tiers";
import { listSettings, SETTING_SPECS, isNumericSettingKey } from "@/lib/settings";
import { fmtFcfa, fmtDate } from "@/lib/format";
import { TRAINER_STORAGE_QUOTA_BYTES, sizeLimitLabel } from "@/lib/rules";
import { PricingActions } from "./pricing-actions";
import { EndDiscountButton } from "./end-discount-button";
import { SettingRow } from "./setting-row";
import { PLATFORM_RULES } from "./rules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paramètres",
  robots: { index: false },
};

const DISCOUNT_KIND_LABELS: Record<string, string> = {
  CAMPAIGN: "Campagne",
  TRAINER: "Remise nominative",
  PROMO_CODE: "Code promo",
};

/**
 * Deux natures partagent la grille (arbitrage 69). L'historique les mêle par
 * ordre de date : sans cette étiquette, un prix de palier se lirait comme une
 * baisse de l'abonnement.
 */
const TARIFF_KIND_LABELS: Record<TariffKind, string> = {
  SUBSCRIPTION: "Abonnement",
  STORAGE_TIER: "Palier stockage",
};

/** Les deux cadences d'une grille, à l'identique pour l'abonnement et le palier. */
function CurrentTariffTiles({
  current,
  emptyNote,
}: {
  current: Record<PlanCadence, PlatformTariff | null>;
  emptyNote: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["MONTHLY", "YEARLY"] as const).map((cadence) => {
        const tariff = current[cadence];
        return (
          <div key={cadence} className="rounded-nk-lg border border-line p-5">
            <p className="mb-1 text-[13px] font-bold uppercase tracking-wide text-ink-3">
              {CADENCE_LABELS[cadence]}
            </p>
            {tariff ? (
              <>
                <p className="font-display text-[26px] font-extrabold leading-none">
                  {tariff.amountFcfa === 0 ? "Gratuit" : fmtFcfa(tariff.amountFcfa)}
                </p>
                <p className="mt-2 text-[13px] text-ink-2">
                  Depuis le {fmtDate(tariff.validFrom)}
                  {tariff.validUntil ? ` · jusqu'au ${fmtDate(tariff.validUntil)}` : ""}
                </p>
                {tariff.label ? (
                  <p className="mt-1 text-[13px] text-ink-3">{tariff.label}</p>
                ) : null}
              </>
            ) : (
              <>
                <p className="font-display text-[26px] font-extrabold leading-none text-ink-3">—</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{emptyNote}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default async function ParametresPage() {
  const auth = await getAuthContext();
  // Décision 60 — la grille tarifaire et la bascule gratuit ⇄ payant sont au
  // Super-admin. Finances n'a que les remises, qui ne vivent pas sur cet écran.
  if (auth?.user.adminRole !== "SUPER_ADMIN") redirect("/admin");

  const [current, storageCurrent, history, discounts, settings] = await Promise.all([
    getCurrentTariffs(),
    getCurrentStorageTierTariffs(),
    listTariffs(),
    listDiscounts(),
    listSettings(),
  ]);

  const now = new Date();

  // Une clé câblée mais jamais écrite n'a pas de ligne en base, et l'écran ne
  // la montrait donc pas : le réglage existait, agissait par son défaut, et
  // restait introuvable pour qui voulait le changer. On part du registre, pas
  // de la table — c'est le registre qui dit ce que la plateforme sait régler.
  const stored = new Map(settings.map((s) => [s.key, s]));
  const settingRows = [
    ...settings.filter((s) => !isNumericSettingKey(s.key)),
    ...Object.keys(SETTING_SPECS).map((key) => {
      const row = stored.get(key);
      const spec = SETTING_SPECS[key as keyof typeof SETTING_SPECS];
      return {
        key,
        value: row?.value ?? String(spec.fallback),
        description: row?.description ?? null,
      };
    }),
  ].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <>
      <AdminHead
        title="Paramètres"
        lead="Le tarif de l'abonnement formateur vit en base et il est daté : la gratuité de lancement n'est pas codée en dur, c'est un tarif à 0 avec une date de fin."
      />

      <div className="grid gap-6">
        <AdminCard title="Tarif d'abonnement en vigueur">
          <CurrentTariffTiles
            current={current}
            emptyNote="Aucun tarif posé. Tant qu'il n'y en a pas, l'abonnement est de fait gratuit."
          />

          <PricingActions />

          <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
            Un nouveau tarif porte une date d&apos;effet et ne s&apos;applique jamais au passé.
            La bascule prend effet <b className="font-bold text-ink-2">à l&apos;échéance de
            chaque formateur</b>, pas à une date commune : personne n&apos;est débité par
            surprise, et il n&apos;y a aucun prorata à calculer.
          </p>
        </AdminCard>

        <AdminCard title="Palier de stockage en vigueur">
          <CurrentTariffTiles
            current={storageCurrent}
            emptyNote="Aucun prix posé. Les paliers pris par les formateurs ne facturent alors rien, et rien ne leur sera réclamé rétroactivement le jour où un prix sera posé."
          />

          <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
            Au-delà des {sizeLimitLabel(TRAINER_STORAGE_QUOTA_BYTES)} inclus, le stockage s&apos;achète par tranches de{" "}
            {sizeLimitLabel(STORAGE_TIER_BYTES)}, depuis le portefeuille du formateur. Le palier{" "}
            <b className="font-bold text-ink-2">se facture avec l&apos;abonnement</b>, à sa cadence :
            il n&apos;a pas d&apos;échéance propre. Le prix se pose avec le même bouton ci-dessus,
            en choisissant « Palier de stockage ».
          </p>
        </AdminCard>

        {history.length > 0 ? (
          <AdminCard title="Historique des tarifs">
            <ul className="flex flex-col">
              {history.map((tariff) => {
                const active =
                  tariff.validFrom <= now && (!tariff.validUntil || tariff.validUntil > now);
                return (
                  <li
                    key={tariff.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0"
                  >
                    <span className="w-[130px] shrink-0 text-[13px] font-bold text-ink-2">
                      {TARIFF_KIND_LABELS[tariff.kind] ?? tariff.kind}
                    </span>
                    <span className="w-[90px] shrink-0 text-[13px] text-ink-3">
                      {CADENCE_LABELS[tariff.cadence]}
                    </span>
                    <span className="text-[13.5px] font-bold">
                      {tariff.amountFcfa === 0 ? "Gratuit" : fmtFcfa(tariff.amountFcfa)}
                    </span>
                    <span className="text-[13px] text-ink-3">
                      {fmtDate(tariff.validFrom)}
                      {tariff.validUntil ? ` → ${fmtDate(tariff.validUntil)}` : " → en cours"}
                    </span>
                    {active ? <StPill tone="ok">En vigueur</StPill> : null}
                    {tariff.label ? (
                      <span className="text-[13px] text-ink-3">{tariff.label}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </AdminCard>
        ) : null}

        <AdminCard title="Réductions">
          {discounts.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-ink-2">
              Aucune réduction. Trois canaux existent (campagne, remise nominative, code promo)
              et <b className="font-bold text-ink">la plus favorable l&apos;emporte</b> : elles ne
              s&apos;additionnent jamais.
            </p>
          ) : (
            <>
              <ul className="flex flex-col">
                {discounts.map((discount) => {
                  const active =
                    discount.validFrom <= now && (!discount.validUntil || discount.validUntil > now);
                  const exhausted =
                    discount.maxUses !== null && discount.usedCount >= discount.maxUses;
                  return (
                    <li
                      key={discount.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0"
                    >
                      <span className="w-[130px] shrink-0 text-[13px] font-bold text-ink-2">
                        {DISCOUNT_KIND_LABELS[discount.kind] ?? discount.kind}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                        {discount.label}
                        {discount.code ? (
                          <code className="ml-2 rounded bg-paper px-1.5 py-0.5 font-mono text-[13px] text-ink-3">
                            {discount.code}
                          </code>
                        ) : null}
                      </span>
                      <span className="text-[13.5px] font-bold">
                        −{fmtFcfa(discount.amountFcfa)}
                      </span>
                      {discount.maxUses !== null ? (
                        <span className="text-[13px] text-ink-3">
                          {discount.usedCount}/{discount.maxUses}
                        </span>
                      ) : null}
                      {exhausted ? (
                        <StPill tone="muted">Épuisée</StPill>
                      ) : active ? (
                        <>
                          <StPill tone="ok">Active</StPill>
                          <EndDiscountButton discountId={discount.id} />
                        </>
                      ) : (
                        <StPill tone="muted">Inactive</StPill>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
                Cumul : <b className="font-bold text-ink-2">la plus favorable l&apos;emporte</b>.
                Trois remises ne s&apos;empilent pas : l&apos;addition mènerait l&apos;abonnement
                à zéro sans que personne l&apos;ait décidé.
              </p>
            </>
          )}
        </AdminCard>

        {settingRows.length > 0 ? (
          <AdminCard title="Réglages système">
            <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
              Ces valeurs vivent en base, pas dans le code, contrairement aux règles ci-dessous.{" "}
              <b className="font-bold text-ink">
                Les modifier change ce que fait la plateforme, tout de suite
              </b>{" "}
              : chaque réglage dit sous sa valeur les écrans qu&apos;il commande.
            </p>
            <dl>
              {settingRows.map((setting) => {
                const spec = isNumericSettingKey(setting.key)
                  ? SETTING_SPECS[setting.key]
                  : null;
                return (
                  <SettingRow
                    key={setting.key}
                    settingKey={setting.key}
                    value={setting.value}
                    description={setting.description}
                    effect={spec?.effect ?? null}
                    min={spec?.min ?? null}
                    max={spec?.max ?? null}
                  />
                );
              })}
            </dl>
          </AdminCard>
        ) : null}

        <AdminCard title="Règles en vigueur">
          <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
            Ces valeurs gouvernent la plateforme et vivent dans le code, pas en base. Elles sont
            affichées ici pour être vérifiables ;{" "}
            <b className="font-bold text-ink">les modifier demande une livraison</b>, parce
            qu&apos;elles portent des arbitrages, pas des préférences.
          </p>
          <dl>
            {PLATFORM_RULES.map((rule) => (
              <div
                key={rule.label}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0"
              >
                <dt className="w-full shrink-0 text-[13px] text-ink-2 sm:w-[280px]">
                  {rule.label}
                  <span className="ml-2 text-[13px] text-ink-3">{rule.source}</span>
                </dt>
                <dd className="min-w-0 flex-1 text-[14px] font-bold text-ink">
                  {rule.value}
                  {rule.note ? (
                    <span className="ml-2 text-[13px] font-normal text-ink-3">{rule.note}</span>
                  ) : null}
                  {rule.alert ? (
                    <span className="mt-1 block text-[13px] font-semibold text-danger">
                      {rule.alert}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </AdminCard>
      </div>

      <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-ink-3">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Chaque modification de tarif ou de réduction est journalisée avec votre identité, et
        aucune ne réécrit une période déjà facturée : le montant consenti est figé sur
        l&apos;abonnement au moment où il est souscrit.
      </p>
    </>
  );
}
