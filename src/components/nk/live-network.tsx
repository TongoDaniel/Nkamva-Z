"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ce que la salle et la console partagent autour du réseau.
 * ==========================================================================
 * Deux pièces, posées à l'identique des deux côtés de la scène (même règle que
 * `live-stage.tsx` : recopier ferait deux écrans qui divergent).
 * ==========================================================================
 */

/**
 * Relit la vue serveur de la salle, au plus une fois par seconde.
 *
 * C'est ce qu'on passe à `useLiveRoom` pour répondre aux signaux des autres
 * participants. La retenue compte : dix mains levées en une seconde ne doivent
 * pas faire dix relectures, et un signal qui tombe pendant la retenue n'est pas
 * perdu, il déclenche la relecture suivante.
 */
export function useRoomRefresh(): () => void {
  const router = useRouter();
  const timer = React.useRef<number | null>(null);
  const last = React.useRef(0);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return React.useCallback(() => {
    if (timer.current !== null) return;
    const wait = Math.max(0, 1_000 - (Date.now() - last.current));
    timer.current = window.setTimeout(() => {
      timer.current = null;
      last.current = Date.now();
      router.refresh();
    }, wait);
  }, [router]);
}

/**
 * Ce que le réseau fait subir à la séance, dit en clair.
 *
 * Une image figée sans explication se lit comme une panne du site, et la
 * personne recharge la page — ce qui coupe son micro et lui fait perdre sa
 * place. Pendant une reconnexion, on dit que ça revient tout seul ; sur un
 * réseau faible, on dit quoi faire.
 */
export function NetworkNotice({
  reconnecting,
  weak,
  camOn,
  className,
}: {
  reconnecting: boolean;
  weak: boolean;
  /** La caméra de ce participant est-elle allumée ? Le conseil en dépend. */
  camOn: boolean;
  className?: string;
}) {
  if (!reconnecting && !weak) return null;
  return (
    <p
      role="status"
      className={cn(
        "flex w-full items-center justify-center gap-2 text-center text-[13px] font-semibold text-[var(--live-alert-fg)]",
        className,
      )}
    >
      {reconnecting ? (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          Connexion interrompue : reconnexion en cours, ne rechargez pas la page.
        </>
      ) : (
        <>
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          {camOn
            ? "Votre connexion est faible : coupez votre caméra pour garder le son."
            : "Votre connexion est faible : l'image des autres peut se figer, le son reste prioritaire."}
        </>
      )}
    </p>
  );
}
