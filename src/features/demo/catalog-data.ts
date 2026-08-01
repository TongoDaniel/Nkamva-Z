import type { CourseListItem } from '@/lib/dto'

/**
 * Données de démonstration reprises de la maquette (`assets/nkamva-data.js`).
 *
 * ⚠️ Aucune de ces données ne vient de la base. Elles alimentent les écrans tant
 * que ceux-ci ne sont pas branchés sur les services Prisma des lots 0-4. Le jour
 * où un écran est branché, il cesse d'importer ce module — c'est le seul endroit
 * à supprimer pour savoir qu'il ne reste plus de faux contenu.
 */

export type CategoryId = 'dev' | 'biz' | 'dsg' | 'mkt'
export type FormatId = 'video' | 'pdf' | 'kit' | 'notion' | 'tableur'
export type ChipTone = 'brand' | 'clay' | 'blue' | 'gold'

export interface Category {
  id: CategoryId
  label: string
  tone: ChipTone
}

export interface Format {
  id: FormatId
  label: string
  /** Icône lucide correspondante, résolue à l'affichage. */
  icon: 'play' | 'file-text' | 'package' | 'layout' | 'table'
}

export interface Author {
  id: string
  name: string
  initials: string
  role: string
  city: string
  bio: string
  rating: number
  students: number
  resourceCount: number
}

export interface CurriculumModule {
  title: string
  lessons: number
  minutes: number
}

export interface Review {
  name: string
  initials: string
  stars: number
  text: string
}

export interface Resource {
  slug: string
  title: string
  category: Category
  format: Format
  /** Durée ou volume affiché à côté du format : « 4 h 20 », « 24 pages »… */
  meta: string
  price: number
  author: Author
  rating: number
  reviews: number
  students: number
  level: 'Débutant' | 'Intermédiaire' | 'Avancé'
  updated: string
  lang: string
  blurb: string
  learn: string[]
  includes: string[]
  curriculum: CurriculumModule[]
  lessonsTotal: number
  reviewList: Review[]
  /** Répartition des notes, de 5 étoiles à 1 étoile. */
  distribution: number[]
}

export const CATEGORIES: Category[] = [
  { id: 'dev', label: 'Développement', tone: 'brand' },
  { id: 'biz', label: 'Business', tone: 'clay' },
  { id: 'dsg', label: 'Design', tone: 'blue' },
  { id: 'mkt', label: 'Marketing', tone: 'gold' },
]

export const FORMATS: Format[] = [
  { id: 'video', label: 'Vidéo', icon: 'play' },
  { id: 'pdf', label: 'PDF', icon: 'file-text' },
  { id: 'kit', label: 'Kit', icon: 'package' },
  { id: 'notion', label: 'Modèle', icon: 'layout' },
  { id: 'tableur', label: 'Tableur', icon: 'table' },
]

