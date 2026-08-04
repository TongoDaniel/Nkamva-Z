// ==========================================================================
// Recherche transversale
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { searchEverything, SEARCH_MIN_LENGTH } from '@/lib/search'

describe('Recherche transversale', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const user = await prisma.user.create({
      data: { email: 'awa@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: {
        userId: user.id, approvedAt: new Date(), slogan: 'Architecture logicielle',
        domains: ['Développement'],
      },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'pipelines-python', title: 'Pipelines de données avec Python',
        blurb: 'Construisez des pipelines fiables', description: 'Description',
        category: 'Développement', format: 'video', priceFcfa: 18000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
      },
    })
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: 'Les artisans du back', slug: 'artisans-back',
        description: 'Entraide entre développeurs Python', priceFcfa: 5000,
      },
    })
    return { user, trainer, course, community }
  }

  it('traverse les trois sections en une requête', async () => {
    await setup()

    const results = await searchEverything('Python')
    // Le terme est dans le titre d'une ressource et dans la description d'une
    // communauté : les deux doivent remonter ensemble.
    expect(results.courses).toHaveLength(1)
    expect(results.communities).toHaveLength(1)
    expect(results.total).toBe(2)
  })

  it('trouve un formateur par son nom', async () => {
    await setup()

    const results = await searchEverything('Awa')
    expect(results.trainers).toHaveLength(1)
    expect(results.trainers[0].fullName).toBe('Awa Sarr')
    expect(results.trainers[0].publishedCount).toBe(1)
  })

  it('ignore la casse', async () => {
    await setup()
    expect((await searchEverything('pYtHoN')).total).toBeGreaterThan(0)
  })

  it('n\'expose ni brouillon, ni formateur sans ressource publiée', async () => {
    const { trainer } = await setup()
    await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'brouillon-python', title: 'Brouillon Python',
        blurb: 'Pas encore prêt', description: 'Description', category: 'Développement',
        format: 'video', priceFcfa: 9000, status: 'draft',
      },
    })
    const solo = await prisma.user.create({
      data: { email: 'solo@test.com', role: 'TRAINER', fullName: 'Awa Diallo' },
    })
    await prisma.trainerProfile.create({ data: { userId: solo.id, approvedAt: new Date() } })

    const results = await searchEverything('Python')
    expect(results.courses.map((c) => c.title)).not.toContain('Brouillon Python')

    // Même règle que l'annuaire : sans ressource publiée, pas de fiche à montrer.
    const byName = await searchEverything('Awa')
    expect(byName.trainers.map((t) => t.fullName)).not.toContain('Awa Diallo')
  })

  it('renvoie vide en deçà du seuil, sans interroger la base', async () => {
    await setup()
    const results = await searchEverything('a'.repeat(SEARCH_MIN_LENGTH - 1))
    expect(results.total).toBe(0)
    expect(results.courses).toHaveLength(0)
  })
})
