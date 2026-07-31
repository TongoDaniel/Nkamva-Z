import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { PageHead } from "@/components/nk/page-head";
import { getPublicCourse } from "@/lib/catalog";
import { checkCourseAccess } from "@/lib/access";
import { getAuthContext } from "@/lib/api";
import type { CourseDetail } from "@/lib/dto";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finaliser l'achat",
  robots: { index: false },
};

export default async function AchatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await getAuthContext();
  if (!auth) redirect(`/auth/connexion?callbackUrl=${encodeURIComponent(`/achat/${slug}`)}`);

  const course = (await getPublicCourse(slug)) as CourseDetail | null;
  if (!course) notFound();

  // Déjà possédée : inutile de faire traverser le tunnel.
  const access = await checkCourseAccess(course.id, auth.user.id);
  if (access.granted) redirect("/mes-ressources");

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[
          { label: "Ressources", href: "/ressources" },
          { label: course.title, href: `/ressources/${course.slug}` },
          { label: "Paiement" },
        ]}
        title="Finaliser votre achat"
        lead="Paiement à l'unité, en FCFA. L'accès est immédiat une fois le paiement confirmé."
      />
      <CheckoutForm
        courseId={course.id}
        title={course.title}
        category={course.category}
        format={course.format}
        priceFcfa={course.priceFcfa}
        durationSeconds={course.durationSeconds}
        trainerName={course.trainerProfile?.user?.fullName ?? null}
      />
    </div>
  );
}
