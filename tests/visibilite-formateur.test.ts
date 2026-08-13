// ==========================================================================
// Visibilité publique d'un formateur
// ==========================================================================
// Le défaut d'origine : une communauté publique s'affiche sans rien demander de
// son animateur, alors que l'annuaire exigeait une ressource publiée. La fiche
// communauté portait donc deux liens vers `/formateurs/<id>` — le nom du
// formateur et le bouton « Voir le formateur » — qui répondaient 404, juste
// au-dessus du bouton d'adhésion payant.
//
// Ces tests tiennent les trois surfaces d'accord entre elles : l'annuaire, la
// fiche et la recherche lisent le même `PUBLIC_TRAINER_WHERE`. Le dernier bloc
// vérifie que le préavis affiché au formateur dit la même chose que la règle
// qui le cache : un avertissement faux serait pire que pas d'avertissement.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { listPublicTrainers, getPublicTrainer, getTrainerVisibility } from '@/lib/trainers'
import { searchEverything } from '@/lib/search'

describe('Visibilité publique d’un formateur', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  /** Un formateur approuvé, sans rien à montrer. */
  async function makeTrainer(email = 'formateur@test.com', fullName = 'Daniel Tongo') {
    const user = await prisma.user.create({
      data: { email, role: 'TRAINER', fullName },
    })
    return prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date(), slogan: 'Développer, comprendre' },
    })
  }

  async function addCommunity(
    trainerId: string,
    over: { status?: string; visibility?: 'PUBLIC' | 'PRIVATE'; slug?: string } = {},
  ) {
    return prisma.community.create({
      data: {
        trainerId,
        name: 'Le Cercle des Développeurs',
        slug: over.slug ?? 'cercle-des-developpeurs',
        description: 'Une communauté dédiée aux étudiants et développeurs débutants',
        priceFcfa: 15000,
        status: over.status ?? 'active',
        visibility: over.visibility ?? 'PUBLIC',
      },
    })
  }

  async function addPublishedCourse(trainerId: string) {
    return prisma.course.create({
      data: {
        trainerId, slug: 'ddd', title: 'Masterclass DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
      },
    })
  }

  it('cache un formateur qui n’a ni ressource ni communauté', async () => {
    const trainer = await makeTrainer()

    expect(await listPublicTrainers()).toHaveLength(0)
    expect(await getPublicTrainer(trainer.id)).toBeNull()
  })

  it('montre un formateur qui n’a qu’une communauté publique ouverte', async () => {
    const trainer = await makeTrainer()
    await addCommunity(trainer.id)

    const listed = await listPublicTrainers()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(trainer.id)
    // La carte n'a pas de ressource à annoncer : c'est le compte de
    // communautés qui lui évite un « 0 ressource » pour toute présentation.
    expect(listed[0].publishedCount).toBe(0)
    expect(listed[0].communityCount).toBe(1)

    // Le cœur de la correction : le lien porté par la fiche communauté mène
    // désormais quelque part.
    const detail = await getPublicTrainer(trainer.id)
    expect(detail).not.toBeNull()
    expect(detail!.community?.slug).toBe('cercle-des-developpeurs')
    expect(detail!.courses).toHaveLength(0)
  })

  it('ne compte ni la communauté privée ni la communauté fermée', async () => {
    const privateOwner = await makeTrainer('prive@test.com', 'Awa Sarr')
    await addCommunity(privateOwner.id, { visibility: 'PRIVATE', slug: 'cercle-prive' })

    const closedOwner = await makeTrainer('ferme@test.com', 'Koffi Mensah')
    await addCommunity(closedOwner.id, { status: 'closed', slug: 'cercle-ferme' })

    expect(await listPublicTrainers()).toHaveLength(0)
    expect(await getPublicTrainer(privateOwner.id)).toBeNull()
    expect(await getPublicTrainer(closedOwner.id)).toBeNull()
  })

  it('cache un formateur suspendu, même s’il anime une communauté publique', async () => {
    const trainer = await makeTrainer()
    await addCommunity(trainer.id)
    await prisma.trainerProfile.update({
      where: { id: trainer.id },
      data: { suspendedAt: new Date(), suspendedReason: 'Enquête en cours' },
    })

    expect(await listPublicTrainers()).toHaveLength(0)
    expect(await getPublicTrainer(trainer.id)).toBeNull()
  })

  it('cache un formateur non approuvé, même s’il anime une communauté publique', async () => {
    const trainer = await makeTrainer()
    await addCommunity(trainer.id)
    await prisma.trainerProfile.update({
      where: { id: trainer.id },
      data: { approvedAt: null },
    })

    expect(await listPublicTrainers()).toHaveLength(0)
  })

  it('garde le filtre de recherche subordonné à la visibilité', async () => {
    // Deux `OR` au même niveau s'écrasent : sans le `AND` qui les sépare, le
    // filtre de recherche l'emporterait et ramènerait des formateurs cachés.
    const hidden = await makeTrainer('cache@test.com', 'Daniel Caché')
    const shown = await makeTrainer('visible@test.com', 'Daniel Visible')
    await addCommunity(shown.id)

    const found = await listPublicTrainers('Daniel')
    expect(found.map((t) => t.id)).toEqual([shown.id])
    expect(found.map((t) => t.id)).not.toContain(hidden.id)
  })

  it('applique la même règle à la recherche transversale', async () => {
    const hidden = await makeTrainer('cache@test.com', 'Daniel Caché')
    const shown = await makeTrainer('visible@test.com', 'Daniel Visible')
    await addCommunity(shown.id)

    const results = await searchEverything('Daniel')
    expect(results.trainers.map((t) => t.id)).toEqual([shown.id])
    expect(results.trainers.map((t) => t.id)).not.toContain(hidden.id)
  })

  describe('Ce que le formateur lit de sa propre visibilité', () => {
    it('signale l’absence totale de vitrine', async () => {
      const trainer = await makeTrainer()

      const state = await getTrainerVisibility(trainer.id)
      expect(state).toMatchObject({
        approved: true, suspended: false,
        publishedCount: 0, publicCommunityCount: 0, hiddenCommunityCount: 0,
        visible: false,
      })
    })

    it('distingue une communauté fermée d’une communauté absente', async () => {
      const trainer = await makeTrainer()
      await addCommunity(trainer.id, { visibility: 'PRIVATE' })

      const state = await getTrainerVisibility(trainer.id)
      expect(state).toMatchObject({
        publicCommunityCount: 0,
        // C'est ce compte qui fait dire « ouvrez-la » plutôt que « créez-en une ».
        hiddenCommunityCount: 1,
        visible: false,
      })
    })

    it('se tait dès que la visibilité est acquise, par l’une ou l’autre voie', async () => {
      const byCommunity = await makeTrainer('comm@test.com', 'Par la communauté')
      await addCommunity(byCommunity.id)
      const byCourse = await makeTrainer('cours@test.com', 'Par la ressource')
      await addPublishedCourse(byCourse.id)

      expect((await getTrainerVisibility(byCommunity.id))!.visible).toBe(true)
      expect((await getTrainerVisibility(byCourse.id))!.visible).toBe(true)
    })

    it('dit exactement ce que dit la règle qui cache — sur tous les cas', async () => {
      // Le préavis et le filtre sont deux lectures de la même condition. S'ils
      // divergent, un formateur voit « tout est bon » sur un profil introuvable.
      const cases: Array<{
        label: string
        build: (trainerId: string) => Promise<unknown>
        patch?: { approvedAt?: Date | null; suspendedAt?: Date | null }
      }> = [
        { label: 'rien', build: async () => {} },
        { label: 'communauté publique', build: (id) => addCommunity(id) },
        { label: 'communauté privée', build: (id) => addCommunity(id, { visibility: 'PRIVATE' }) },
        { label: 'communauté fermée', build: (id) => addCommunity(id, { status: 'closed' }) },
        { label: 'ressource publiée', build: (id) => addPublishedCourse(id) },
        {
          label: 'communauté publique mais suspendu',
          build: (id) => addCommunity(id),
          patch: { suspendedAt: new Date() },
        },
        {
          label: 'ressource publiée mais non approuvé',
          build: (id) => addPublishedCourse(id),
          patch: { approvedAt: null },
        },
      ]

      for (const scenario of cases) {
        await cleanDatabase()
        const trainer = await makeTrainer()
        await scenario.build(trainer.id)
        if (scenario.patch) {
          await prisma.trainerProfile.update({ where: { id: trainer.id }, data: scenario.patch })
        }

        const state = await getTrainerVisibility(trainer.id)
        const listed = (await listPublicTrainers()).some((t) => t.id === trainer.id)
        const reachable = (await getPublicTrainer(trainer.id)) !== null

        expect(state!.visible, scenario.label).toBe(listed)
        expect(reachable, scenario.label).toBe(listed)
      }
    })
  })
})
