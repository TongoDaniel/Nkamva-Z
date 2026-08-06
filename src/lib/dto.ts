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
  lessonsCount: number | null;
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
  paymentUrl?: string;
  clientSecret?: string;
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

/** % de consommation affiché, aligné sur getConsumptionPercent() du backend. */
export function consumptionPercent(
  view: CourseViewState | null | undefined,
  format?: string | null,
  durationSeconds?: number | null,
): number {
  if (!view) return 0;
  if (view.downloaded) return 100;
  if (format === "video" && durationSeconds && durationSeconds > 0) {
    return Math.min(100, Math.round((view.watchedSeconds / durationSeconds) * 100));
  }
  return 0;
}
