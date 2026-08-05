"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/nk/toast";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { MobileAudit } from "@/components/pwa/mobile-audit";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";

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
