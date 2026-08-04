import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import type { Role, AdminRole } from '@prisma/client'

export interface AuthContext { user: { id: string; email: string; role: Role; adminRole: AdminRole | null; trainerId: string | null } }

export function success<T>(data: T, meta?: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status })
}

export function error(code: string, message: string, status: number, details?: Array<{ field?: string; reason?: string }>): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })
}

const PUBLIC_ROUTES: { method: string; prefix: string }[] = [
  { method: 'POST', prefix: '/api/auth/register' },
  { method: 'POST', prefix: '/api/auth/otp' },
  { method: 'POST', prefix: '/api/auth/verify-otp' },
  { method: 'POST', prefix: '/api/auth/reset-password' },
  { method: 'GET', prefix: '/api/catalog/' },
  { method: 'GET', prefix: '/api/courses/' },
  { method: 'GET', prefix: '/api/trainers' },
  { method: 'GET', prefix: '/api/communities' },
  { method: 'GET', prefix: '/api/tarifs' },
  { method: 'GET', prefix: '/api/legal/' },
  { method: 'GET', prefix: '/api/contact' },
  { method: 'POST', prefix: '/api/contact' },
  { method: 'GET', prefix: '/api/aide' },
  { method: 'POST', prefix: '/api/webhooks/' },
  { method: 'GET', prefix: '/api/health' },
]

export function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(r => method === r.method && (path === r.prefix || path.startsWith(r.prefix)))
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return { user: { id: session.user.id, email: session.user.email || '', role: session.user.role, adminRole: session.user.adminRole, trainerId: session.user.trainerId } }
}

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext()
  if (!ctx) return error('UNAUTHORIZED', 'Non authentifié', 401)
  return ctx
}

export async function requireRole(...roles: Role[]): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx
  if (!roles.includes(ctx.user.role)) return error('FORBIDDEN_ROLE', 'Rôle insuffisant', 403)
  return ctx
}

export async function requireAdminSubRole(...subRoles: AdminRole[]): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx
  if (ctx.user.role !== 'ADMIN' || !ctx.user.adminRole || !subRoles.includes(ctx.user.adminRole)) {
    const labels = subRoles.join(' ou ')
    return error('FORBIDDEN_SUBROLE', `Accès réservé au sous-rôle ${labels}`, 403)
  }
  return ctx
}

export async function requireTrainer(): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx
  if (!ctx.user.trainerId) return error('NOT_TRAINER', 'Compte formateur requis', 403)
  return ctx
}

