// ==========================================================================
// Recherche — campagne du 12 octobre 2026, m6
// ==========================================================================
// `%` et `_` renvoyaient tout le catalogue (jokers de LIKE non échappés),
// `maxPrice=abc` rendait une erreur 500, et « rôbe » ne trouvait pas « robe ».

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { searchCourses } from '@/lib/catalog'
import { searchEverything } from '@/lib/search'
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

  it('un prix illisible dans l\'URL est ignoré, sans erreur 500', async () => {
    await catalogue()
    const res = await catalogRoute(new Request('http://localhost/api/catalog/courses?maxPrice=abc&minPrice=-3'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toHaveLength(3)
  })
})
