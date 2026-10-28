import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, ShieldAlert } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { getAuthContext } from "@/lib/api";
import { getPayoutMethodDetail, PAYOUT_METHOD_MAX_REJECTIONS } from "@/lib/payout-methods";
import { fmtDate } from "@/lib/format";
import { ReviewActions } from "./review-actions";
import {
  METHOD_STATUS, NATURE_LABELS, OPERATOR_LABELS,
  VERIFICATION_METHOD_LABELS, DOCUMENT_LABELS,
} from "../status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instruire un moyen de paiement",
  robots: { index: false },
};

/** Ligne d'un tableau de correspondances clé/valeur. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0">
      <dt className="w-full shrink-0 text-[13px] font-bold text-ink-3 sm:w-[220px]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] text-ink">{children}</dd>
    </div>
  );
}

export default async function MoyenDePaiementDetailPage({
  params,
}: {
  params: Promise<{ payoutMethodId: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }
  const { payoutMethodId } = await params;

  const method = await getPayoutMethodDetail(payoutMethodId).catch(() => null);
  if (!method) notFound();

  const isSuperAdmin = auth.user.adminRole === "SUPER_ADMIN";
  const state = METHOD_STATUS[method.verificationStatus] ?? {
    label: method.verificationStatus,
    tone: "muted" as const,
    help: "",
  };
  const trainer = method.trainerProfile.user;
  const name = trainer.fullName ?? trainer.email;
  const comparison = method.nameComparison;

  return (
    <>
      <AdminHead
        title={name}
        lead={
          <>
            {NATURE_LABELS[method.accountNature]} · enregistré le {fmtDate(method.createdAt)}
          </>
        }
        actions={
          <BtnLink href="/admin/moyens-de-paiement" variant="o" size="sm">
              <ArrowLeft aria-hidden="true" />
              Retour à la file
          </BtnLink>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StPill tone={state.tone}>{state.label}</StPill>
        <span className="text-[13px] text-ink-2">{state.help}</span>
      </div>

      {method.verificationStatus === "BLOCKED" ? (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-nk-lg border border-danger/30 bg-danger/5 p-5">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <b className="block text-[14.5px] font-extrabold text-ink">
              Escalade ouverte après {PAYOUT_METHOD_MAX_REJECTIONS} refus
            </b>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
              Décision 27 : Finances ne tranche pas seule un écart de nom persistant.
              {isSuperAdmin
                ? " Vous avez accès à l'identité et au moyen de paiement : c'est à vous d'arbitrer."
                : " Un Super-admin doit reprendre ce dossier ; vous pouvez le consulter mais pas le trancher."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="grid gap-6">
          {/*
            Décision 22a — la comparaison est présentée normalisée pour que
            l'instructeur voie ce que la machine voit : accents, casse, ordre des
            mots et forme juridique sont neutralisés des deux côtés.
          */}
          <AdminCard title="Comparaison des noms">
            <dl>
              <Row label="Nom légal vérifié">
                {/*
                  Décision 21 — Finances lit ce champ pour la comparaison, et
                  n'a jamais accès à l'image de la pièce d'identité. Aucun lien
                  vers les pièces du dossier de candidature ici : c'est
                  volontaire.
                */}
                {method.trainerProfile.verifiedLegalName ?? (
                  <span className="text-danger">absent, vérification impossible</span>
                )}
              </Row>
              <Row
                label={
                  method.accountNature === "BUSINESS"
                    ? "Dénomination sociale déclarée"
                    : "Titulaire déclaré"
                }
              >
                {comparison.expectedName ?? "—"}
                {comparison.expectedNormalized ? (
                  <>
                    {/* Sans ce libellé, la forme normalisée se lit collée au nom :
                        « Sarr Formation SARLformation sarr ». */}
                    <span className="sr-only">, forme normalisée : </span>
                    <code className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[13px] text-ink-3">
                      {comparison.expectedNormalized}
                    </code>
                  </>
                ) : null}
              </Row>
              <Row label="Nom renvoyé par l'opérateur">
                {comparison.operatorName ? (
                  <>
                    {comparison.operatorName}
                    <span className="sr-only">, forme normalisée : </span>
                    <code className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[13px] text-ink-3">
                      {comparison.operatorNormalized}
                    </code>
                  </>
                ) : (
                  <span className="text-ink-3">
                    Aucun contrôle opérateur disponible : la comparaison vous revient.
                  </span>
                )}
              </Row>
              {comparison.operatorMatch ? (
                <Row label="Résultat automatique">
                  <StPill tone={comparison.operatorMatch === "MATCH" ? "ok" : "bad"}>
                    {comparison.operatorMatch === "MATCH" ? "Concordance" : "Écart"}
                  </StPill>
                </Row>
              ) : null}
            </dl>

            {comparison.businessIsSoleTrader ? (
              <p className="mt-4 rounded-xl border border-line bg-card border-l-4 border-l-gold px-4 py-3 text-[13px] leading-relaxed text-gold-ink rounded-l-sm">
                <b className="font-extrabold">La dénomination sociale est le nom du formateur.</b>{" "}
                C&apos;est le cas d&apos;une entreprise individuelle : légitime, mais le compte
                « de la société » est en pratique celui de la personne. Les documents doivent le
                confirmer.
              </p>
            ) : null}
          </AdminCard>

          <AdminCard title="Coordonnées du compte">
            <dl>
              <Row label="Type">
                {method.type === "BANK_IBAN" ? "Virement bancaire" : "Mobile money"}
              </Row>
              {method.type === "BANK_IBAN" ? (
                <>
                  <Row label="IBAN">
                    <span className="font-mono text-[13.5px]">{method.iban}</span>
                  </Row>
                  {method.bic ? <Row label="BIC">{method.bic}</Row> : null}
                </>
              ) : (
                <>
                  <Row label="Opérateur">
                    {(method.mobileOperator && OPERATOR_LABELS[method.mobileOperator]) ?? "—"}
                  </Row>
                  <Row label="Numéro">
                    <span className="font-mono text-[13.5px]">{method.mobilePhone}</span>
                  </Row>
                </>
              )}
              <Row label="Contact du formateur">
                {method.trainerEmailSnapshot}
                {method.trainerPhoneSnapshot ? ` · ${method.trainerPhoneSnapshot}` : ""}
              </Row>
              {method.verificationMethod ? (
                <Row label="Voie de vérification">
                  {VERIFICATION_METHOD_LABELS[method.verificationMethod] ??
                    method.verificationMethod}
                </Row>
              ) : null}
              {method.carenceUntil ? (
                <Row label="Délai de sécurité">Jusqu&apos;au {fmtDate(method.carenceUntil)}</Row>
              ) : null}
            </dl>
          </AdminCard>

          {method.accountNature === "BUSINESS" ? (
            <AdminCard title="Documents d'entreprise">
              <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
                Décision 28 : la dénomination sociale doit correspondre au compte,{" "}
                <b className="font-bold text-ink">et le nom légal vérifié doit figurer comme
                représentant légal</b> sur ces documents. C&apos;est la partie que la machine ne
                sait pas lire.
              </p>
              <ul className="flex flex-col gap-2.5">
                {(["BUSINESS_DOC", "LEGAL_REP_PROOF"] as const).map((kind) => {
                  const present =
                    kind === "BUSINESS_DOC" ? method.businessDocS3Key : method.legalRepProofS3Key;
                  return (
                    <li key={kind} className="flex flex-wrap items-center gap-3">
                      <FileText className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-[13.5px]">{DOCUMENT_LABELS[kind]}</span>
                      {present ? (
                        <Btn asChild variant="o" size="sm">
                          <a
                            href={`/api/admin/payout-methods/${method.id}/documents/${kind}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ouvrir
                          </a>
                        </Btn>
                      ) : (
                        <span className="text-[13px] font-semibold text-danger">Absent</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
                Chaque ouverture est journalisée avec votre identité.
              </p>
            </AdminCard>
          ) : null}

          {method.microDepositAmount1 !== null && method.microDepositAmount2 !== null ? (
            <AdminCard title="Micro-virements à effectuer">
              <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
                Envoyez ces deux montants sur le compte. Le formateur les saisira depuis son
                portefeuille pour prouver qu&apos;il y a accès.
              </p>
              <dl>
                <Row label="Premier montant">
                  <b className="font-display text-[18px] font-extrabold">
                    {method.microDepositAmount1} FCFA
                  </b>
                </Row>
                <Row label="Second montant">
                  <b className="font-display text-[18px] font-extrabold">
                    {method.microDepositAmount2} FCFA
                  </b>
                </Row>
                {method.microDepositReference ? (
                  <Row label="Référence">
                    <span className="font-mono text-[13.5px]">{method.microDepositReference}</span>
                  </Row>
                ) : null}
                {method.microDepositVerifiedAt ? (
                  <Row label="Confirmés le">{fmtDate(method.microDepositVerifiedAt)}</Row>
                ) : null}
              </dl>
            </AdminCard>
          ) : null}

          <AdminCard title="Historique">
            {method.reviewEvents.length === 0 ? (
              <p className="text-[13px] text-ink-3">Aucune transition enregistrée.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {method.reviewEvents.map((event) => (
                  <li key={event.id} className="border-b border-line-2 pb-3 last:border-b-0 last:pb-0">
                    <p className="text-[13.5px]">
                      <b className="font-bold">
                        {/* L'enregistrement initial part et arrive dans le même
                            état : « À instruire → À instruire » ne dit rien. */}
                        {event.fromStatus === event.toStatus
                          ? "Enregistrement du moyen de paiement"
                          : `${METHOD_STATUS[event.fromStatus]?.label ?? event.fromStatus} → ${
                              METHOD_STATUS[event.toStatus]?.label ?? event.toStatus
                            }`}
                      </b>
                      <span className="ml-2 text-[13px] text-ink-3">
                        {event.actorRole} · {fmtDate(event.createdAt)}
                      </span>
                    </p>
                    {event.note ? (
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{event.note}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </AdminCard>
        </div>

        <aside className="lg:sticky lg:top-6">
          <AdminCard title="Décision">
            <ReviewActions
              payoutMethodId={method.id}
              status={method.verificationStatus}
              accountNature={method.accountNature}
              type={method.type}
              updatedAt={method.updatedAt.toISOString()}
              isSuperAdmin={isSuperAdmin}
              hasVerifiedLegalName={Boolean(method.trainerProfile.verifiedLegalName)}
              microDepositIssued={
                method.verificationMethod === "MICRO_DEPOSIT" &&
                method.microDepositAmount1 !== null &&
                method.microDepositVerifiedAt === null
              }
              rejectionCount={trainer.payoutMethodRejectionCount ?? 0}
              maxRejections={PAYOUT_METHOD_MAX_REJECTIONS}
            />
          </AdminCard>
        </aside>
      </div>
    </>
  );
}
