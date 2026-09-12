import { Check, Minus } from "lucide-react";
import { Hint } from "@/components/nk/hint";
import { StPill } from "@/components/nk/status-pill";
import { fmtDate } from "@/lib/format";
import {
  KYC_THRESHOLD_VERIFIED,
  KYC_WEIGHT_PI,
  KYC_WEIGHT_RIB,
  KYC_WEIGHT_SENIORITY,
  KYC_WEIGHT_CLEAN_SALES,
  KYC_WEIGHT_NO_OPEN_DISPUTE,
  CLEAN_SALES_MIN_COUNT,
  CLEAN_SALES_WINDOW_DAYS,
  SENIORITY_MIN_DAYS,
  type KycScore,
} from "@/lib/kyc";

const BADGES = {
  VERIFIED: { label: "Vérifié", tone: "ok" as const },
  TO_VERIFY: { label: "À vérifier", tone: "warn" as const },
  UNVERIFIED: { label: "Non vérifié", tone: "bad" as const },
};

/**
 * Le score n'est pas une note : c'est la somme de cinq critères dont chacun se
 * gagne par une action précise. On affiche donc les cinq lignes et leur poids,
 * pas seulement le total — un formateur à 70 doit voir *quels* 30 points
 * manquent, et lesquels dépendent de lui.
 */
export function KycPanel({ kyc }: { kyc: KycScore }) {
  const badge = BADGES[kyc.badge];
  const criteria = [
    {
      done: kyc.criteria.piVerified,
      weight: KYC_WEIGHT_PI,
      label: "Pièce d'identité vérifiée",
      detail: "Validée lors de votre candidature de formateur.",
    },
    {
      done: kyc.criteria.ribVerified,
      weight: KYC_WEIGHT_RIB,
      label: "Moyen de paiement vérifié",
      detail: "Le seul critère qui se gagne depuis cet écran.",
    },
    {
      done: kyc.criteria.seniority30Days,
      weight: KYC_WEIGHT_SENIORITY,
      label: `Ancienneté de ${SENIORITY_MIN_DAYS} jours`,
      detail: "Compte à partir de l'approbation de votre candidature.",
    },
    {
      done: kyc.criteria.cleanSales3,
      weight: KYC_WEIGHT_CLEAN_SALES,
      label: `${CLEAN_SALES_MIN_COUNT} ventes réglées sans litige`,
      // « 7 sur 3 » se lit mal une fois le critère dépassé : on ne compare au
      // seuil que tant qu'il reste à atteindre.
      detail: kyc.criteria.cleanSales3
        ? `${kyc.details.cleanSalesCount} sur les ${CLEAN_SALES_WINDOW_DAYS} derniers jours.`
        : `${kyc.details.cleanSalesCount} sur ${CLEAN_SALES_MIN_COUNT} à ce jour.`,
    },
    {
      done: kyc.criteria.noOpenDispute,
      weight: KYC_WEIGHT_NO_OPEN_DISPUTE,
      label: "Aucun litige ouvert",
      detail:
        kyc.details.totalCompletedSales === 0
          ? "Ne compte qu'à partir de votre première vente réglée."
          : `${kyc.details.openDisputesCount} litige${kyc.details.openDisputesCount > 1 ? "s" : ""} en cours.`,
    },
  ];

  return (
    <section
      aria-labelledby="kyc-titre"
      className="rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 id="kyc-titre" className="text-[15.5px] font-extrabold sm:text-[16.5px]">
            Score de confiance
          </h2>
          {/* À quoi sert le score est une règle (arbitrage 138) ; le délai de
              sécurité **en cours**, lui, reste écrit sous la liste : ce n'est pas
              une explication, c'est ce qui retient un retrait aujourd'hui. */}
          <Hint label="À quoi sert ce score">
            {kyc.firstPayout ? (
              <>
                Votre <b>premier retrait passe toujours en revue manuelle</b>, quel que soit ce
                score. L&apos;approbation automatique à partir de {KYC_THRESHOLD_VERIFIED} points
                ne s&apos;applique qu&apos;aux suivants.
              </>
            ) : (
              <>
                À partir de {KYC_THRESHOLD_VERIFIED} points, vos retraits sont approuvés
                automatiquement — hors délai de sécurité en cours sur un moyen de paiement
                récent.
              </>
            )}
          </Hint>
        </div>
        <StPill tone={badge.tone}>{badge.label}</StPill>
      </div>

      <p className="flex items-baseline gap-2">
        <b className="font-display text-[34px] font-extrabold leading-none text-ink">
          {kyc.score}
        </b>
        <span className="text-[13px] text-ink-2">sur 100</span>
      </p>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line-2"
        role="img"
        aria-label={`Score de ${kyc.score} sur 100`}
      >
        <i
          className="block h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${kyc.score}%` }}
        />
      </div>

      {/*
        Le détail ne paraît que sous un critère **non acquis** : c'est là qu'il
        dit quoi faire — « 0 sur 3 à ce jour », « ne compte qu'à partir de votre
        première vente ». Sous un critère déjà gagné, il ne faisait que tenir
        une ligne de plus ; la liste occupait 298 px sur un téléphone, et la
        moitié ne servait qu'à confirmer ce que la coche disait déjà.
      */}
      <ul className="mt-4 grid gap-2.5">
        {criteria.map((c) => (
          <li key={c.label} className="flex items-start gap-3">
            <span
              className={
                c.done
                  ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-tint text-brand"
                  : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-line-2 text-ink-3"
              }
              aria-hidden="true"
            >
              {c.done ? <Check className="size-3" /> : <Minus className="size-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <b className={c.done ? "text-[13.5px] font-bold text-ink" : "text-[13.5px] font-bold text-ink-2"}>
                  {c.label}
                </b>
                <span className="text-[13px] font-semibold text-ink-3">
                  {c.done ? `+${c.weight}` : `${c.weight} pts`}
                </span>
              </span>
              {c.done ? null : (
                <span className="block text-[13px] leading-snug text-ink-3">{c.detail}</span>
              )}
            </span>
            <span className="sr-only">{c.done ? "Acquis" : "Non acquis"}</span>
          </li>
        ))}
      </ul>

      {/* Ne reste ici que ce qui retient un retrait maintenant. Le reste — ce
          à quoi sert le score — est passé dans le ⓘ du titre. */}
      {kyc.carenceActive ? (
        <p className="mt-4 border-t border-line pt-3.5 text-[13px] leading-relaxed text-ink-3">
          Délai de sécurité en cours jusqu&apos;au {fmtDate(kyc.details.carenceUntil!)}.
        </p>
      ) : null}
    </section>
  );
}
