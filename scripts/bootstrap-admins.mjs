// ==========================================================================
// Amorçage des comptes Super-admin
// ==========================================================================
// Une base fraîchement migrée n'a **aucun utilisateur** : personne ne peut se
// connecter à l'administration, et rien dans l'application ne permet de créer
// le premier administrateur — la route de création d'admin exige déjà d'être
// Super-admin. C'est ce script qui rompt ce cercle.
//
// À ne pas confondre avec `prisma/seed.ts` : le seed est un jeu de
// démonstration qui **purge** la base avant de la remplir. Celui-ci ne
// supprime rien, ne touche à aucun autre compte, et se rejoue sans dommage —
// il est fait pour tourner à chaque déploiement.
//
// Écrit en `.mjs` et non en TypeScript à dessein : il doit s'exécuter dans
// l'image de production, qui n'embarque ni `bun` ni `tsx`.
// ==========================================================================

import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'

/**
 * Les comptes qui doivent exister par défaut. Ce sont des identités, pas des
 * données de démonstration : elles vivent ici pour qu'un déploiement sur une
 * base vide donne toujours les mêmes accès.
 */
export const SUPER_ADMINS = [
  { email: 'daniel.tongo@nkamva.com', fullName: 'Daniel TONGO' },
  { email: 'jaures.nsotang@nkamva.com', fullName: 'Jaures NSOTANG' },
]

// Aucun mot de passe par défaut, et c'est délibéré. Le dépôt est public : une
// valeur écrite ici est connue de tous, et un déploiement sur une base vide
// sans BOOTSTRAP_ADMIN_PASSWORD ouvrait l'administration avec elle. Ni repli,
// ni mot de passe tiré au hasard puis affiché : le déploiement du staging
// tourne dans GitHub Actions, dont les journaux sont lisibles par tous pour un
// dépôt public. Sans mot de passe fourni, le script refuse de créer un compte.

/**
 * Longueur minimale, alignée sur `MIN_PASSWORD_LENGTH` de
 * `src/lib/validation.ts` : un compte amorcé ne doit pas porter un mot de passe
 * que l'inscription refuserait.
 */
export const MIN_PASSWORD_LENGTH = 10

/** Refus d'amorçage faute de mot de passe utilisable. Rien n'a été écrit. */
export class BootstrapPasswordError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'BootstrapPasswordError'
  }
}

// Paramètres alignés sur `src/lib/password.ts` : un hachage produit ici doit
// être vérifiable par la route de connexion, qui utilise les mêmes. `2` est
// Argon2id — la valeur numérique plutôt que l'énumération, qui est un
// `const enum` inutilisable hors compilation TypeScript.
const HASH_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }

/**
 * Garantit la présence des Super-admins.
 *
 * Le mot de passe d'un compte **déjà existant n'est jamais réécrit** : sur un
 * serveur en service, quelqu'un l'a peut-être changé, et un script de
 * déploiement qui le remettrait à sa valeur d'usine rouvrirait silencieusement
 * un accès que l'on croyait fermé. `resetPassword` force ce cas, et il faut le
 * demander explicitement.
 *
 * Le rôle, lui, est toujours réaffirmé : un compte homonyme rétrogradé par
 * erreur doit pouvoir être remis d'aplomb par un simple passage.
 *
 * Un mot de passe n'est exigé que s'il doit être posé : création d'un compte
 * absent, ou `resetPassword`. Les comptes en place n'en ont pas besoin, si bien
 * qu'un déploiement ordinaire passe sans BOOTSTRAP_ADMIN_PASSWORD. Quand il en
 * faut un et qu'il manque, ou qu'il est trop court, la fonction lève une
 * `BootstrapPasswordError` **avant toute écriture**.
 *
 * Les types sont annotés en JSDoc : ce module est importé par `prisma/seed.ts`,
 * qui est compilé, et sans annotation TypeScript déduit une signature trop
 * étroite du seul jeu de valeurs par défaut.
 *
 * @param {import('@prisma/client').PrismaClient} db
 * @param {{ password?: string, resetPassword?: boolean }} [options]
 * @returns {Promise<Array<{ email: string, action: string }>>}
 */
