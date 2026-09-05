// ==========================================================================
// Formes de données renvoyées par l'API, telles que consommées par le front.
// Reflètent les `select`/`include` de src/lib/catalog.ts, purchases.ts, access.ts.
// ==========================================================================

export interface TrainerSummary {
  id: string;
  user: { id?: string; fullName: string | null; bio?: string | null };
  ratingAverage: number;
  ratingCount: number;
  studentsCount?: number;
  /** Accroche courte du formateur (TrainerProfile.slogan). */
  slogan?: string | null;
  /** Présentation publique (TrainerProfile.description). */
  description?: string | null;
}

/** Présentation à afficher : description du profil, sinon bio du compte. */
export function trainerBio(trainer?: TrainerSummary | null): string | null {
  return trainer?.description || trainer?.user?.bio || null;
}

/** Élément du catalogue — GET /api/catalog/courses */
export interface CourseListItem {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  category: string;
  format: string;
  priceFcfa: number;
  level: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  coverS3Key: string | null;
  trainerProfile: TrainerSummary;
}

/** Fiche complète — GET /api/courses/[slug] */
export interface CourseDetail extends CourseListItem {
  description: string;
  learnPoints: string[];
  includes: string[];
  language: string;
  status: string;
  trainerProfile: TrainerSummary & { studentsCount: number };
}

export type PaymentProvider = "STRIPE" | "PAWAPAY";
export type PaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "REFUNDED"
  | "DISPUTED"
  | "CANCELED";

/** Achat — GET /api/me/purchases */
export interface PurchaseItem {
  id: string;
  amountFcfa: number;
  provider: PaymentProvider;
  providerStatus: PaymentStatus;
  providerTransactionId: string | null;
  accessSuspended: boolean;
  refundedAt: string | null;
  createdAt: string;
  courseId: string | null;
  course: {
    id: string;
    title: string;
    slug: string;
    format: string;
    coverS3Key: string | null;
    durationSeconds: number | null;
  } | null;
}

export interface CourseViewState {
  watchedSeconds: number;
  /** Document — la page où l'on s'est arrêté (F3.1). */
  lastPage: number | null;
  /** Archive — le marqueur « terminé » posé par l'apprenant (F3.3). */
  completedAt: string | null;
  downloaded: boolean;
  downloadedAt: string | null;
  lastViewedAt: string | null;
}

/** Ressource possédée — GET /api/me/resources */
export interface ResourceItem {
  id: string;
  courseId: string | null;
  createdAt: string;
  accessSuspended: boolean;
  amountFcfa: number;
  course: {
    id: string;
    title: string;
    slug: string;
    format: string;
    coverS3Key: string | null;
    durationSeconds: number | null;
    pageCount: number | null;
    category: string;
    trainerProfile: { user: { fullName: string | null } };
  } | null;
  courseView: CourseViewState | null;
  isStarted: boolean;
}

/** Réponse de POST /api/purchases/initiate */
export interface InitiatePurchaseResult {
  purchaseId: string;
  providerTransactionId: string;
  provider: PaymentProvider;
  /**
   * Stripe : la page de paiement hébergée. Absent pour le mobile money, qui se
   * confirme sur le téléphone sans quitter le site. `paymentUrl`, hérité de
   * CinetPay, n'était plus renseigné par personne depuis la migration.
   */
  redirectUrl?: string;
  nextStep: "CONFIRM_ON_PHONE" | "REDIRECT_TO_PROVIDER" | "ALREADY_SETTLED";
}

/**
 * Délai de grâce avant effacement d'un compte.
 * Vit ici, et non dans lib/profile.ts, pour rester importable côté client sans
 * y entraîner Prisma.
 */
export const DELETION_GRACE_DAYS = 30;

/** Formats téléchargeables (le reste est streamé) — miroir de access.ts. */
export const DOWNLOADABLE_FORMATS = ["pdf", "kit", "notion", "tableur"] as const;

export function isDownloadable(format?: string | null): boolean {
  return !!format && (DOWNLOADABLE_FORMATS as readonly string[]).includes(format);
}

/**
 * Progression affichée, dérivée de la position réelle (F3.5).
 *
 * `null` **n'est pas zéro** : il dit que la longueur de la ressource est
 * inconnue — une vidéo dont la durée n'a pas pu être lue, un PDF dont les pages
 * n'ont pas pu être comptées. Un anneau à 0 % sur une ressource lue à moitié
 * fait croire que rien n'a été enregistré ; l'écran affiche alors l'avancement
 * sans pourcentage.
 *
 * Miroir de `getConsumptionPercent()` côté serveur, à une nuance près assumée :
 * ici on rend ce que l'apprenant a lu, là-bas ce que la règle des litiges
 * retient. Les deux se dérivent de la même position — il n'en existe pas deux
 * (F3.6).
 */
export function readingPercent(
  view: CourseViewState | null | undefined,
  format?: string | null,
  durationSeconds?: number | null,
  pageCount?: number | null,
): number | null {
  if (!view) return 0;

  // Une archive ne se rend pas en ligne : elle n'a que deux états, et c'est
  // l'apprenant qui les pose. Le téléchargement seul ne dit pas qu'on a lu,
  // mais il reste ce que la règle des litiges retient (F8.1) — d'où les 100 %
  // quand rien d'autre n'a été déclaré.
  if (format && ARCHIVE_FORMATS.includes(format)) {
    if (view.completedAt) return 100;
    return view.downloaded ? 100 : 0;
  }

  if (format === "video") {
    if (!durationSeconds || durationSeconds <= 0) return view.watchedSeconds > 0 ? null : 0;
    return Math.min(100, Math.round((view.watchedSeconds / durationSeconds) * 100));
  }

  if (format === "pdf") {
    // Un PDF téléchargé sans jamais avoir été ouvert en ligne n'a pas de page.
    if (!view.lastPage) return view.downloaded ? 100 : 0;
    if (!pageCount || pageCount <= 0) return null;
    return Math.min(100, Math.round((view.lastPage / pageCount) * 100));
  }

  return view.downloaded ? 100 : 0;
}

/** Les trois formats qui se livrent en archive et ne se rendent pas en ligne. */
const ARCHIVE_FORMATS = ["kit", "notion", "tableur"];
