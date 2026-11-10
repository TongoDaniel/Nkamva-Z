// ==========================================================================
// Rôles d'administration cumulables : plan d'action du 10 novembre 2026
// ==========================================================================
// Un administrateur peut avoir plusieurs rôles ; il reçoit la somme de leurs
// permissions (modèle Shopify). Deux principes encadrent ce cumul :
//
//   · le moindre privilège : chaque rôle ne donne que ce que sa tâche exige ;
//   · la séparation des tâches : personne ne mène seul une opération sensible
//     de bout en bout (NIST SP 800-53, AC-5 et AC-6).
//
// Ce module est la seule source des accès. Les routes passent par
// `requireAdminSubRole` (`lib/api`), les pages et la navigation par
// `hasAdminRole` : la même ligne décide pour l'écran et pour l'API.
//
// Volontairement sans dépendance (ni Prisma, ni base) : importable depuis un
// composant client.
// ==========================================================================

export type AdminRoleCode =
  | 'SUPER_ADMIN'
  | 'FINANCES'
  | 'MODERATION'
  | 'PILOTAGE'
  | 'SUPPORT'
  | 'SALES'
  | 'COMMUNICATION'
  | 'TECHNICAL'
  | 'QA'

export const ADMIN_ROLE_CODES: AdminRoleCode[] = [
  'SUPER_ADMIN', 'PILOTAGE', 'FINANCES', 'MODERATION', 'SUPPORT', 'SALES', 'COMMUNICATION', 'TECHNICAL', 'QA',
]

export const ADMIN_ROLE_LABELS: Record<AdminRoleCode, string> = {
  SUPER_ADMIN: 'Propriétaire',
  PILOTAGE: 'Pilotage',
  FINANCES: 'Finances',
  MODERATION: 'Modération',
  SUPPORT: 'Service client',
  SALES: 'Commercial',
  COMMUNICATION: 'Communication',
  TECHNICAL: 'Technique',
  QA: 'Recette',
}

/** Ce que chaque rôle permet, tel que l'écran Administrateurs l'explique. */
export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRoleCode, string> = {
  SUPER_ADMIN: 'Tout voir ; créer et retirer des administrateurs, attribuer les rôles ; changer tarifs, commission, plans et taux de change.',
  PILOTAGE: 'Tableau de pilotage du modèle, recettes, en lecture ; exporter les chiffres. N’agit sur aucun dossier.',
  FINANCES: 'Transactions, portefeuilles, retraits, abonnements, remises ; valide ou refuse retraits, moyens de paiement et remboursements.',
  MODERATION: 'Candidatures, signalements, contenus ; valide les formateurs, sanctionne. Ne touche pas à l’argent.',
  SUPPORT: 'Fiche client complète, litiges ; rétablit un accès, propose un remboursement, rédige l’aide. Ne valide ni remboursement ni retrait.',
  SALES: 'Suivi des formateurs ; crée des remises dans un plafond. Ne valide pas les candidatures.',
  COMMUNICATION: 'Tendances, aide en ligne et annonces. Aucune donnée personnelle ni montant individuel.',
  TECHNICAL: 'Intégrations, santé des services, journal d’audit. N’approuve ni retrait ni remboursement.',
  QA: 'Tous les rôles, sur l’environnement de test uniquement, avec des données fictives.',
}

export interface AdminRoleHolder {
  role?: string
  adminRole?: string | null
  adminRoles?: readonly string[] | null
}

/** Les rôles réels d'un administrateur : le tableau, à défaut le rôle principal. */
export function rolesOf(user: AdminRoleHolder | null | undefined): AdminRoleCode[] {
  if (!user) return []
  const fromArray = (user.adminRoles ?? []).filter((r): r is AdminRoleCode => (ADMIN_ROLE_CODES as string[]).includes(r))
  if (fromArray.length > 0) return fromArray
  return user.adminRole && (ADMIN_ROLE_CODES as string[]).includes(user.adminRole) ? [user.adminRole as AdminRoleCode] : []
}

/**
 * Vrai si l'administrateur a au moins un des rôles demandés. Le Propriétaire
 * passe partout : il « voit tout ». La Recette passe partout **hors
 * production** : c'est son métier de tester chaque rôle, et elle n'existe pas
 * en production (`isProductionRuntime`).
 */
export function hasAdminRole(user: AdminRoleHolder | null | undefined, ...wanted: AdminRoleCode[]): boolean {
  const roles = rolesOf(user)
  if (roles.includes('SUPER_ADMIN')) return true
  if (roles.includes('QA') && !isProductionRuntime()) return true
  return wanted.some((r) => roles.includes(r))
}

/**
 * Production réelle. `APP_ENV` distingue le staging, qui tourne lui aussi avec
 * `NODE_ENV=production` : la Recette y a accès, c'est son terrain.
 */
export function isProductionRuntime(): boolean {
  if (typeof process === 'undefined') return false
  return process.env.NODE_ENV === 'production' && (process.env.APP_ENV ?? 'production') === 'production'
}

// --- Carte des accès : une ligne par espace ----------------------------------

/**
 * Qui ouvre quoi. Le Propriétaire n'y figure pas : il passe partout. Une page
 * absente de cette carte est ouverte à tout administrateur.
 */
export const ADMIN_ACCESS = {
  analytics: ['PILOTAGE'],
  trainerApplications: ['MODERATION'],
  // Le service client instruit, Finances décide (séparation, règle 1).
  disputes: ['SUPPORT', 'FINANCES'],
  disputeDecision: ['FINANCES'],
  reports: ['MODERATION'],
  help: ['MODERATION', 'SUPPORT', 'COMMUNICATION'],
  transactions: ['FINANCES', 'PILOTAGE'],
  refunds: ['FINANCES'],
  payoutMethods: ['FINANCES'],
  payouts: ['FINANCES'],
  wallets: ['FINANCES'],
  subscriptions: ['FINANCES'],
  discounts: ['FINANCES', 'SALES'],
  fxRates: ['FINANCES'],
  users: ['FINANCES', 'SUPPORT'],
  customers: ['SUPPORT', 'FINANCES'],
  auditLog: ['TECHNICAL'],
  integrations: ['TECHNICAL'],
} as const satisfies Record<string, readonly AdminRoleCode[]>

export type AdminSpace = keyof typeof ADMIN_ACCESS

export function canOpen(user: AdminRoleHolder | null | undefined, space: AdminSpace): boolean {
  return hasAdminRole(user, ...ADMIN_ACCESS[space])
}

// --- Séparation des tâches ---------------------------------------------------

/**
 * Règle 4 : le Commercial ne valide pas les formateurs (conflit d'intérêts avec
 * le recrutement). Un administrateur qui cumule Commercial et Modération garde
 * la lecture des candidatures, pas la décision.
 */
export function canDecideTrainerApplication(user: AdminRoleHolder | null | undefined): boolean {
  const roles = rolesOf(user)
  if (roles.includes('SUPER_ADMIN')) return true
  if (roles.includes('SALES')) return false
  return hasAdminRole(user, 'MODERATION')
}

/**
 * Règle 1 : le service client propose un remboursement, Finances le valide. La
 * même personne ne peut pas proposer et valider le même dossier.
 */
export function canValidateRefund(
  user: (AdminRoleHolder & { id?: string }) | null | undefined,
  proposedById: string | null | undefined,
): boolean {
  if (!hasAdminRole(user, 'FINANCES')) return false
  // Sans exception, Propriétaire compris : « personne ne mène seul une
  // opération sensible de bout en bout ».
  if (proposedById && user?.id && proposedById === user.id) return false
  return true
}
