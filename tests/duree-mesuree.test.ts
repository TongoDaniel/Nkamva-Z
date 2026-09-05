// ==========================================================================
// Lot 6 — Ce que la confirmation du téléversement écrit (F3.8, F3.9)
// ==========================================================================
// Deux règles se rejoignent ici, au même endroit et pour la même raison que la
// taille du fichier y était déjà relue : **ce qui est vérifiable est mesuré,
// pas déclaré**.
//
//   · La durée d'une vidéo est lue dans le fichier déposé, et réécrite à
//     chaque dépôt — `null` compris. Sans cela, la durée d'un fichier remplacé
//     survivrait à ce qu'elle décrivait, et continuerait d'arbitrer la
//     progression *et* le seuil de consommation d'un litige.
//   · Le genre du fichier doit être celui que la fiche annonce. Une ressource
//     déclarée « Vidéo » portant un PDF donnait un écran noir dans une balise
//     `<video>` — c'est le défaut que l'audit a rencontré, et il ne se corrige
//     pas dans le lecteur.
//
// Le stockage est simulé : les tests n'écrivent pas dans le seau, ils servent
// des intervalles sur un MP4 fabriqué en mémoire.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/** Le fichier que le stockage simulé sert. Réaffecté par chaque test. */
let objet: Buffer | null = null

vi.mock('@/lib/s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/s3')>()),
  headObject: vi.fn(async () =>
    objet ? { contentLength: objet.length, contentType: 'video/mp4' } : null,
  ),
  // Le contrôle de nombre magique est neutralisé : il a ses propres tests, et
  // ce qui se joue ici est la mesure, pas la reconnaissance du format.
  validateMagicNumber: vi.fn(async () => {}),
  getRange: vi.fn(async (_key: string, start: number, end: number) => {
    if (!objet || start >= objet.length) return null
    return objet.subarray(start, Math.min(end + 1, objet.length))
  }),
}))

import { prisma, cleanDatabase } from './setup'
import { createCourse, updateCourse, confirmCourseUpload } from '@/lib/courses'

