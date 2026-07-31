"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/nk/error-panel";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[public]", error);
  }, [error]);

  return <ErrorPanel reset={reset} />;
}
