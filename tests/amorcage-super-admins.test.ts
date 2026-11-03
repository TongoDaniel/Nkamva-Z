// ==========================================================================
// Amorçage des Super-admins : aucun mot de passe en dur
// ==========================================================================
// `scripts/bootstrap-admins.mjs` tourne à chaque déploiement, dans l'image de
// production. Il retombait sur un mot de passe écrit dans son code quand
// BOOTSTRAP_ADMIN_PASSWORD manquait : le dépôt étant public, un déploiement sur
// une base vide ouvrait l'administration avec une valeur connue de tous.
//
// Ce qui est vérifié ici : sans mot de passe fourni, le script refuse de créer
// ou de réinitialiser un compte, et refuse **avant toute écriture** ; les
// comptes déjà en place, eux, passent sans mot de passe, pour qu'un déploiement
// ordinaire ne casse pas.
//
// La fonction reçoit sa base en argument : une base en mémoire suffit, et la
// suite n'a besoin d'aucun Postgres.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import {
  bootstrapSuperAdmins, BootstrapPasswordError, MIN_PASSWORD_LENGTH, SUPER_ADMINS,
} from '../scripts/bootstrap-admins.mjs'
import { verifyPassword } from '@/lib/password'
import { MIN_PASSWORD_LENGTH as APP_MIN_PASSWORD_LENGTH } from '@/lib/validation'
import { DEV_PASSWORD } from '../prisma/seed/data'

const PASSWORD = 'un-secret-de-test-assez-long'
const [DANIEL, JAURES] = SUPER_ADMINS.map((a) => a.email)

type FakeUser = {
  id: string
  email: string
  fullName: string
  role: string
  adminRole: string | null
  passwordHash: string | null
  deletedAt: Date | null
}

/** Juste ce que le script appelle, et le journal de chaque écriture. */
function fakeDb(initial: Array<Partial<FakeUser> & { email: string }> = []) {
  const users = new Map<string, FakeUser>()
  const writes: string[] = []
  const audits: Array<Record<string, unknown>> = []
  let next = 0
  for (const u of initial) {
    users.set(u.email, {
      id: `u${++next}`, fullName: u.email, role: 'ADMIN', adminRole: 'SUPER_ADMIN',
      passwordHash: 'haché-existant', deletedAt: null, ...u,
    })
  }

  const db = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        const u = users.get(where.email)
        return u ? { id: u.id, role: u.role, adminRole: u.adminRole, deletedAt: u.deletedAt } : null
      },
      create: async ({ data }: { data: Omit<FakeUser, 'id' | 'deletedAt'> }) => {
        writes.push(`create ${data.email}`)
        const id = `u${++next}`
        users.set(data.email, { id, deletedAt: null, ...data })
        return { id }
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const u = [...users.values()].find((x) => x.id === where.id)!
        writes.push(`update ${u.email}`)
        Object.assign(u, data)
        return { id: u.id }
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data)
        return data
      },
    },
  }

  return { db: db as unknown as PrismaClient, users, writes, audits }
}

