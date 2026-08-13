"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Btn } from "@/components/nk/button";
import { Logo } from "@/components/nk/logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP_ERROR]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Une erreur est survenue</h1>
        <p className="mt-2 text-ink-2">
          Le problème a été enregistré. Vous pouvez réessayer ou revenir à l&apos;accueil.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-ink-3">Référence : {error.digest}</p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <Btn onClick={reset}>Réessayer</Btn>
        <Btn variant="o" asChild>
          <Link href="/">Retour à l&apos;accueil</Link>
        </Btn>
      </div>
    </div>
  );
}
