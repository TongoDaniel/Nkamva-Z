// ==========================================================================
// Recherche — campagne du 12 octobre 2026, m6
// ==========================================================================
// `%` et `_` renvoyaient tout le catalogue (jokers de LIKE non échappés),
// `maxPrice=abc` rendait une erreur 500, et « rôbe » ne trouvait pas « robe ».
// La seconde moitié — « robe » qui trouve « rôbe » — passe par l'extension
// `unaccent` (migration 20261026120000_recherche_sans_accents).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { searchCourses } from '@/lib/catalog'
import { searchEverything } from '@/lib/search'
import { listPublicCommunities } from '@/lib/communities'
import { listPublicTrainers } from '@/lib/trainers'
import { escapeLike, searchForms } from '@/lib/search-text'
import { GET as catalogRoute } from '@/app/api/catalog/courses/route'

describe('m6 — la recherche cherche ce qu\'on a tapé', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function catalogue() {
    const user = await prisma.user.create({ data: { email: 'mariam@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: user.id, approvedAt: new Date() } })
    for (const [slug, title] of [['robe', 'Patron de robe'], ['pagne', 'Coudre un pagne'], ['jupe', 'Jupe portefeuille']]) {
      await prisma.course.create({
        data: {
          trainerId: trainer.id, slug, title, blurb: 'Accroche', description: 'Description',
          category: 'Couture', format: 'pdf', priceFcfa: 5000, status: 'published', publishedAt: new Date(),
        },
      })
    }
  }

  it('les jokers sont échappés', () => {
    expect(escapeLike('100%_sûr\\')).toBe('100\\%\\_sûr\\\\')
    expect(searchForms('rôbe')).toEqual(['rôbe', 'robe'])
    expect(searchForms('  ')).toEqual([])
  })

  it('« % » et « _ » ne renvoient plus tout le catalogue', async () => {
    await catalogue()
    expect((await searchCourses({ search: '%', page: 1, pageSize: 20 })).total).toBe(0)
    expect((await searchCourses({ search: '_', page: 1, pageSize: 20 })).total).toBe(0)
    expect((await searchEverything('%%')).courses).toHaveLength(0)
  })

  it('« rôbe » trouve « robe »', async () => {
    await catalogue()
    const { items } = await searchCourses({ search: 'rôbe', page: 1, pageSize: 20 })
    expect(items.map((c) => c.slug)).toEqual(['robe'])
  })

  /** Une formatrice dont le nom, une ressource et une communauté portent des accents. */
  async function accentue() {
    const user = await prisma.user.create({
      data: { email: 'aicha@test.com', role: 'TRAINER', fullName: 'Aïcha Ngô' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date(), slogan: 'Créations élégantes' },
    })
    await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'robe-soiree', title: 'Patron de rôbe de soirée', blurb: 'Accroche',
        description: 'Description', category: 'Couture', format: 'pdf', priceFcfa: 5000,
        status: 'published', publishedAt: new Date(),
      },
    })
    await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Atelier Brodé', slug: 'atelier-brode', priceFcfa: 2500 },
    })
  }

  it('« robe » trouve « rôbe » : le texte stocké est comparé sans ses accents', async () => {
    await accentue()
    const { items } = await searchCourses({ search: 'robe', page: 1, pageSize: 20 })
    expect(items.map((c) => c.slug)).toEqual(['robe-soiree'])

    const everything = await searchEverything('robe')
    expect(everything.courses.map((c) => c.slug)).toEqual(['robe-soiree'])
  })

  it('les communautés et les formateurs aussi, dans l\'annuaire comme dans la recherche', async () => {
    await accentue()
    const communities = await listPublicCommunities({ search: 'brode' })
    expect(communities.items.map((c) => c.slug)).toEqual(['atelier-brode'])
    expect((await searchEverything('BRODE')).communities.map((c) => c.slug)).toEqual(['atelier-brode'])

    const trainers = await listPublicTrainers('aicha ngo')
    expect(trainers.map((t) => t.fullName)).toEqual(['Aïcha Ngô'])
    expect((await searchEverything('elegantes')).trainers.map((t) => t.fullName)).toEqual(['Aïcha Ngô'])
  })

  it('un mot absent ne remonte rien, accents ou pas', async () => {
    await accentue()
    expect((await searchCourses({ search: 'pantalon', page: 1, pageSize: 20 })).total).toBe(0)
    expect((await searchEverything('brodé%')).communities).toHaveLength(0)
  })

  it('un prix illisible dans l\'URL est ignoré, sans erreur 500', async () => {
    await catalogue()
    const res = await catalogRoute(new Request('http://localhost/api/catalog/courses?maxPrice=abc&minPrice=-3'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toHaveLength(3)
  })
})
