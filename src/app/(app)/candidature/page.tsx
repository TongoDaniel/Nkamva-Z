import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { getMyApplication, missingDocuments } from "@/lib/trainer-applications";
import { isS3Configured } from "@/lib/s3";
import { ApplicationWizard, type WizardApplication } from "./application-wizard";
import { EMPTY_DRAFT, type ApplicationDraft } from "./application-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ma candidature formateur",
  robots: { index: false },
};

/** Statuts pour lesquels il n'y a plus rien à saisir : on montre le suivi. */
const READ_ONLY = ["SUBMITTED", "APPROVED", "REJECTED"];

export default async function CandidaturePage() {
  const auth = await getAuthContext();
  if (!auth) return null;
  if (auth.user.trainerId) redirect("/formateur");

  const application = await getMyApplication(auth.user.id);
  if (application && READ_ONLY.includes(application.status)) redirect("/candidature/statut");

  const missing = application ? await missingDocuments(application.id) : [];

  const draft: ApplicationDraft = application
    ? {
        slogan: application.slogan ?? "",
        description: application.description ?? "",
        websiteUrl: application.websiteUrl ?? "",
        domains: application.domains,
        experienceYears: application.experienceYears ? String(application.experienceYears) : "",
      }
    : EMPTY_DRAFT;

  const wizardApplication: WizardApplication | null = application
    ? {
        id: application.id,
        status: application.status,
        documents: application.documents.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          rejectionReason: d.rejectionReason,
          resubmissionCount: d.resubmissionCount,
          originalFileName: d.originalFileName,
        })),
        missingDocuments: missing,
      }
    : null;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Devenir formateur", href: "/devenir-formateur" }, { label: "Ma candidature" }]}
        title={
          application?.status === "RESUBMISSION_PENDING"
            ? "Complétez votre candidature"
            : "Devenir formateur"
        }
        lead={
          application?.status === "RESUBMISSION_PENDING"
            ? "L'équipe de modération a demandé de nouvelles pièces. Le reste de votre dossier est conservé."
            : "Trois étapes : votre présentation, vos pièces justificatives, puis l'envoi."
        }
      />
      <div className="mx-auto max-w-[640px] pt-2">
        <ApplicationWizard
          application={wizardApplication}
          draft={draft}
          storageAvailable={isS3Configured()}
        />
      </div>
    </div>
  );
}
