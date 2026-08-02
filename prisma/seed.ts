// ==========================================================================
// Jeu de données de développement
// ==========================================================================
// Peuple une base vide avec de quoi exercer les écrans publics et l'espace
// formateur : quatre formateurs validés, onze ressources publiées couvrant les
// quatre catégories et les cinq formats, deux brouillons, et des achats réels.
//
// Le script est idempotent — tout passe par `upsert` sur une clé naturelle
// (email, slug, référence de transaction). Il n'efface jamais rien : relancer
// est sans risque, mais il ne remet pas la base à zéro.
//
//   bun prisma/seed.ts
// ==========================================================================

import { db } from '../src/lib/db'
import { creditWalletOnPurchase } from '../src/lib/wallet'
import { openDispute, askLearner } from '../src/lib/disputes'
import { hashPassword } from '../src/lib/password'

const COMMISSION = 0.15

/**
 * Mot de passe commun à tous les comptes semés, pour pouvoir se connecter et
 * parcourir les espaces authentifiés en développement. Un seul hachage est
 * calculé puis partagé : argon2 est lent par construction, et un sel commun
 * n'a aucune conséquence sur une base de démonstration.
 */
const DEV_PASSWORD = 'Nkamva!2026'

/** Décalage de publication, pour que le tri « les plus récentes » ait un sens. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000)
}

interface TrainerSeed {
  email: string
  fullName: string
  slogan: string
  description: string
  domains: string[]
  experienceYears: number
}

const TRAINERS: TrainerSeed[] = [
  {
    email: 'awa.sarr@nkamva.dev',
    fullName: 'Awa Sarr',
    slogan: 'Architecture logicielle et revue de code',
    description:
      "Ingénieure logicielle à Dakar, elle accompagne depuis neuf ans les équipes qui passent du prototype à la production. Elle enseigne ce qu'elle pratique : découper un domaine, tester sans base de données, et tenir une revue de code qui ne décourage personne.",
    domains: ['Développement', 'Data'],
    experienceYears: 9,
  },
  {
    email: 'moussa.traore@nkamva.dev',
    fullName: 'Moussa Traoré',
    slogan: "Conformité OHADA pour les dirigeants de PME",
    description:
      "Juriste d'affaires à Abidjan, il outille les créateurs d'entreprise sur le droit OHADA : choix de la forme juridique, rédaction des statuts, obligations comptables. Ses ressources sont des documents qu'on remplit, pas des cours magistraux.",
    domains: ['Business'],
    experienceYears: 14,
  },
  {
    email: 'fatou.ndiaye@nkamva.dev',
    fullName: 'Fatou Ndiaye',
    slogan: 'Growth local et WhatsApp Business',
    description:
      "Elle construit des acquisitions pour le commerce africain : référencement local, catalogues WhatsApp, publicité à petit budget. Six ans passés à faire vendre des boutiques qui n'avaient jamais eu de site.",
    domains: ['Marketing'],
    experienceYears: 6,
  },
  {
    email: 'yao.kouassi@nkamva.dev',
    fullName: 'Yao Kouassi',
    slogan: 'Montage vidéo et identité de marque',
    description:
      "Monteur et directeur artistique, il travaille pour des marques et des créateurs d'Afrique de l'Ouest. Il défend une idée simple : le rythme d'un montage compte plus que ses effets.",
    domains: ['Design'],
    experienceYears: 8,
  },
]

const LEARNERS = [
  { email: 'aminata.diallo@example.com', fullName: 'Aminata Diallo' },
  { email: 'ibrahim.cisse@example.com', fullName: 'Ibrahim Cissé' },
  { email: 'nadia.bamba@example.com', fullName: 'Nadia Bamba' },
  { email: 'seydou.keita@example.com', fullName: 'Seydou Keïta' },
  { email: 'clarisse.mvondo@example.com', fullName: 'Clarisse Mvondo' },
  { email: 'omar.fall@example.com', fullName: 'Omar Fall' },
  { email: 'rita.owusu@example.com', fullName: 'Rita Owusu' },
  { email: 'jean.kouame@example.com', fullName: 'Jean Kouamé' },
]

interface CourseSeed {
  trainerEmail: string
  slug: string
  title: string
  blurb: string
  description: string
  learnPoints: string[]
  includes: string[]
  category: string
  format: string
  priceFcfa: number
  level?: string
  durationSeconds?: number
  lessonsCount?: number
  status?: 'published' | 'draft'
  publishedDaysAgo?: number
}

const COURSES: CourseSeed[] = [
  {
    trainerEmail: 'awa.sarr@nkamva.dev',
    slug: 'architecture-hexagonale-en-pratique',
    title: 'Architecture hexagonale en pratique',
    blurb: "Structurer une application qui doit encore tenir dans trois ans.",
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
    publishedDaysAgo: 40,
  },
  {
    trainerEmail: 'awa.sarr@nkamva.dev',
    slug: 'tests-automatises-de-zero-a-la-ci',
    title: 'Tests automatisés : de zéro à la CI',
    blurb: "Commencer à tester un projet qui n'a jamais été testé.",
    description:
      "Aucun test, une équipe pressée, et personne ne sait par où commencer. Ce cours prend ce cas précis et le déroule jusqu'à une intégration continue qui tourne à chaque poussée.",
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
    publishedDaysAgo: 27,
  },
  {
    trainerEmail: 'awa.sarr@nkamva.dev',
    slug: 'grille-de-revue-de-code',
    title: 'Grille de revue de code',
    blurb: 'Une revue qui améliore le code sans décourager son auteur.',
    description:
      "Neuf fiches à garder ouvertes pendant une revue : ce qu'on regarde, dans quel ordre, et comment formuler une remarque pour qu'elle soit suivie d'effet.",
    learnPoints: ['Hiérarchiser les remarques', 'Distinguer le goût du défaut'],
    includes: ['PDF de 34 pages', 'Téléchargeable, accès à vie'],
    category: 'Développement',
    format: 'pdf',
    priceFcfa: 5000,
    lessonsCount: 9,
    publishedDaysAgo: 15,
  },
  {
    trainerEmail: 'awa.sarr@nkamva.dev',
    slug: 'pipelines-de-donnees-avec-python',
    title: 'Pipelines de données avec Python',
    blurb: "Construire une chaîne de traitement qu'on peut relancer sans crainte.",
    description:
      "Extraction, transformation, chargement — et surtout ce qui arrive quand une étape échoue à trois heures du matin. Le cours insiste sur l'idempotence et la reprise, pas sur les bibliothèques à la mode.",
    learnPoints: [
      'Rendre une étape rejouable sans effet de bord',
      'Surveiller une chaîne sans la noyer de journaux',
      'Reprendre après échec au bon endroit',
    ],
    includes: ['22 leçons vidéo', 'Jeux de données', 'Accès à vie'],
    category: 'Développement',
    format: 'video',
    priceFcfa: 18000,
    level: 'avancé',
    durationSeconds: 27000,
    lessonsCount: 22,
    publishedDaysAgo: 8,
  },
  {
    trainerEmail: 'moussa.traore@nkamva.dev',
    slug: 'creer-sa-societe-en-zone-ohada',
    title: 'Créer sa société en zone OHADA',
    blurb: 'Du choix de la forme juridique au dépôt des statuts.',
    description:
      "Un guide qui suit l'ordre réel des démarches, avec ce que coûte chaque étape et ce qui bloque le plus souvent. Écrit pour les dix-sept pays de l'espace OHADA, avec les écarts signalés quand il y en a.",
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
    publishedDaysAgo: 34,
  },
  {
    trainerEmail: 'moussa.traore@nkamva.dev',
    slug: 'kit-statuts-et-registres-ohada',
    title: 'Kit statuts et registres OHADA',
    blurb: 'Les documents à remplir, pas à rédiger.',
    description:
      "Statuts types, procès-verbaux d'assemblée, registre des mouvements de titres : les pièces qu'on refait à chaque création et qu'il vaut mieux ne pas improviser.",
    learnPoints: ['Remplir des statuts sans oublier de clause'],
    includes: ['11 documents modifiables', 'Téléchargeable, accès à vie'],
    category: 'Business',
    format: 'kit',
    priceFcfa: 14000,
    publishedDaysAgo: 21,
  },
  {
    trainerEmail: 'moussa.traore@nkamva.dev',
    slug: 'tableau-de-bord-de-tresorerie-pme',
    title: 'Tableau de bord de trésorerie PME',
    blurb: 'Savoir combien il reste, et jusqu’à quand.',
    description:
      "Un tableur qui projette la trésorerie sur douze semaines à partir des encaissements et décaissements réels. Pensé pour une PME qui facture en FCFA et paie parfois en espèces.",
    learnPoints: ['Projeter une trésorerie à douze semaines', 'Repérer le mois qui va coincer'],
    includes: ['Tableur prêt à remplir', 'Notice de prise en main'],
    category: 'Business',
    format: 'tableur',
    priceFcfa: 6500,
    level: 'intermédiaire',
    lessonsCount: 5,
    publishedDaysAgo: 11,
  },
  {
    trainerEmail: 'fatou.ndiaye@nkamva.dev',
    slug: 'whatsapp-business-commerce-local',
    title: 'WhatsApp Business pour le commerce local',
    blurb: 'Vendre par le canal que vos clients utilisent déjà.',
    description:
      "Catalogue, réponses rapides, listes de diffusion : tout ce que WhatsApp Business permet et que la plupart des boutiques n'exploitent pas. Avec les erreurs qui font perdre un compte.",
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
    publishedDaysAgo: 30,
  },
  {
    trainerEmail: 'fatou.ndiaye@nkamva.dev',
    slug: 'modele-notion-plan-marketing-90-jours',
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
    publishedDaysAgo: 6,
  },
  {
    trainerEmail: 'yao.kouassi@nkamva.dev',
    slug: 'montage-video-le-rythme-avant-les-effets',
    title: 'Montage vidéo : le rythme avant les effets',
    blurb: "Ce qui rend un montage regardable jusqu'au bout.",
    description:
      "Un cours sur le découpage, la durée des plans et le son — les trois choses qui font qu'on reste. Les transitions et les filtres arrivent à la fin, quand ils servent à quelque chose.",
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
    publishedDaysAgo: 18,
  },
  {
    trainerEmail: 'yao.kouassi@nkamva.dev',
    slug: 'kit-identite-de-marque',
    title: 'Kit identité de marque',
    blurb: 'De quoi tenir une marque cohérente sans studio.',
    description:
      "Palettes, échelles typographiques, gabarits de publication : les pièces qu'on installe une fois et qui évitent d'improviser à chaque post.",
    learnPoints: ['Construire une palette qui tient en photo comme à l’écran'],
    includes: ['Fichiers sources', 'Gabarits de publication', 'Téléchargeable'],
    category: 'Design',
    format: 'kit',
    priceFcfa: 13000,
    publishedDaysAgo: 3,
  },
  // Deux brouillons : l'espace formateur doit montrer la distinction.
  {
    trainerEmail: 'awa.sarr@nkamva.dev',
    slug: 'observabilite-pour-petites-equipes',
    title: 'Observabilité pour petites équipes',
    blurb: 'Savoir ce que fait la production sans y passer ses nuits.',
    description: "Journaux, métriques et traces, réduits à ce qu'une équipe de trois peut tenir.",
    learnPoints: ['Choisir trois métriques qui comptent'],
    includes: ['Leçons vidéo'],
    category: 'Développement',
    format: 'video',
    priceFcfa: 14000,
    level: 'intermédiaire',
    status: 'draft',
  },
  {
    trainerEmail: 'fatou.ndiaye@nkamva.dev',
    slug: 'referencement-local-fiches-etablissement',
    title: 'Référencement local et fiches établissement',
    blurb: 'Être trouvé par les gens du quartier.',
    description: 'Un guide court sur les fiches établissement et les avis clients.',
    learnPoints: ['Renseigner une fiche complète'],
    includes: ['PDF'],
    category: 'Marketing',
    format: 'pdf',
    priceFcfa: 5500,
    status: 'draft',
  },
]

/** Achats confirmés : `ref` sert de clé d'idempotence (`providerTransactionId`). */
const PURCHASES: Array<{ ref: string; courseSlug: string; learnerEmail: string; provider: 'STRIPE' | 'CINETPAY'; daysAgo: number }> = [
  { ref: 'seed_tx_01', courseSlug: 'architecture-hexagonale-en-pratique', learnerEmail: 'aminata.diallo@example.com', provider: 'CINETPAY', daysAgo: 32 },
  { ref: 'seed_tx_02', courseSlug: 'architecture-hexagonale-en-pratique', learnerEmail: 'ibrahim.cisse@example.com', provider: 'STRIPE', daysAgo: 25 },
  { ref: 'seed_tx_03', courseSlug: 'architecture-hexagonale-en-pratique', learnerEmail: 'jean.kouame@example.com', provider: 'CINETPAY', daysAgo: 9 },
  { ref: 'seed_tx_04', courseSlug: 'tests-automatises-de-zero-a-la-ci', learnerEmail: 'aminata.diallo@example.com', provider: 'CINETPAY', daysAgo: 20 },
  { ref: 'seed_tx_05', courseSlug: 'tests-automatises-de-zero-a-la-ci', learnerEmail: 'nadia.bamba@example.com', provider: 'STRIPE', daysAgo: 14 },
  { ref: 'seed_tx_06', courseSlug: 'grille-de-revue-de-code', learnerEmail: 'ibrahim.cisse@example.com', provider: 'CINETPAY', daysAgo: 12 },
  { ref: 'seed_tx_07', courseSlug: 'pipelines-de-donnees-avec-python', learnerEmail: 'seydou.keita@example.com', provider: 'STRIPE', daysAgo: 5 },
  { ref: 'seed_tx_08', courseSlug: 'creer-sa-societe-en-zone-ohada', learnerEmail: 'nadia.bamba@example.com', provider: 'CINETPAY', daysAgo: 28 },
  { ref: 'seed_tx_09', courseSlug: 'creer-sa-societe-en-zone-ohada', learnerEmail: 'omar.fall@example.com', provider: 'CINETPAY', daysAgo: 17 },
  { ref: 'seed_tx_10', courseSlug: 'kit-statuts-et-registres-ohada', learnerEmail: 'omar.fall@example.com', provider: 'STRIPE', daysAgo: 16 },
  { ref: 'seed_tx_11', courseSlug: 'tableau-de-bord-de-tresorerie-pme', learnerEmail: 'clarisse.mvondo@example.com', provider: 'CINETPAY', daysAgo: 7 },
  { ref: 'seed_tx_12', courseSlug: 'whatsapp-business-commerce-local', learnerEmail: 'rita.owusu@example.com', provider: 'CINETPAY', daysAgo: 22 },
  { ref: 'seed_tx_13', courseSlug: 'whatsapp-business-commerce-local', learnerEmail: 'clarisse.mvondo@example.com', provider: 'STRIPE', daysAgo: 10 },
  { ref: 'seed_tx_14', courseSlug: 'modele-notion-plan-marketing-90-jours', learnerEmail: 'rita.owusu@example.com', provider: 'CINETPAY', daysAgo: 4 },
  { ref: 'seed_tx_15', courseSlug: 'montage-video-le-rythme-avant-les-effets', learnerEmail: 'jean.kouame@example.com', provider: 'STRIPE', daysAgo: 13 },
  { ref: 'seed_tx_16', courseSlug: 'montage-video-le-rythme-avant-les-effets', learnerEmail: 'seydou.keita@example.com', provider: 'CINETPAY', daysAgo: 6 },
  { ref: 'seed_tx_17', courseSlug: 'kit-identite-de-marque', learnerEmail: 'aminata.diallo@example.com', provider: 'STRIPE', daysAgo: 2 },
]

