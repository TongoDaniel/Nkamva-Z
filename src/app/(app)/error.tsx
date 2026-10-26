"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/nk/error-panel";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[espace]", error);
  }, [error]);

  return (
    <ErrorPanel
      reset={reset}
      description="Votre espace est momentanément indisponible. Réessayez dans un instant : vos achats et votre progression sont conservés."
    />
  );
}
