"use client";

import * as React from "react";

// ==========================================================================
// L'heure d'une séance, sans erreur d'hydratation
// ==========================================================================
// Le serveur ne connaît pas le fuseau du lecteur. `Intl.DateTimeFormat` sans
// `timeZone` écrit l'heure dans celui de la machine qui rend : le poste du
// développeur en dev, UTC dans le conteneur de production. Le même nœud
// porterait alors deux textes — celui du serveur, puis celui du navigateur —,
// d'où une erreur d'hydratation, ou pire une heure fausse figée. Le défaut ne
// se voit pas en dev, où serveur et navigateur partagent le fuseau du poste.
//
// La règle, née sur l'accueil (arbitrage 142) et partagée depuis par les lignes
// d'agenda et de replay :
//
//   1. le premier rendu, serveur et navigateur confondus, écrit l'heure dans le
//      fuseau **de l'animateur** — une donnée de la séance, qui donne le même
//      texte partout ;
//   2. une fois hydraté, le composant repasse dans le fuseau du lecteur, et
//      rappelle celui de l'animateur s'il en diffère (arbitrage 107).
//
// Un seul endroit décide de ce moment : deux copies de la règle auraient fini
// par basculer à deux instants différents, et c'est exactement le genre d'écart
// qui ne se voit qu'en production.
// ==========================================================================

/**
 * Le fuseau du premier rendu quand la séance n'en porte pas (programmée avant
 * l'arbitrage 107). Celui du marché d'origine de la plateforme : c'est l'heure
 * que l'animateur avait le plus probablement en tête.
 */
export const FALLBACK_HOST_TIME_ZONE = "Africa/Douala";

const subscribe = () => () => {};

/**
 * Vrai dès que le fuseau du navigateur fait foi : faux au rendu serveur et
 * pendant l'hydratation, vrai ensuite.
 *
 * `useSyncExternalStore` et non un état posé dans un `useEffect` : un effet
 * ferait passer **chaque** montage par le fuseau de l'animateur, y compris
 * ceux qui n'hydratent rien — changer d'onglet ou de jour sur `/mes-lives`
 * ferait clignoter l'heure le temps d'un rendu. L'instantané serveur ne sert
 * qu'à l'hydratation ; un composant monté plus tard lit directement `true`.
 */
export function useReaderTimeZoneKnown(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Un fuseau enregistré en base a été validé côté serveur (`isValidTimeZone`),
 * mais un navigateur ancien peut ne pas le connaître : `Intl` lèverait alors
 * pendant le rendu, et toute la liste tomberait avec la ligne.
 */
function knownZone(timeZone: string | null): string {
  if (!timeZone) return FALLBACK_HOST_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_HOST_TIME_ZONE;
  }
}

/**
 * Arbitrage 107 — l'heure s'affiche toujours dans le fuseau du lecteur ; on
 * rappelle celui de l'animateur **seulement** s'il en diffère.
 *
 * Sans cette condition, tout le monde lirait « 18 h 00 (Africa/Douala) » à
 * Douala, ce qui n'apprend rien et alourdit chaque ligne. Avec, un membre de la
 * diaspora sait que 19 h 00 chez lui est bien la séance de 18 h 00 annoncée.
 * Le nom de ville plutôt que l'identifiant : « Douala » se lit, `Africa/Douala`
 * se déchiffre.
 *
 * Non exportée : la comparaison lit le fuseau de la machine qui rend, et
 * n'a donc de sens qu'une fois hydraté. Côté serveur, elle comparerait au
 * fuseau du conteneur. `useSessionTimeZone` porte cette garde.
 */
function hostTimeLabel(date: Date, timeZone: string | null): string | null {
  if (!timeZone) return null;
  try {
    if (timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone) return null;
    const time = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(date);
    const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
    return `${time} à ${city}`;
  } catch {
    // Fuseau inconnu du navigateur : mieux vaut ne rien dire que d'afficher un
    // identifiant brut à côté d'une heure déjà juste.
    return null;
  }
}

/**
 * Le fuseau dans lequel écrire la date d'une séance, et le rappel de celui de
 * l'animateur.
 *
 * Usage
 * -----
 *   const { timeZone, hostLabel } = useSessionTimeZone(session.timeZone);
 *   new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", timeZone }).format(date);
 *   hostLabel(date); // « 18:00 à Douala », ou null
 */
export function useSessionTimeZone(hostTimeZone: string | null): {
  /** À passer tel quel à `Intl.DateTimeFormat` — `undefined` : le fuseau du lecteur. */
  timeZone: string | undefined;
  /** Nul avant l'hydratation, ou si le lecteur est dans le fuseau de l'animateur. */
  hostLabel: (date: Date) => string | null;
} {
  const readerKnown = useReaderTimeZoneKnown();
  return {
    timeZone: readerKnown ? undefined : knownZone(hostTimeZone),
    hostLabel: (date) => (readerKnown ? hostTimeLabel(date, hostTimeZone) : null),
  };
}
