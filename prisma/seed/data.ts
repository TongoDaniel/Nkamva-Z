// ==========================================================================
// Le contenu du jeu de démonstration
// ==========================================================================
// Uniquement des données : aucune écriture, aucune règle. Le scénario — qui
// achète quoi, qui conteste, qui est payé — vit dans `prisma/seed.ts`, qui
// pilote les vrais services avec ce que ce fichier décrit.
//
// Les textes sont écrits pour être lus. Un catalogue de « Ressource 1 …
// Ressource 12 » remplit les grilles mais ne montre rien : ni la longueur
// réelle d'un titre sur une carte, ni le comportement d'une description à deux
// paragraphes, ni ce que devient un nom de formateur trop long dans un avatar.
// ==========================================================================

// --- Adressage -------------------------------------------------------------
//
// Toutes les boîtes du jeu sont des sous-adresses d'une seule vraie boîte.
// Deux raisons, et la seconde est la plus importante :
//
//   1. On peut se connecter à n'importe quel personnage et recevoir réellement
//      ses e-mails — vérification d'adresse, réinitialisation, décision de
//      candidature. Le parcours se teste en entier.
//   2. Les clés Resend sont actives. Semer des adresses `@example.com` ferait
//      partir de vrais messages vers un domaine réservé par l'IANA, sans MX :
//      chaque envoi reviendrait en rebond dur, et un domaine expéditeur qui
//      accumule les rebonds durs finit par être suspendu. Une sous-adresse
//      Gmail délivre toujours.
//
// Changer cette constante suffit à rebrancher tout le jeu sur une autre boîte.
export const MAILBOX = 'tongodanielfo@gmail.com'

export function addressFor(key: string): string {
  const [local, domain] = MAILBOX.split('@')
  return `${local}+${key}@${domain}`
}

/** Mot de passe commun : un seul hachage argon2 à calculer, partagé ensuite. */
export const DEV_PASSWORD = 'Nkamva!2026'

// --- Administration --------------------------------------------------------

export interface AdminSeed {
  key: string
  fullName: string
  adminRole: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION'
}

export const ADMINS: AdminSeed[] = [
  { key: 'admin', fullName: 'Diane Ekwalla', adminRole: 'SUPER_ADMIN' },
  { key: 'finances', fullName: 'Paul Mbarga', adminRole: 'FINANCES' },
  { key: 'moderation', fullName: 'Sarah Nkoulou', adminRole: 'MODERATION' },
]

// --- Formateurs ------------------------------------------------------------

export interface TrainerSeed {
  key: string
  fullName: string
  /** Nom relevé sur la pièce d'identité — ce que Finances compare au compte. */
  legalName: string
  slogan: string
  description: string
  domains: string[]
  experienceYears: number
  countryCode: string
  phone: string
  websiteUrl?: string
  /** Ancienneté du profil, en jours. Le score KYC exige au moins 30 jours. */
  approvedDaysAgo: number
}

export const TRAINERS: TrainerSeed[] = [
  {
    key: 'awa',
    fullName: 'Awa Sarr',
    legalName: 'Awa Sarr',
    slogan: 'Architecture logicielle et revue de code',
    description:
      "Ingénieure logicielle à Dakar, elle accompagne depuis neuf ans les équipes qui passent du prototype à la production. Elle enseigne ce qu'elle pratique : découper un domaine, tester sans base de données, et tenir une revue de code qui ne décourage personne.",
    domains: ['Développement', 'Data'],
    experienceYears: 9,
    countryCode: 'SN',
    phone: '+221770000101',
    websiteUrl: 'https://awasarr.dev',
    approvedDaysAgo: 420,
  },
  {
    key: 'moussa',
    fullName: 'Moussa Traoré',
    legalName: 'Moussa Traoré',
    slogan: 'Conformité OHADA pour les dirigeants de PME',
    description:
      "Juriste d'affaires à Abidjan, il outille les créateurs d'entreprise sur le droit OHADA : choix de la forme juridique, rédaction des statuts, obligations comptables. Ses ressources sont des documents qu'on remplit, pas des cours magistraux.",
    domains: ['Business'],
    experienceYears: 14,
    countryCode: 'CI',
    phone: '+225070000102',
    approvedDaysAgo: 310,
  },
  {
    key: 'fatou',
    fullName: 'Fatou Ndiaye',
    legalName: 'Fatou Ndiaye',
    slogan: 'Growth local et WhatsApp Business',
    description:
      "Elle construit des acquisitions pour le commerce africain : référencement local, catalogues WhatsApp, publicité à petit budget. Six ans passés à faire vendre des boutiques qui n'avaient jamais eu de site.",
    domains: ['Marketing'],
    experienceYears: 6,
    countryCode: 'SN',
    phone: '+221770000103',
    approvedDaysAgo: 260,
  },
  {
    key: 'yao',
    fullName: 'Yao Kouassi',
    legalName: 'Yao Marcel Kouassi',
    slogan: 'Montage vidéo et identité de marque',
    description:
      "Monteur et directeur artistique, il travaille pour des marques et des créateurs d'Afrique de l'Ouest. Il défend une idée simple : le rythme d'un montage compte plus que ses effets.",
    domains: ['Design'],
    experienceYears: 8,
    countryCode: 'CI',
    phone: '+225070000104',
    approvedDaysAgo: 180,
  },
  {
    key: 'kofi',
    fullName: 'Kofi Mensah',
    legalName: 'Kofi Mensah',
    slogan: 'Données et tableaux de bord pour dirigeants',
    description:
      "Analyste à Accra, il transforme des exports comptables en tableaux de bord qu'un dirigeant lit en deux minutes. Il travaille surtout avec des PME qui n'ont ni service data ni budget pour en avoir un.",
    domains: ['Data', 'Business'],
    experienceYears: 11,
    countryCode: 'GH',
    phone: '+233240000105',
    approvedDaysAgo: 95,
  },
  {
    key: 'nadege',
    fullName: 'Nadège Bidias',
    legalName: 'Nadège Carine Bidias',
    slogan: 'Design de présentations et supports de formation',
    description:
      "Graphiste à Douala, elle met en forme les supports des formateurs et des ONG : décks, livrets d'atelier, kits d'animation. Elle a rejoint NkamVa récemment et prépare ses premières publications.",
    domains: ['Design'],
    experienceYears: 5,
    countryCode: 'CM',
    phone: '+237690000106',
    // Approuvée par la vraie chaîne de candidature pendant le seed : c'est la
    // date d'aujourd'hui qui fera foi, d'où l'absence d'antériorité ici.
    approvedDaysAgo: 0,
  },
]