/**
 * Progression de lecture. `watchedSeconds` à 0 laisse la ressource « à ouvrir » ;
 * `downloaded` marque un format téléchargeable comme consulté. Sans ces lignes,
 * l'onglet « Consultées » de /mes-ressources resterait vide.
 */
const VIEWS: Array<{ courseSlug: string; learnerEmail: string; watchedSeconds?: number; downloaded?: boolean; daysAgo: number }> = [
  { courseSlug: 'architecture-hexagonale-en-pratique', learnerEmail: 'aminata.diallo@example.com', watchedSeconds: 4200, daysAgo: 2 },
  { courseSlug: 'tests-automatises-de-zero-a-la-ci', learnerEmail: 'aminata.diallo@example.com', watchedSeconds: 900, daysAgo: 6 },
  { courseSlug: 'architecture-hexagonale-en-pratique', learnerEmail: 'ibrahim.cisse@example.com', watchedSeconds: 11700, daysAgo: 1 },
  { courseSlug: 'grille-de-revue-de-code', learnerEmail: 'ibrahim.cisse@example.com', downloaded: true, daysAgo: 4 },
  { courseSlug: 'whatsapp-business-commerce-local', learnerEmail: 'rita.owusu@example.com', watchedSeconds: 6300, daysAgo: 3 },
  { courseSlug: 'creer-sa-societe-en-zone-ohada', learnerEmail: 'omar.fall@example.com', downloaded: true, daysAgo: 9 },
  { courseSlug: 'montage-video-le-rythme-avant-les-effets', learnerEmail: 'jean.kouame@example.com', watchedSeconds: 2400, daysAgo: 5 },
]