const AUTHORS_RAW = {
  as: {
    id: 'as',
    name: 'Aminata Sow',
    initials: 'AS',
    role: 'Architecte logicielle',
    city: 'Dakar, Sénégal',
    bio: "12 ans à concevoir des systèmes pour la fintech ouest-africaine. J'enseigne l'architecture comme un métier, pas comme une théorie.",
    rating: 4.9,
    students: 3120,
  },
  dt: {
    id: 'dt',
    name: 'Daniel Tongo',
    initials: 'DT',
    role: 'Lead QA & testeur',
    city: 'Douala, Cameroun',
    bio: 'Je traque les bugs pour les équipes produit depuis 8 ans. Mes guides sont des checklists nées du terrain.',
    rating: 4.7,
    students: 1440,
  },
  yo: {
    id: 'yo',
    name: 'Yann Ondoa',
    initials: 'YO',
    role: 'Monteur & créateur vidéo',
    city: 'Yaoundé, Cameroun',
    bio: '430k abonnés cumulés. Je montre le montage tel que je le pratique, projet réel à l’appui.',
    rating: 4.8,
    students: 5210,
  },
  mt: {
    id: 'mt',
    name: 'Mariam Traoré',
    initials: 'MT',
    role: 'Juriste d’affaires',
    city: 'Bamako, Mali',
    bio: "J'accompagne les PME dans leur création et leur mise en conformité. Mes kits font gagner des semaines.",
    rating: 4.9,
    students: 980,
  },
  km: {
    id: 'km',
    name: 'Kwame Mensah',
    initials: 'KM',
    role: 'Consultant freelance & Notion',
    city: 'Accra, Ghana',
    bio: "Freelance depuis 6 ans, je pilote tout dans Notion. Je partage mes systèmes, prêts à l'emploi.",
    rating: 4.6,
    students: 2260,
  },
  fn: {
    id: 'fn',
    name: 'Fatou Ndiaye',
    initials: 'FN',
    role: 'Consultante SEO & growth',
    city: 'Abidjan, Côte d’Ivoire',
    bio: "J'aide les commerces locaux à être trouvés sur Google. Résultats mesurables, méthodes simples.",
    rating: 4.8,
    students: 1870,
  },
  jk: {
    id: 'jk',
    name: 'Jean-Marc Kouassi',
    initials: 'JK',
    role: 'Product designer',
    city: 'Abidjan, Côte d’Ivoire',
    bio: "Designer produit dans la tech africaine. J'enseigne l'UI par la pratique, un projet à la fois.",
    rating: 4.9,
    students: 4090,
  },
} as const

type AuthorKey = keyof typeof AUTHORS_RAW

interface ResourceSeed {
  slug: string
  title: string
  cat: CategoryId
  fmt: FormatId
  meta: string
  price: number
  author: AuthorKey
  rating: number
  reviews: number
  students: number
  level: Resource['level']
  updated: string
  blurb: string
  learn: string[]
  includes: string[]
}

