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

/** Mot de passe par défaut, surchargeable sans toucher au dépôt. */
const DEFAULT_PASSWORD = 'Nkamva!2026'

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
 * Les types sont annotés en JSDoc : ce module est importé par `prisma/seed.ts`,
 * qui est compilé, et sans annotation TypeScript déduit une signature trop
 * étroite du seul jeu de valeurs par défaut.
 *
 * @param {import('@prisma/client').PrismaClient} db
 * @param {{ password?: string, resetPassword?: boolean }} [options]
 * @returns {Promise<Array<{ email: string, action: string }>>}
 */
export async function bootstrapSuperAdmins(db, { password, resetPassword = false } = {}) {
  const results = []

  for (const account of SUPER_ADMINS) {
    // Un hachage par compte, et non un seul partagé : deux comptes au même mot
    // de passe produiraient sinon deux hachés identiques, ce qui le dit à qui
    // lit la table. Le sel est tiré à chaque appel.
    const passwordHash = await hash(password ?? DEFAULT_PASSWORD, HASH_OPTIONS)
    const existing = await db.user.findUnique({
      where: { email: account.email },
      select: { id: true, role: true, adminRole: true, deletedAt: true },
    })

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
    if (!password) {
      console.warn(
        "⚠  BOOTSTRAP_ADMIN_PASSWORD n'est pas défini : le mot de passe par défaut du dépôt est utilisé.\n" +
        '   Il est lisible par quiconque a accès au code. À changer dès la première connexion.',
      )
    }
    const results = await bootstrapSuperAdmins(db, { password, resetPassword })
    console.log('\nComptes Super-admin :')
    for (const r of results) console.log(`  · ${r.email} — ${r.action}`)
    console.log('')
  } finally {
    await db.$disconnect()
  }
}
