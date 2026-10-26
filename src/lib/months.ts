// ==========================================================================
// Ajouter des mois à une date — en UTC, sans déborder sur le mois suivant
// ==========================================================================
// `setMonth` travaille dans le fuseau du serveur et déborde : un 31 janvier
// plus un mois donnait le 3 mars, et une période qui enjambait le passage à
// l'heure d'hiver gagnait une heure (campagne du 12 octobre 2026, m18). Sans
// effet tant que le serveur tourne en UTC — ce qui n'est écrit nulle part.
// ==========================================================================

function daysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * `start` plus `months` mois, à la même heure UTC. Le jour est plafonné au
 * dernier jour du mois d'arrivée : 31 janvier → 28 (ou 29) février.
 *
 * ⚠️ Enchaîné, le plafond se garde : 31 janvier → 28 février → 28 mars. Une
 * période qui doit revenir au 31 demanderait de garder le jour d'ancrage.
 */
export function addMonthsUtc(start: Date, months: number): Date {
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth() + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const day = Math.min(start.getUTCDate(), daysInMonthUtc(targetYear, targetMonth))
  return new Date(Date.UTC(
    targetYear, targetMonth, day,
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds(),
  ))
}
