import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, AuthHeading, AuthIllustration } from "@/components/layouts/auth-shell";
import { BtnLink } from "@/components/nk/button-link";

export const metadata: Metadata = {
  title: "Connexion impossible",
};

const MESSAGES: Record<string, string> = {
  Configuration: "Le service d'authentification est mal configuré. Contactez le support.",
  AccessDenied: "Votre compte n'a pas accès à cette page.",
  Verification: "Ce lien de connexion a expiré ou a déjà été utilisé.",
  ACCOUNT_SUSPENDED: "Ce compte est suspendu. Contactez le support pour en connaître la raison.",
  TOO_MANY_ATTEMPTS: "Trop de tentatives de connexion. Patientez une minute avant de réessayer.",
};

async function ErrorBody({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message =
    (error && MESSAGES[error]) ??
    "La connexion n'a pas pu aboutir. Réessayez dans un instant.";

  return (
    <>
      <AuthHeading title="Connexion impossible" subtitle={message} />
      <BtnLink href="/auth/connexion" size="lg" block>Retour à la connexion</BtnLink>
      <p className="mt-5 text-center text-sm text-ink-2">
        Besoin d&apos;aide ?{" "}
        <Link href="/contact" className="font-bold text-brand">
          Contacter le support
        </Link>
      </p>
    </>
  );
}

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AuthShell
      illustration={
        <AuthIllustration
          photo="/auth/erreur.webp"
          focus="15%"
          quote="Un souci d'accès ? On le règle vite."
          author="Support NKAMVA"
        />
      }
    >
      <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
        <ErrorBody searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