const RESOURCES_RAW: ResourceSeed[] = [
  {
    slug: 'architecture-logicielle-ddd',
    title: 'Architecture logicielle — masterclass Patterns & DDD',
    cat: 'dev', fmt: 'video', meta: '4 h 20', price: 49000, author: 'as',
    rating: 4.9, reviews: 214, students: 1280, level: 'Avancé', updated: 'Mars 2026',
    blurb: 'Concevez des systèmes qui tiennent la charge et le temps. Patterns tactiques, Domain-Driven Design et découpage en services, appliqués à des cas réels.',
    learn: ['Modéliser un domaine métier avec DDD', 'Choisir le bon pattern selon le contexte', 'Découper un monolithe en services cohérents', 'Poser des frontières et des contrats clairs'],
    includes: ['4 h 20 de vidéo HD', 'Code source des exemples', 'Diagrammes téléchargeables', 'Accès à vie, mises à jour incluses'],
  },
  {
    slug: 'guide-qa-checklist',
    title: 'Guide QA — Checklist de validation fonctionnelle',
    cat: 'dev', fmt: 'pdf', meta: '24 pages', price: 1000, author: 'dt',
    rating: 4.7, reviews: 88, students: 640, level: 'Débutant', updated: 'Février 2026',
    blurb: "La checklist que j'utilise avant chaque mise en production. Rien à installer : imprimez, cochez, livrez sereinement.",
    learn: ['Structurer une recette fonctionnelle', 'Repérer les cas limites oubliés', 'Documenter un bug utile pour les devs', 'Prioriser ce qui bloque vraiment'],
    includes: ['24 pages PDF prêtes à imprimer', 'Modèle de fiche de bug', 'Accès à vie'],
  },
  {
    slug: 'montage-davinci-resolve',
    title: 'Montage vidéo avec DaVinci Resolve — de zéro à publié',
    cat: 'dsg', fmt: 'video', meta: '2 h 05', price: 3000, author: 'yo',
    rating: 4.8, reviews: 301, students: 2140, level: 'Débutant', updated: 'Janvier 2026',
    blurb: "Du rush brut à la vidéo publiée, sans jargon. On monte un projet réel ensemble, étape par étape, sur la version gratuite de DaVinci.",
    learn: ['Maîtriser l’interface de DaVinci Resolve', 'Couper, rythmer et raccorder proprement', 'Étalonner et corriger le son', 'Exporter pour YouTube et le mobile'],
    includes: ['2 h 05 de vidéo', 'Rushes du projet fil rouge', 'LUT et presets d’export', 'Accès à vie'],
  },
  {
    slug: 'lancer-sa-pme-kit',
    title: 'Lancer sa PME — kit juridique & financier complet',
    cat: 'biz', fmt: 'kit', meta: 'PDF + tableur', price: 6900, author: 'mt',
    rating: 4.9, reviews: 126, students: 520, level: 'Intermédiaire', updated: 'Mars 2026',
    blurb: "Toutes les pièces pour créer et piloter votre PME dans l'espace OHADA : statuts, prévisionnel, suivi de trésorerie. Prêt à remplir.",
    learn: ['Choisir la bonne forme juridique', 'Bâtir un prévisionnel crédible', 'Suivre sa trésorerie mois par mois', 'Éviter les erreurs de conformité courantes'],
    includes: ['Modèles de statuts (Word)', 'Tableur prévisionnel & trésorerie', 'Guide PDF de 40 pages', 'Accès à vie, mises à jour incluses'],
  },
  {
    slug: 'notion-freelances',
    title: 'Notion pour freelances — pilotez missions & factures',
    cat: 'biz', fmt: 'notion', meta: 'Modèle Notion', price: 4500, author: 'km',
    rating: 4.6, reviews: 174, students: 1310, level: 'Débutant', updated: 'Février 2026',
    blurb: "Mon système Notion complet pour gérer clients, missions, factures et revenus au même endroit. Dupliquez-le et travaillez dès aujourd'hui.",
    learn: ['Centraliser clients et missions', 'Suivre devis, factures et paiements', 'Visualiser vos revenus mensuels', 'Adapter le système à votre activité'],
    includes: ['Modèle Notion à dupliquer', 'Vidéo de prise en main (18 min)', 'Mises à jour à vie'],
  },
  {
    slug: 'seo-local-commerce',
    title: 'SEO local — faire trouver son commerce sur Google',
    cat: 'mkt', fmt: 'video', meta: '3 h 10', price: 8000, author: 'fn',
    rating: 4.8, reviews: 142, students: 890, level: 'Intermédiaire', updated: 'Janvier 2026',
    blurb: "Faites remonter votre commerce dans Google et sur la carte. Une méthode locale, testée sur des dizaines d'entreprises africaines.",
    learn: ['Optimiser sa fiche Google Business', 'Choisir les bons mots-clés locaux', 'Récolter des avis qui convertissent', 'Mesurer ce qui ramène des clients'],
    includes: ['3 h 10 de vidéo', 'Modèle de fiche Google', 'Checklist SEO local', 'Accès à vie'],
  },
  {
    slug: 'ui-design-fondamentaux',
    title: 'UI design — les fondamentaux, projet par projet',
    cat: 'dsg', fmt: 'video', meta: '5 h 40', price: 12000, author: 'jk',
    rating: 4.9, reviews: 268, students: 2010, level: 'Débutant', updated: 'Mars 2026',
    blurb: "Apprenez le design d'interface en concevant de vrais écrans. Typographie, couleur, grilles et composants — la théorie juste ce qu'il faut.",
    learn: ['Poser une hiérarchie visuelle claire', 'Composer typographie et couleur', 'Construire une grille et des espacements', 'Livrer des maquettes propres dans Figma'],
    includes: ['5 h 40 de vidéo', 'Fichiers Figma des projets', 'Kit UI de démarrage', 'Accès à vie, mises à jour incluses'],
  },
  {
    slug: 'whatsapp-business-auto',
    title: 'Automatiser WhatsApp Business — répondre en dormant',
    cat: 'mkt', fmt: 'pdf', meta: '18 pages', price: 2500, author: 'fn',
    rating: 4.5, reviews: 63, students: 410, level: 'Débutant', updated: 'Février 2026',
    blurb: 'Mettez en place des réponses automatiques, un catalogue et un tunnel de vente sur WhatsApp Business, sans coder.',
    learn: ['Configurer les réponses automatiques', 'Monter un catalogue produit', 'Créer des messages de relance', 'Suivre les conversations qui vendent'],
    includes: ['Guide PDF de 18 pages', 'Modèles de messages prêts', 'Accès à vie'],
  },
  {
    slug: 'python-data-debutant',
    title: 'Python pour l’analyse de données — premiers pas',
    cat: 'dev', fmt: 'video', meta: '6 h 15', price: 15000, author: 'as',
    rating: 4.8, reviews: 97, students: 720, level: 'Débutant', updated: 'Mars 2026',
    blurb: 'De zéro à vos premières analyses réelles avec Python, pandas et des jeux de données africains concrets.',
    learn: ['Écrire ses premiers scripts Python', 'Manipuler des tableaux avec pandas', 'Nettoyer et croiser des données', 'Produire des graphiques lisibles'],
    includes: ['6 h 15 de vidéo', 'Notebooks et jeux de données', 'Exercices corrigés', 'Accès à vie'],
  },
  {
    slug: 'branding-identite-visuelle',
    title: 'Identité visuelle — créer une marque qui reste',
    cat: 'dsg', fmt: 'kit', meta: 'Vidéo + gabarits', price: 9500, author: 'jk',
    rating: 4.7, reviews: 81, students: 530, level: 'Intermédiaire', updated: 'Janvier 2026',
    blurb: 'Logo, palette, typographie, déclinaisons : construisez une identité de marque cohérente et livrez un guide de style pro.',
    learn: ['Traduire une marque en éléments visuels', 'Composer une palette et une typo durables', 'Décliner un logo sur tous les supports', 'Livrer un guide de style clair'],
    includes: ['2 h 40 de vidéo', 'Gabarits de charte (Figma)', 'Bibliothèque d’icônes', 'Accès à vie'],
  },
  {
    slug: 'compta-simplifiee-tableur',
    title: 'Comptabilité simplifiée — le tableur tout-en-un',
    cat: 'biz', fmt: 'tableur', meta: 'Tableur + guide', price: 3500, author: 'mt',
    rating: 4.8, reviews: 110, students: 940, level: 'Débutant', updated: 'Février 2026',
    blurb: 'Suivez recettes, dépenses et TVA sans logiciel comptable. Un tableur clair, pensé pour les indépendants et petites structures.',
    learn: ['Enregistrer recettes et dépenses', 'Suivre sa marge en temps réel', 'Préparer ses déclarations', 'Anticiper sa trésorerie'],
    includes: ['Tableur prêt à l’emploi', 'Guide PDF de prise en main', 'Accès à vie, mises à jour incluses'],
  },
  {
    slug: 'react-projet-reel',
    title: 'React en pratique — construire une vraie application',
    cat: 'dev', fmt: 'video', meta: '7 h 30', price: 18000, author: 'dt',
    rating: 4.7, reviews: 134, students: 610, level: 'Intermédiaire', updated: 'Mars 2026',
    blurb: 'On construit une application complète en React, du composant à la mise en ligne. State, routing, appels API : tout par la pratique.',
    learn: ['Structurer une application React', 'Gérer l’état et les effets', 'Consommer une API proprement', 'Déployer en production'],
    includes: ['7 h 30 de vidéo', 'Code source par étape', 'Accès à vie'],
  },
  {
    slug: 'photographie-smartphone',
    title: 'Photographie au smartphone — des images qui vendent',
    cat: 'dsg', fmt: 'video', meta: '2 h 45', price: 5000, author: 'yo',
    rating: 4.6, reviews: 76, students: 820, level: 'Débutant', updated: 'Janvier 2026',
    blurb: "Prenez des photos produit et lifestyle dignes d'un pro, avec le téléphone que vous avez déjà. Lumière, cadrage, retouche mobile.",
    learn: ['Maîtriser la lumière naturelle', 'Cadrer et composer une photo produit', 'Retoucher sur mobile en 5 minutes', 'Créer un feed cohérent'],
    includes: ['2 h 45 de vidéo', 'Presets de retouche mobile', 'Accès à vie'],
  },
  {
    slug: 'publicite-facebook-instagram',
    title: 'Publicité Facebook & Instagram — le guide qui convertit',
    cat: 'mkt', fmt: 'video', meta: '4 h 00', price: 11000, author: 'fn',
    rating: 4.7, reviews: 119, students: 700, level: 'Intermédiaire', updated: 'Février 2026',
    blurb: 'Lancez des campagnes qui rapportent, sans brûler votre budget. Ciblage, créa, tunnel et lecture des chiffres.',
    learn: ['Structurer une campagne rentable', 'Cibler la bonne audience', 'Créer des visuels qui arrêtent le scroll', 'Lire ses résultats et optimiser'],
    includes: ['4 h de vidéo', 'Modèles de visuels', 'Tableur de suivi budget', 'Accès à vie'],
  },
  {
    slug: 'gestion-projet-agile',
    title: 'Gestion de projet agile — livrer sans chaos',
    cat: 'biz', fmt: 'pdf', meta: '32 pages', price: 4000, author: 'km',
    rating: 4.6, reviews: 58, students: 480, level: 'Intermédiaire', updated: 'Mars 2026',
    blurb: 'Les rituels et outils agiles expliqués simplement, pour des équipes qui livrent vraiment. Sans dogme, avec du bon sens.',
    learn: ['Cadrer un projet et son périmètre', 'Animer les rituels essentiels', 'Prioriser un backlog utile', 'Suivre l’avancement sans réunionite'],
    includes: ['Guide PDF de 32 pages', 'Modèles de backlog & rétro', 'Accès à vie'],
  },
  {
    slug: 'design-system-figma',
    title: 'Design system dans Figma — composants & tokens',
    cat: 'dsg', fmt: 'video', meta: '3 h 55', price: 14000, author: 'jk',
    rating: 4.9, reviews: 92, students: 560, level: 'Avancé', updated: 'Mars 2026',
    blurb: 'Construisez un design system maintenable dans Figma : tokens, composants, variantes et documentation que les devs adorent.',
    learn: ['Structurer des tokens de design', 'Créer des composants à variantes', 'Documenter pour le handoff', 'Faire évoluer le système sans tout casser'],
    includes: ['3 h 55 de vidéo', 'Fichier Figma de démarrage', 'Accès à vie, mises à jour incluses'],
  },
]