// --- Candidatures en cours d'instruction -----------------------------------

export interface ApplicantSeed {
  key: string
  fullName: string
  slogan: string
  description: string
  domains: string[]
  experienceYears: number
  countryCode: string
  /** Ce que la Modération en fait pendant le seed. */
  outcome: 'SUBMITTED' | 'RESUBMISSION_PENDING' | 'REJECTED'
  submittedDaysAgo: number
  /** Motif de rejet de la pièce, pour `RESUBMISSION_PENDING` et `REJECTED`. */
  rejectionReason?: string
}

export const APPLICANTS: ApplicantSeed[] = [
  {
    key: 'serge',
    fullName: 'Serge Abega',
    slogan: 'Électricité solaire domestique',
    description:
      "Installateur photovoltaïque à Yaoundé depuis douze ans. Je forme les techniciens à dimensionner une installation domestique, choisir les batteries et diagnostiquer une panne sans multimètre de laboratoire.",
    domains: ['Business'],
    experienceYears: 12,
    countryCode: 'CM',
    outcome: 'SUBMITTED',
    submittedDaysAgo: 3,
  },
  {
    key: 'lucie',
    fullName: 'Lucie Ngo',
    slogan: 'Pâtisserie professionnelle et coût matière',
    description:
      "Cheffe pâtissière et formatrice. Mes ressources portent autant sur le geste que sur le calcul du coût matière : une pâtisserie qui ne sait pas ce que coûte sa production ferme dans l'année.",
    domains: ['Business'],
    experienceYears: 7,
    countryCode: 'CM',
    outcome: 'RESUBMISSION_PENDING',
    submittedDaysAgo: 9,
    rejectionReason:
      "La pièce d'identité est illisible sur la moitié inférieure : le numéro et la date d'expiration ne sont pas exploitables. Merci de reprendre la photo à plat, sans reflet.",
  },
  {
    key: 'thierry',
    fullName: 'Thierry Owona',
    slogan: 'Trading et revenus rapides',
    description:
      "Je forme au trading de devises avec une méthode qui garantit un rendement mensuel. Résultats prouvés sur mon compte personnel.",
    domains: ['Business'],
    experienceYears: 2,
    countryCode: 'CM',
    outcome: 'REJECTED',
    submittedDaysAgo: 21,
    rejectionReason:
      "Le dossier annonce une garantie de rendement financier, ce que les conditions d'utilisation interdisent explicitement. La candidature ne peut pas être retenue en l'état.",
  },
]

// --- Apprenants ------------------------------------------------------------

export interface LearnerSeed {
  key: string
  fullName: string
  preferredName?: string
  countryCode: string
  bio?: string
  /** Compte créé il y a n jours — étale les inscriptions sur l'axe du temps. */
  createdDaysAgo: number
  /**
   * Arbitrage 63 — deux niveaux, pas un booléen. `RESTRICTED` écarte la parole
   * sans retirer l'accès ; `BANNED` coupe la connexion **et** l'accès aux
   * ressources déjà payées, ce qui la réserve au Super-admin.
   *
   * Les deux passent par `applySanction`, qui pose aussi `suspendedAt` — le
   * champ que lit l'authentification. L'écrire à la main produirait un compte
   * suspendu au niveau `NONE` : un état que le produit ne sait pas fabriquer,
   * et que ses écrans lisent de deux façons contradictoires.
   */
  sanction?: { level: 'RESTRICTED' | 'BANNED'; reason: string }
}

