// ==========================================================================
// Adresse jamais vérifiée — campagne du 12 octobre 2026, M6
// ==========================================================================
// Inscription par le formulaire, abandon sur l'écran du code, puis connexion
// par mot de passe : session valide, et l'on pouvait acheter, candidater et
// devenir formateur avec une adresse qu'on ne contrôle pas. Seules les
// invitations exigeaient la vérification.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { POST as initiatePurchaseRoute } from '@/app/api/purchases/initiate/route'
import { POST as joinRoute } from '@/app/api/communities/[slug]/adhesion/route'
import { POST as submitApplicationRoute } from '@/app/api/trainer-applications/me/submit/route'

function signInAs(id: string) {
  vi.mocked(getServerSession).mockResolvedValue(
    { user: { id, email: 'x@test.com', role: 'LEARNER', adminRole: null, trainerId: null } } as never,
  )
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/x', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('M6 — une adresse jamais vérifiée ne paie pas et ne candidate pas', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function fixtures(verified: boolean) {
    const learner = await prisma.user.create({
      data: { email: 'paul@test.com', role: 'LEARNER', emailVerifiedAt: verified ? new Date() : null },
    })
    const trainerUser = await prisma.user.create({ data: { email: 'awa@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id, approvedAt: new Date() } })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'cours', title: 'Cours', blurb: 'Accroche', description: 'Description',
        category: 'dev', format: 'pdf', priceFcfa: 5000, status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/doc.pdf', contentMimeType: 'application/pdf',
      },
    })
    await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Atelier', slug: 'atelier', priceFcfa: 2500 },
    })
    signInAs(learner.id)
    return { learner, course }
  }

  it('acheter, adhérer et candidater sont refusés, avec la marche à suivre', async () => {
    const { course } = await fixtures(false)
    const params = { params: Promise.resolve({ slug: 'atelier' }) }

    const responses = [
      await initiatePurchaseRoute(jsonRequest({ courseId: course.id, provider: 'STRIPE' })),
      await joinRoute(jsonRequest({ provider: 'STRIPE' }), params),
      await submitApplicationRoute(),
    ]
    for (const res of responses) {
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('EMAIL_NOT_VERIFIED')
      expect(body.error.message).toMatch(/Profil/)
    }
    // Rien n'a été ouvert chez le fournisseur.
    expect(await prisma.purchase.count()).toBe(0)
  })

  it('une adresse vérifiée paie comme avant', async () => {
    const { course } = await fixtures(true)

    const res = await initiatePurchaseRoute(jsonRequest({ courseId: course.id, provider: 'STRIPE' }))
    expect(res.status).not.toBe(403)
  })
})
