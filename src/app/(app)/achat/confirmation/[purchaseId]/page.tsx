import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/api";
import { PageHead } from "@/components/nk/page-head";
import { ConfirmationStatus } from "./confirmation-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmation de paiement",
  robots: { index: false },
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const { purchaseId } = await params;
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/connexion");

  // Il n'existe pas de GET /api/purchases/[purchaseId] : l'achat est lu côté
  // serveur, et seul le suivi d'état passe par /reconcile.
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      learnerId: true,
      amountFcfa: true,
      provider: true,
      providerStatus: true,
      createdAt: true,
      course: { select: { title: true, slug: true, format: true, category: true } },
    },
  });

  if (!purchase) notFound();
  if (purchase.learnerId !== auth.user.id) notFound();

  return (
    <div className="nk-wrap pb-16">
      <PageHead title="Confirmation de paiement" />
      <ConfirmationStatus
        purchaseId={purchase.id}
        initialStatus={purchase.providerStatus}
        amountFcfa={purchase.amountFcfa}
        provider={purchase.provider}
        courseTitle={purchase.course?.title ?? "Votre ressource"}
        courseSlug={purchase.course?.slug ?? null}
        courseCategory={purchase.course?.category ?? null}
        courseFormat={purchase.course?.format ?? null}
      />
    </div>
  );
}
