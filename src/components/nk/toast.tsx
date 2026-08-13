"use client";

import { Toaster as Sonner } from "sonner";
import { toast } from "sonner";

/**
 * Toasts — port de `#toasts` / `.toast` (pilule sombre, bas-centre).
 * La maquette n'a pas de mode sombre : le thème est figé en clair pour ne pas
 * dépendre de la préférence système via next-themes.
 */
export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      offset={26}
      // Le bas de l'écran est désormais occupé par la barre d'onglets
      // (arbitrage 111) : sans ce décalage, le toast se posait dessus et
      // masquait la navigation pendant quatre secondes — juste après une
      // action, donc exactement quand on veut continuer.
      // `mobileOffset` ne s'applique que sous 600 px chez sonner ; la barre,
      // elle, existe jusqu'à `lg`. La règle CSS de `globals.css` prend le relais
      // entre les deux.
      mobileOffset={{ bottom: "calc(var(--nk-tabbar-h) + env(safe-area-inset-bottom) + 0.75rem)" }}
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "!bg-ink !text-paper !border-0 !rounded-full !shadow-nk-lg !font-sans !font-semibold !text-sm !px-5 !py-3.5 !gap-2.5",
          description: "!text-[#9fb3a9]",
          actionButton: "!bg-transparent !text-[#9fb3a9] !underline !font-semibold !text-[13.5px]",
          cancelButton: "!bg-transparent !text-[#9fb3a9] !underline !font-semibold !text-[13.5px]",
          icon: "!text-[#7fd4b4]",
          error: "!bg-[#7a2b1f]",
        },
      }}
    />
  );
}

export { toast };
