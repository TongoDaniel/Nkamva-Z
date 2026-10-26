// ==========================================================================
// Une ressource ne se vend pas sans fichier — campagne du 12 octobre 2026, B2
// ==========================================================================
// La confirmation du dépôt ne contrôlait l'objet **que s'il existait** : une
// clé jamais écrite, voire inventée, entrait en base avec une taille de 0. La
// ressource se publiait, se vendait, se facturait, et l'acheteur recevait un
// `NoSuchKey`.
//
// Le stockage est simulé **et déclaré configuré** : c'est précisément le cas
// où un `headObject` nul veut dire « absent », et non « mode dev ».

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/** Les clés que le stockage simulé connaît. Réaffecté par chaque test. */
let presentes = new Set<string>()

vi.mock('@/lib/s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/s3')>()),
  isS3Configured: vi.fn(() => true),
  headObject: vi.fn(async (key: string) =>
    presentes.has(key) ? { contentLength: 4096, contentType: 'application/pdf' } : null,
  ),
  validateMagicNumber: vi.fn(async () => {}),
  // La mesure des pages a ses propres tests ; ici, elle ne trouve rien.
  getRange: vi.fn(async () => null),
}))

import { prisma, cleanDatabase } from './setup'
import { createCourse, confirmCourseUpload, publishCourse } from '@/lib/courses'

describe('Fichier absent du stockage', () => {
  beforeEach(async () => { presentes = new Set(); await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const user = await prisma.user.create({ data: { email: 'formatrice@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, verifiedLegalName: 'Mariam Diallo', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const course = await createCourse(profile.id, user.id, {
      title: 'Ressource fantôme', blurb: 'Accroche', description: 'Un document.',
      category: 'dev', format: 'pdf', priceFcfa: 5000,
    })
    return { user, profile, course }
  }

  it('la confirmation refuse une clé émise mais jamais écrite', async () => {
    const { user, profile, course } = await setup()
    const s3Key = `course-assets/${course.id}/pdf-jamais-envoye.pdf`

    await expect(
      confirmCourseUpload(course.id, profile.id, user.id, { s3Key, kind: 'pdf', mimeType: 'application/pdf' }),
    ).rejects.toThrow('UPLOAD_NOT_FOUND')

    // Rien n'est entré en base : la ressource n'a toujours pas de contenu.
    const fresh = await prisma.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(fresh.contentS3Key).toBeNull()
    await expect(publishCourse(course.id, profile.id, user.id)).rejects.toThrow('CONTENT_REQUIRED')
  })

  it('la confirmation refuse une clé inventée sous le bon préfixe', async () => {
    const { user, profile, course } = await setup()

    await expect(
      confirmCourseUpload(course.id, profile.id, user.id, {
        s3Key: `course-assets/${course.id}/invente-de-toutes-pieces.pdf`,
        kind: 'pdf', mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('UPLOAD_NOT_FOUND')
  })

  it('un objet réellement déposé se confirme et se publie', async () => {
    const { user, profile, course } = await setup()
    const s3Key = `course-assets/${course.id}/pdf-depose.pdf`
    presentes.add(s3Key)

    await confirmCourseUpload(course.id, profile.id, user.id, { s3Key, kind: 'pdf', mimeType: 'application/pdf' })
    const published = await publishCourse(course.id, profile.id, user.id)
    expect(published.status).toBe('published')
  })

  it('la publication relit le stockage : une clé en base sans objet ne suffit pas', async () => {
    const { user, profile, course } = await setup()
    // L'état que la confirmation d'avant laissait derrière elle — ou un objet
    // disparu depuis.
    await prisma.course.update({
      where: { id: course.id },
      data: {
        contentS3Key: `course-assets/${course.id}/disparu.pdf`,
        contentSizeBytes: BigInt(0), contentMimeType: 'application/pdf',
      },
    })

    await expect(publishCourse(course.id, profile.id, user.id)).rejects.toThrow('CONTENT_REQUIRED')
    expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).status).not.toBe('published')
  })
})
