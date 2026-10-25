// Formatage d'affichage — monolingue français (décision : pas d'i18n).

const NBSP = " ";

/** 49000 → « 49 000 » (espace insécable étroite, comme la maquette). */
export function fmtNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

/**
 * Un nombre et son nom, accordé : « 1 membre », « 3 membres », « 0 membre ».
 * En français, zéro et un prennent le singulier. Remplace les « membres »
 * accolés à 1 et les « ressource(s) » des notifications (campagne du
 * 12 octobre 2026, m11).
 */
export function fmtCount(value: number, singular: string, pluralForm = `${singular}s`): string {
  return `${fmtNumber(value)}${NBSP}${Math.abs(value) >= 2 ? pluralForm : singular}`;
}

/** Montant en FCFA. Les montants sont des entiers côté schéma (jamais de Float). */
export function fmtFcfa(amountFcfa: number): string {
  return `${fmtNumber(amountFcfa)}${NBSP}FCFA`;
}

/** 2_147_483_648 → « 2.0 Go ». Repris du dépôt de contenu, pour le quota de stockage. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} Go`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

/** 15600 → « 4 h 20 » · 320 → « 5 min ». */
export function fmtDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

export function fmtDate(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/**
 * Date **et heure à la seconde**, pour le journal d'audit.
 *
 * La seconde n'est pas du zèle : une tâche planifiée écrit des dizaines
 * d'entrées dans la même minute, et le journal les rend dans l'ordre
 * chronologique sans autre repère. Sans l'heure, 250 lignes portaient la même
 * date et rien ne permettait de suivre un enchaînement — ni de dire quelle
 * action avait précédé laquelle.
 */
export function fmtDateTime(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

/** Durée restante d'un compte à rebours, en « m:ss ». */
/**
 * Ancienneté abrégée, comme « il y a 2 h » de la maquette. Au-delà d'un mois on
 * bascule sur la date : « il y a 7 sem. » ne dit plus rien d'utile.
 */
export function fmtRelative(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}${NBSP}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days}${NBSP}j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `il y a ${weeks} sem.`;
  return fmtDate(d);
}

/**
 * L'horodatage d'une liste de conversations, à la manière des messageries
 * courantes : **l'heure** aujourd'hui, « Hier » la veille, le **jour** dans la
 * semaine écoulée, la **date** au-delà.
 *
 * `fmtRelative` ne convient pas ici. « il y a 1 h » répond à « depuis quand »,
 * ce qui intéresse un fil qu'on est en train de lire ; une liste répond à
 * « quand », ce qui se repère et se compare d'une ligne à l'autre. Deux
 * messages à « il y a 2 h » et « il y a 3 h » se rangent mal dans une journée ;
 * 14:05 et 13:10, oui.
 *
 * La comparaison se fait sur le **jour calendaire**, pas sur un écart d'heures :
 * un message de 23 h 50 doit dire « Hier » à 0 h 10, pas « il y a 20 min ».
 */
export function fmtListStamp(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;

  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecartJours = Math.round((jour(new Date()) - jour(d)) / 86_400_000);

  if (ecartJours <= 0) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  if (ecartJours === 1) return "Hier";
  if (ecartJours < 7) {
    // Le jour seul suffit dans la semaine : « mardi » se situe sans calcul.
    const nom = d.toLocaleDateString("fr-FR", { weekday: "long" });
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