export const LEARNERS: LearnerSeed[] = [
  {
    key: 'aminata',
    fullName: 'Aminata Diallo',
    preferredName: 'Aminata',
    countryCode: 'SN',
    bio: "Développeuse junior à Dakar. J'apprends surtout le soir, sur téléphone.",
    createdDaysAgo: 120,
  },
  { key: 'ibrahim', fullName: 'Ibrahim Cissé', countryCode: 'ML', createdDaysAgo: 98 },
  { key: 'nadia', fullName: 'Nadia Bamba', countryCode: 'CI', createdDaysAgo: 86 },
  { key: 'seydou', fullName: 'Seydou Keïta', countryCode: 'ML', createdDaysAgo: 74 },
  {
    key: 'clarisse',
    fullName: 'Clarisse Mvondo',
    countryCode: 'CM',
    bio: 'Gérante de deux boutiques à Douala.',
    createdDaysAgo: 61,
  },
  { key: 'omar', fullName: 'Omar Fall', countryCode: 'SN', createdDaysAgo: 52 },
  { key: 'rita', fullName: 'Rita Owusu', countryCode: 'GH', createdDaysAgo: 44 },
  { key: 'jean', fullName: 'Jean Kouamé', countryCode: 'CI', createdDaysAgo: 33 },
  { key: 'esther', fullName: 'Esther Abaga', countryCode: 'GA', createdDaysAgo: 19 },
  { key: 'malick', fullName: 'Malick Sow', countryCode: 'SN', createdDaysAgo: 12 },
  {
    key: 'blaise',
    fullName: 'Blaise Zongo',
    countryCode: 'BF',
    createdDaysAgo: 40,
    sanction: {
      level: 'RESTRICTED',
      reason:
        "Propos agressifs répétés envers un formateur dans le forum de « L'Atelier du code », malgré un premier rappel.",
    },
  },
  {
    key: 'grace',
    fullName: 'Grâce Ilunga',
    countryCode: 'CD',
    createdDaysAgo: 27,
    sanction: {
      level: 'BANNED',
      reason:
        'Trois contestations de paiement ouvertes chez le fournisseur en deux semaines, sans réponse aux demandes du support.',
    },
  },
]

// --- Catalogue -------------------------------------------------------------

export interface CourseSeed {
  key: string
  trainerKey: string
  title: string
  blurb: string
  description: string
  learnPoints: string[]
  includes: string[]
  category: string
  format: 'video' | 'pdf' | 'kit' | 'notion' | 'tableur'
  priceFcfa: number
  level?: 'débutant' | 'intermédiaire' | 'avancé'
  durationSeconds?: number
  lessonsCount?: number
  /** `draft` reste en brouillon ; `archived` est publié puis retiré. */
  state?: 'published' | 'draft' | 'archived'
  publishedDaysAgo?: number
  /** Ressource réservée aux membres d'une communauté (arbitrage 47). */
  communityKey?: string
}

