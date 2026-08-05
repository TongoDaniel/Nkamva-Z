"use client";

import * as React from "react";

/**
 * Enregistre le service worker.
 *
 * Volontairement inactif en développement : le worker met `/_next/static/*` en
 * cache d'abord, ce qui fige les modules recompilés par Turbopack et fait
 * croire à des régressions qui n'existent pas. Pour l'éprouver en local, il
 * faut donc un vrai build : `bun run build && bun run start`.
 *
 * `NEXT_PUBLIC_SW_DEV=1` force l'enregistrement si on veut malgré tout
 * l'observer sur le serveur de développement.
 */
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const enabled =
      process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1";

    if (!enabled) {
      // Un worker laissé par un build précédent continuerait de servir de
      // vieux modules pendant tout le développement.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => void reg.unregister());
      });
      return;
    }

    const onLoad = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.error("[pwa] enregistrement du service worker refusé", error);
      });
    };

    // L'enregistrement attend `load` : il ne doit pas disputer la bande
    // passante au premier rendu.
    if (document.readyState === "complete") onLoad();
    else {
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