// --- Enrichissement déterministe (curriculum + avis), repris de la maquette ---

const FIRST_NAMES = ['Awa', 'Ibrahim', 'Grace', 'Cheikh', 'Nadège', 'Serge', 'Fadila', 'Olivier', 'Rokhaya', 'Patrick']

const REVIEW_BITS = [
  'Exactement ce que je cherchais, sans blabla. Chaque partie sert.',
  'Le formateur va droit au but et les exemples parlent vraiment.',
  "J'ai appliqué dès le lendemain, résultats concrets. Prix largement justifié.",
  'Clair, bien rythmé, accessible même en partant de zéro.',
  'Un des rares contenus adaptés à notre contexte. Merci !',
  "Rien à jeter. J'y reviens régulièrement comme référence.",
]

const MODULE_TITLES = [
  'Prise en main & fondations',
  'Le cœur du sujet, en pratique',
  'Aller plus loin, cas réels',
  'Finaliser, livrer & progresser',
  'Bonus & modèles réutilisables',
]

/** Générateur pseudo-aléatoire à graine : le contenu doit être stable entre SSR et client. */
function seeded(n: number) {
  let s = n * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function buildResource(seed: ResourceSeed, index: number, author: Author): Resource {
  const rand = seeded(index + 3)
  const isDocument = seed.fmt === 'pdf' || seed.fmt === 'tableur' || seed.fmt === 'notion'
  const moduleCount = isDocument ? 3 : 4 + Math.floor(rand() * 2)

  const curriculum: CurriculumModule[] = []
  for (let m = 0; m < moduleCount; m++) {
    const lessons = 3 + Math.floor(rand() * 3)
    curriculum.push({
      title: MODULE_TITLES[m] ?? `Module ${m + 1}`,
      lessons,
      minutes: lessons * (8 + Math.floor(rand() * 12)),
    })
  }

  const reviewList: Review[] = []
  for (let i = 0; i < 3; i++) {
    const name = FIRST_NAMES[(index * 3 + i) % FIRST_NAMES.length]
    reviewList.push({
      name,
      initials: name.slice(0, 2).toUpperCase(),
      stars: rand() > 0.25 ? 5 : 4,
      text: REVIEW_BITS[(index * 2 + i) % REVIEW_BITS.length],
    })
  }

  return {
    ...seed,
    author,
    category: CATEGORIES.find(c => c.id === seed.cat)!,
    format: FORMATS.find(f => f.id === seed.fmt)!,
    lang: 'Français',
    curriculum,
    lessonsTotal: curriculum.reduce((total, m) => total + m.lessons, 0),
    reviewList,
    distribution: [0.72, 0.19, 0.06, 0.02, 0.01].map(share => Math.round(seed.reviews * share)),
  }
}

export const AUTHORS: Record<string, Author> = Object.fromEntries(
  Object.values(AUTHORS_RAW).map(a => [
    a.id,
    { ...a, resourceCount: RESOURCES_RAW.filter(r => r.author === a.id).length },
  ]),
)

export const RESOURCES: Resource[] = RESOURCES_RAW.map((seed, index) =>
  buildResource(seed, index, AUTHORS[seed.author]),
)

export function resourceBySlug(slug: string): Resource | undefined {
  return RESOURCES.find(r => r.slug === slug)
}

export function resourcesByAuthor(authorId: string): Resource[] {
  return RESOURCES.filter(r => r.author.id === authorId)
}

/**
 * Étiquette de couverture : « VIDÉO · 4 H 20 ». Quand `meta` répète déjà le format
 * (« Modèle Notion »), on ne l'annonce pas deux fois.
 */
export function coverLabel(resource: Resource): string {
  const meta = resource.meta.toUpperCase()
  const format = resource.format.label.toUpperCase()
  return meta.startsWith(format) ? meta : `${format} · ${meta}`
}

/** Formatage des montants en FCFA, séparateur d'espace insécable normalisé. */
export function formatFcfa(amount: number): string {
  return amount.toLocaleString('fr-FR').replace(/ | /g, ' ')
}

/**
 * Adapte une ressource de démonstration au DTO attendu par `ResourceCard`.
 *
 * Les écrans branchés sur Prisma fournissent un `CourseListItem` réel ; les
 * écrans encore en démonstration passent par ici. Quand ils seront branchés,
 * ce mappeur disparaît avec le reste du module.
 */
export function toCourseListItem(resource: Resource): CourseListItem {
  return {
    id: resource.slug,
    slug: resource.slug,
    title: resource.title,
    blurb: resource.blurb,
    category: resource.category.label,
    format: resource.format.id,
    priceFcfa: resource.price,
    level: resource.level,
    // La démo n'exprime la durée que sous forme libre (« 4 h 20 », « 24 pages ») :
    // aucune seconde exploitable, la carte masque donc la durée.
    durationSeconds: null,
    publishedAt: null,
    coverS3Key: null,
    trainerProfile: {
      id: resource.author.id,
      user: { fullName: resource.author.name, bio: resource.author.bio },
      ratingAverage: resource.rating,
      ratingCount: resource.reviews,
      studentsCount: resource.students,
    },
  }
}
