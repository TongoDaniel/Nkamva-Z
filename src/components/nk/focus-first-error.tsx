"use client";

import * as React from "react";

/**
 * À la soumission, le focus va au premier champ en défaut.
 * ==========================================================================
 * Règle 6 des onze règles d'expérience. Le produit compte 33 formulaires et
 * **aucun** ne le faisait : seul l'assistant `devenir-formateur` déplaçait le
 * focus, et seulement sur son titre d'étape.
 *
 * Sur un poste de travail le défaut se voit à peine — le formulaire tient à
 * l'écran, l'erreur apparaît dans le champ de vision. Sur un téléphone, le
 * clavier occupe la moitié basse : un message d'erreur posé sous un champ situé
 * plus haut est **hors du cadre**, et rien ne dit pourquoi la soumission n'a pas
 * abouti. On appuie une deuxième fois sur le même bouton.
 *
 * Pourquoi un écouteur global plutôt qu'un hook appelé 33 fois
 * ------------------------------------------------------------
 * Parce qu'un hook aurait été oublié au 34ᵉ formulaire. La règle est
 * transversale : elle vaut pour tout ce qui se soumet, y compris ce qui n'existe
 * pas encore. Le repère est déjà là et déjà uniforme — `Field` et
 * `PasswordField` posent `aria-invalid` dès qu'ils portent une erreur, et c'est
 * aussi le repère que lisent les lecteurs d'écran.
 *
 * Deux passes plutôt qu'une : la validation locale rend au tour suivant, mais
 * une erreur renvoyée par le serveur arrive plus tard. La seconde passe ne bouge
 * le focus que s'il est resté où il était — si la personne a déjà recommencé à
 * saisir entre-temps, on ne lui reprend pas la main.
 *
 * Des minuteries et non `requestAnimationFrame` : un onglet en arrière-plan ne
 * reçoit pas de frames, et le focus est un comportement de **correction**, pas
 * une animation. Il ne doit pas dépendre de la cadence d'affichage. (C'est aussi
 * ce qui le rend vérifiable : le panneau navigateur ne compose pas de frames,
 * une version bâtie sur `rAF` y restait muette sans qu'aucun défaut n'existe.)
 * ==========================================================================
 */

/** Laisse React rendre l'état d'erreur posé par le gestionnaire de soumission. */
const PAINT_DELAY_MS = 0;
/** Laisse revenir une erreur de validation du serveur. */
const RETRY_DELAY_MS = 600;

function firstInvalid(form: HTMLFormElement): HTMLElement | null {
  const el = form.querySelector<HTMLElement>(
    '[aria-invalid="true"]:not([disabled]):not([type="hidden"])',
  );
  if (!el) return null;
  // Un champ dans un onglet fermé ou un accordéon replié n'est pas atteignable :
  // le focus y serait invisible, et pire qu'un focus resté sur le bouton.
  if (!el.getClientRects().length) return null;
  return el;
}

function focusIt(el: HTMLElement) {
  el.focus({ preventScroll: true });
  // `center` et non `nearest` : sur mobile le clavier va occuper le bas de
  // l'écran, un champ « juste visible » en bas se retrouve dessous.
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function FocusFirstError() {
  React.useEffect(() => {
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      // Au tour suivant : les erreurs de validation locale ne sont pas encore
      // dans le DOM au moment où l'événement se propage en capture.
      window.setTimeout(() => {
        const el = firstInvalid(form);
        if (el) {
          focusIt(el);
          return;
        }

        // Rien en défaut pour l'instant : l'erreur peut venir du serveur.
        const activeBefore = document.activeElement;
        window.setTimeout(() => {
          // La personne a repris la main entre-temps : on ne la lui reprend pas.
          if (document.activeElement !== activeBefore) return;
          const late = firstInvalid(form);
          if (late) focusIt(late);
        }, RETRY_DELAY_MS);
      }, PAINT_DELAY_MS);
    };

    // Capture : un `onSubmit` React qui appelle `preventDefault` ne nous
    // empêche pas de voir passer l'événement.
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}
