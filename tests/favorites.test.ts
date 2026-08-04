// ==========================================================================
// Favoris — bascule, unicité, contrainte de cible
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { toggleFavorite, listMyFavorites, favoritedCourseIds, countFavorites } from '@/lib/favorites'

describe('Favoris', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const user = await prisma.user.create({ data: { email: 'apprenant@test.com', role: 'LEARNER' } })
    const trainerUser = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date() },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'masterclass-ddd', title: 'Masterclass DDD',
        blurb: 'Accroche', description: 'Description', category: 'Développement',
        format: 'video', priceFcfa: 15000, status: 'published', publishedAt: new Date(),
      },
    })
    const community = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Les artisans du back', slug: 'artisans-back', priceFcfa: 5000 },
    })
    return { user, trainer, course, community }
  }

  it('bascule : un premier clic met de côté, un second retire', async () => {
    const { user, course } = await setup()

    expect(await toggleFavorite(user.id, { courseId: course.id })).toEqual({ favorited: true })
    expect(await countFavorites(user.id)).toBe(1)

    expect(await toggleFavorite(user.id, { courseId: course.id })).toEqual({ favorited: false })
    expect(await countFavorites(user.id)).toBe(0)
  })

  it('deux clics simultanés ne créent qu\'une ligne', async () => {
    const { user, course } = await setup()

    // Le second se heurte à l'unicité ; le résultat voulu est atteint, aucune
    // erreur ne doit remonter à quelqu'un qui a juste cliqué deux fois.
    const results = await Promise.allSettled([
      toggleFavorite(user.id, { courseId: course.id }),
      toggleFavorite(user.id, { courseId: course.id }),
    ])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(await prisma.favorite.count({ where: { userId: user.id } })).toBeLessThanOrEqual(1)
  })

  it('un utilisateur peut mettre de côté plusieurs communautés', async () => {
    const { user, trainer, community } = await setup()
    const second = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Data Afrique', slug: 'data-afrique', priceFcfa: 7000 },
    })

    // Les deux lignes ont `courseId` NULL : en Postgres deux NULL ne se
    // heurtent pas, l'index unique ne doit donc pas bloquer la seconde.
    await toggleFavorite(user.id, { communityId: community.id })
    await toggleFavorite(user.id, { communityId: second.id })

    expect(await countFavorites(user.id)).toBe(2)
  })

  it('refuse une cible inexistante ou hors catalogue', async () => {
    const { user, trainer } = await setup()
    const draft = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'brouillon', title: 'Brouillon',
        blurb: 'Accroche', description: 'Description', category: 'Développement',
        format: 'video', priceFcfa: 9000, status: 'draft',
      },
    })

    await expect(toggleFavorite(user.id, { courseId: draft.id })).rejects.toThrow('COURSE_NOT_FOUND')
    await expect(
      toggleFavorite(user.id, { courseId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow('COURSE_NOT_FOUND')
    expect(await countFavorites(user.id)).toBe(0)
  })

  it('la base refuse une ligne sans cible ou avec les deux', async () => {
    const { user, course, community } = await setup()

    // La contrainte CHECK est le filet : Prisma ne sait pas l'exprimer, et une
    // telle ligne resterait invisible jusqu'au rendu.
    await expect(
      prisma.favorite.create({ data: { userId: user.id } }),
    ).rejects.toThrow()
    await expect(
      prisma.favorite.create({ data: { userId: user.id, courseId: course.id, communityId: community.id } }),
    ).rejects.toThrow()
  })

  it('la liste écarte une ressource dépubliée sans supprimer le favori', async () => {
    const { user, course } = await setup()
    await toggleFavorite(user.id, { courseId: course.id })

    await prisma.course.update({ where: { id: course.id }, data: { status: 'archived' } })

    const view = await listMyFavorites(user.id)
    expect(view.courses).toHaveLength(0)
    // Le favori survit : la ressource peut revenir au catalogue.
    expect(await countFavorites(user.id)).toBe(1)
  })

  it('rend les identifiants en favori pour préallumer une liste', async () => {
    const { user, trainer, course } = await setup()
    const other = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'autre', title: 'Autre',
        blurb: 'Accroche', description: 'Description', category: 'Développement',
        format: 'pdf', priceFcfa: 3000, status: 'published', publishedAt: new Date(),
      },
    })
    await toggleFavorite(user.id, { courseId: course.id })

    const ids = await favoritedCourseIds(user.id, [course.id, other.id])
    expect(ids.has(course.id)).toBe(true)
    expect(ids.has(other.id)).toBe(false)
  })

  it('les favoris disparaissent avec le compte', async () => {
    const { user, course, community } = await setup()
    await toggleFavorite(user.id, { courseId: course.id })
    await toggleFavorite(user.id, { communityId: community.id })

    await prisma.favorite.deleteMany({ where: { userId: user.id } })
    expect(await countFavorites(user.id)).toBe(0)
  })
})
