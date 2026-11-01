const LOCALE = 'fr-FR'

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
  // L'heure est composée à la main : selon le moteur JavaScript du téléphone,
  // `toLocaleTimeString` rendait parfois une chaîne vide (« jeudi 5 novembre à »).
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${day} à ${time}`
}

/** « il y a 3 h », « hier », « 12 oct. » : pour les fils et les notifications. */
export function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'à l’instant'
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  if (diff < 172800) return 'hier'
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
}

export const FORMAT_LABELS: Record<string, string> = {
  video: 'Vidéo',
  pdf: 'PDF',
  kit: 'Kit',
  notion: 'Notion',
  tableur: 'Tableur',
}

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format
}

export function firstName(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? ''
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'N'
}
