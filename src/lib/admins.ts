// ==========================================================================
// Comptes d'administration — création et sous-rôle
// ==========================================================================
// Rien ne créait d'administrateur : ni route, ni service. Les trois comptes
// du jeu de démonstration étaient écrits directement en base, et en
// production le premier Super-admin ne peut naître que d'une insertion SQL
// manuelle — ce qui est resté vrai, volontairement (voir `bootstrapNotice`
// plus bas) : cette console ne peut créer le tout premier compte, elle ne
// gère que ceux qui viennent après.
//
// Règle posée par l'exploitant (2026-08-05), et non négociable ici :
//
//   · Seul un Super-admin peut créer un administrateur ou changer son
//     sous-rôle — appliqué par `requireAdminSubRole('SUPER_ADMIN')` dans
//     chaque route, comme pour `applySanction`.
//   · Le Super-admin est IMMUABLE par cette console : aucune fonction d'ici
//     ne peut faire sortir un compte de `SUPER_ADMIN`, quel que soit
//     l'acteur — y compris un autre Super-admin, y compris lui-même. Le
//     seul chemin reste une intervention manuelle en base. C'est le garde-
//     fou qui empêche de fermer la console à tout le monde par un clic.
//
// Le mot de passe n'existe jamais en clair côté serveur : le compte naît
// avec `passwordHash: null` et l'invité l'établit lui-même via le parcours
// « mot de passe oublié » existant (OTP par e-mail, déjà éprouvé pour
// l'inscription). Personne ici ne choisit ni ne transmet de secret.
// ==========================================================================

import { ADMIN_ROLE_LABELS as ROLE_LABELS } from './admin-roles'
import type { AdminRole } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { sendEmail, renderSimpleEmail } from './email'
import { absoluteUrl } from './notification'

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = ROLE_LABELS

export interface AdminAccount {
  id: string
  email: string
  fullName: string | null
  adminRole: AdminRole
  /** Rôles cumulés (plan d'action, section 2). Le premier est le principal. */
  adminRoles: AdminRole[]
  suspendedAt: Date | null
  createdAt: Date
}

/** Plan d'action : « deux personnes au plus » ont le rôle Propriétaire. */
export const MAX_OWNERS = 2

/** Normalise une liste de rôles : sans doublon, dans l'ordre du registre, jamais vide. */
function normalizeRoles(roles: AdminRole[]): AdminRole[] {
  const unique = Array.from(new Set(roles))
  if (unique.length === 0) throw new Error('ROLES_REQUIRED')
  return unique
}

