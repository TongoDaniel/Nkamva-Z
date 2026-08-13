// ==========================================================================
// Sanctions de compte — le garde de la route (décision 67)
// ==========================================================================
// Le service refusait déjà l'exclusion à la Modération, et il était testé. Ce
// n'était pas suffisant : la **route** exigeait `SUPER_ADMIN` pour tout, si
// bien que la moitié de la décision 67 était inatteignable — la Modération
// instruisait un signalement visant un compte sans pouvoir en tirer la seule
// conséquence qui lui revienne.
//
// Ces tests tiennent les deux bords à la fois : ce que la Modération peut
// faire, et ce qu'elle ne peut pas. Un test qui ne vérifierait que le premier
// laisserait passer une route ouverte à tous.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { POST as sanctionRoute } from '@/app/api/admin/users/[userId]/sanction/route'

const MOTIF = 'Propos haineux répétés dans le salon, constatés sur trois signalements.'

type SessionUser = {
  id: string
  role: 'LEARNER' | 'TRAINER' | 'ADMIN'
  adminRole?: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION' | null
}

function signInAs(user: SessionUser | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    user ? ({ user: { email: 'x@test.com', adminRole: null, trainerId: null, ...user } } as never) : null,
  )
}

function call(userId: string, body: unknown) {
  const request = new Request(`http://test/api/admin/users/${userId}/sanction`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return sanctionRoute(request, { params: Promise.resolve({ userId }) })
}

describe('Route de sanction', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function fixtures() {
    const target = await prisma.user.create({
      data: { email: 'membre@test.com', role: 'LEARNER', fullName: 'Koffi N\'Da' },
    })
    const moderator = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const superAdmin = await prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { target, moderator, superAdmin }
  }

  const levelOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { sanctionLevel: true } })).sanctionLevel

  it('décision 67 — la Modération met en lecture seule', async () => {
    const { target, moderator } = await fixtures()
    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })

    const response = await call(target.id, { level: 'RESTRICTED', reason: MOTIF })

    expect(response.status).toBe(200)
    expect(await levelOf(target.id)).toBe('RESTRICTED')
  })

  it('décision 67 — la Modération ne coupe pas la connexion', async () => {
    const { target, moderator } = await fixtures()
    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })

    const response = await call(target.id, { level: 'BANNED', reason: MOTIF })

    // Couper l'accès retire des ressources **payées** : le refus vient du
    // service, la route ne fait que le laisser passer sans le masquer.
    expect(response.status).toBe(403)
    expect(await levelOf(target.id)).toBe('NONE')
  })

  it('décision 67 — le Super-admin ferme le compte, et lui seul le rouvre', async () => {
    const { target, moderator, superAdmin } = await fixtures()

    signInAs({ id: superAdmin.id, role: 'ADMIN', adminRole: 'SUPER_ADMIN' })
    expect((await call(target.id, { level: 'BANNED', reason: MOTIF })).status).toBe(200)
    expect(await levelOf(target.id)).toBe('BANNED')

    // Rendre l'accès à quelqu'un qu'on en a privé pèse autant que la privation.
    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    expect((await call(target.id, { level: 'NONE', reason: MOTIF })).status).toBe(403)
    expect(await levelOf(target.id)).toBe('BANNED')
  })

  it('décision 7 — Finances n\'a rien à faire dans la modération', async () => {
    const { target } = await fixtures()
    const finances = await prisma.user.create({
      data: { email: 'finances@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    signInAs({ id: finances.id, role: 'ADMIN', adminRole: 'FINANCES' })

    expect((await call(target.id, { level: 'RESTRICTED', reason: MOTIF })).status).toBe(403)
    expect(await levelOf(target.id)).toBe('NONE')
  })

  it('un motif trop court est refusé avant d\'atteindre le service', async () => {
    const { target, moderator } = await fixtures()
    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })

    expect((await call(target.id, { level: 'RESTRICTED', reason: 'spam' })).status).toBe(400)
    expect(await levelOf(target.id)).toBe('NONE')
  })

  it('sans session, rien ne passe', async () => {
    const { target } = await fixtures()
    signInAs(null)

    expect((await call(target.id, { level: 'RESTRICTED', reason: MOTIF })).status).toBe(401)
    expect(await levelOf(target.id)).toBe('NONE')
  })
})
