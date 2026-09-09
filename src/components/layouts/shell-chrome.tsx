"use client";

import * as React from "react";

/**
 * Ce qu'un écran peut demander à la coquille qui le porte.
 * ==========================================================================
 * Un seul cas pour l'instant, et il vient de la messagerie : sur téléphone,
 * ouvrir une conversation la fait passer **plein écran**, et l'en-tête de la
 * coquille s'efface. Deux barres empilées — celle du site, puis celle du fil
 * avec son nom et sa flèche de retour — mangeaient un cinquième de la hauteur
 * pour redire ce que la seconde disait déjà mieux ; c'est le geste qu'ont
 * toutes les messageries de téléphone.
 *
 * Le passage par un contexte plutôt que par un attribut sur `document.body` :
 * l'état vit là où React le voit, il se défait tout seul au démontage, et rien
 * ne subsiste si l'écran change en cours de route.
 *
 * Le contexte par défaut ne fait rien : la messagerie se rend aussi hors de la
 * coquille (les tests, un futur écran embarqué) sans avoir à savoir qui la
 * porte.
 * ==========================================================================
 */
interface ShellChrome {
  /** Vrai quand un fil occupe tout l'écran et que l'en-tête doit s'effacer. */
  setThreadFocus: (on: boolean) => void;
}

const ShellChromeContext = React.createContext<ShellChrome>({ setThreadFocus: () => {} });

export function ShellChromeProvider({
  value,
  children,
}: {
  value: ShellChrome;
  children: React.ReactNode;
}) {
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

/**
 * Demande à la coquille d'effacer son en-tête tant que `on` est vrai.
 *
 * La coquille décide *comment* : elle ne le retire qu'en dessous de `md`, là
 * où le fil prend toute la largeur. Au-dessus, la liste et le fil sont côte à
 * côte et l'en-tête reste — il n'y a rien à récupérer comme place.
 */
export function useThreadFocus(on: boolean) {
  const { setThreadFocus } = React.useContext(ShellChromeContext);
  React.useEffect(() => {
    setThreadFocus(on);
    // Au démontage — une navigation vers un autre écran, par exemple —
    // l'en-tête revient, quoi qu'il arrive.
    return () => setThreadFocus(false);
  }, [on, setThreadFocus]);
}
