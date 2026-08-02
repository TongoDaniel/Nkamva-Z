import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, AuthAside, AuthHeading } from "@/components/layouts/auth-shell";
import { Btn } from "@/components/nk/button";

export const metadata: Metadata = {
  title: "Connexion impossible",
};

const MESSAGES: Record<string, string> = {
  Configuration: "Le service d'authentification est mal configuré. Contactez le support.",
  AccessDenied: "Votre compte n'a pas accès à cette page.",
  Verification: "Ce lien de connexion a expiré ou a déjà été utilisé.",
  ACCOUNT_SUSPENDED: "Ce compte est suspendu. Contactez le support pour en connaître la raison.",
};

async function ErrorBody({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message =
    (error && MESSAGES[error]) ??
    "La connexion n'a pas pu aboutir. Réessayez dans un instant.";

  return (
    <>
      <AuthHeading title="Connexion impossible" subtitle={message} />
      <Btn asChild size="lg" block>
        <Link href="/auth/connexion">Retour à la connexion</Link>
      </Btn>
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
      aside={<AuthAside photoBrief="support NkamVa au téléphone" quote="Un souci d'accès ? On le règle vite." author="Support NkamVa" />}
    >
      <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
        <ErrorBody searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