export const COURSES: CourseSeed[] = [
  // --- Awa Sarr — Développement & Data
  {
    key: 'hexagonale',
    trainerKey: 'awa',
    title: 'Architecture hexagonale en pratique',
    blurb: 'Structurer une application qui doit encore tenir dans trois ans.',
    description:
      "On part d'une application qui marche mais qu'on n'ose plus toucher, et on la remet d'aplomb couche par couche.\n\nLe domaine d'abord, les adaptateurs ensuite : à la fin, changer de base de données ou de fournisseur de paiement ne demande plus de rouvrir la logique métier.",
    learnPoints: [
      'Isoler un domaine des détails techniques',
      'Écrire des tests qui ne touchent pas la base',
      'Reconnaître une dépendance qui part dans le mauvais sens',
      'Introduire un port sans réécrire le projet',
    ],
    includes: ['12 leçons vidéo', 'Code source du projet fil rouge', 'Accès à vie'],
    category: 'Développement',
    format: 'video',
    priceFcfa: 15000,
    level: 'intermédiaire',
    durationSeconds: 12600,
    lessonsCount: 12,
    publishedDaysAgo: 96,
  },
  {
    key: 'tests-ci',
    trainerKey: 'awa',
    title: 'Tests automatisés : de zéro à la CI',
    blurb: "Commencer à tester un projet qui n'a jamais été testé.",
    description:
      "Aucun test, une équipe pressée, et personne ne sait par où commencer. Ce cours prend ce cas précis et le déroule jusqu'à une intégration continue qui tourne à chaque poussée.\n\nOn s'attarde sur le choix des premiers tests : ceux qui rapportent tout de suite, et ceux qui coûtent cher pour rien.",
    learnPoints: [
      'Choisir les premiers tests qui rapportent',
      'Isoler ce qui est lent : base, réseau, horloge',
      'Monter une CI qui échoue pour de bonnes raisons',
    ],
    includes: ['18 leçons vidéo', 'Modèles de configuration CI', 'Accès à vie'],
    category: 'Développement',
    format: 'video',
    priceFcfa: 12000,
    level: 'débutant',
    durationSeconds: 16200,
    lessonsCount: 18,
    publishedDaysAgo: 71,
  },
  {
    key: 'revue-code',
    trainerKey: 'awa',
    title: 'Grille de revue de code',
    blurb: "Une revue qui améliore le code sans décourager son auteur.",
    description:
      "Neuf fiches à garder ouvertes pendant une revue : ce qu'on regarde, dans quel ordre, et comment formuler une remarque pour qu'elle soit suivie d'effet.",
    learnPoints: ['Hiérarchiser les remarques', 'Distinguer le goût du défaut'],
    includes: ['PDF de 34 pages', 'Téléchargeable, accès à vie'],
    category: 'Développement',
    format: 'pdf',
    priceFcfa: 5000,
    lessonsCount: 9,
    publishedDaysAgo: 48,
  },
  {
    key: 'pipelines',
    trainerKey: 'awa',
    title: 'Pipelines de données avec Python',
    blurb: "Construire une chaîne de traitement qu'on peut relancer sans crainte.",
    description:
      "Extraction, transformation, chargement — et surtout ce qui arrive quand une étape échoue à trois heures du matin.\n\nLe cours insiste sur l'idempotence et la reprise, pas sur les bibliothèques à la mode : celles-ci changent tous les deux ans, le problème reste le même.",
    learnPoints: [
      'Rendre une étape rejouable sans effet de bord',
      'Surveiller une chaîne sans la noyer de journaux',
      'Reprendre après échec au bon endroit',
    ],
    includes: ['22 leçons vidéo', 'Jeux de données', 'Accès à vie'],
    category: 'Data',
    format: 'video',
    priceFcfa: 18000,
    level: 'avancé',
    durationSeconds: 27000,
    lessonsCount: 22,
    publishedDaysAgo: 22,
  },
  {
    key: 'observabilite',
    trainerKey: 'awa',
    title: 'Observabilité pour petites équipes',
    blurb: "Savoir ce que fait la production sans y passer ses nuits.",
    description:
      "Journaux, métriques et traces, réduits à ce qu'une équipe de trois personnes peut réellement tenir. En préparation.",
    learnPoints: ['Choisir trois métriques qui comptent'],
    includes: ['Leçons vidéo'],
    category: 'Développement',
    format: 'video',
    priceFcfa: 14000,
    level: 'intermédiaire',
    state: 'draft',
  },
  {
    key: 'atelier-refacto',
    trainerKey: 'awa',
    title: "Atelier : reprendre un code hérité",
    blurb: 'La séance de travail mensuelle de la communauté, en rediffusion.',
    description:
      "Chaque mois, un membre soumet un morceau de code qu'il n'ose plus toucher et on le reprend ensemble, en direct. Cette ressource rassemble les fiches de méthode issues des ateliers.",
    learnPoints: ['Poser un filet de tests avant de toucher au code', 'Découper un fichier de 2000 lignes'],
    includes: ['Fiches de méthode', 'Réservé aux membres'],
    category: 'Développement',
    format: 'pdf',
    priceFcfa: 9000,
    lessonsCount: 6,
    publishedDaysAgo: 30,
    communityKey: 'atelier-code',
  },

  // --- Moussa Traoré — Business
  {
    key: 'ohada-societe',
    trainerKey: 'moussa',
    title: 'Créer sa société en zone OHADA',
    blurb: 'Du choix de la forme juridique au dépôt des statuts.',
    description:
      "Un guide qui suit l'ordre réel des démarches, avec ce que coûte chaque étape et ce qui bloque le plus souvent.\n\nÉcrit pour les dix-sept pays de l'espace OHADA, avec les écarts signalés quand il y en a.",
    learnPoints: [
      'Choisir entre SARL, SAS et entreprise individuelle',
      'Préparer un dossier qui passe du premier coup',
      'Anticiper les obligations comptables de la première année',
    ],
    includes: ['PDF de 68 pages', 'Modèles de courriers', 'Téléchargeable'],
    category: 'Business',
    format: 'pdf',
    priceFcfa: 9000,
    level: 'débutant',
    lessonsCount: 7,
    publishedDaysAgo: 88,
  },
  {
    key: 'kit-ohada',
    trainerKey: 'moussa',
    title: 'Kit statuts et registres OHADA',
    blurb: 'Les documents à remplir, pas à rédiger.',
    description:
      "Statuts types, procès-verbaux d'assemblée, registre des mouvements de titres : les pièces qu'on refait à chaque création et qu'il vaut mieux ne pas improviser.",
    learnPoints: ['Remplir des statuts sans oublier de clause'],
    includes: ['11 documents modifiables', 'Téléchargeable, accès à vie'],
    category: 'Business',
    format: 'kit',
    priceFcfa: 14000,
    publishedDaysAgo: 63,
  },
  {
    key: 'tresorerie',
    trainerKey: 'moussa',
    title: 'Tableau de bord de trésorerie PME',
    blurb: "Savoir combien il reste, et jusqu'à quand.",
    description:
      "Un tableur qui projette la trésorerie sur douze semaines à partir des encaissements et décaissements réels. Pensé pour une PME qui facture en FCFA et paie parfois en espèces.",
    learnPoints: ['Projeter une trésorerie à douze semaines', 'Repérer le mois qui va coincer'],
    includes: ['Tableur prêt à remplir', 'Notice de prise en main'],
    category: 'Business',
    format: 'tableur',
    priceFcfa: 6500,
    level: 'intermédiaire',
    lessonsCount: 5,
    publishedDaysAgo: 35,
  },
  {
    key: 'contrats-commerciaux',
    trainerKey: 'moussa',
    title: 'Contrats commerciaux : les dix clauses qui comptent',
    blurb: 'Relire un contrat quand on n’est pas juriste.',
    description:
      "Dix clauses, dix pièges, et la formulation à préférer. Le membre de la communauté y trouve aussi les versions annotées que nous relisons ensemble en séance.",
    learnPoints: ['Repérer une clause de résiliation déséquilibrée', 'Négocier un délai de paiement'],
    includes: ['Fiches annotées', 'Réservé aux membres'],
    category: 'Business',
    format: 'pdf',
    priceFcfa: 7500,
    lessonsCount: 10,
    publishedDaysAgo: 26,
    communityKey: 'cercle-ohada',
  },

  // --- Fatou Ndiaye — Marketing
  {
    key: 'whatsapp',
    trainerKey: 'fatou',
    title: 'WhatsApp Business pour le commerce local',
    blurb: 'Vendre par le canal que vos clients utilisent déjà.',
    description:
      "Catalogue, réponses rapides, listes de diffusion : tout ce que WhatsApp Business permet et que la plupart des boutiques n'exploitent pas.\n\nAvec les erreurs qui font perdre un compte, et la marche à suivre quand c'est arrivé.",
    learnPoints: [
      'Monter un catalogue qui donne envie de commander',
      'Automatiser sans devenir agaçant',
      'Mesurer ce que le canal rapporte vraiment',
    ],
    includes: ['14 leçons vidéo', 'Modèles de messages', 'Accès à vie'],
    category: 'Marketing',
    format: 'video',
    priceFcfa: 8000,
    level: 'débutant',
    durationSeconds: 10800,
    lessonsCount: 14,
    publishedDaysAgo: 79,
  },
  {
    key: 'notion-marketing',
    trainerKey: 'fatou',
    title: 'Modèle Notion : plan marketing 90 jours',
    blurb: 'Un plan tenable, revu toutes les deux semaines.',
    description:
      "Un espace Notion prêt à dupliquer : objectifs trimestriels, calendrier éditorial, suivi des canaux. Conçu pour une personne seule, pas pour une équipe de dix.",
    learnPoints: ['Découper un trimestre en actions vérifiables'],
    includes: ['Espace Notion à dupliquer', 'Guide de démarrage'],
    category: 'Marketing',
    format: 'notion',
    priceFcfa: 4500,
    lessonsCount: 6,
    publishedDaysAgo: 17,
  },
  {
    key: 'pub-express',
    trainerKey: 'fatou',
    title: 'Publicité en ligne : doubler ses ventes en 7 jours',
    blurb: 'Méthode accélérée pour le commerce en ligne.',
    description:
      "Une méthode de campagne courte, vendue sur une promesse de résultat chiffrée. Publiée telle quelle : c'est le signalement d'une apprenante, puis la décision de la Modération, qui la retirent du catalogue pendant le scénario.",
    learnPoints: ['Lancer une campagne en une heure'],
    includes: ['PDF'],
    category: 'Marketing',
    format: 'pdf',
    priceFcfa: 6000,
    publishedDaysAgo: 55,
  },
  {
    key: 'seo-local',
    trainerKey: 'fatou',
    title: 'Référencement local et fiches établissement',
    blurb: 'Être trouvé par les gens du quartier.',
    description: "Un guide court sur les fiches établissement et les avis clients. En cours d'écriture.",
    learnPoints: ['Renseigner une fiche complète'],
    includes: ['PDF'],
    category: 'Marketing',
    format: 'pdf',
    priceFcfa: 5500,
    state: 'draft',
  },

  // --- Yao Kouassi — Design
  {
    key: 'montage',
    trainerKey: 'yao',
    title: 'Montage vidéo : le rythme avant les effets',
    blurb: "Ce qui rend un montage regardable jusqu'au bout.",
    description:
      "Un cours sur le découpage, la durée des plans et le son — les trois choses qui font qu'on reste.\n\nLes transitions et les filtres arrivent à la fin, quand ils servent à quelque chose.",
    learnPoints: [
      'Découper une séquence sur le sens, pas sur la musique',
      'Étalonner sans dénaturer les peaux',
      'Mixer une voix pour le téléphone',
    ],
    includes: ['16 leçons vidéo', 'Rushs du projet', 'Accès à vie'],
    category: 'Design',
    format: 'video',
    priceFcfa: 11000,
    level: 'intermédiaire',
    durationSeconds: 14400,
    lessonsCount: 16,
    publishedDaysAgo: 41,
  },
  {
    key: 'identite',
    trainerKey: 'yao',
    title: 'Kit identité de marque',
    blurb: 'De quoi tenir une marque cohérente sans studio.',
    description:
      "Palettes, échelles typographiques, gabarits de publication : les pièces qu'on installe une fois et qui évitent d'improviser à chaque post.",
    learnPoints: ["Construire une palette qui tient en photo comme à l'écran"],
    includes: ['Fichiers sources', 'Gabarits de publication', 'Téléchargeable'],
    category: 'Design',
    format: 'kit',
    priceFcfa: 13000,
    publishedDaysAgo: 12,
  },

  // --- Kofi Mensah — Data & Business
  {
    key: 'tableaux-bord',
    trainerKey: 'kofi',
    title: 'Tableaux de bord que les dirigeants lisent',
    blurb: 'Trois chiffres bien choisis valent mieux que quarante.',
    description:
      "Comment passer d'un export comptable illisible à une page que le dirigeant consulte tous les lundis.\n\nLe cours porte autant sur le choix des indicateurs que sur leur mise en forme : un bon chiffre mal présenté ne sert à rien.",
    learnPoints: [
      'Choisir trois indicateurs qui décident de quelque chose',
      'Nettoyer un export comptable sans le retaper',
      'Mettre en page pour un écran de téléphone',
    ],
    includes: ['9 leçons vidéo', 'Classeur modèle', 'Accès à vie'],
    category: 'Data',
    format: 'video',
    priceFcfa: 16000,
    level: 'intermédiaire',
    durationSeconds: 9900,
    lessonsCount: 9,
    publishedDaysAgo: 58,
  },
  {
    key: 'budget-annuel',
    trainerKey: 'kofi',
    title: 'Modèle de budget annuel commenté',
    blurb: 'Un classeur qui explique chaque ligne.',
    description:
      "Un budget sur douze mois, avec les formules laissées apparentes et une note en marge de chaque poste. Fait pour être modifié, pas seulement rempli.",
    learnPoints: ['Construire un budget qui résiste à un mois raté'],
    includes: ['Classeur commenté', 'Notice'],
    category: 'Data',
    format: 'tableur',
    priceFcfa: 7000,
    lessonsCount: 4,
    publishedDaysAgo: 29,
  },

  // --- Nadège Bidias — aucune publication : espace formateur à l'état neuf
]

