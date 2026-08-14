import type { Metadata } from "next";
import { Gift, Users } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { Chip } from "@/components/nk/chip";
import { EmptyState } from "@/components/nk/empty-state";
import { Price } from "@/components/nk/resource-card";
import { getAuthContext } from "@/lib/api";
import { previewInvitation, type AcceptBlocker } from "@/lib/invitations";
import { fmtDate } from "@/lib/format";
import { AcceptGift } from "./invitation-actions";

export const dynamic = "force-dynamic";

// Une invitation est adressée : elle n'a rien à faire dans un index.
export const metadata: Metadata = {
  title: "Votre invitation",
  robots: { index: false, follow: false },
};

/**
 * Ce qui empêche d'accepter, dit à la personne concernée.
 *
 * `NOT_AUTHENTICATED` n'est pas un refus mais une étape : on l'emmène se
 * connecter en gardant l'invitation en main, plutôt que de la renvoyer sur une
 * page d'accueil où elle perdrait son lien.
 */
const BLOCKERS: Record<Exclude<AcceptBlocker, "NOT_AUTHENTICATED">, string> = {
  INVITATION_EMAIL_MISMATCH:
    "Cette invitation vise une autre adresse que celle de votre compte. Connectez-vous avec l'adresse qui l'a reçue.",
  EMAIL_NOT_VERIFIED:
    "Vérifiez votre adresse e-mail avant d'accepter : le code vous a été envoyé à l'inscription.",
  ALREADY_MEMBER: "Vous êtes déjà membre de cette communauté.",
  CANNOT_JOIN_OWN_COMMUNITY: "Vous animez cette communauté : vous n'avez pas à y adhérer.",
  MEMBERSHIP_BANNED: "Vous avez été banni de cette communauté.",
  ACCOUNT_BANNED: "Votre compte ne permet pas de rejoindre une communauté.",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const auth = await getAuthContext();
  const invitation = await previewInvitation(token, auth?.user.id ?? null);

  // Inconnue, expirée, révoquée ou épuisée : un seul message pour les quatre.
  // Les distinguer dirait au porteur d'un jeton au hasard s'il a visé juste.
  if (!invitation) {
    return (
      <div className="nk-wrap pb-16 pt-12">
        <EmptyState
          icon={<Gift />}
          title="Cette invitation n'est plus valable"
          description="Elle a peut-être expiré, été retirée, ou déjà servi. Demandez-en une nouvelle à la personne qui vous l'a transmise."
          action={
            <BtnLink href="/communautes" variant="o">Voir les communautés ouvertes</BtnLink>
          }
        />
      </div>
    );
  }

  const { community, grant, giftMonths, blocker, invitedEmailMasked, expiresAt } = invitation;
  const isGift = grant === "GIFT";
  const here = `/invitation/${encodeURIComponent(token)}`;

  return (
    <div className="nk-wrap pb-16 pt-12">
      <div className="mx-auto max-w-[620px] overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk">
        <div className="h-[120px] bg-gradient-to-br from-navy to-info" />

        <div className="p-7 sm:p-9">
          <Chip tone={isGift ? "clay" : "brand"} className="mb-3">
            {isGift ? "Invitation offerte" : "Invitation"}
          </Chip>

          <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold leading-tight text-balance">
            {community.trainerName ?? "Un formateur"} vous invite dans {community.name}
          </h1>

          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            {isGift ? (
              <>
                <b className="font-bold text-ink">
                  {giftMonths} mois d&apos;adhésion vous sont offerts.
                </b>{" "}
                Vous n&apos;avez rien à régler, et rien ne vous sera prélevé au terme : une adhésion
                offerte s&apos;arrête, elle ne se reconduit pas.
              </>
            ) : (
              <>
                L&apos;adhésion à cette communauté est de{" "}
                <Price amountFcfa={community.priceFcfa} className="text-[17px]" /> par mois,
                résiliable à tout moment.
              </>
            )}
          </p>

          {invitedEmailMasked ? (
            <p className="mt-3 text-[13px] text-ink-3">
              Adressée à {invitedEmailMasked} · expire le {fmtDate(expiresAt)}
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-ink-3">Expire le {fmtDate(expiresAt)}</p>
          )}

          <div className="mt-7 border-t border-line-2 pt-6">
            {blocker === "NOT_AUTHENTICATED" ? (
              <>
                <p className="mb-4 text-[14px] leading-relaxed text-ink-2">
                  Connectez-vous ou créez votre compte pour continuer. Votre invitation vous attend
                  ici.
                </p>
                <div className="flex flex-wrap gap-3">
                  <BtnLink
                    href={`/auth/inscription?callbackUrl=${encodeURIComponent(here)}`}
                    size="lg"
                  >
                    Créer mon compte
                  </BtnLink>
                  <BtnLink
                    href={`/auth/connexion?callbackUrl=${encodeURIComponent(here)}`}
                    variant="o"
                    size="lg"
                  >
                    J&apos;ai déjà un compte
                  </BtnLink>
                </div>
              </>
            ) : blocker ? (
              <>
                <p
                  role="alert"
                  className="mb-4 rounded-xl bg-gold-tint px-4 py-3 text-[14px] leading-relaxed text-gold-ink"
                >
                  {BLOCKERS[blocker]}
                </p>
                <BtnLink href={`/communautes/${community.slug}`} variant="o">
                  Voir la communauté
                </BtnLink>
              </>
            ) : isGift ? (
              <AcceptGift token={token} communityName={community.name} />
            ) : (
              <>
                {/* Le jeton suit dans le tunnel : c'est lui qui attribuera
                    l'adhésion à cette invitation, et qui la consommera au
                    moment du paiement confirmé — pas avant. */}
                <BtnLink
                  href={`/adhesion/${community.slug}?invitation=${encodeURIComponent(token)}`}
                  size="lg"
                >
                  Rejoindre la communauté
                </BtnLink>
                <p className="mt-3 text-[13px] text-ink-3">
                  Vous serez redirigé vers le paiement. Rien n&apos;est prélevé avant votre
                  confirmation.
                </p>
              </>
            )}
          </div>

          <p className="mt-7 flex items-start gap-2.5 border-t border-line-2 pt-5 text-[13px] leading-relaxed text-ink-3">
            <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Vous recevez cette invitation parce que quelqu&apos;un a saisi votre adresse. Aucun
            compte n&apos;a été créé à votre nom, et l&apos;ignorer n&apos;a aucune conséquence.
          </p>
        </div>
      </div>
    </div>
  );
}
