"use client";

import * as React from "react";

/**
 * Une couche superposée est une entrée d'historique.
 * ==========================================================================
 * Règle 1 des onze règles d'expérience (arbitrages 108-117) : sur Android, le
 * retour — bouton ou geste de bord — est le geste le plus utilisé de
 * l'interface. Avant ce hook, **rien** dans le projet ne le gérait : zéro
 * `popstate`, zéro `pushState`. Tiroirs et modales étaient de simples
 * `useState`, donc le retour **quittait la page** au lieu de fermer la couche,
 * et la saisie d'une modale de formulaire était perdue.
 *
 * Le défaut ne se voyait pas depuis un poste de travail : au clavier, `Échap`
 * ferme correctement — Radix s'en charge.
 *
 * Usage
 * -----
 *   useHistoryLayer(open, () => setOpen(false));
 *
 * Trois précautions, chacune pour un piège rencontré :
 *
 * 1. **L'état de Next est préservé.** On empile `{ ...history.state, __nkLayer }`
 *    et non un état neuf : le routeur de l'App Router lit `event.state` au
 *    retour, et un état étranger le ferait recharger la page. L'URL ne change
 *    pas — une modale n'est pas une adresse.
 *
 * 2. **La fermeture programmatique dépile.** Fermer par la croix, par Échap ou
 *    par le voile doit retirer l'entrée, sinon la pile enfle et il faut appuyer
 *    trois fois sur retour pour quitter un écran où l'on a ouvert trois fois la
 *    même modale.
 *
 * 3. **Sauf si l'on a navigué entre-temps.** Une modale qui contient un lien se
 *    démonte à la navigation ; dépiler à ce moment-là renverrait la personne à
 *    l'écran précédent, juste après l'avoir quitté. On compare l'adresse au
 *    démontage avec celle relevée à l'ouverture, et on ne touche à rien si elle
 *    a changé.
 */
export function useHistoryLayer(open: boolean, onClose: () => void) {
  // `onClose` passe par une référence : le mettre en dépendance ferait rejouer
  // l'effet — donc réempiler une entrée — à chaque rendu du parent.
  const closeRef = React.useRef(onClose);
  React.useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    const openedAt = window.location.href;
    let pushed = true;

    window.history.pushState({ ...window.history.state, __nkLayer: true }, "");

    const onPop = () => {
      // Notre entrée vient d'être dépilée par le geste de retour : il ne reste
      // qu'à fermer. Ne pas rappeler `history.back()` au nettoyage.
      pushed = false;
      closeRef.current();
    };

    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (!pushed) return;
      // Navigation entre-temps : notre entrée n'est plus au sommet, la dépiler
      // ramènerait à l'écran qu'on vient de quitter.
      if (window.location.href !== openedAt) return;
      window.history.back();
    };
  }, [open]);
}
