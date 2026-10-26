import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, FileSearch, XCircle } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import { getAuthContext } from "@/lib/api";
import { getMyApplication } from "@/lib/trainer-applications";
import { getActivationState } from "@/lib/trainer-activation";
import { payableProvidersForUser } from "@/lib/fx";
import { fmtDate } from "@/lib/format";
import { DOCUMENT_RETENTION_DAYS } from "@/lib/rules";
import { DOCUMENT_SLOTS, DOCUMENT_STATUS } from "@/lib/trainer-document-slots";
import { ActivationPanel } from "./activation-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suivi de ma candidature",
  robots: { index: false },
};

export default async function StatutCandidaturePage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  const application = await getMyApplication(auth.user.id);
  if (!application) redirect("/candidature");
  // Un dossier encore ouvert se complète, il ne se contemple pas.
  if (["DRAFT", "RESUBMISSION_PENDING"].includes(application.status)) redirect("/candidature");

  const documentsByType = new Map(application.documents.map((d) => [d.type, d]));

  // Un dossier accepté n'ouvre plus l'espace à lui seul : le premier abonnement
  // doit être réglé. `getActivationState` rend `null` dès que l'espace existe,
  // ou quand il n'y a rien à payer.
  const activation =
    application.status === "APPROVED" ? await getActivationState(auth.user.id) : null;
  const providers = activation ? await payableProvidersForUser(auth.user.id) : [];

  const view = {
    SUBMITTED: {
      icon: <FileSearch className="size-8" aria-hidden="true" />,
      tone: "bg-info-tint text-info",
      title: "Votre dossier est en cours d'examen",
      body: "L'équipe de modération examine chaque candidature une par une. Vous serez prévenu par e-mail dès qu'une décision est prise, favorable ou non.",
    },
    APPROVED: {
      icon: <CheckCircle2 className="size-8" aria-hidden="true" />,
      tone: "bg-brand-tint text-brand",
      title: "Votre candidature est acceptée",
      // Deux formulations, parce qu'il y a deux situations : annoncer « votre
      // espace est ouvert » puis présenter un mur de paiement juste en dessous
      // serait la pire des deux.
      body: activation
        ? "Bienvenue parmi les formateurs NKAMVA. Une dernière étape avant l'ouverture de votre espace : le règlement de votre abonnement."
        : "Bienvenue parmi les formateurs NKAMVA. Votre espace formateur est ouvert : vous pouvez publier votre première ressource.",
    },
    REJECTED: {
      icon: <XCircle className="size-8" aria-hidden="true" />,
      tone: "bg-danger-tint text-danger",
      title: "Votre candidature n'a pas été retenue",
      body: "L'équipe de modération n'a pas donné suite à ce dossier.",
    },
  }[application.status as "SUBMITTED" | "APPROVED" | "REJECTED"];

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Devenir formateur", href: "/devenir-formateur" }, { label: "Suivi" }]}
        title="Suivi de ma candidature"
      />

      <div className="mx-auto max-w-[640px] pt-2">
        <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
          <span className={`mb-5 grid size-16 place-items-center rounded-full ${view.tone}`}>
            {view.icon}
          </span>
          <h2 className="mb-2 text-[22px] font-extrabold">{view.title}</h2>
          <p className="max-w-[52ch] leading-relaxed text-ink-2">{view.body}</p>

          {application.status === "REJECTED" && application.finalRejectionReason ? (
            <p className="mt-5 rounded-nk bg-danger-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-danger">
              <b>Motif :</b> {application.finalRejectionReason}
            </p>
          ) : null}

          <dl className="mt-6 grid gap-2.5 border-t border-line-2 pt-5 text-sm">
            {application.submittedAt ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Dossier envoyé</dt>
                <dd className="font-bold">{fmtDate(application.submittedAt)}</dd>
              </div>
            ) : null}
            {application.approvedAt ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Accepté</dt>
                <dd className="font-bold">{fmtDate(application.approvedAt)}</dd>
              </div>
            ) : null}
            {application.rejectedAt ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Décision</dt>
                <dd className="font-bold">{fmtDate(application.rejectedAt)}</dd>
              </div>
            ) : null}
          </dl>

          {application.status === "SUBMITTED" ? (
            <p className="mt-5 flex items-center gap-2 text-[13px] font-semibold text-ink-3">
              <Clock className="size-4" aria-hidden="true" />
              Aucune action de votre part n&apos;est attendue pour l&apos;instant.
            </p>
          ) : null}

          {application.status === "APPROVED" && !activation ? (
            <BtnLink href="/formateur" size="lg" className="mt-6">
              Ouvrir mon espace formateur
            </BtnLink>
          ) : null}
        </section>

        {activation ? <ActivationPanel state={activation} providers={providers} /> : null}

        <section
          aria-label="Pièces du dossier"
          className="mt-5 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8"
        >
          <h2 className="mb-4 text-[16.5px] font-extrabold">Pièces transmises</h2>
          <ul className="grid gap-3">
            {DOCUMENT_SLOTS.map((slot) => {
              const document = documentsByType.get(slot.type);
              const state = document ? DOCUMENT_STATUS[document.status] : null;
              return (
                <li
                  key={slot.type}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <b className="block text-[14.5px]">{slot.label}</b>
                    {document?.originalFileName ? (
                      <small className="block truncate text-[13px] text-ink-3">
                        {document.originalFileName}
                      </small>
                    ) : null}
                  </div>
                  {state ? (
                    <StPill tone={state.tone}>{state.label}</StPill>
                  ) : (
                    <StPill tone="muted">Absente</StPill>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
            Vos pièces ne sont consultables que par l&apos;équipe de modération, et sont effacées
            {DOCUMENT_RETENTION_DAYS} jours après la décision.
          </p>
        </section>
      </div>
    </div>
  );
}