// --- Communautés -----------------------------------------------------------

export interface CommunitySeed {
  key: string
  trainerKey: string
  name: string
  slug: string
  description: string
  rules: string
  priceFcfa: number
  visibility: 'PUBLIC' | 'PRIVATE'
  forumEnabled?: boolean
  messagingEnabled?: boolean
  resourcesEnabled?: boolean
  eventsEnabled?: boolean
  createdDaysAgo: number
}

export const COMMUNITIES: CommunitySeed[] = [
  {
    key: 'atelier-code',
    trainerKey: 'awa',
    name: "L'Atelier du code",
    slug: 'atelier-du-code',
    description:
      "Un salon pour celles et ceux qui écrivent du code au quotidien en Afrique de l'Ouest.\n\nOn y relit du code ensemble, on y prépare des entretiens, et on y tient une séance en direct tous les quinze jours. Les questions bêtes sont les bienvenues : ce sont souvent celles que dix personnes se posent en silence.",
    rules:
      "1. On critique le code, jamais la personne qui l'a écrit.\n2. Une question mérite un contexte : le message d'erreur complet vaut mieux que « ça marche pas ».\n3. Pas de recrutement déguisé dans le forum. Les offres, c'est en message direct.",
    priceFcfa: 5000,
    visibility: 'PUBLIC',
    createdDaysAgo: 210,
  },
  {
    key: 'cercle-ohada',
    trainerKey: 'moussa',
    name: 'Cercle OHADA',
    slug: 'cercle-ohada',
    description:
      "L'entraide entre dirigeants de PME de l'espace OHADA : formalités, contrats, obligations comptables. Une permanence écrite toute la semaine, et une session de questions le premier jeudi du mois.",
    rules:
      "Les réponses données ici sont des repères, pas des consultations juridiques. Pour un dossier engageant, prenez un conseil.",
    priceFcfa: 7500,
    visibility: 'PUBLIC',
    eventsEnabled: true,
    createdDaysAgo: 140,
  },
  {
    key: 'studio-yao',
    trainerKey: 'yao',
    name: 'Studio — promotion 2026',
    slug: 'studio-promotion-2026',
    description:
      "Le suivi de la promotion 2026 : retours sur vos montages, veille matériel et séances de correction collective. Salon fermé, on n'y entre que sur invitation.",
    rules: 'Les rushs partagés ici restent ici. Rien ne sort du salon sans accord de son auteur.',
    priceFcfa: 12000,
    visibility: 'PRIVATE',
    // Un salon de suivi n'a pas de forum ouvert : tout passe par les annonces
    // et le fil direct avec l'animateur.
    forumEnabled: false,
    createdDaysAgo: 64,
  },
]

