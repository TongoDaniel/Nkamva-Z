// ==========================================================================
// Formes de données renvoyées par l'API, telles que consommées par le front.
// Reflètent les `select`/`include` de src/lib/catalog.ts, purchases.ts, access.ts.
// ==========================================================================

export interface TrainerSummary {
  id: string;
  user: { id?: string; fullName: string | null };
  ratingAverage: number;
  ratingCount: number;
  studentsCount?: number;
  bio?: string | null;
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
  trainerProfile: Required<Pick<TrainerSummary, "id" | "user" | "ratingAverage" | "ratingCount">> & {
    studentsCount: number;
    bio: string | null;
  };
}

export type PaymentProvider = "STRIPE" | "CINETPAY";
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
