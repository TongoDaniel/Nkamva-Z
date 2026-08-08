/**
 * Les écrans de navigation — catalogue, communautés, formateurs — existent en
 * deux exemplaires : un pour le visiteur, un pour l'utilisateur connecté. Même
 * corps de page, deux URLs, deux coquilles.
 *
 * Next.js interdit à deux groupes de routes de résoudre la même URL : c'est
 * pour ça que la version connectée vit sous `/catalogue/…` et non sous les
 * mêmes chemins que la version publique.
 *
 * Toute l'arborescence est décrite ici plutôt qu'écrite en dur dans chaque
 * composant : un lien codé en dur dans un écran partagé ferait sortir de
 * l'espace courant, ce qui est exactement le défaut que cette table corrige.
 */
export type Space = 'public' | 'app'

export interface SpaceRoutes {
  /** Cible du premier maillon du fil d'Ariane. */
  home: string
  /**
   * Parent du catalogue dans le fil d'Ariane. Il diffère d'un espace à l'autre :
   * le visiteur y arrive depuis l'accueil, le connecté depuis ses ressources —
   * son onglet, depuis que « Catalogue » a quitté la barre de navigation.
   */
  catalogParent: { label: string; href: string }
  /** Catalogue des ressources. */
  catalog: string
  course: (slug: string) => string
  /** Catalogue filtré sur une catégorie — utilisé par le fil d'Ariane des fiches. */
  catalogCategory: (category: string) => string
  communities: string
  community: (slug: string) => string
  trainers: string
  trainer: (trainerId: string) => string
}

export const SPACES: Record<Space, SpaceRoutes> = {
  public: {
    home: '/',
    catalogParent: { label: 'Accueil', href: '/' },
    catalog: '/ressources',
    course: (slug) => `/ressources/${slug}`,
    catalogCategory: (category) => `/ressources?category=${encodeURIComponent(category)}`,
    communities: '/communautes',
    community: (slug) => `/communautes/${slug}`,
    trainers: '/formateurs',
    trainer: (trainerId) => `/formateurs/${trainerId}`,
  },
  app: {
    home: '/accueil',
    catalogParent: { label: 'Mes ressources', href: '/mes-ressources' },
    catalog: '/catalogue',
    // Un segment `ressource` intercalé : sans lui, `/catalogue/communautes`
    // entrerait en collision avec la fiche d'une ressource dont le slug serait
    // « communautes », que Next résoudrait silencieusement vers la route
    // statique en rendant la ressource injoignable.
    course: (slug) => `/catalogue/ressource/${slug}`,
    catalogCategory: (category) => `/catalogue?category=${encodeURIComponent(category)}`,
    communities: '/catalogue/communautes',
    community: (slug) => `/catalogue/communautes/${slug}`,
    trainers: '/catalogue/formateurs',
    trainer: (trainerId) => `/catalogue/formateurs/${trainerId}`,
  },
}

export function routesOf(space: Space): SpaceRoutes {
  return SPACES[space]
}
