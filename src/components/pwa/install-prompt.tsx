"use client";

import * as React from "react";
import { Download, Share, X } from "lucide-react";

/** Événement Chromium, absent des types du DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "nkamva:install-dismissed";
/** Un refus vaut trois mois : reproposer chaque semaine serait du harcèlement. */
const DISMISS_DAYS = 90;

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // Navigation privée : pas de stockage, donc pas de mémoire du refus.
    return false;
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS n'expose pas `display-mode` et pose ce drapeau non standard.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Invite discrète à installer l'application.
 *
 * Deux chemins, parce que les navigateurs ne s'accordent pas :
 * - Chromium émet `beforeinstallprompt`, qu'on retient pour déclencher la
 *   boîte native au moment choisi par la personne.
 * - Safari iOS n'a pas d'API d'installation. On ne peut qu'expliquer le geste
 *   — Partager, puis « Sur l'écran d'accueil ».
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      // Sans ça, Chrome affiche sa propre bannière au moment qui l'arrange.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS n'émettra jamais l'événement : on propose l'explication après un
    // court délai, pour ne pas accueillir la première visite par une bannière.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      timer = setTimeout(() => setShowIosHint(true), 4000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = React.useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Sans stockage, l'invite réapparaîtra : acceptable.
    }
    setDeferred(null);
    setShowIosHint(false);
  }, []);

  const install = React.useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // Le même événement ne peut pas servir deux fois.
    setDeferred(null);
    if (outcome === "dismissed") dismiss();
  }, [deferred, dismiss]);

  if (!deferred && !showIosHint) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="nk-install-title"
      className="nk-above-tabbar nk-safe-b fixed inset-x-0 bottom-0 z-100 p-3 sm:left-auto sm:right-4 sm:w-[380px] sm:p-4"
    >
      <div className="flex items-start gap-3 rounded-nk-lg border border-line bg-card p-4 shadow-nk-lg">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-nk-sm bg-navy text-white"
          aria-hidden="true"
        >
          <Download className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <b id="nk-install-title" className="block font-display text-[15px] font-extrabold">
            Installer NKAMVA
          </b>

          {deferred ? (
            <>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
                Accès direct depuis votre écran d&apos;accueil, sans passer par le
                navigateur.
              </p>
              <button
                type="button"
                onClick={() => void install()}
                className="nk-tap relative mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-brand px-5 text-[14px] font-semibold text-white transition hover:bg-brand-dark active:scale-[0.97]"
              >
                Installer
              </button>
            </>
          ) : (
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
              Touchez{" "}
              <Share className="inline size-[15px] -translate-y-px" aria-label="Partager" />{" "}
              puis <b className="font-bold text-ink">Sur l&apos;écran d&apos;accueil</b>.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Masquer l'invitation à installer"
          className="nk-tap relative -mr-1 -mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-paper hover:text-ink"
        >
          <X className="size-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
