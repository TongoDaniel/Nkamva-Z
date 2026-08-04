"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, MessageSquareOff } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { api, ApiError } from "@/lib/client";
import { fmtDate, fmtFcfa } from "@/lib/format";

export interface MembershipState {
  status: "ACTIVE" | "PAST_DUE" | "BANNED" | "CANCELED" | "EXPIRED";
  periodEnd: string;
  canceledAt: string | null;
  dueAmountFcfa: number | null;
  gracePeriodEndsAt: string | null;
}

/**
 * Le pavé d'adhésion de la fiche publique. Il remplace le renvoi vers le
 * support qui tenait lieu de tunnel : le bouton mène désormais quelque part.
 *
 * Trois gestes seulement — rejoindre, résilier, se raviser. Le paiement lui-même
 * vit dans `/adhesion/[slug]`, comme l'achat vit dans `/achat/[slug]`.
 */
export function MembershipPanel({
  slug,
  priceFcfa,
  isOwner,
  membership,
}: {
  slug: string;
  priceFcfa: number;
  isOwner: boolean;
  membership: MembershipState | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function act(run: () => Promise<unknown>, done: string) {
    setPending(true);
    try {
      await run();
      toast.success(done);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "L'opération n'a pas abouti. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  if (isOwner) {
    return (
      <p className="mt-4 rounded-nk-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        Vous animez cette communauté : elle vous appartient, vous n&apos;y adhérez pas.
      </p>
    );
  }

  if (!membership) {
    return (
      <>
        <Btn asChild size="lg" block className="mt-4">
          <Link href={`/adhesion/${slug}`}>Rejoindre — {fmtFcfa(priceFcfa)} / mois</Link>
        </Btn>
        <p className="mt-2 text-center text-[12.5px] text-ink-3">
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
        <Btn asChild size="lg" block>
          <Link href={`/adhesion/${slug}`}>
            Régler {membership.dueAmountFcfa ? fmtFcfa(membership.dueAmountFcfa) : ""}
          </Link>
        </Btn>
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
          loading={pending}
          onClick={() =>
            act(
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
        loading={pending}
        onClick={() =>
          act(
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
