"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Btn } from "@/components/nk/button";

/**
 * Rejoue les sondes. Elles ne sont pas mémoïsées : la page est
 * `force-dynamic` et chaque `fetch` porte `cache: 'no-store'`, donc un
 * rafraîchissement interroge réellement les six fournisseurs.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Btn
      size="sm"
      variant="o"
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw className="size-3.5" aria-hidden="true" />
      Relancer les sondes
    </Btn>
  );
}
