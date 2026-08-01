/**
 * Communautés et formateurs de démonstration (`nkamva-communities-data.js`,
 * `nkamva-formateurs-data.js` de la maquette). Voir l'avertissement en tête de
 * `catalog-data.ts` : rien ici ne vient de la base.
 */

import { AUTHORS, CATEGORIES, type Author, type Category, type CategoryId } from './catalog-data'

export interface Community {
  slug: string
  name: string
  author: Author
  category: Category
  price: number
  members: number
  messages: number
  lives: number
  description: string
}

interface CommunitySeed {
  slug: string
  name: string
  authorId: string
  cat: CategoryId
  price: number
  members: number
  messages: number
  lives: number
  description: string
}

const COMMUNITIES_RAW: CommunitySeed[] = [
  {
    slug: 'ingenierie-logicielle-afrique',
    name: 'Ingénierie logicielle Afrique',
    authorId: 'as', cat: 'dev', price: 5000, members: 412, messages: 34, lives: 2,
    description: 'Un espace pour les développeurs qui construisent des systèmes sérieux : architecture, revue de code entre pairs, et sessions live sur des cas réels de production.',
  },
  {
    slug: 'qa-tests-logiciels',
    name: 'QA & Tests logiciels',
    authorId: 'dt', cat: 'dev', price: 3000, members: 187, messages: 15, lives: 1,
    description: "La communauté des testeurs et QA d'Afrique francophone. Checklists partagées, retours d'expérience terrain, et entraide sur vos plans de test.",
  },
  {
    slug: 'createurs-video-montage',
    name: 'Créateurs vidéo & montage',
    authorId: 'yo', cat: 'dsg', price: 4000, members: 566, messages: 41, lives: 3,
    description: 'Monteurs et créateurs vidéo : partagez vos rushs, obtenez des retours sur vos montages, et suivez des lives de montage en direct chaque semaine.',
  },
  {
    slug: 'entrepreneurs-pme-ohada',
    name: 'Entrepreneurs & PME OHADA',
    authorId: 'mt', cat: 'biz', price: 6000, members: 298, messages: 22, lives: 2,
    description: "Créateurs et dirigeants de PME dans l'espace OHADA : questions juridiques, conformité, et modèles partagés entre membres.",
  },
  {
    slug: 'freelances-independants',
    name: 'Freelances & indépendants',
    authorId: 'km', cat: 'biz', price: 3500, members: 341, messages: 27, lives: 1,
    description: "Pilotez votre activité freelance : missions, facturation, organisation Notion — une communauté d'indépendants qui s'entraident.",
  },
  {
    slug: 'growth-marketing-local',
    name: 'Growth & marketing local',
    authorId: 'fn', cat: 'mkt', price: 4500, members: 229, messages: 19, lives: 2,
    description: 'SEO local, publicité, WhatsApp Business : des stratégies marketing pensées pour le commerce africain, testées en direct.',
  },
  {
    slug: 'design-produit-afrique',
    name: 'Design produit Afrique',
    authorId: 'jk', cat: 'dsg', price: 5500, members: 503, messages: 38, lives: 3,
    description: 'Product designers et UI/UX : critiques de fichiers Figma, discussions design system, et lives de conception en direct.',
  },
]

export const COMMUNITIES: Community[] = COMMUNITIES_RAW.map(seed => ({
  slug: seed.slug,
  name: seed.name,
  author: AUTHORS[seed.authorId],
  category: CATEGORIES.find(c => c.id === seed.cat)!,
  price: seed.price,
  members: seed.members,
  messages: seed.messages,
  lives: seed.lives,
  description: seed.description,
}))

export function communityBySlug(slug: string): Community | undefined {
  return COMMUNITIES.find(c => c.slug === slug)
}

/** Salons d'une communauté — même découpage que la maquette. */
export const SALONS = [
  { key: 'forum', label: 'Forum', description: 'Échanges et questions de la communauté' },
  { key: 'res', label: 'Ressources', description: 'Documents et supports partagés' },
  { key: 'live', label: 'Lives & Replays', description: 'Sessions en direct et rediffusions' },
] as const

export interface Trainer extends Author {
  since: number
  category: Category
  community: Community
}

const SINCE: Record<string, number> = { as: 2024, dt: 2025, yo: 2023, mt: 2024, km: 2025, fn: 2024, jk: 2023 }

export const TRAINERS: Trainer[] = ['as', 'dt', 'yo', 'mt', 'km', 'fn', 'jk'].map(id => {
  const community = COMMUNITIES.find(c => c.author.id === id)!
  return { ...AUTHORS[id], since: SINCE[id], category: community.category, community }
})

export function trainerById(id: string): Trainer | undefined {
  return TRAINERS.find(t => t.id === id)
}