async function assertOwnerSeatAvailable(excludeUserId?: string) {
  const owners = await db.user.count({
    where: {
      role: 'ADMIN', deletedAt: null, suspendedAt: null,
      OR: [{ adminRoles: { has: 'SUPER_ADMIN' } }, { adminRole: 'SUPER_ADMIN' }],
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
  })
  if (owners >= MAX_OWNERS) throw new Error('TOO_MANY_OWNERS')
}

const ADMIN_SELECT = {
  id: true, email: true, fullName: true, avatarS3Key: true, avatarUrl: true, adminRole: true, adminRoles: true, suspendedAt: true, createdAt: true,
} as const

export async function listAdmins(): Promise<AdminAccount[]> {
  const rows = await db.user.findMany({
    where: { role: 'ADMIN', deletedAt: null },
    select: ADMIN_SELECT,
    orderBy: [{ adminRole: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((r) => ({ ...r, adminRole: r.adminRole!, adminRoles: r.adminRoles.length ? r.adminRoles : [r.adminRole!] }))
}

export interface CreateAdminInput {
  email: string
  fullName: string
  /** Rôle unique (ancien formulaire) ou rôles cumulés. */
  adminRole?: AdminRole
  adminRoles?: AdminRole[]
  actorId: string
}

/**
 * Ouvre un compte d'administration. L'invité l'active lui-même : on ne
 * choisit ni ne transmet aucun mot de passe, l'e-mail renvoie vers
 * « Mot de passe oublié », qui fonctionne pour n'importe quel compte non
 * suspendu, y compris un compte qui n'a encore jamais eu de mot de passe.
 */
export async function createAdmin(input: CreateAdminInput): Promise<AdminAccount> {
  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()
  if (fullName.length < 2) throw new Error('NAME_REQUIRED')

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new Error('EMAIL_ALREADY_USED')

  const roles = normalizeRoles(input.adminRoles ?? (input.adminRole ? [input.adminRole] : []))
  if (roles.includes('SUPER_ADMIN')) await assertOwnerSeatAvailable()

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        fullName,
        role: 'ADMIN',
        adminRole: roles[0],
        adminRoles: roles,
        passwordHash: null,
      },
      select: ADMIN_SELECT,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: 'SUPER_ADMIN',
      action: 'ADMIN_ACCOUNT_CREATED', targetType: 'User', targetId: user.id,
      meta: { email, adminRoles: roles },
    })
    return user
  })

  const { html, text } = renderSimpleEmail({
    title: 'Un accès administrateur vous a été ouvert',
    paragraphs: [
      'Bonjour,',
      `Un compte d’administration (${roles.map((r) => ADMIN_ROLE_LABELS[r]).join(', ')}) vous a été ouvert sur NKAMVA.`,
      'Pour l’activer, choisissez votre mot de passe depuis « Mot de passe oublié », avec cette adresse e-mail. Vous recevrez un code à saisir avant de le définir.',
    ],
    cta: { label: 'Choisir mon mot de passe', url: absoluteUrl('/auth/mot-de-passe-oublie') },
    footnote:
      'Si cet accès ne vous était pas destiné, ignorez cet e-mail : le compte reste inactif tant qu’aucun mot de passe n’est défini.',
  })
  await sendEmail({
    to: email,
    subject: 'NKAMVA · votre accès administrateur',
    html, text,
    tags: ['admin-invitation'],
  })

  return { ...created, adminRole: created.adminRole!, adminRoles: created.adminRoles }
}

/**
 * Fixe les rôles cumulés d'un administrateur. Le rôle Propriétaire ne se donne
 * ni ne se retire ici : comme pour `changeAdminRole`, c'est le garde-fou qui
 * empêche de fermer la console d'un clic. Un Propriétaire peut en revanche
 * recevoir d'autres rôles (Jaurès : Propriétaire, Pilotage, Finances).
 */
export async function setAdminRoles(
  targetId: string,
  nextRoles: AdminRole[],
  actorId: string,
): Promise<AdminAccount> {
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, adminRole: true, adminRoles: true, deletedAt: true },
  })
  if (!target || target.deletedAt || target.role !== 'ADMIN') throw new Error('ADMIN_NOT_FOUND')
  const current = target.adminRoles.length ? target.adminRoles : target.adminRole ? [target.adminRole] : []
  const roles = normalizeRoles(nextRoles)
  if (current.includes('SUPER_ADMIN') !== roles.includes('SUPER_ADMIN')) throw new Error('SUPER_ADMIN_IMMUTABLE')
  // Le rôle principal reste en tête : le Propriétaire le reste.
  const ordered = roles.includes('SUPER_ADMIN') ? ['SUPER_ADMIN' as AdminRole, ...roles.filter((r) => r !== 'SUPER_ADMIN')] : roles

  const updated = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetId },
      data: { adminRole: ordered[0], adminRoles: ordered },
      select: ADMIN_SELECT,
    })
    await audit(tx, {
      actorId, actorRole: 'SUPER_ADMIN',
      action: 'ADMIN_ROLES_CHANGED', targetType: 'User', targetId,
      meta: { from: current, to: ordered },
    })
    return user
  })
  return { ...updated, adminRole: updated.adminRole!, adminRoles: updated.adminRoles }
}

/**
 * Change le sous-rôle d'un administrateur existant — jamais vers ni depuis
 * `SUPER_ADMIN` : l'immutabilité posée en tête de fichier s'applique aux deux
 * sens du changement, pas seulement à la rétrogradation.
 */