// --- Vie des communautés ---------------------------------------------------

export interface PostSeed {
  communityKey: string
  authorKey: string
  kind: 'ANNOUNCEMENT' | 'DISCUSSION'
  body: string
  pinned?: boolean
  daysAgo: number
  replies?: Array<{ authorKey: string; body: string; daysAgo: number }>
}

export const POSTS: PostSeed[] = [
  {
    communityKey: 'atelier-code',
    authorKey: 'awa',
    kind: 'ANNOUNCEMENT',
    pinned: true,
    daysAgo: 34,
    body:
      "Bienvenue dans l'Atelier.\n\nDeux repères pour démarrer : la séance en direct a lieu un jeudi sur deux à 20 h (heure de Dakar), et les fiches de méthode des ateliers précédents sont dans les ressources incluses. N'attendez pas d'avoir une « bonne » question pour écrire.",
  },
  {
    communityKey: 'atelier-code',
    authorKey: 'awa',
    kind: 'ANNOUNCEMENT',
    daysAgo: 6,
    body:
      "Séance de jeudi : on reprend un service de facturation de 2 400 lignes proposé par Ibrahim. Objectif — poser un filet de tests avant d'y toucher. Venez avec vos questions, le code sera partagé à l'écran.",
  },
  {
    communityKey: 'atelier-code',
    authorKey: 'ibrahim',
    kind: 'DISCUSSION',
    daysAgo: 11,
    body:
      "Question de méthode : sur un projet sans aucun test, vous commencez par les tests unitaires ou par un test de bout en bout qui couvre le parcours principal ?\n\nJ'ai tendance à vouloir tout unitaire, et je m'enlise.",
    replies: [
      {
        authorKey: 'awa',
        daysAgo: 11,
        body:
          "Bout en bout, sans hésiter. Un seul test qui traverse le parcours d'achat vous protège plus que trente tests unitaires sur des fonctions que personne n'appelle. L'unitaire vient après, quand vous savez où sont les vraies décisions.",
      },
      {
        authorKey: 'aminata',
        daysAgo: 10,
        body: "Même expérience de mon côté. Et le test de bout en bout sert de documentation quand on revient sur le projet six mois plus tard.",
      },
      {
        authorKey: 'seydou',
        daysAgo: 9,
        body: 'Merci, ça répond aussi à une question que je me posais depuis un moment.',
      },
    ],
  },
  {
    communityKey: 'atelier-code',
    authorKey: 'aminata',
    kind: 'DISCUSSION',
    daysAgo: 4,
    body:
      "Je bute sur un déploiement : mes migrations passent en local et échouent en production avec un verrou d'avis. Quelqu'un a déjà vu ça avec un pooler devant Postgres ?",
    replies: [
      {
        authorKey: 'awa',
        daysAgo: 4,
        body:
          "Oui, c'est classique : le pooler en mode transaction ne tient pas les verrous d'avis entre deux requêtes. Il faut une connexion directe pour les migrations, et garder le pooler pour l'application. Deux URL distinctes, donc.",
      },
      { authorKey: 'aminata', daysAgo: 3, body: "C'était exactement ça. Merci !" },
    ],
  },
  {
    communityKey: 'cercle-ohada',
    authorKey: 'moussa',
    kind: 'ANNOUNCEMENT',
    pinned: true,
    daysAgo: 20,
    body:
      "Rappel : la session de questions du mois porte sur les obligations comptables de la première année. Envoyez vos cas à l'avance, je les traite dans l'ordre d'arrivée.",
  },
  {
    communityKey: 'cercle-ohada',
    authorKey: 'clarisse',
    kind: 'DISCUSSION',
    daysAgo: 8,
    body:
      "J'ai deux boutiques sous la même entreprise individuelle. Est-ce que passer en SARL a un intérêt si le chiffre reste sous les 30 millions FCFA ?",
    replies: [
      {
        authorKey: 'moussa',
        daysAgo: 7,
        body:
          "L'intérêt n'est pas dans le chiffre mais dans la séparation des patrimoines. En entreprise individuelle, une dette de la boutique est votre dette personnelle. C'est souvent ça qui décide, avant la fiscalité.",
      },
    ],
  },
  {
    communityKey: 'studio-yao',
    authorKey: 'yao',
    kind: 'ANNOUNCEMENT',
    pinned: true,
    daysAgo: 15,
    body:
      "Correction collective vendredi. Déposez vos exports avant jeudi soir — au-delà je ne garantis pas de les avoir regardés.",
  },
]

