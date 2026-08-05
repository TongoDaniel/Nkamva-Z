// Formatage d'affichage — monolingue français (décision : pas d'i18n).

const NBSP = " ";

/** 49000 → « 49 000 » (espace insécable étroite, comme la maquette). */
export function fmtNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
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

export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
