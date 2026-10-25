"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, MessageSquareOff } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtDate, fmtFcfa } from "@/lib/format";

export interface MembershipState {
  status: "ACTIVE" | "PAST_DUE" | "BANNED" | "CANCELED" | "EXPIRED";
  periodEnd: string;
  canceledAt: string | null;
  dueAmountFcfa: number | null;
  gracePeriodEndsAt: string | null;
}

/**
 * Le pavé d'adhésion. Il remplace le renvoi vers le support qui tenait lieu de
 * tunnel : le bouton mène désormais quelque part.
 *
 * Trois gestes seulement — rejoindre, résilier, se raviser. Le paiement lui-même
 * vit dans `/adhesion/[slug]`, comme l'achat vit dans `/achat/[slug]`.
 *
 * Deux écrans le rendent : la fiche publique, où il sert d'abord à rejoindre, et
 * le salon du membre, où il ne sert qu'à gérer ce qui est déjà en cours. Le
 * membre y arrivait auparavant par un lien qui le renvoyait sur la fiche
 * publique — on quittait son espace, pour aboutir sur la page qui vend
 * l'adhésion, afin de la résilier.
 */
export function MembershipPanel({
  slug,
  priceFcfa,
  isOwner,
  membership,
  inCommunity = false,
  acceptsMembers = true,
}: {
  slug: string;
  priceFcfa: number;
  isOwner: boolean;
  membership: MembershipState | null;
  /** Faux quand le formateur est suspendu : on n'y entre plus (M3). */
  acceptsMembers?: boolean;
  /**
   * Rendu depuis le salon de la communauté : « Entrer dans la communauté »
   * disparaît, puisque c'est la page sur laquelle on se trouve.
   */
  inCommunity?: boolean;
}) {
  const action = useKeyedAction();

  function act(key: string, fn: () => Promise<unknown>, done: string) {
    void action.run(key, fn, {
      success: done,
      error: "L'opération n'a pas abouti. Réessayez.",
    });
  }

  if (isOwner) {
    return (
      <p className="mt-4 rounded-nk-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        Vous animez cette communauté : elle vous appartient, vous n&apos;y adhérez pas.
      </p>
    );
  }

  if (!membership && !acceptsMembers) {
    return (
      <p className="mt-4 rounded-nk-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        Cette communauté n&apos;accueille pas de nouveaux membres pour le moment.
      </p>
    );
  }

  if (!membership) {
    return (
      <>
        <BtnLink href={`/adhesion/${slug}`} size="lg" block className="mt-4">
          Rejoindre — {fmtFcfa(priceFcfa)} / mois
        </BtnLink>
        <p className="mt-2 text-center text-[13px] text-ink-3">
          Sans engagement. Le premier mois court à la confirmation du paiement.
        </p>
      </>
    );
  }

  if (membership.status === "PAST_DUE") {
    return (
      <div className="mt-4 grid gap-3">
        <p className="flex items-start gap-2.5 rounded-nk-sm border border-line-2 bg-gold-tint px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden="true" />
          <span>
            <b className="text-ink">Échéance à régler.</b> Votre adhésion prend fin le{" "}
            {fmtDate(membership.gracePeriodEndsAt)} si elle reste impayée. Vous gardez
            l&apos;accès jusque-là.
          </span>
        </p>
        <BtnLink href={`/adhesion/${slug}`} size="lg" block>
            Régler {membership.dueAmountFcfa ? fmtFcfa(membership.dueAmountFcfa) : ""}
        </BtnLink>
      </div>
    );
  }

  if (membership.canceledAt) {
    return (
      <div className="mt-4 grid gap-3">
        <p className="rounded-nk-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          Votre adhésion est résiliée. Elle reste ouverte jusqu&apos;au{" "}
          <b className="text-ink">{fmtDate(membership.periodEnd)}</b>, terme du mois déjà
          réglé.
        </p>
        <Btn
          size="lg"
          block
          loading={action.isRunning("reprise")}
          onClick={() =>
            act(
              "reprise",
              () => api.post(`/api/communities/${encodeURIComponent(slug)}/adhesion/reprise`),
              "Votre adhésion se poursuivra.",
            )
          }
        >
          Reprendre mon adhésion
        </Btn>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      {inCommunity ? null : (
        <BtnLink href={`/mes-communautes/${slug}`} size="lg" block>
          Entrer dans la communauté
        </BtnLink>
      )}
      <p className="flex items-start gap-2.5 rounded-nk-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        {membership.status === "BANNED" ? (
          <>
            <MessageSquareOff className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <span>
              <b className="text-ink">Vous ne pouvez plus prendre la parole ici.</b> Votre accès
              aux ressources de la communauté est conservé.
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <b className="text-ink">Vous êtes membre.</b> Prochaine échéance le{" "}
              {fmtDate(membership.periodEnd)}.
            </span>
          </>
        )}
      </p>
      <Btn
        variant="o"
        size="lg"
        block
        loading={action.isRunning("resiliation")}
        onClick={() =>
          act(
            "resiliation",
            () => api.del(`/api/communities/${encodeURIComponent(slug)}/adhesion`),
            "Résiliée. Votre accès court jusqu'au terme du mois payé.",
          )
        }
      >
        Résilier
      </Btn>
    </div>
  );
}
