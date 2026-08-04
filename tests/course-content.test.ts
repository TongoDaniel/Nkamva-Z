// ==========================================================================
// Contenu d'une ressource et quota de stockage (arbitrage 54)
// ==========================================================================
// La chaîne était rompue en trois endroits : aucun écran ne déposait le
// contenu, la présignature n'enregistrait rien, et la lecture signait une clé
// devinée. Ces tests tiennent les deux bouts qui vivent côté serveur.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  createCourse, publishCourse, presignCourseUpload, confirmCourseUpload,
  trainerStorage, TRAINER_STORAGE_QUOTA_BYTES,
} from '@/lib/courses'
import { getCourseContentUrl } from '@/lib/access'

describe('Contenu de ressource et quota', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const course = await createCourse(profile.id, user.id, {
      title: 'Masterclass Node.js', blurb: 'Apprenez Node.js', description: 'Un cours complet.',
      category: 'dev', format: 'video', priceFcfa: 15000, durationSeconds: 3600,
    })
    return { user, profile, course }
  }

  it('publier exige un contenu déposé', async () => {
    const { user, profile, course } = await setup()

    // C'est le cœur du défaut : une ressource sans contenu pouvait être publiée,
    // donc vendue, et l'acheteur ne le découvrait qu'après paiement.
    await expect(publishCourse(course.id, profile.id, user.id)).rejects.toThrow('CONTENT_REQUIRED')

    await confirmCourseUpload(course.id, profile.id, user.id, {
      s3Key: `course-assets/${course.id}/video-abc.mp4`,
      kind: 'video',
      mimeType: 'video/mp4',
    })

    const published = await publishCourse(course.id, profile.id, user.id)
    expect(published.status).toBe('published')
  })

  it('la confirmation enregistre la clé, et c\'est elle qui est servie à l\'acheteur', async () => {
    const { user, profile, course } = await setup()
    const s3Key = `course-assets/${course.id}/video-xyz.mp4`

    await confirmCourseUpload(course.id, profile.id, user.id, { s3Key, kind: 'video', mimeType: 'video/mp4' })
    await publishCourse(course.id, profile.id, user.id)

    const learner = await prisma.user.create({ data: { email: 'apprenant@test.com', role: 'LEARNER' } })
    await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: 15000, commissionRate: 0.15, trainerShareFcfa: 12750, platformShareFcfa: 2250,
        provider: 'STRIPE', providerTransactionId: `pi_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
      },
    })

    const { url } = await getCourseContentUrl(course.id, learner.id)
    // Sans identifiants R2 l'URL est un repli, mais elle porte la vraie clé —
    // celle que le formateur a déposée, et non `course-content/…/main.mp4`.
    expect(decodeURIComponent(url)).toContain(s3Key)
  })

  it('une ressource sans contenu répond CONTENT_UNAVAILABLE plutôt qu\'une URL morte', async () => {
    const { profile, course } = await setup()
    const learner = await prisma.user.create({ data: { email: 'apprenant@test.com', role: 'LEARNER' } })
    await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: 15000, commissionRate: 0.15, trainerShareFcfa: 12750, platformShareFcfa: 2250,
        provider: 'STRIPE', providerTransactionId: `pi_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
      },
    })

    await expect(getCourseContentUrl(course.id, learner.id)).rejects.toThrow('CONTENT_UNAVAILABLE')
  })

  it('refuse de rattacher une clé émise pour une autre ressource', async () => {
    const { user, profile, course } = await setup()

    await expect(
      confirmCourseUpload(course.id, profile.id, user.id, {
        s3Key: 'course-assets/00000000-0000-0000-0000-000000000000/video-vole.mp4',
        kind: 'video',
        mimeType: 'video/mp4',
      }),
    ).rejects.toThrow('UPLOAD_NOT_FOUND')
  })

  it('le quota compte le contenu et la couverture, et borne la présignature', async () => {
    const { user, profile, course } = await setup()

    expect((await trainerStorage(profile.id)).usedBytes).toBe(0)

    // La taille vient de l'objet réel ; sans R2 configuré `headObject` renvoie
    // null, on la pose donc directement pour éprouver le calcul.
    await confirmCourseUpload(course.id, profile.id, user.id, {
      s3Key: `course-assets/${course.id}/video-a.mp4`, kind: 'video', mimeType: 'video/mp4',
    })
    await prisma.course.update({
      where: { id: course.id },
      data: { contentSizeBytes: BigInt(39 * 1024 ** 3), coverSizeBytes: BigInt(1024 ** 2) },
    })

    const storage = await trainerStorage(profile.id)
    expect(storage.usedBytes).toBe(39 * 1024 ** 3 + 1024 ** 2)
    expect(storage.quotaBytes).toBe(TRAINER_STORAGE_QUOTA_BYTES)

    // Il reste moins d'un Go. Une vidéo de 2 Go passe la limite par fichier —
    // c'est exactement le maximum autorisé — mais plus le quota : c'est bien la
    // seconde garde qui doit parler, et avant toute URL d'envoi.
    await expect(
      presignCourseUpload(course.id, profile.id, {
        mimeType: 'video/mp4', sizeBytes: 2 * 1024 ** 3, kind: 'video',
      }),
    ).rejects.toThrow('STORAGE_QUOTA_EXCEEDED')

    // Un fichier qui tient dans le reste passe.
    const ok = await presignCourseUpload(course.id, profile.id, {
      mimeType: 'application/pdf', sizeBytes: 1024 ** 2, kind: 'pdf',
    })
    expect(ok.s3Key).toContain(`course-assets/${course.id}/`)
  })
})
