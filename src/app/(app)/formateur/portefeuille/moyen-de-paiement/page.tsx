import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { InfoBox } from "@/components/nk/info-box";
import { getAuthContext } from "@/lib/api";
import { listMyPayoutMethods, PAYOUT_METHOD_CARENCE_HOURS } from "@/lib/payout-methods";
import { describeMethod } from "../payout-status";
import { NameMismatchNotice } from "./name-mismatch-notice";
import { PayoutMethodForm } from "./payout-method-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moyen de paiement",
  robots: { index: false },
};

export default async function MoyenDePaiementPage() {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const methods = await listMyPayoutMethods(auth.user.trainerId);
  const active = methods.find((m) => m.isActive) ?? null;

  // Décision 30 — l'écart de nom se raconte, il ne se solde pas par un rejet
  // muet. Il vient soit du contrôle opérateur, soit de la revue Finances.
  const nameIssue =
    active &&
    (active.nameLookupResult === "MISMATCH" ||
      active.verificationStatus === "REJECTED" ||
      active.verificationStatus === "BLOCKED");

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Espace formateur", href: "/formateur" },
          { label: "Portefeuille", href: "/formateur/portefeuille" },
          { label: "Moyen de paiement" },
        ]}
        title={active ? "Remplacer votre moyen de paiement" : "Enregistrer un moyen de paiement"}
        lead="Le compte sur lequel NkamVa vous verse vos revenus."
      />

      <div className="mx-auto max-w-[720px]">
        {nameIssue ? <NameMismatchNotice reason={active?.rejectionReason} /> : null}

        {/*
          Décision 29 — la règle est posée avant le formulaire, pas après un
          refus. C'est la seule place où elle évite une saisie inutile.
        */}
        <section
          aria-labelledby="regle-titre"
          className="mb-7 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-6"
        >
          <h2
            id="regle-titre"
            className="mb-3 flex items-center gap-2 text-[15.5px] font-extrabold sm:text-[16.5px]"
          >
            <ShieldCheck className="size-[18px] text-brand" aria-hidden="true" />
            Avant de commencer
          </h2>
          <ul className="grid gap-3 text-[13.5px] leading-relaxed text-ink-2">
            <li>
              <b className="font-bold text-ink">Le compte doit être le vôtre.</b> Aucun compte
              de tiers n&apos;est accepté, quel que soit le lien de parenté ou le motif — ni
              celui d&apos;un proche, ni celui d&apos;un associé à titre personnel.
            </li>
            <li>
              <b className="font-bold text-ink">Il est vérifié, jamais cru sur parole.</b>{" "}
              Selon le type de compte, la vérification passe par l&apos;équipe Finances ou par
              deux micro-virements que vous devrez confirmer.
            </li>
            <li>
              <b className="font-bold text-ink">
                Un délai de sécurité de {PAYOUT_METHOD_CARENCE_HOURS} h s&apos;applique
              </b>{" "}
              après tout enregistrement ou remplacement, même si la vérification aboutit plus
              tôt. Il protège votre solde si votre compte était compromis.
            </li>
            <li>
              <b className="font-bold text-ink">Trois refus suspendent la vérification</b> et
              confient le dossier à un responsable. Le compteur ne se remet pas à zéro en
              enregistrant un autre compte.
            </li>
          </ul>
        </section>

        {active ? (
          <InfoBox>
            Vous remplacez <b>{describeMethod(active)}</b>. L&apos;ancien compte est archivé
            pour l&apos;historique, la vérification recommence de zéro et le délai de{" "}
            {PAYOUT_METHOD_CARENCE_HOURS} h repart. Si vous avez un retrait en cours, il suit
            son cours sur l&apos;ancien compte.
          </InfoBox>
        ) : null}

        <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
          <PayoutMethodForm replacing={Boolean(active)} />
        </section>

        <p className="mt-5 text-center text-[13px] leading-relaxed text-ink-3">
          Une question sur ces règles ?{" "}
          <Link href="/aide" className="font-bold text-brand">
            Consultez l&apos;aide
          </Link>{" "}
          ou écrivez au support.
        </p>
      </div>
    </div>
  );
}