export async function bootstrapSuperAdmins(db, { password, resetPassword = false } = {}) {
  // La chaîne vide vaut absence. C'est ce que reçoit le script quand le .env du
  // serveur n'a pas la ligne (`docker run -e VAR="$(grep …)"`), et l'ancien
  // `password ?? défaut` la gardait telle quelle : il hachait un mot de passe vide.
  const secret = password || undefined

  // Toutes les lectures d'abord : un refus doit tomber avant la première
  // écriture, pas au deuxième compte.
  const accounts = []
  for (const account of SUPER_ADMINS) {
    const existing = await db.user.findUnique({
      where: { email: account.email },
      select: { id: true, role: true, adminRole: true, deletedAt: true },
    })
    accounts.push({ account, existing })
  }

  const missing = accounts.filter((a) => !a.existing).map((a) => a.account.email)
  const needsPassword = missing.length > 0 || resetPassword
  if (needsPassword) {
    const target = resetPassword
      ? `réinitialiser le mot de passe de ${SUPER_ADMINS.map((a) => a.email).join(', ')}`
      : `créer ${missing.join(', ')}`
    if (!secret) {
      throw new BootstrapPasswordError(
        `BOOTSTRAP_ADMIN_PASSWORD n'est pas défini : impossible de ${target}.\n` +
        "   Le script n'a plus de mot de passe par défaut. Renseignez BOOTSTRAP_ADMIN_PASSWORD\n" +
        `   (au moins ${MIN_PASSWORD_LENGTH} caractères) dans le .env du serveur, puis relancez. Rien n'a été écrit.`,
      )
    }
    if (secret.length < MIN_PASSWORD_LENGTH) {
      throw new BootstrapPasswordError(
        `BOOTSTRAP_ADMIN_PASSWORD est trop court pour ${target} : ` +
        `au moins ${MIN_PASSWORD_LENGTH} caractères. Rien n'a été écrit.`,
      )
    }
  }

  const results = []

  for (const { account, existing } of accounts) {
    // Un hachage par compte, et non un seul partagé : deux comptes au même mot
    // de passe produiraient sinon deux hachés identiques, ce qui le dit à qui
    // lit la table. Le sel est tiré à chaque appel.
    const passwordHash = needsPassword ? await hash(/** @type {string} */ (secret), HASH_OPTIONS) : undefined

    if (!existing) {
      const created = await db.user.create({
        data: {
          email: account.email,
          fullName: account.fullName,
          role: 'ADMIN',
          adminRole: 'SUPER_ADMIN',
          passwordHash,
          // Sans cette date, la connexion redemanderait un code à six chiffres
          // envoyé à une adresse qui n'est peut-être pas encore relevée.
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      })
      await audit(db, created.id, 'SUPER_ADMIN_BOOTSTRAPPED', { email: account.email })
      results.push({ email: account.email, action: 'créé' })
      continue
    }

    // Un compte effacé ne se réanime pas au détour d'un déploiement : c'est une
    // décision, elle se prend à la main.
    if (existing.deletedAt) {
      results.push({ email: account.email, action: 'ignoré (compte supprimé)' })
      continue
    }

    const needsRole = existing.role !== 'ADMIN' || existing.adminRole !== 'SUPER_ADMIN'
    if (!needsRole && !resetPassword) {
      results.push({ email: account.email, action: 'déjà en place' })
      continue
    }

    await db.user.update({
      where: { id: existing.id },
      data: {
        role: 'ADMIN',
        adminRole: 'SUPER_ADMIN',
        ...(resetPassword ? { passwordHash } : {}),
      },
    })
    await audit(db, existing.id, 'SUPER_ADMIN_BOOTSTRAP_UPDATED', {
      email: account.email,
      roleRestored: needsRole,
      passwordReset: resetPassword,
    })
    results.push({
      email: account.email,
      action: resetPassword ? 'mot de passe réinitialisé' : 'rôle rétabli',
    })
  }

  return results
}

async function audit(db, targetId, action, meta) {
  await db.auditLog.create({
    data: { actorId: null, actorRole: 'SYSTEM', action, targetType: 'User', targetId, meta },
  })
}

// --- Exécution directe -----------------------------------------------------

// `import.meta.url` comparé à l'argument : le module reste importable par le
// seed sans déclencher l'exécution.
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))

if (invokedDirectly) {
  const resetPassword = process.argv.includes('--reset-password')
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  const db = new PrismaClient()

  try {
    const results = await bootstrapSuperAdmins(db, { password, resetPassword })
    console.log('\nComptes Super-admin :')
    for (const r of results) console.log(`  · ${r.email} — ${r.action}`)
    console.log('')
  } catch (error) {
    if (!(error instanceof BootstrapPasswordError)) throw error
    // Un refus attendu : le message suffit, la pile n'apprendrait rien. Le code
    // de sortie non nul arrête le déploiement (`set -e`) avant `compose up`.
    console.error(`\n✗ ${error.message}\n`)
    process.exitCode = 1
  } finally {
    await db.$disconnect()
  }
}
