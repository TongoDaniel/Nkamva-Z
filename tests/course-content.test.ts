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
  deleteCourseContent, trainerStorage, TRAINER_STORAGE_QUOTA_BYTES,
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

  // --- Archives (.zip / .rar) ---
  //
  // Trois des cinq formats proposés à la saisie — kit, modèle Notion, tableur —
  // n'avaient aucun type de fichier acceptable : ni MP4 ni PDF ne les portent.
  // Ils étaient donc impubliables, `publishCourse` exigeant un contenu.

  it('accepte une archive, et la clé porte l\'extension réelle', async () => {
    const { profile, course } = await setup()

    const zip = await presignCourseUpload(course.id, profile.id, {
      mimeType: 'application/zip', sizeBytes: 5 * 1024 ** 2, kind: 'archive',
    })
    expect(zip.s3Key).toMatch(/\.zip$/)

    // `mimeType.split('/')[1]` aurait donné `vnd.rar` — c'est bien l'extension
    // qui doit finir dans la clé, pas le sous-type MIME.
    const rar = await presignCourseUpload(course.id, profile.id, {
      mimeType: 'application/vnd.rar', sizeBytes: 5 * 1024 ** 2, kind: 'archive',
    })
    expect(rar.s3Key).toMatch(/\.rar$/)

    // Windows annonce les .zip sous ce type-là : le refuser bloquerait la
    // moitié des formateurs.
    const windowsZip = await presignCourseUpload(course.id, profile.id, {
      mimeType: 'application/x-zip-compressed', sizeBytes: 1024 ** 2, kind: 'archive',
    })
    expect(windowsZip.s3Key).toMatch(/\.zip$/)
  })

  it('refuse un type qui n\'est pas une archive sous le genre archive', async () => {
    const { profile, course } = await setup()

    await expect(
      presignCourseUpload(course.id, profile.id, {
        mimeType: 'application/x-msdownload', sizeBytes: 1024, kind: 'archive',
      }),
    ).rejects.toThrow('MIME_NOT_ALLOWED')
  })

  it('une archive suffit à rendre une ressource publiable', async () => {
    const { user, profile } = await setup()
    const kit = await createCourse(profile.id, user.id, {
      title: 'Kit de démarrage produit', blurb: 'Tous les gabarits',
      description: 'Un dossier complet.', category: 'business', format: 'kit', priceFcfa: 9000,
    })

    await expect(publishCourse(kit.id, profile.id, user.id)).rejects.toThrow('CONTENT_REQUIRED')

    await confirmCourseUpload(kit.id, profile.id, user.id, {
      s3Key: `course-assets/${kit.id}/archive-abc.zip`,
      kind: 'archive',
      mimeType: 'application/zip',
    })

    const published = await publishCourse(kit.id, profile.id, user.id)
    expect(published.status).toBe('published')
    expect(published.contentMimeType).toBe('application/zip')
  })

  // =========================================================================
  // Suppression du contenu — arbitrage 18
  // =========================================================================
  // Le geste n'existait pas : le quota d'un formateur ne pouvait que croître
  // depuis son inscription. Seule la purge des replays à 24 mois lui rendait
  // de la place, alors que `setTrainerStorageTiers` lui conseillait de
  // « libérer de l'espace d'abord ».
  //
  // ⚠️ Aucun objet n'est réellement supprimé ici : `tests/setup.ts` neutralise
  // les variables `AWS_*`, donc `deleteObject` sort sans client. C'est ce qui
  // rend ces tests sûrs à jouer — le `.env` de dev pointe sur le seau de
  // production.

  async function withContent(profileId: string, userId: string, bytes: number) {
    const course = await createCourse(profileId, userId, {
      title: 'Ressource à effacer', blurb: 'Accroche', description: 'Description',
      category: 'dev', format: 'video', priceFcfa: 12000,
    })
    await confirmCourseUpload(course.id, profileId, userId, {
      s3Key: `course-assets/${course.id}/content-abc.mp4`,
      kind: 'video',
      mimeType: 'video/mp4',
    })
    // Comme plus haut : sans R2 configuré, `headObject` rend null et la taille
    // ne s'enregistre pas. On la pose pour éprouver ce qui est rendu au quota.
    return prisma.course.update({
      where: { id: course.id },
      data: { contentSizeBytes: BigInt(bytes) },
    })
  }

  it('supprimer le contenu rend les octets et laisse la fiche', async () => {
    const { user, profile } = await setup()
    const course = await withContent(profile.id, user.id, 500_000)
    expect((await trainerStorage(profile.id)).usedBytes).toBe(500_000)

    const after = await deleteCourseContent(course.id, profile.id, user.id)

    expect(after.contentS3Key).toBeNull()
    expect(after.contentSizeBytes).toBeNull()
    expect(after.contentMimeType).toBeNull()
    expect((await trainerStorage(profile.id)).usedBytes).toBe(0)
    // La fiche reste : rien en aval ne casse.
    expect(await prisma.course.findUnique({ where: { id: course.id } })).not.toBeNull()
    expect(after.title).toBe('Ressource à effacer')
  })

  it('la ressource repasse en brouillon plutôt que de rester publiée sans contenu', async () => {
    const { user, profile } = await setup()
    const course = await withContent(profile.id, user.id, 500_000)
    await publishCourse(course.id, profile.id, user.id)

    const after = await deleteCourseContent(course.id, profile.id, user.id)

    // Publiée sans contenu, elle serait achetable et livrerait du vide.
    expect(after.status).toBe('draft')
  })

  it('une ressource vendue ne peut pas être vidée de son contenu', async () => {
    const { user, profile } = await setup()
    const course = await withContent(profile.id, user.id, 500_000)
    await prisma.course.update({
      where: { id: course.id }, data: { obligationAt: new Date() },
    })

    await expect(deleteCourseContent(course.id, profile.id, user.id))
      .rejects.toThrow('COURSE_SOLD')

    // Elle reste servie à ses acheteurs — et ne lui est plus comptée.
    const intact = await prisma.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(intact.contentS3Key).not.toBeNull()
    expect((await trainerStorage(profile.id)).usedBytes).toBe(0)
  })

  it('supprimer un contenu absent est refusé, et un autre formateur ne peut rien effacer', async () => {
    const { user, profile } = await setup()
    const vide = await createCourse(profile.id, user.id, {
      title: 'Sans contenu', blurb: 'Accroche', description: 'Description',
      category: 'dev', format: 'video', priceFcfa: 8000,
    })
    await expect(deleteCourseContent(vide.id, profile.id, user.id)).rejects.toThrow('NO_CONTENT')

    const course = await withContent(profile.id, user.id, 500_000)
    const autre = await prisma.user.create({ data: { email: 'autre@test.com', role: 'TRAINER' } })
    const autreProfil = await prisma.trainerProfile.create({
      data: { userId: autre.id, approvedAt: new Date() },
    })
    await expect(deleteCourseContent(course.id, autreProfil.id, autre.id))
      .rejects.toThrow('NOT_OWNER')
  })
})
