"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { Cover, coverImageUrl, formatLabel } from "@/components/nk/cover";
import { api } from "@/lib/client";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { paymentFailureMessage } from "@/lib/payment-input";
import type { PaymentProvider, PaymentStatus } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

/** Renseigné quand le paiement porte une adhésion, et non une ressource. */
export interface ConfirmationCommunity {
  name: string;
  slug: string;
  periodEnd: string | null;
}

/** Convention Lot 0 : polling TanStack Query, pas de WebSocket. */
const POLL_INTERVAL_MS = 8_000;
/**
 * Arbitrage 115 — porté de 120 s à 300 s.
 *
 * Le parcours réel sur ce marché n'est pas un aller-retour d'une minute : on
 * quitte le navigateur, on ouvre l'application de mobile money ou on compose un
 * code USSD, on saisit un code secret sur un réseau lent, puis on revient. Deux
 * minutes couvraient à peine le cas favorable ; au-delà, la personne retrouvait
 * un sondage **arrêté** et croyait son paiement perdu, alors qu'il était en
 * cours.
 */
const POLL_TIMEOUT_MS = 300_000;

const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  PAWAPAY: "Mobile money",
  STRIPE: "Carte bancaire",
};

export function ConfirmationStatus({
  purchaseId,
  initialStatus,
  initialFailureCode = null,
  amountFcfa,
  provider,
  courseTitle,
  courseSlug,
  courseCategory,
  courseFormat,
  courseId,
  courseCoverS3Key,
  community = null,
}: {
  purchaseId: string;
  initialStatus: PaymentStatus;
  /** Motif d'échec déjà connu au rendu serveur, avant le premier sondage. */
  initialFailureCode?: string | null;
  amountFcfa: number;
  provider: PaymentProvider;
  courseTitle: string;
  courseSlug: string | null;
  courseCategory: string | null;
  courseFormat: string | null;
  /** Les deux servent la couverture déposée ; nuls pour une adhésion. */
  courseId: string | null;
  courseCoverS3Key: string | null;
  community?: ConfirmationCommunity | null;
}) {
  const [timedOut, setTimedOut] = React.useState(false);
  // Incrémenté par « Vérifier à nouveau » : le compte à rebours repart, et le
  // sondage avec lui.
  const [attempt, setAttempt] = React.useState(0);

  // Au-delà du délai, on cesse d'interroger : l'achat reste suivi dans
  // « Mes achats », le webhook créditera l'accès quand il arrivera.
  React.useEffect(() => {
    setTimedOut(false);
    const id = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [attempt]);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["purchase-reconcile", purchaseId],
    queryFn: async () => {
      const res = await api.get<{
        status: string;
        credited: boolean;
        failureCode: string | null;
      }>(`/api/purchases/${purchaseId}/reconcile`);
      return res.data;
    },
    initialData: { status: initialStatus, credited: false, failureCode: initialFailureCode },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && status !== "PENDING") return false;
      return timedOut ? false : POLL_INTERVAL_MS;
    },
    // Arbitrage 115 — la **seule** dérogation à `refetchOnWindowFocus: false`,
    // qui est posé globalement dans `providers.tsx` par sobriété réseau.
    //
    // Ici la sobriété a tort : le retour de focus est le signal le plus fiable
    // dont on dispose. La personne revient de son application de mobile money,
    // et c'est exactement l'instant où le statut a changé. Sans ça elle
    // attendait jusqu'à huit secondes de plus devant un écran qui disait encore
    // « en attente » — le moment précis où l'on doute d'avoir payé deux fois.
    refetchOnWindowFocus: true,
    // `staleTime` vaut 30 s par défaut (`providers.tsx`) : sans ce zéro, un
    // retour dans les trente secondes suivant le dernier sondage serait
    // considéré comme frais et **ne redemanderait rien** — soit exactement le
    // cas d'une confirmation rapide.
    staleTime: 0,
  });

  const status = data?.status ?? initialStatus;
  const settled = status === "SUCCEEDED";
  const failed = status === "FAILED" || status === "CANCELED";
  // Le motif du fournisseur, traduit. `null` quand le code est inconnu ou
  // absent : on retombe alors sur la formulation générique plutôt que
  // d'affirmer une cause qu'on ignore.
  const failureCode = data?.failureCode ?? initialFailureCode;
  const failureMessage = paymentFailureMessage(failureCode);

  /**
   * Redemander l'état sans recharger la page.
   *
   * C'était un `window.location.reload()` : tout l'écran repartait de zéro,
   * sans rien afficher pendant l'aller-retour — alors que la requête est déjà
   * là, et qu'elle sait dire quand elle travaille. Relancer le compte à rebours
   * rouvre aussi le sondage automatique, refermé au dépassement du délai.
   */
  const recheck = () => {
    setAttempt((n) => n + 1);
    void refetch();
  };

  return (
    <div className="grid items-start gap-8 pt-2 lg:grid-cols-[1fr_360px]">
      <div
        className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-9"
        aria-live="polite"
        aria-busy={!settled && !failed && !timedOut}
      >
        {settled ? (
          <>
            <span className="mb-5 grid size-16 place-items-center rounded-full bg-brand-tint text-brand">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <h2 className="mb-2 text-[24px] font-extrabold">Paiement confirmé</h2>
            {community ? (
              <>
                <p className="mb-6 max-w-[52ch] text-ink-2">
                  Vous êtes membre de <b className="text-ink">{community.name}</b>.
                  {community.periodEnd
                    ? ` Votre adhésion court jusqu'au ${fmtDate(community.periodEnd)}, et vous serez prévenu avant l'échéance.`
                    : ""}{" "}
                  Les ressources incluses sont dès maintenant dans votre espace.
                </p>
                <div className="flex flex-wrap gap-3">
                  <BtnLink href={routes.community(community.slug)} size="lg">
                    Aller à la communauté
                  </BtnLink>
                  <BtnLink href="/mes-communautes" variant="o" size="lg">Mes communautés</BtnLink>
                </div>
              </>
            ) : (
              <>
                <p className="mb-6 max-w-[52ch] text-ink-2">
                  <b className="text-ink">{courseTitle}</b> est ajoutée à vos ressources.
                  L&apos;accès est à vie : vous la retrouverez toujours dans votre espace.
                </p>
                <div className="flex flex-wrap gap-3">
                  <BtnLink href="/mes-ressources" size="lg">Accéder à ma ressource</BtnLink>
                  <BtnLink href="/mes-achats" variant="o" size="lg">Voir mes achats</BtnLink>
                </div>
              </>
            )}
          </>
        ) : failed ? (
          <>
            <span className="mb-5 grid size-16 place-items-center rounded-full bg-danger-tint text-danger">
              <XCircle className="size-8" aria-hidden="true" />
            </span>
            <h2 className="mb-2 text-[24px] font-extrabold">Paiement non abouti</h2>
            <p className="mb-2 max-w-[52ch] text-ink-2">
              {failureMessage ??
                "L'opérateur a refusé ou annulé la transaction."}
            </p>
            <p className="mb-6 max-w-[52ch] text-ink-2">
              Aucun montant n&apos;a été prélevé et aucun accès n&apos;a été ouvert.
            </p>
            {/* Le code brut, discrètement : quand aucune traduction n'existe, il
                reste la seule prise pour le support — et il évite de laisser
                l'apprenant devant une phrase creuse. */}
            {failureCode && !failureMessage ? (
              <p className="mb-6 -mt-4 text-[13px] text-ink-3">
                Motif communiqué : <code>{failureCode}</code>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {courseSlug || community ? (
                <BtnLink
                  href={community ? `/adhesion/${community.slug}` : `/achat/${courseSlug}`}
                  size="lg"
                >
                  Réessayer le paiement
                </BtnLink>
              ) : null}
              <BtnLink href="/contact" variant="o" size="lg">Contacter le support</BtnLink>
            </div>
          </>
        ) : timedOut ? (
          <>
            <span className="mb-5 grid size-16 place-items-center rounded-full bg-gold-tint text-gold-ink">
              <Clock className="size-8" aria-hidden="true" />
            </span>
            <h2 className="mb-2 text-[24px] font-extrabold">Paiement toujours en attente</h2>
            <p className="mb-6 max-w-[52ch] text-ink-2">
              L&apos;opérateur n&apos;a pas encore confirmé la transaction. C&apos;est fréquent en
              mobile money. Dès qu&apos;elle est confirmée, la ressource apparaît dans votre
              espace : rien n&apos;est perdu.
            </p>
            <div className="flex flex-wrap gap-3">
              <BtnLink href="/mes-achats" size="lg">Suivre dans mes achats</BtnLink>
              <Btn variant="o" size="lg" loading={isFetching} onClick={recheck}>
                Vérifier à nouveau
              </Btn>
            </div>
          </>
        ) : (
          <>
            <span className="mb-5 grid size-16 place-items-center rounded-full bg-brand-tint text-brand">
              <Loader2 className="size-8 animate-spin" aria-hidden="true" />
            </span>
            <h2 className="mb-2 text-[24px] font-extrabold">
              {provider === "PAWAPAY" ? "Regardez votre téléphone" : "Confirmation en cours…"}
            </h2>
            {/* Le mobile money ne redirige plus vers une page hébergée : l'opérateur
                pousse une demande sur le téléphone, et sans cette consigne
                l'apprenant attend un écran qui ne viendra jamais. */}
            <p className="max-w-[52ch] text-ink-2">
              {provider === "PAWAPAY"
                ? "Une demande de paiement vient d’être envoyée sur votre numéro. Saisissez votre code secret pour la valider. Cette page se met à jour toute seule."
                : "Nous attendons la confirmation de l’opérateur. Vous pouvez laisser cette page ouverte : elle se met à jour toute seule."}
            </p>
          </>
        )}
      </div>

      <aside
        aria-label="Détail de la transaction"
        className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm"
      >
        {courseCategory && courseFormat ? (
          <Cover
            category={courseCategory}
            format={courseFormat}
            typeLabel={formatLabel(courseFormat).toUpperCase()}
            imageUrl={courseId ? coverImageUrl({ id: courseId, coverS3Key: courseCoverS3Key }) : null}
          />
        ) : null}
        <dl className="grid gap-3 p-6 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">{community ? "Communauté" : "Ressource"}</dt>
            <dd className="text-right font-bold">{courseTitle}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Montant</dt>
            <dd className="font-bold">{fmtFcfa(amountFcfa)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Moyen</dt>
            <dd className="font-bold">{PROVIDER_LABEL[provider]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Référence</dt>
            <dd className="font-mono text-[13px] font-bold">{purchaseId.slice(0, 8)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