export interface ConversationSeed {
  communityKey: string
  learnerKey: string
  messages: Array<{ from: 'learner' | 'trainer'; body: string; daysAgo: number; read?: boolean }>
}

export const CONVERSATIONS: ConversationSeed[] = [
  {
    communityKey: 'atelier-code',
    learnerKey: 'aminata',
    messages: [
      {
        from: 'learner',
        daysAgo: 5,
        body:
          "Bonjour Awa, je prépare un entretien pour un poste d'ingénieure back-end. Est-ce que l'atelier sur l'architecture hexagonale suffit pour tenir une discussion de conception, ou vaut-il mieux que je révise autre chose en priorité ?",
        read: true,
      },
      {
        from: 'trainer',
        daysAgo: 5,
        body:
          "Bonjour Aminata. Il suffit largement pour la partie conception : ce qu'on y voit, c'est exactement ce qu'on vous demandera de justifier. Ajoutez-y une relecture de vos propres projets — on vous interrogera plus volontiers sur ce que vous avez écrit que sur une théorie.",
        read: true,
      },
      {
        from: 'learner',
        daysAgo: 2,
        body: "Entretien passé ce matin, la partie conception s'est très bien déroulée. Merci beaucoup.",
      },
    ],
  },
  {
    communityKey: 'atelier-code',
    learnerKey: 'seydou',
    messages: [
      {
        from: 'learner',
        daysAgo: 1,
        body:
          "Bonjour, est-ce que le replay de la séance sur les pipelines est encore accessible ? Je n'avais pas pu suivre en direct.",
      },
    ],
  },
  {
    communityKey: 'cercle-ohada',
    learnerKey: 'omar',
    messages: [
      {
        from: 'learner',
        daysAgo: 12,
        body: "Bonjour Maître, le kit de statuts couvre-t-il aussi la SAS unipersonnelle ?",
        read: true,
      },
      {
        from: 'trainer',
        daysAgo: 11,
        body:
          "Bonjour. Oui, le modèle est fourni en deux versions, pluripersonnelle et unipersonnelle. La seconde est dans le dossier « SASU » du kit.",
        read: true,
      },
    ],
  },
]