export async function changeAdminRole(
  targetId: string,
  nextRole: AdminRole,
  actorId: string,
): Promise<AdminAccount> {
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, adminRole: true, deletedAt: true },
  })
  if (!target || target.deletedAt || target.role !== 'ADMIN') throw new Error('ADMIN_NOT_FOUND')
  if (target.adminRole === 'SUPER_ADMIN' || nextRole === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN_IMMUTABLE')
  }
  if (target.adminRole === nextRole) throw new Error('ROLE_UNCHANGED')

  const updated = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetId },
      data: { adminRole: nextRole, adminRoles: [nextRole] },
      select: ADMIN_SELECT,
    })
    await audit(tx, {
      actorId, actorRole: 'SUPER_ADMIN',
      action: 'ADMIN_ROLE_CHANGED', targetType: 'User', targetId,
      meta: { from: target.adminRole, to: nextRole },
    })
    return user
  })

  return { ...updated, adminRole: updated.adminRole!, adminRoles: updated.adminRoles }
}

/**
 * Ferme un compte d'administration (arbitrage 88).
 *
 * Le compte **reste** administrateur : `role` et `adminRole` sont conservés,
 * seul `suspendedAt` est posé. Ce n'est pas un détail d'implémentation.
 *
 * Cette fonction rétrogradait autrefois vers `LEARNER`. C'était la porte de
 * sortie de l'interdiction posée par l'arbitrage 87 : il suffisait de se faire
 * retirer ses droits pour redevenir un acheteur ordinaire — avec, derrière
 * soi, un journal d'audit signé par un administrateur. La frontière ne se
 * franchit dans aucun sens : qui a été administrateur le reste, et s'ouvre un
 * compte personnel s'il veut acheter.
 *
 * `suspendedAt` suffit à couper l'accès : `authorize` refuse la connexion
 * (`ACCOUNT_SUSPENDED`) et le callback `session` annule toute session déjà
 * ouverte, à la requête suivante. Le bump de `sessionsValidAfter` s'y ajoute
 * pour que le **middleware** — qui ne lit que le JWT, sans toucher la base —
 * cesse lui aussi de laisser passer, sans attendre le prochain rafraîchissement.
 *
 * Interdit sur un `SUPER_ADMIN`, pour la même raison que `changeAdminRole` —
 * et sur son propre compte, pour la même raison qu'`applySanction` refuse
 * l'auto-sanction : la console ne doit jamais se fermer à celui qui vient d'y
 * agir.
 */
export async function deactivateAdmin(targetId: string, actorId: string): Promise<void> {
  if (targetId === actorId) throw new Error('REVOKE_SELF_FORBIDDEN')

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, adminRole: true, deletedAt: true, suspendedAt: true },
  })
  if (!target || target.deletedAt || target.role !== 'ADMIN') throw new Error('ADMIN_NOT_FOUND')
  if (target.adminRole === 'SUPER_ADMIN') throw new Error('SUPER_ADMIN_IMMUTABLE')
  if (target.suspendedAt) throw new Error('ADMIN_ALREADY_DEACTIVATED')

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { suspendedAt: new Date(), sessionsValidAfter: new Date() },
    })
    await audit(tx, {
      actorId, actorRole: 'SUPER_ADMIN',
      action: 'ADMIN_ACCOUNT_DEACTIVATED', targetType: 'User', targetId,
      meta: { adminRole: target.adminRole },
    })
  })
}

/**
 * Rouvre un compte fermé.
 *
 * Contrepartie indispensable de la fonction précédente : sans elle, un clic
 * malheureux condamnerait définitivement un compte, et le seul recours serait
 * d'en créer un autre — en laissant derrière soi un journal d'audit coupé en
 * deux entre deux identités pour une même personne.
 *
 * Le compte n'ayant jamais cessé d'être administrateur, il n'y a aucun rôle à
 * lui rendre : lever `suspendedAt` suffit.
 */
export async function reactivateAdmin(targetId: string, actorId: string): Promise<void> {
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, adminRole: true, deletedAt: true, suspendedAt: true },
  })
  if (!target || target.deletedAt || target.role !== 'ADMIN') throw new Error('ADMIN_NOT_FOUND')
  if (!target.suspendedAt) throw new Error('ADMIN_NOT_DEACTIVATED')

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { suspendedAt: null },
    })
    await audit(tx, {
      actorId, actorRole: 'SUPER_ADMIN',
      action: 'ADMIN_ACCOUNT_REACTIVATED', targetType: 'User', targetId,
      meta: { adminRole: target.adminRole },
    })
  })
}
