// ==========================================================================
// Sections de l'espace formateur
// ==========================================================================
// Source unique des écrans qui composent l'espace : la barre de sous-navigation
// du layout et la grille d'entrées de la page d'accueil lisent cette liste.
//
// Aucune icône ici, comme dans `admin-nav.ts` : ce module est importé des deux
// côtés de la frontière. Un composant React exporté depuis un module client ne
// peut pas être lu par un composant serveur, et l'inverse ne peut pas lui être
// passé en prop. Chaque côté attache donc ses propres icônes.
// ==========================================================================

export interface TrainerSection {
  href: string;
  label: string;
  /** Une phrase, affichée sur la carte de la page d'accueil de l'espace. */
  description: string;
}

/**
 * Les cinq écrans qui ont quitté la barre de navigation principale. La racine
 * `/formateur` n'y figure pas : elle est le point d'entrée, pas une section.
 */
export const TRAINER_SECTIONS: TrainerSection[] = [
  {
    href: "/formateur/ressources",
    label: "Mes publications",
    description: "Vos ressources, leurs ventes et vos brouillons en préparation.",
  },
  {
    href: "/formateur/communaute",
    label: "Ma communauté",
    description: "Le salon d'abonnés, ses membres, ses invitations et ses réglages.",
  },
  // « Mes sessions » et non « Mes lives » : le menu du compte porte déjà une
  // entrée « Mes lives » côté apprenant, que le formateur voit aussi.
  {
    href: "/formateur/lives",
    label: "Mes sessions",
    description: "Les directs que vous animez et les replays qu'ils produisent.",
  },
  {
    href: "/formateur/portefeuille",
    label: "Portefeuille",
    description: "Votre solde, vos retraits, votre stockage et votre score de confiance.",
  },
  {
    href: "/formateur/litiges",
    label: "Litiges",
    description: "Les achats contestés et les éléments à fournir à la modération.",
  },
];
