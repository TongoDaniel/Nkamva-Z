// ==========================================================================
// Données structurées schema.org pour les moteurs de recherche
// ==========================================================================
// Google lit le type `Course` pour ses résultats enrichis de cours (fiche et
// liste). Rien n'y est ajouté qui ne soit déjà en base et affiché sur la
// page : pas de note (aucun avis n'alimente `ratingAverage`), et pas d'offre
// chiffrée, le franc CFA de NKAMVA couvrant deux devises ISO (XOF et XAF) que
// la ressource ne distingue pas.
// ==========================================================================

import { absoluteUrl } from './notification'

interface CourseForSchema {
  slug: string
  title: string
  blurb: string
  language?: string | null
  level?: string | null
  durationSeconds?: number | null
  trainerProfile?: { user?: { fullName?: string | null } | null } | null
}

/** Durée ISO 8601 (`PT1H30M`) à partir des secondes mesurées sur le fichier. */
function isoDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}`
}

const PROVIDER = { '@type': 'Organization', name: 'NKAMVA', sameAs: absoluteUrl('/') }

export function courseJsonLd(course: CourseForSchema) {
  const author = course.trainerProfile?.user?.fullName
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.blurb,
    url: absoluteUrl(`/ressources/${course.slug}`),
    provider: PROVIDER,
    ...(course.language ? { inLanguage: course.language } : {}),
    ...(course.level ? { educationalLevel: course.level } : {}),
    ...(course.durationSeconds ? { timeRequired: isoDuration(course.durationSeconds) } : {}),
    ...(author ? { author: { '@type': 'Person', name: author } } : {}),
  }
}

/** Liste de cours d'une page du catalogue, pour le résultat « liste de cours ». */
export function courseListJsonLd(courses: { slug: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: courses.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(`/ressources/${c.slug}`),
    })),
  }
}

/**
 * Le JSON à poser dans une balise `<script type="application/ld+json">`. Le
 * chevron ouvrant est échappé : un titre contenant `</script>` fermerait la
 * balise et injecterait du HTML dans la page.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
