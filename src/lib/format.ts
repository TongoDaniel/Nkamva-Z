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
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