describe('Amorçage des Super-admins sans mot de passe en dur', () => {
  it('refuse de créer les comptes sans BOOTSTRAP_ADMIN_PASSWORD, sans rien écrire', async () => {
    const { db, writes, audits } = fakeDb()

    const run = bootstrapSuperAdmins(db, {})
    await expect(run).rejects.toBeInstanceOf(BootstrapPasswordError)
    await expect(run).rejects.toThrow(/BOOTSTRAP_ADMIN_PASSWORD/)
    await expect(run).rejects.toThrow(new RegExp(`${DANIEL}.*${JAURES}`))
    expect(writes).toEqual([])
    expect(audits).toEqual([])
  })

  it('traite la chaîne vide comme une absence', async () => {
    // Le cas du staging : `-e BOOTSTRAP_ADMIN_PASSWORD="$(grep …)"` transmet ''
    // quand le .env du serveur n'a pas la ligne. L'ancien code hachait ''.
    const { db, writes } = fakeDb()

    await expect(bootstrapSuperAdmins(db, { password: '' })).rejects.toBeInstanceOf(BootstrapPasswordError)
    expect(writes).toEqual([])
  })

  it('refuse un mot de passe plus court que celui exigé à l\'inscription', async () => {
    const { db, writes } = fakeDb()

    await expect(bootstrapSuperAdmins(db, { password: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) }))
      .rejects.toThrow(/trop court/)
    expect(writes).toEqual([])
  })

  it("aligne son minimum sur celui de l'application", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(APP_MIN_PASSWORD_LENGTH)
  })

  it('crée les deux comptes avec le mot de passe fourni, et lui seul', async () => {
    const { db, users, audits } = fakeDb()

    const results = await bootstrapSuperAdmins(db, { password: PASSWORD })

    expect(results).toEqual([
      { email: DANIEL, action: 'créé' },
      { email: JAURES, action: 'créé' },
    ])
    for (const email of [DANIEL, JAURES]) {
      const u = users.get(email)!
      expect(u.role).toBe('ADMIN')
      expect(u.adminRole).toBe('SUPER_ADMIN')
      expect(await verifyPassword(PASSWORD, u.passwordHash!)).toBe(true)
      // L'ancien mot de passe par défaut, resté public dans l'historique Git.
      expect(await verifyPassword(DEV_PASSWORD, u.passwordHash!)).toBe(false)
    }
    expect(users.get(DANIEL)!.passwordHash).not.toBe(users.get(JAURES)!.passwordHash)
    expect(audits.map((a) => a.action)).toEqual(['SUPER_ADMIN_BOOTSTRAPPED', 'SUPER_ADMIN_BOOTSTRAPPED'])
  })

  it('laisse passer un déploiement ordinaire sans mot de passe', async () => {
    const { db, writes } = fakeDb([{ email: DANIEL }, { email: JAURES }])

    const results = await bootstrapSuperAdmins(db, {})

    expect(results.map((r) => r.action)).toEqual(['déjà en place', 'déjà en place'])
    expect(writes).toEqual([])
  })

  it('rétablit un rôle sans mot de passe, sans toucher au haché', async () => {
    const { db, users } = fakeDb([{ email: DANIEL, role: 'LEARNER', adminRole: null }, { email: JAURES }])

    const results = await bootstrapSuperAdmins(db, {})

    expect(results[0]).toEqual({ email: DANIEL, action: 'rôle rétabli' })
    expect(users.get(DANIEL)!.adminRole).toBe('SUPER_ADMIN')
    expect(users.get(DANIEL)!.passwordHash).toBe('haché-existant')
  })

  it('refuse --reset-password sans mot de passe, sans rien réécrire', async () => {
    const { db, users, writes } = fakeDb([{ email: DANIEL }, { email: JAURES }])

    await expect(bootstrapSuperAdmins(db, { resetPassword: true }))
      .rejects.toThrow(/réinitialiser le mot de passe/)
    expect(writes).toEqual([])
    expect(users.get(DANIEL)!.passwordHash).toBe('haché-existant')
  })

  it('refuse avant la première écriture quand un seul compte manque', async () => {
    // Daniel existe mais a été rétrogradé : sans la lecture préalable, son rôle
    // serait rétabli avant que le refus ne tombe sur le compte de Jaures.
    const { db, users, writes } = fakeDb([{ email: DANIEL, role: 'LEARNER', adminRole: null }])

    await expect(bootstrapSuperAdmins(db, {})).rejects.toThrow(new RegExp(`créer ${JAURES}`))
    expect(writes).toEqual([])
    expect(users.get(DANIEL)!.adminRole).toBeNull()
  })

  it('ne porte plus aucun mot de passe écrit dans le script', () => {
    const source = readFileSync(new URL('../scripts/bootstrap-admins.mjs', import.meta.url), 'utf8')
    expect(source).not.toContain(DEV_PASSWORD)
    expect(source).not.toMatch(/DEFAULT_PASSWORD/)
  })

  it('le mot de passe de démonstration du seed passe le minimum', () => {
    // Le seed retombe dessus quand BOOTSTRAP_ADMIN_PASSWORD est vide : trop
    // court, il ferait échouer `npm run db:seed` en dev.
    expect(DEV_PASSWORD.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH)
  })
})