async function main() {
  const passwordHash = await hashPassword(DEV_PASSWORD)
  const trainerIdByEmail = new Map<string, string>()

  for (const t of TRAINERS) {
    const user = await db.user.upsert({
      where: { email: t.email },
      update: { fullName: t.fullName, role: 'TRAINER', passwordHash },
      create: {
        email: t.email,
        fullName: t.fullName,
        role: 'TRAINER',
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    })
    const profile = await db.trainerProfile.upsert({
      where: { userId: user.id },
      update: {
        slogan: t.slogan,
        description: t.description,
        domains: t.domains,
        experienceYears: t.experienceYears,
        approvedAt: new Date(),
        suspendedAt: null,
      },
      create: {
        userId: user.id,
        slogan: t.slogan,
        description: t.description,
        domains: t.domains,
        experienceYears: t.experienceYears,
        approvedAt: new Date(),
      },
    })
    trainerIdByEmail.set(t.email, profile.id)
  }

  const learnerIdByEmail = new Map<string, string>()
  for (const l of LEARNERS) {
    const user = await db.user.upsert({
      where: { email: l.email },
      update: { fullName: l.fullName, passwordHash },
      create: {
        email: l.email,
        fullName: l.fullName,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    })
    learnerIdByEmail.set(l.email, user.id)
  }

  const courseBySlug = new Map<string, { id: string; trainerId: string; priceFcfa: number }>()
  for (const c of COURSES) {
    const trainerId = trainerIdByEmail.get(c.trainerEmail)
    if (!trainerId) throw new Error(`Formateur inconnu pour ${c.slug} : ${c.trainerEmail}`)
    const status = c.status ?? 'published'
    const data = {
      trainerId,
      title: c.title,
      blurb: c.blurb,
      description: c.description,
      learnPoints: c.learnPoints,
      includes: c.includes,
      category: c.category,
      format: c.format,
      priceFcfa: c.priceFcfa,
      level: c.level ?? null,
      durationSeconds: c.durationSeconds ?? null,
      lessonsCount: c.lessonsCount ?? null,
      status,
      publishedAt: status === 'published' ? daysAgo(c.publishedDaysAgo ?? 30) : null,
    }
    const course = await db.course.upsert({
      where: { slug: c.slug },
      update: data,
      create: { slug: c.slug, ...data },
    })
    courseBySlug.set(c.slug, { id: course.id, trainerId, priceFcfa: course.priceFcfa })
  }

  let created = 0
  for (const p of PURCHASES) {
    const course = courseBySlug.get(p.courseSlug)
    const learnerId = learnerIdByEmail.get(p.learnerEmail)
    if (!course || !learnerId) throw new Error(`Achat ${p.ref} : ressource ou apprenant inconnu`)

    const existing = await db.purchase.findUnique({ where: { providerTransactionId: p.ref } })
    if (existing) continue

    const amountFcfa = course.priceFcfa
    const trainerShareFcfa = Math.round(amountFcfa * (1 - COMMISSION))

    // On crée l'achat en PENDING puis on passe par le même chemin que le
    // webhook : c'est lui qui fait foi pour le solde du portefeuille et la
    // trace d'audit. Écrire `balance` à la main produirait un état que le code
    // de production n'aurait jamais pu créer.
    await db.purchase.create({
      data: {
        learnerId,
        courseId: course.id,
        trainerId: course.trainerId,
        amountFcfa,
        commissionRate: COMMISSION,
        trainerShareFcfa,
        platformShareFcfa: amountFcfa - trainerShareFcfa,
        provider: p.provider,
        providerTransactionId: p.ref,
        providerStatus: 'PENDING',
        acquisitionSource: 'catalogue',
        createdAt: daysAgo(p.daysAgo),
      },
    })
    await db.$transaction((tx) => creditWalletOnPurchase(tx, p.ref, p.provider))
    created++
  }

  for (const v of VIEWS) {
    const course = courseBySlug.get(v.courseSlug)
    const learnerId = learnerIdByEmail.get(v.learnerEmail)
    if (!course || !learnerId) throw new Error(`Progression ${v.courseSlug} : ressource ou apprenant inconnu`)
    const seen = daysAgo(v.daysAgo)
    const data = {
      watchedSeconds: v.watchedSeconds ?? 0,
      downloaded: v.downloaded ?? false,
      downloadedAt: v.downloaded ? seen : null,
      lastViewedAt: seen,
    }
    await db.courseView.upsert({
      where: { courseId_learnerId: { courseId: course.id, learnerId } },
      update: data,
      create: { courseId: course.id, learnerId, ...data },
    })
  }

  // Un litige réel plutôt que des lignes écrites à la main : `openDispute` pose
  // l'instantané de consommation, la réservation de fonds et la suspension
  // d'accès, et fait naître les notifications que le produit émet vraiment.
  // Sans lui, /mes-litiges et /notifications resteraient vides — ou remplies de
  // notifications inventées, qu'aucun chemin applicatif n'aurait pu écrire.
  const support = await db.user.upsert({
    where: { email: 'support@nkamva.dev' },
    update: { fullName: 'Support NkamVa', role: 'ADMIN', adminRole: 'MODERATION', passwordHash },
    create: {
      email: 'support@nkamva.dev',
      fullName: 'Support NkamVa',
      role: 'ADMIN',
      adminRole: 'MODERATION',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  })

  const disputedRef = 'seed_tx_17' // Kit identité de marque, acheté il y a 2 j
  const disputedPurchase = await db.purchase.findUnique({
    where: { providerTransactionId: disputedRef },
    select: { id: true, learnerId: true },
  })
  // Le bloc converge vers l'état voulu au lieu de tout refaire : le litige est
  // créé s'il manque, puis mis en attente de réponse s'il ne l'est pas encore.
  // Relancer le seed ne duplique donc rien et n'exige aucun nettoyage préalable.
  let disputeCreated = false
  if (disputedPurchase) {
    let dispute = await db.dispute.findFirst({
      where: { purchaseId: disputedPurchase.id },
      select: { id: true, status: true, updatedAt: true },
    })

    if (!dispute) {
      const opened = await openDispute(disputedPurchase.learnerId, {
        purchaseId: disputedPurchase.id,
        reason: 'CONTENT_MISMATCH',
        reasonDetail:
          "Les gabarits annoncés pour les publications ne sont pas dans le fichier téléchargé : il ne contient que les palettes et la typographie.",
      })
      dispute = await db.dispute.findUniqueOrThrow({
        where: { id: opened.id },
        select: { id: true, status: true, updatedAt: true },
      })
      disputeCreated = true
    }

    // `postDisputeMessage` n'avertit pas le destinataire ; `askLearner` si, et
    // place le dossier en attente de réponse — l'état qui donne quelque chose à
    // voir sur /mes-litiges comme sur /notifications.
    if (dispute.status === 'OPEN' || dispute.status === 'IN_REVIEW') {
      await askLearner(dispute.id, {
        actorId: support.id,
        expectedUpdatedAt: dispute.updatedAt.toISOString(),
        question:
          "Bonjour, merci pour votre signalement. Pouvez-vous préciser quels gabarits étaient annoncés sur la fiche ? Une capture suffit.",
      })
    }
  }

  // `studentsCount` n'est maintenu par aucun chemin applicatif aujourd'hui :
  // on l'aligne sur le nombre d'acheteurs distincts pour qu'il ne mente pas.
  for (const trainerId of trainerIdByEmail.values()) {
    const buyers = await db.purchase.findMany({
      where: { trainerId, providerStatus: 'SUCCEEDED' },
      select: { learnerId: true },
      distinct: ['learnerId'],
    })
    await db.trainerProfile.update({
      where: { id: trainerId },
      data: { studentsCount: buyers.length },
    })
  }

  const [users, trainers, published, drafts, purchases] = await Promise.all([
    db.user.count(),
    db.trainerProfile.count(),
    db.course.count({ where: { status: 'published' } }),
    db.course.count({ where: { status: 'draft' } }),
    db.purchase.count({ where: { providerStatus: 'SUCCEEDED' } }),
  ])
  const views = await db.courseView.count()
  const notifications = await db.notification.count()
  const disputes = await db.dispute.count()
  const wallets = await db.wallet.findMany({ select: { balance: true } })
  const total = wallets.reduce((sum, w) => sum + w.balance, 0)

  console.log(
    `\nSeed terminé — ${users} comptes, ${trainers} formateurs, ` +
      `${published} ressources publiées, ${drafts} brouillons, ` +
      `${purchases} achats confirmés (${created} créés cette fois), ` +
      `${views} progressions de lecture, ` +
      `${disputes} litige${disputes > 1 ? 's' : ''}${disputeCreated ? ' (ouvert cette fois)' : ''}, ` +
      `${notifications} notifications, ` +
      `${total.toLocaleString('fr-FR')} FCFA répartis sur ${wallets.length} portefeuilles.\n` +
      `Connexion : n'importe quel email ci-dessus, mot de passe « ${DEV_PASSWORD} ».\n` +
      `  apprenante  aminata.diallo@example.com  (3 ressources achetées)\n` +
      `  formatrice  awa.sarr@nkamva.dev         (4 ressources publiées)\n`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
