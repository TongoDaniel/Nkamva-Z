import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { EmptyState } from "@/components/nk/empty-state";
import { PageHead } from "@/components/nk/page-head";
import { getPublicCourse } from "@/lib/catalog";
import { checkCourseAccess } from "@/lib/access";
import { getAuthContext } from "@/lib/api";
import { payableProvidersForUser } from "@/lib/fx";
import type { CourseDetail } from "@/lib/dto";
import { CheckoutForm } from "./checkout-form";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");


export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finaliser l'achat",
  robots: { index: false },
};

export default async function AchatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await getAuthContext();
  if (!auth) redirect(`/auth/deconnexion?callbackUrl=${encodeURIComponent(`/achat/${slug}`)}`);

  const course = (await getPublicCourse(slug)) as CourseDetail | null;
  if (!course) notFound();

  // Déjà possédée : inutile de faire traverser le tunnel.
  const access = await checkCourseAccess(course.id, auth.user.id);
  if (access.granted) redirect("/mes-ressources");

  // L'auteur n'achète pas sa propre ressource : `initiatePurchase` refuse
  // (`CANNOT_BUY_OWN_COURSE`). On le dit ici plutôt que de dérouler un tunnel
  // dont le bouton de paiement échouerait au dernier geste. Pas de redirection
  // muette non plus : partir de sa propre fiche et se retrouver ailleurs sans
  // explication se lit comme un bug.
  const isAuthor = course.trainerProfile?.user?.id === auth.user.id;

  const crumbs = [
    { label: "Ressources", href: routes.catalog },
    { label: course.title, href: routes.course(course.slug) },
    { label: isAuthor ? "Votre ressource" : "Paiement" },
  ];

  if (isAuthor) {
    return (
      <div className="nk-wrap pb-10 sm:pb-16">
        <PageHead crumbs={crumbs} title="Vous êtes l'auteur de cette ressource" />
        <EmptyState
          icon={<PenLine />}
          title="Cette ressource est la vôtre"
          description="Vous la vendez, vous ne l'achetez pas : la commission de la plateforme serait prélevée sur votre propre argent et la vente compterait dans vos statistiques."
          action={
            <BtnLink href={`/formateur/ressources/${course.id}`} size="lg">
              Gérer cette ressource
            </BtnLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={crumbs}
        title="Finaliser votre achat"
        lead="Paiement à l'unité, en FCFA. L'accès est immédiat une fois le paiement confirmé."
      />
      <CheckoutForm
        providers={await payableProvidersForUser(auth.user.id)}
        courseId={course.id}
        title={course.title}
        category={course.category}
        format={course.format}
        coverS3Key={course.coverS3Key}
        priceFcfa={course.priceFcfa}
        durationSeconds={course.durationSeconds}
        trainerName={course.trainerProfile?.user?.fullName ?? null}
      />
    </div>
  );
}
