// ==========================================================================
// Catalogue de démonstration, repris tel quel de la maquette
// (assets/nkamva-data.js). Sert uniquement de repli quand la base ne renvoie
// rien — typiquement un environnement fraîchement installé — pour que les
// écrans publics restent lisibles au lieu d'afficher une page vide.
//
// Contrat : ces objets respectent `CourseListItem`. Brancher un écran revient
// donc à remplacer la source, jamais à retoucher le rendu.
// Tout écran qui les affiche DOIT le signaler (`<DemoNotice />`).
// ==========================================================================

import type { CourseListItem } from "@/lib/dto";

function trainer(id: string, fullName: string, ratingAverage: number, ratingCount: number) {
  return { id, user: { id, fullName }, ratingAverage, ratingCount };
}

export const DEMO_COURSES: CourseListItem[] = [
  {
    id: "demo-ddd",
    slug: "architecture-logicielle-ddd",
    title: "Architecture logicielle — masterclass Patterns & DDD",
    blurb:
      "Concevoir des systèmes qui tiennent dans le temps : découpage en domaines, agrégats, événements et frontières explicites.",
    category: "Développement",
    format: "video",
    priceFcfa: 49000,
    level: "Avancé",
    durationSeconds: 15600,
    publishedAt: "2026-05-12T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-as", "Aminata Sow", 4.8, 126),
  },
  {
    id: "demo-qa",
    slug: "guide-qa-checklist",
    title: "Guide QA — Checklist de validation fonctionnelle",
    blurb:
      "La checklist qu'on déroule avant chaque mise en production, pensée pour une petite équipe sans testeur dédié.",
    category: "Développement",
    format: "pdf",
    priceFcfa: 1000,
    level: "Débutant",
    durationSeconds: null,
    publishedAt: "2026-06-02T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-dt", "Daniel Tongo", 4.6, 41),
  },
  {
    id: "demo-davinci",
    slug: "montage-davinci-resolve",
    title: "Montage vidéo avec DaVinci Resolve — de zéro à publié",
    blurb:
      "Du rush brut à la vidéo publiée : dérushage, montage, étalonnage et export, sur un logiciel gratuit.",
    category: "Design",
    format: "video",
    priceFcfa: 3000,
    level: "Débutant",
    durationSeconds: 7500,
    publishedAt: "2026-06-18T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-yo", "Yann Ondoa", 4.7, 88),
  },
  {
    id: "demo-pme",
    slug: "lancer-sa-pme-kit",
    title: "Lancer sa PME — kit juridique & financier complet",
    blurb:
      "Statuts, prévisionnel, tableau de trésorerie et modèles de contrats : le dossier complet pour immatriculer et démarrer.",
    category: "Business",
    format: "kit",
    priceFcfa: 6900,
    level: "Intermédiaire",
    durationSeconds: null,
    publishedAt: "2026-04-28T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-mt", "Mariam Traoré", 4.9, 213),
  },
  {
    id: "demo-notion",
    slug: "notion-freelances",
    title: "Notion pour freelances — pilotez missions & factures",
    blurb:
      "Un espace Notion prêt à dupliquer : pipeline de missions, suivi des factures, relances et tableau de bord mensuel.",
    category: "Business",
    format: "notion",
    priceFcfa: 4500,
    level: "Débutant",
    durationSeconds: null,
    publishedAt: "2026-05-30T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-km", "Kwame Mensah", 4.5, 67),
  },
  {
    id: "demo-seo",
    slug: "seo-local-commerce",
    title: "SEO local — faire trouver son commerce sur Google",
    blurb:
      "Fiche établissement, avis clients, pages de quartier : la méthode pour apparaître sur les recherches proches de chez vous.",
    category: "Marketing",
    format: "video",
    priceFcfa: 8000,
    level: "Intermédiaire",
    durationSeconds: 11400,
    publishedAt: "2026-06-25T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-fn", "Fatou Ndiaye", 4.7, 154),
  },
  {
    id: "demo-ui",
    slug: "ui-design-fondamentaux",
    title: "UI design — les fondamentaux, projet par projet",
    blurb:
      "Grille, échelle typographique, couleur et composants : construire une interface cohérente en partant d'une page blanche.",
    category: "Design",
    format: "video",
    priceFcfa: 12000,
    level: "Intermédiaire",
    durationSeconds: 20400,
    publishedAt: "2026-03-14T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-jk", "Jean-Marc Kouassi", 4.8, 192),
  },
  {
    id: "demo-whatsapp",
    slug: "whatsapp-business-auto",
    title: "Automatiser WhatsApp Business — répondre en dormant",
    blurb:
      "Messages d'accueil, réponses rapides, catalogue et relances : servir ses clients sans rester collé au téléphone.",
    category: "Marketing",
    format: "pdf",
    priceFcfa: 2500,
    level: "Débutant",
    durationSeconds: null,
    publishedAt: "2026-07-01T09:00:00.000Z",
    coverS3Key: null,
    trainerProfile: trainer("demo-t-as", "Aminata Sow", 4.8, 126),
  },
];