// Mapping mutualisé des erreurs métier levées par les services (`throw new
// Error('CODE')`) vers l'enveloppe HTTP. Les routes n'ont plus qu'à relayer.
const DOMAIN_ERRORS: Record<string, { message: string; status: number }> = {
  // Communs
  NOT_OWNER: { message: 'Ressource non possédée', status: 403 },
  COURSE_NOT_FOUND: { message: 'Ressource introuvable', status: 404 },
  COMMUNITY_NOT_FOUND: { message: 'Communauté introuvable', status: 404 },
  CONTENT_REQUIRED: { message: 'Déposez le contenu avant de publier', status: 422 },
  CONTENT_UNAVAILABLE: { message: 'Le contenu de cette ressource est indisponible', status: 409 },
  STORAGE_QUOTA_EXCEEDED: { message: 'Quota de stockage atteint', status: 422 },
  ALREADY_PUBLISHED: { message: 'Ressource déjà publiée', status: 409 },
  // Lot 2 — litiges
  PURCHASE_NOT_FOUND: { message: 'Achat introuvable', status: 404 },
  PURCHASE_NOT_SUCCEEDED: { message: 'Achat non confirmé', status: 422 },
  ALREADY_REFUNDED: { message: 'Achat déjà remboursé', status: 409 },
  DISPUTE_NOT_FOUND: { message: 'Litige introuvable', status: 404 },
  DISPUTE_ALREADY_ACTIVE: { message: 'Un litige est déjà en cours sur cet achat', status: 409 },
  DISPUTE_ALREADY_RESOLVED: { message: 'Litige déjà résolu', status: 409 },
  DISPUTE_CLOSED: { message: 'Litige clos', status: 409 },
  DISPUTE_WINDOW_EXPIRED: { message: 'Le délai de 14 jours est dépassé', status: 422 },
  RESOURCE_CONSUMED: { message: 'Ressource consultée à plus de 30 %', status: 422 },
  RESOURCE_DOWNLOADED: { message: 'Ressource déjà téléchargée', status: 403 },
  STALE_DISPUTE: { message: 'Le litige a été modifié entre-temps', status: 409 },
  INVALID_STATUS: { message: 'Transition impossible depuis ce statut', status: 409 },
  INVALID_RESOLUTION: { message: 'Résolution invalide', status: 400 },
  INVALID_REFUND_AMOUNT: { message: 'Montant de remboursement invalide', status: 400 },
  MESSAGE_TOO_LONG: { message: 'Message trop long', status: 400 },
  PROVIDER_DISPUTE_ACTIVE: { message: 'Un chargeback provider est en cours sur cet achat', status: 409 },
  OVERRIDE_FORBIDDEN: { message: 'Bypass réservé au Super-admin', status: 403 },
  OVERRIDE_JUSTIFICATION_REQUIRED: { message: 'Justification obligatoire pour un bypass', status: 400 },
  REFUND_RULE_NOT_MET: { message: 'La règle 14 jours / 30 % n\'est pas satisfaite', status: 422 },
  CONTEST_ALREADY_OPEN: { message: 'Une contestation est déjà ouverte', status: 409 },
  ATTACHMENT_INVALID: { message: 'Pièce jointe invalide ou expirée', status: 400 },
  MIME_NOT_ALLOWED: { message: 'Type MIME non autorisé', status: 400 },
  SIZE_EXCEEDS_LIMIT: { message: 'Taille dépassée', status: 400 },
  TASK_NOT_FOUND: { message: 'Tâche introuvable', status: 404 },
  TASK_NOT_PENDING: { message: 'Tâche déjà traitée', status: 409 },
  // Lot 1 — candidatures formateur
  USER_NOT_FOUND: { message: 'Utilisateur introuvable', status: 404 },
  ALREADY_TRAINER: { message: 'Vous êtes déjà formateur', status: 409 },
  APPLICATION_ALREADY_EXISTS: { message: 'Une candidature est déjà en cours', status: 409 },
  APPLICATION_NOT_FOUND: { message: 'Candidature introuvable', status: 404 },
  APPLICATION_NOT_EDITABLE: { message: 'La candidature n\'est plus modifiable', status: 409 },
  APPLICATION_NOT_SUBMITTABLE: { message: 'La candidature ne peut pas être soumise dans cet état', status: 409 },
  APPLICATION_NOT_SUBMITTED: { message: 'La candidature n\'est pas en attente d\'instruction', status: 409 },
  APPLICATION_NOT_REJECTABLE: { message: 'La candidature ne peut pas être rejetée dans cet état', status: 409 },
  APPLICATION_NOT_REJECTED: { message: 'La candidature n\'est pas rejetée', status: 409 },
  ALREADY_REOPENED: { message: 'La candidature a déjà été rouverte une fois', status: 409 },
  REOPEN_TOO_EARLY: { message: 'Réouverture possible seulement 24 h après le rejet', status: 422 },
  REOPEN_IMPOSSIBLE: { message: 'Pièces purgées : le dossier ne peut plus être rouvert', status: 410 },
  STALE_APPLICATION: { message: 'La candidature a été modifiée entre-temps', status: 409 },
  DOCUMENTS_INCOMPLETE: { message: 'Les 3 pièces justificatives doivent être déposées', status: 422 },
  NO_DOCUMENT_REJECTED: { message: 'Au moins une pièce doit être rejetée', status: 400 },
  MAX_RESUBMISSIONS_REACHED: { message: 'Nombre maximal de re-soumissions atteint', status: 422 },
  // Lot 1 — pièces justificatives
  DOCUMENT_NOT_FOUND: { message: 'Pièce introuvable', status: 404 },
  DOCUMENT_NOT_AWAITING_UPLOAD: { message: 'Pièce déjà confirmée', status: 409 },
  DOCUMENT_ALREADY_SUBMITTED: { message: 'Une pièce de ce type a déjà été déposée', status: 409 },
  DOCUMENT_NOT_REJECTED: { message: 'Seule une pièce refusée peut être remplacée', status: 409 },
  DOCUMENT_NOT_REVIEWABLE: { message: 'Pièce non instruisible dans cet état', status: 409 },
  DOCUMENT_PURGED: { message: 'Pièce purgée après 90 jours', status: 410 },
  // Vérification du contenu réellement téléversé (s3.validateMagicNumber)
  UPLOAD_NOT_FOUND: { message: 'Aucun fichier téléversé pour cette pièce', status: 422 },
  EMPTY_FILE: { message: 'Fichier vide', status: 422 },
  CANNOT_READ_FILE: { message: 'Fichier illisible', status: 422 },
  MAGIC_NUMBER_MISMATCH: { message: 'Le contenu ne correspond pas au type déclaré', status: 422 },
  // Lot 3 — KYC & moyens de paiement
  TRAINER_NOT_FOUND: { message: 'Profil formateur introuvable', status: 404 },
  IDENTITY_NAME_MISSING: { message: 'Nom légal vérifié absent : la vérification est impossible', status: 409 },
  PAYOUT_METHOD_NOT_FOUND: { message: 'Moyen de paiement introuvable', status: 404 },
  PAYOUT_METHOD_BLOCKED: { message: 'Vérification suspendue après 3 tentatives', status: 409 },
  PAYOUT_METHOD_NOT_PENDING: { message: 'Moyen de paiement déjà instruit', status: 409 },
  PAYOUT_METHOD_NOT_BLOCKED: { message: 'Aucune escalade en cours sur ce moyen de paiement', status: 409 },
  PAYOUT_METHOD_NOT_ARCHIVED: { message: 'Seul un moyen archivé peut être restauré', status: 409 },
  PAYOUT_METHOD_MISSING: { message: 'Aucun moyen de paiement enregistré', status: 422 },
  PAYOUT_METHOD_NOT_VERIFIED: { message: 'Moyen de paiement non vérifié', status: 422 },
  PAYOUT_METHOD_CARENCE: { message: 'Délai de sécurité de 72 h en cours', status: 422 },
  STALE_PAYOUT_METHOD: { message: 'Le moyen de paiement a été modifié entre-temps', status: 409 },
  MICRO_DEPOSIT_IBAN_ONLY: { message: 'Micro-virement réservé aux comptes IBAN', status: 422 },
  MICRO_DEPOSIT_NOT_ISSUED: { message: 'Aucun micro-virement en attente', status: 409 },
  MICRO_DEPOSIT_ALREADY_ISSUED: { message: 'Des micro-virements sont déjà en attente de confirmation', status: 409 },
  // --- Signalements (Modération) ---
  REPORT_NOT_FOUND: { message: 'Signalement introuvable', status: 404 },
  REPORT_NOT_OPEN: { message: 'Signalement déjà tranché', status: 409 },
  REPORT_ALREADY_OPEN: { message: 'Vous avez déjà signalé cet élément', status: 409 },
  TARGET_NOT_HIDEABLE: { message: 'Seule une ressource peut être retirée du catalogue', status: 422 },
  STALE_REPORT: { message: 'Le signalement a été modifié entre-temps', status: 409 },
  // --- Abonnement formateur (décision 68) ---
  SUBSCRIPTION_SUSPENDED: {
    message: 'Abonnement suspendu : la publication et le téléversement sont bloqués tant qu\'il n\'est pas réglé',
    status: 422,
  },
  SUBSCRIPTION_CHARGE_NOT_FOUND: { message: 'Période de facturation introuvable', status: 404 },
  SUBSCRIPTION_CHARGE_NOT_DUE: { message: 'Période déjà réglée ou offerte', status: 409 },
  // --- Tarification plateforme (Super-admin) ---
  INVALID_AMOUNT: { message: 'Montant invalide', status: 400 },
  TARIFF_DATE_IN_PAST: { message: 'Un tarif ne peut pas prendre effet dans le passé', status: 422 },
  CODE_REQUIRED: { message: 'Un code promo doit porter un code', status: 400 },
  TRAINER_DISCOUNT_NEEDS_REASON: { message: 'Une remise nominative exige un formateur et un motif', status: 400 },
  MICRO_DEPOSIT_MISMATCH: { message: 'Les montants saisis ne correspondent pas', status: 422 },
  IBAN_REQUIRED: { message: 'IBAN obligatoire', status: 400 },
  MOBILE_ACCOUNT_REQUIRED: { message: 'Opérateur et numéro obligatoires', status: 400 },
  HOLDER_NAME_REQUIRED: { message: 'Nom du titulaire obligatoire', status: 400 },
  BUSINESS_NAME_REQUIRED: { message: 'Dénomination sociale obligatoire', status: 400 },
  BUSINESS_DOC_REQUIRED: { message: 'Document d\'immatriculation obligatoire', status: 400 },
  LEGAL_REP_PROOF_REQUIRED: { message: 'Preuve de représentation légale obligatoire', status: 400 },
  JUSTIFICATION_REQUIRED: { message: 'Justification obligatoire', status: 400 },
  // Lot 3 — retraits
  WALLET_NOT_FOUND: { message: 'Portefeuille introuvable', status: 404 },
  PAYOUT_NOT_FOUND: { message: 'Retrait introuvable', status: 404 },
  PAYOUT_IN_PROGRESS: { message: 'Un retrait est déjà en cours', status: 409 },
  PAYOUT_NOT_IN_REVIEW: { message: 'Le retrait n\'est pas en revue', status: 409 },
  PAYOUT_NOT_APPROVED: { message: 'Le retrait n\'est pas approuvé', status: 409 },
  PAYOUT_NOT_FAILED: { message: 'Le retrait n\'est pas en échec', status: 409 },
  AMOUNT_BELOW_MINIMUM: { message: 'Montant inférieur au minimum de retrait', status: 422 },
  INSUFFICIENT_WITHDRAWABLE_BALANCE: { message: 'Solde retirable insuffisant', status: 422 },
  STALE_PAYOUT: { message: 'Le retrait a été modifié entre-temps', status: 409 },
}

export function errorFromException(err: unknown): NextResponse {
  const code = err instanceof Error ? err.message : ''
  const known = DOMAIN_ERRORS[code]
  if (known) return error(code, known.message, known.status)
  console.error('[API:UNEXPECTED_ERROR]', err)
  return error('INTERNAL_ERROR', 'Erreur interne', 500)
}

export function parsePagination(url: URL): { page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))
  return { page, pageSize }
}

export async function parseBody<T>(request: Request, schema: { parse: (data: unknown) => T }): Promise<{ data: T } | NextResponse> {
  try {
    const json = await request.json()
    return { data: schema.parse(json) }
  } catch (err: any) {
    if (err.issues) return error('VALIDATION_ERROR', 'Requête invalide', 400, err.issues.map((i: any) => ({ field: i.path.join('.'), reason: i.message })))
    return error('INVALID_JSON', 'Corps de requête invalide', 400)
  }
}
