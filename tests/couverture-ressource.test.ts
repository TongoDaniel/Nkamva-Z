// ==========================================================================
// La couverture d'une ressource
// ==========================================================================
// Le défaut d'origine : `coverS3Key` entrait bien en base, mais aucune surface
// ne lisait la colonne. Cartes du catalogue, fiche et panneau d'édition
// rendaient tous la couverture *générée* — un formateur déposait son image,
// lisait « Couverture mise à jour », et ne voyait jamais rien changer.
//
// Ce qui se teste ici est la règle d'accès de la route qui la sert, parce que
// c'est la partie qu'on peut casser sans que rien ne se voie : une couverture
// de brouillon qui fuit ne provoque aucune erreur visible.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { GET as coverRoute } from '@/app/api/media/courses/[courseId]/cover/route'
import { coverImageUrl } from '@/components/nk/cover'

function signInAs(user: { id: string; role: string; trainerId?: string | null } | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    user
      ? ({ user: { email: 'x@test.com', adminRole: null, trainerId: null, ...user } } as never)
      : null,
  )
}

const call = (courseId: string) =>
  coverRoute(new Request('http://localhost/x'), { params: Promise.resolve({ courseId }) })

describe('Couverture d’une ressource', () => {
  beforeEach(async () => { await cleanDatabase(); signInAs(null) })
  afterEach(async () => { await cleanDatabase() })

  async function setup(over: { status?: string; coverS3Key?: string | null } = {}) {
    const user = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date() },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'ddd', title: 'Masterclass DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: over.status ?? 'published',
        publishedAt: (over.status ?? 'published') === 'published' ? new Date() : null,
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
        coverS3Key: over.coverS3Key === undefined ? 'course-assets/x/image-1.png' : over.coverS3Key,
      },
    })
    return { user, trainer, course }
  }

  it('répond 404 quand aucune image n’a été déposée', async () => {
    // C'est ce 404 qui laisse la couverture générée à sa place : `coverImageUrl`
    // ne demande d'ailleurs rien dans ce cas, la route est la seconde barrière.
    const { course } = await setup({ coverS3Key: null })
    expect((await call(course.id)).status).toBe(404)
    expect(coverImageUrl(course)).toBeNull()
  })

  it('répond 404 sur un identifiant inconnu', async () => {
    expect((await call('11111111-1111-4111-8111-111111111111')).status).toBe(404)
  })

  it('ne montre pas la couverture d’un brouillon à un visiteur', async () => {
    const { course } = await setup({ status: 'draft' })
    expect((await call(course.id)).status).toBe(404)
  })

  it('ne la montre pas non plus à un autre formateur', async () => {
    const { course } = await setup({ status: 'draft' })
    const autre = await prisma.user.create({
      data: { email: 'autre@test.com', role: 'TRAINER', fullName: 'Kofi Mensah' },
    })
    const autreProfil = await prisma.trainerProfile.create({
      data: { userId: autre.id, approvedAt: new Date() },
    })
    signInAs({ id: autre.id, role: 'TRAINER', trainerId: autreProfil.id })

    expect((await call(course.id)).status).toBe(404)
  })

  it('la montre à son auteur, qui en a besoin pour juger son dépôt', async () => {
    const { user, trainer, course } = await setup({ status: 'draft' })
    signInAs({ id: user.id, role: 'TRAINER', trainerId: trainer.id })

    // `tests/setup.ts` neutralise les identifiants de stockage — sans quoi la
    // suite écrirait dans le vrai seau. La route répondrait donc 404 à tout le
    // monde, y compris à l'auteur, et le test ne prouverait rien. On rend la
    // configuration présente le temps de cet appel : la présignature est un
    // calcul local, elle ne joint personne.
    const saved = { ...process.env }
    process.env.AWS_ENDPOINT_URL = 'https://exemple.invalid'
    process.env.AWS_ACCESS_KEY_ID = 'test'
    process.env.AWS_SECRET_ACCESS_KEY = 'test'
    process.env.AWS_BUCKET_NAME = 'nkamva-test'
    try {
      const own = await call(course.id)
      expect(own.status).toBe(302)
      expect(own.headers.get('location')).toContain('nkamva-test')

      signInAs(null)
      expect((await call(course.id)).status).toBe(404)
    } finally {
      Object.assign(process.env, saved)
    }
  })

  it('sort une ressource du catalogue avec sa couverture', async () => {
    // Sortie pour impayé (décision 68) : `status` repasse à `archived`. La
    // couverture ne doit pas rester la seule chose encore publique.
    const { course } = await setup()
    await prisma.course.update({
      where: { id: course.id },
      data: { status: 'archived', catalogSuspendedAt: new Date() },
    })
    expect((await call(course.id)).status).toBe(404)
  })

  describe('L’adresse servie aux écrans', () => {
    it('change quand la couverture est remplacée', async () => {
      // Sans cela, le formateur qui remplace son image continue de voir
      // l'ancienne le temps que le cache expire — et conclut une seconde fois
      // que son dépôt n'a rien fait.
      const avant = coverImageUrl({ id: 'c1', coverS3Key: 'course-assets/c1/image-aaaa1111.png' })
      const apres = coverImageUrl({ id: 'c1', coverS3Key: 'course-assets/c1/image-bbbb2222.png' })
      expect(avant).not.toBe(apres)
      expect(avant).toContain('/api/media/courses/c1/cover')
      expect(apres).toContain('/api/media/courses/c1/cover')
    })

    it('reste stable pour une couverture inchangée', async () => {
      const key = 'course-assets/c1/image-aaaa1111.png'
      expect(coverImageUrl({ id: 'c1', coverS3Key: key })).toBe(
        coverImageUrl({ id: 'c1', coverS3Key: key }),
      )
    })
  })
})