// --- Sessions en direct ----------------------------------------------------

export interface LiveSeed {
  key: string
  communityKey: string
  title: string
  description: string
  /** Négatif = passé, positif = à venir. */
  startsInDays: number
  startHour: number
  durationMinutes: number
  outcome: 'SCHEDULED' | 'ENDED' | 'CANCELED'
  /** Participants (clés apprenants) — pour une séance terminée. */
  attendeeKeys?: string[]
  chat?: Array<{ authorKey: string; body: string }>
}

export const LIVES: LiveSeed[] = [
  {
    key: 'atelier-legacy',
    communityKey: 'atelier-code',
    title: 'Atelier : poser un filet de tests sur du code hérité',
    description:
      "Reprise en direct d'un service de facturation que personne n'ose modifier. On écrit les premiers tests ensemble, sans rien réécrire.",
    startsInDays: -9,
    startHour: 20,
    durationMinutes: 90,
    outcome: 'ENDED',
    attendeeKeys: ['aminata', 'ibrahim', 'seydou', 'nadia'],
    chat: [
      { authorKey: 'ibrahim', body: "Est-ce qu'on peut revoir le découpage de la méthode `facturer` ?" },
      { authorKey: 'awa', body: 'Oui, je remonte dessus dans deux minutes.' },
      { authorKey: 'aminata', body: 'Le partage d’écran est un peu petit sur téléphone.' },
      { authorKey: 'awa', body: "Je grossis la police, dites-moi si c'est mieux." },
      { authorKey: 'nadia', body: 'Parfait comme ça, merci.' },
    ],
  },
  {
    key: 'atelier-migrations',
    communityKey: 'atelier-code',
    title: 'Séance : migrations de base de données sans interruption',
    description:
      "Ajouter une colonne, la remplir et la rendre obligatoire — sans jamais couper le service. On déroule les trois déploiements successifs.",
    startsInDays: 5,
    startHour: 20,
    durationMinutes: 90,
    outcome: 'SCHEDULED',
  },
  {
    key: 'ohada-questions',
    communityKey: 'cercle-ohada',
    title: 'Questions ouvertes : obligations comptables de la première année',
    description: 'Session mensuelle de questions-réponses.',
    startsInDays: 12,
    startHour: 18,
    durationMinutes: 60,
    outcome: 'SCHEDULED',
  },
  {
    key: 'studio-correction',
    communityKey: 'studio-yao',
    title: 'Correction collective — exports de novembre',
    description: 'Séance annulée : reportée à la semaine suivante faute de participants disponibles.',
    startsInDays: -2,
    startHour: 19,
    durationMinutes: 60,
    outcome: 'CANCELED',
  },
]
