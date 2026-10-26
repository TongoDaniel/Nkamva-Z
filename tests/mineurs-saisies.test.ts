// ==========================================================================
// Saisies envoyées directement au serveur — campagne du 12 octobre 2026
// m1, m2, m3, m4, m5, m13, m15, m21
// ==========================================================================
// La campagne a envoyé aux routes ce que les formulaires n'auraient jamais
// laissé passer. Ces tests rejouent ses saisies absurdes.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanText, textField, wordsField, httpUrlField, isCountryCode } from '@/lib/text-input'
import { MAX_COURSE_PRICE_FCFA } from '@/lib/course-rules'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'
import { POST as createCourseRoute } from '@/app/api/trainer/courses/route'
import { createCourse } from '@/lib/courses'

describe('Règles de texte', () => {
  it('m15 — les caractères invisibles et les inversions de sens disparaissent avant la mesure', () => {
    expect(cleanText('​​​A')).toBe('A')
    expect(cleanText('Admin‮gnp.exe')).toBe('Admingnp.exe')
    expect(wordsField(2, 120).safeParse('​​​A').success).toBe(false)
    expect(wordsField(2, 120).safeParse('  Awa Sarr  ').data).toBe('Awa Sarr')
  })

  it('m1 et m4 — des espaces ne font ni un nom ni un titre', () => {
    expect(wordsField(2, 200).safeParse('  ').success).toBe(false)
    expect(textField(10, 500).safeParse('            ').success).toBe(false)
  })

  it('m5 — une catégorie doit contenir une lettre', () => {
    expect(wordsField(2, 60).safeParse('💩💩').success).toBe(false)
    expect(wordsField(2, 60).safeParse('Couture').success).toBe(true)
    expect(wordsField(2, 60).safeParse('خياطة').success).toBe(true)
  })

  it('m21 — un message d\'un seul caractère invisible est vide', () => {
    expect(cleanText('​')).toBe('')
  })

  it('m2 — seules les adresses http et https sont acceptées', () => {
    expect(httpUrlField(500).safeParse('javascript:alert(1)').success).toBe(false)
    expect(httpUrlField(500).safeParse('data:text/html,<b>x</b>').success).toBe(false)
    expect(httpUrlField(500).safeParse('https://nkamva.com').success).toBe(true)
  })

  it('m13 — un code pays doit désigner un pays', () => {
    for (const code of ['CM', 'CI', 'SN', 'TZ']) expect(isCountryCode(code)).toBe(true)
    for (const code of ['ZZ', '42', 'XX', 'EU', 'QO', 'cm', 'CMR']) expect(isCountryCode(code)).toBe(false)
  })
})

describe('Création d\'une ressource par la route', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function trainer() {
    const user = await prisma.user.create({ data: { email: 'mariam@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({ data: { userId: user.id, approvedAt: new Date() } })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    vi.mocked(getServerSession).mockResolvedValue(
      { user: { id: user.id, email: 'mariam@test.com', role: 'TRAINER', adminRole: null, trainerId: profile.id } } as never,
    )
    return { user, profile }
  }

  const VALID = {
    title: 'Patron de robe', blurb: 'Un patron simple et complet.', description: 'Tout pour coudre une robe.',
    category: 'Couture', format: 'pdf', priceFcfa: 5000,
  }
  const post = (body: unknown) => createCourseRoute(new Request('http://localhost/x', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))

  it('m3 — un prix démesuré est refusé proprement, sans erreur 500', async () => {
    await trainer()
    expect((await post({ ...VALID, priceFcfa: 2_147_483_648 })).status).toBe(400)
    expect((await post({ ...VALID, priceFcfa: MAX_COURSE_PRICE_FCFA + 1 })).status).toBe(400)
  })

  it('m5 — un format inventé et une catégorie sans lettre sont refusés', async () => {
    await trainer()
    expect((await post({ ...VALID, format: 'hologramme' })).status).toBe(400)
    expect((await post({ ...VALID, category: '💩' })).status).toBe(400)
  })

  it('m4 — un titre d\'espaces est refusé', async () => {
    await trainer()
    expect((await post({ ...VALID, title: '      ' })).status).toBe(400)
  })

  it('m4 — un titre sans lettre latine donne une adresse lisible, pas « -1 »', async () => {
    const { user, profile } = await trainer()
    const input = { ...VALID, title: 'خياطة الفساتين' }
    const first = await createCourse(profile.id, user.id, input)
    const second = await createCourse(profile.id, user.id, input)
    expect(first.slug).toBe('ressource')
    expect(second.slug).toBe('ressource-1')
  })
})
