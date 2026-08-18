// ==========================================================================
// Publier une ressource — le motif du refus doit atteindre le formateur
// ==========================================================================
// `publishCourse` refuse pour cinq raisons, mais la route n'en traduisait que
// trois. Les deux oubliées — `CONTENT_REQUIRED` et `SUBSCRIPTION_SUSPENDED` —
// tombaient dans le fourre-tout 500 « Erreur » : les seuls refus qui disent au
// formateur quoi faire étaient précisément ceux qu'on écrasait. Le service
// était testé (cf. course-content.test.ts), la frontière HTTP ne l'était pas.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { createCourse } from '@/lib/courses'
import { POST as publishRoute } from '@/app/api/trainer/courses/[courseId]/publish/route'

function signInAsTrainer(userId: string, trainerId: string) {
  vi.mocked(getServerSession).mockResolvedValue(
    { user: { id: userId, email: 'formateur@test.com', role: 'TRAINER', adminRole: null, trainerId } } as never,
  )
}

function publish(courseId: string) {
  return publishRoute(
    new Request(`http://localhost/api/trainer/courses/${courseId}/publish`, { method: 'POST' }),
    { params: Promise.resolve({ courseId }) },
  )
}

describe('Route de publication — motifs de refus', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function setup() {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const course = await createCourse(profile.id, user.id, {
      title: 'Bonjour', blurb: 'Un kit pour démarrer', description: 'Un kit complet.',
      category: 'dev', format: 'kit', priceFcfa: 40000,
    })
    return { user, profile, course }
  }

  it('un brouillon sans contenu est refusé en 422, avec le geste à faire', async () => {
    const { user, profile, course } = await setup()
    signInAsTrainer(user.id, profile.id)

    const res = await publish(course.id)
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.code).toBe('CONTENT_REQUIRED')
    // C'est cette phrase qui manquait à l'écran : le toast affichait « Erreur ».
    expect(body.error.message).toContain('Déposez le contenu')

    // Et le brouillon reste un brouillon.
    const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.status).toBe('draft')
  })

  it('avec un contenu déposé, la publication passe', async () => {
    const { user, profile, course } = await setup()
    signInAsTrainer(user.id, profile.id)
    await prisma.course.update({
      where: { id: course.id },
      data: {
        contentS3Key: `course-assets/${course.id}/kit.zip`,
        contentSizeBytes: 2048,
        contentMimeType: 'application/zip',
      },
    })

    const res = await publish(course.id)
    expect(res.status).toBe(200)

    const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.status).toBe('published')
  })
})
