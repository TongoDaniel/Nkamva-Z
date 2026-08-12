"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, TriangleAlert } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { WizardSteps, WizardCard } from "@/components/nk/wizard";
import { useAction } from "@/hooks/use-action";
import { FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { ApplicationForm, type ApplicationDraft } from "./application-form";
import { DocumentUpload, type DocumentState } from "./document-upload";
import { DOCUMENT_SLOTS } from "@/lib/trainer-document-slots";

const STEPS = [
  { id: "presentation", label: "Présentation" },
  { id: "pieces", label: "Pièces" },
  { id: "envoi", label: "Envoi" },
];

export interface WizardApplication {
  id: string;
  status: string;
  documents: DocumentState[];
  missingDocuments: string[];
}

export function ApplicationWizard({
  application,
  draft,
  storageAvailable,
}: {
  application: WizardApplication | null;
  draft: ApplicationDraft;
  storageAvailable: boolean;
}) {
  const router = useRouter();
  // Sans dossier, on démarre à la présentation ; sinon on reprend là où il reste
  // du travail, pour ne pas refaire saisir ce qui est déjà en base.
  const [step, setStep] = React.useState(() => {
    if (!application) return 0;
    return application.missingDocuments.length > 0 ? 1 : 2;
  });
  const [error, setError] = React.useState<string | null>(null);

  const submit = useAction(() => api.post("/api/trainer-applications/me/submit"), {
    success: "Candidature envoyée. L'équipe de modération vous répondra par e-mail.",
    // L'échec s'affiche au fil de l'écran : pas de toast.
    error: null,
    // Navigation dans la transition : le bouton reste occupé jusqu'à ce que
    // l'écran de statut soit affiché.
    onSuccess: () => router.push("/candidature/statut"),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "L'envoi a échoué. Réessayez."),
  });

  const isResubmission = application?.status === "RESUBMISSION_PENDING";
  const documentsByType = new Map(application?.documents.map((d) => [d.type, d]) ?? []);
  const ready = application != null && application.missingDocuments.length === 0;

  return (
    <>
      <WizardSteps steps={STEPS} current={step} label="Étapes de la candidature" />

      {step === 0 ? (
        <WizardCard
          title={application ? "Votre présentation" : "Parlez-nous de vous"}
          subtitle="C'est le premier élément que l'équipe de modération examinera."
        >
          <ApplicationForm
            mode={application ? "edit" : "create"}
            initial={draft}
            onSaved={() => setStep(1)}
          />
        </WizardCard>
      ) : null}

      {step === 1 ? (
        <WizardCard
          title={isResubmission ? "Renvoyez les pièces refusées" : "Vos pièces justificatives"}
          subtitle={
            isResubmission
              ? "Seules les pièces refusées sont à redéposer. Les autres restent acquises."
              : "Trois pièces sont nécessaires. Elles ne sont visibles que par l'équipe de modération."
          }
        >
          {!storageAvailable ? (
            <p className="mb-5 flex items-start gap-2.5 rounded-nk bg-gold-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-gold-ink">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Le stockage des fichiers n&apos;est pas configuré sur cet environnement : le dépôt
                de pièces est indisponible. Votre présentation, elle, est bien enregistrée.
              </span>
            </p>
          ) : null}

          <div className="grid gap-3.5">
            {DOCUMENT_SLOTS.map((slot) => (
              <DocumentUpload
                key={slot.type}
                slot={slot}
                document={documentsByType.get(slot.type)}
                editable
                storageAvailable={storageAvailable}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Btn variant="t" onClick={() => setStep(0)}>
              <ArrowLeft aria-hidden="true" />
              Présentation
            </Btn>
            <Btn onClick={() => setStep(2)} disabled={!ready}>
              Continuer
            </Btn>
          </div>
          {!ready ? (
            <p className="mt-3 text-right text-[12.5px] text-ink-3">
              {application?.missingDocuments.length ?? 3} pièce
              {(application?.missingDocuments.length ?? 3) > 1 ? "s" : ""} encore attendue
              {(application?.missingDocuments.length ?? 3) > 1 ? "s" : ""}.
            </p>
          ) : null}
        </WizardCard>
      ) : null}

      {step === 2 ? (
        <WizardCard
          title="Envoyer votre candidature"
          subtitle="Une fois envoyé, le dossier n'est plus modifiable tant que l'équipe ne l'a pas examiné."
        >
          <FormError>{error}</FormError>
          <ul className="mb-6 grid gap-2.5 text-[14px] leading-relaxed text-ink-2">
            <li>Votre présentation et vos trois pièces partent à l&apos;équipe de modération.</li>
            <li>Votre compte passe en « candidature en cours » : vous restez apprenant entre-temps.</li>
            <li>Vous serez prévenu par e-mail de la décision, favorable ou non.</li>
            <li>
              Aucune coordonnée bancaire n&apos;est demandée à ce stade : elle ne servira qu&apos;au
              moment de votre premier retrait.
            </li>
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Btn variant="t" onClick={() => setStep(1)}>
              <ArrowLeft aria-hidden="true" />
              Pièces
            </Btn>
            <Btn size="lg" loading={submit.pending} disabled={!ready} onClick={() => void submit.run()}>
              <Send aria-hidden="true" />
              {isResubmission ? "Renvoyer mon dossier" : "Envoyer ma candidature"}
            </Btn>
          </div>
        </WizardCard>
      ) : null}
    </>
  );
}
