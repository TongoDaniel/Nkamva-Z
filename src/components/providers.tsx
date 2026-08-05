"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/nk/toast";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";

/**
 * Sonde d'audit mobile — chargée dynamiquement, et seulement hors production.
 *
 * Le bundler remplace `process.env.NODE_ENV` par sa valeur littérale à la
 * compilation : en production, le ternaire se replie sur le composant vide et
 * l'`import()` de la branche morte devient inatteignable. Le module ne part
 * donc pas dans le bundle client, au lieu d'y dormir en retournant `null`.
 *
 * `ssr: false` : la sonde mesure une mise en page, elle n'a rien à rendre côté
 * serveur.
 */
const MobileAudit =
  process.env.NODE_ENV === "production"
    ? () => null
    : dynamic(() => import("@/components/pwa/mobile-audit").then((m) => m.MobileAudit), {
        ssr: false,
      });

export function Providers({ children }: { children: React.ReactNode }) {
  // Un client par montage : évite de partager le cache entre requêtes SSR.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
        <ServiceWorkerRegistration />
        <InstallPrompt />
        <MobileAudit />
      </QueryClientProvider>
    </SessionProvider>
  );
}