// --- Fabrique de MP4 ------------------------------------------------------

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(payload.length + 8, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

/** Un MP4 dont `moov` est **après** les images : le cas le plus courant. */
function mp4(durationSeconds: number, padding = 4096): Buffer {
  const timescale = 600
  const mvhd = Buffer.alloc(100)
  mvhd.writeUInt8(0, 0)
  mvhd.writeUInt32BE(timescale, 12)
  mvhd.writeUInt32BE(durationSeconds * timescale, 16)
  return Buffer.concat([
    box('ftyp', Buffer.from('isomiso2mp41', 'latin1')),
    box('mdat', Buffer.alloc(padding)),
    box('moov', box('mvhd', mvhd)),
  ])
}

describe('Lot 6 — durée mesurée et cohérence du format', () => {
  beforeEach(async () => { await cleanDatabase(); objet = null })
  afterEach(async () => { await cleanDatabase(); objet = null })

  async function formateur() {
    const user = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    return { user, profile }
  }

  async function ressource(profileId: string, userId: string, format: string) {
    return createCourse(profileId, userId, {
      title: `Ressource ${format}`,
      blurb: 'Une accroche de test',
      description: 'Une description de test, assez longue.',
      category: 'dev',
      format,
      priceFcfa: 15_000,
    })
  }

  /** Le dépôt, tel que l'écran l'appelle. */
  function deposer(
    courseId: string,
    profileId: string,
    userId: string,
    kind: 'video' | 'pdf' | 'archive' | 'image',
    mimeType: string,
  ) {
    return confirmCourseUpload(courseId, profileId, userId, {
      s3Key: `course-assets/${courseId}/content-abc`,
      kind,
      mimeType,
    })
  }

  // --- La mesure -----------------------------------------------------------

  it('la durée est lue sur le fichier déposé', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')
    objet = mp4(1_830)

    const maj = await deposer(course.id, profile.id, user.id, 'video', 'video/mp4')
    expect(maj.durationSeconds).toBe(1_830)
  })

  it('elle ne vient pas du formulaire : la création n\'en propose plus', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')
    expect(course.durationSeconds).toBeNull()
  })

  it('remplacer le fichier remplace la durée', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')

    objet = mp4(3_600)
    await deposer(course.id, profile.id, user.id, 'video', 'video/mp4')
    objet = mp4(600)
    const maj = await deposer(course.id, profile.id, user.id, 'video', 'video/mp4')

    // Sans réécriture, les quatre heures du premier fichier auraient continué
    // de décrire les dix minutes du second — et de refuser des remboursements.
    expect(maj.durationSeconds).toBe(600)
  })

  it('une vidéo illisible n\'a pas de durée, et se publie quand même', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')

    // Un conteneur sans `moov` : reconnu comme MP4, mais muet sur sa durée.
    objet = Buffer.concat([
      box('ftyp', Buffer.from('isomiso2mp41', 'latin1')),
      box('mdat', Buffer.alloc(2048)),
    ])
    const maj = await deposer(course.id, profile.id, user.id, 'video', 'video/mp4')

    expect(maj.durationSeconds).toBeNull()
    // Ce qui compte : le contenu est bien rattaché. Une métadonnée illisible
    // ne vaut pas une vente refusée.
    expect(maj.contentS3Key).toContain(course.id)
    expect(Number(maj.contentSizeBytes)).toBeGreaterThan(0)
  })

  it('un contenu qui n\'est pas une vidéo n\'a pas de durée du tout', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'pdf')
    objet = Buffer.from('%PDF-1.4 fictif')

    const maj = await deposer(course.id, profile.id, user.id, 'pdf', 'application/pdf')
    expect(maj.durationSeconds).toBeNull()
  })

  it('une couverture ne touche ni au contenu ni à la durée', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')

    objet = mp4(900)
    await deposer(course.id, profile.id, user.id, 'video', 'video/mp4')
    objet = Buffer.from('image fictive')
    const maj = await deposer(course.id, profile.id, user.id, 'image', 'image/png')

    expect(maj.coverS3Key).toContain(course.id)
    expect(maj.durationSeconds).toBe(900)
  })

  it('la durée mesurée est journalisée', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')
    objet = mp4(2_400)
    await deposer(course.id, profile.id, user.id, 'video', 'video/mp4')

    const trace = await prisma.auditLog.findFirst({
      where: { targetId: course.id, action: 'COURSE_CONTENT_UPLOADED' },
    })
    // Personne n'a saisi ce chiffre : le formateur doit pouvoir retrouver d'où
    // il vient.
    expect((trace?.meta as { durationSeconds?: number } | null)?.durationSeconds).toBe(2_400)
  })

  // --- La cohérence entre l'annonce et le fichier --------------------------

  it('un PDF déposé sous une ressource « vidéo » est refusé', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')
    objet = Buffer.from('%PDF-1.4 fictif')

    await expect(deposer(course.id, profile.id, user.id, 'pdf', 'application/pdf'))
      .rejects.toThrow('CONTENT_FORMAT_MISMATCH')
  })

  it('une vidéo déposée sous une ressource « PDF » est refusée', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'pdf')
    objet = mp4(600)

    await expect(deposer(course.id, profile.id, user.id, 'video', 'video/mp4'))
      .rejects.toThrow('CONTENT_FORMAT_MISMATCH')
  })

  it('les trois formats téléchargeables acceptent la même archive', async () => {
    const { user, profile } = await formateur()
    objet = Buffer.from('PK fictif')

    for (const format of ['kit', 'notion', 'tableur']) {
      const course = await ressource(profile.id, user.id, format)
      const maj = await deposer(course.id, profile.id, user.id, 'archive', 'application/zip')
      expect(maj.contentMimeType).toBe('application/zip')
    }
  })

  it('changer de format vers un genre incompatible est refusé tant que le fichier est là', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')
    objet = mp4(1_200)
    await deposer(course.id, profile.id, user.id, 'video', 'video/mp4')

    // Sans cette garde, le refus au dépôt se contournait par l'écran d'édition :
    // déposer une vidéo, puis annoncer un PDF.
    await expect(updateCourse(course.id, profile.id, user.id, { format: 'pdf' }))
      .rejects.toThrow('FORMAT_CONTRADICTS_CONTENT')
  })

  it('passer d\'un format téléchargeable à un autre reste libre', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'kit')
    objet = Buffer.from('PK fictif')
    await deposer(course.id, profile.id, user.id, 'archive', 'application/zip')

    // Kit, modèle et tableur se livrent tous en archive : ce qui change est le
    // mot, pas le fichier.
    const maj = await updateCourse(course.id, profile.id, user.id, { format: 'tableur' })
    expect(maj.format).toBe('tableur')
  })

  it('sans contenu déposé, le format se change librement', async () => {
    const { user, profile } = await formateur()
    const course = await ressource(profile.id, user.id, 'video')

    const maj = await updateCourse(course.id, profile.id, user.id, { format: 'pdf' })
    expect(maj.format).toBe('pdf')
  })
})
