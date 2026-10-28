// ==========================================================================
// Aide & FAQ administrables — /admin/aide, /aide, FAQ de l'accueil
// ==========================================================================
// Le contenu vit en base ; le Super-admin et la Modération l'éditent. Les
// chiffres passent par des marqueurs, les liens ne sortent jamais du site.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import {
  answerProblems,
  createHelpArticle,
  createHelpCategory,
  deleteHelpCategory,
  listHomepageFaq,
  listPublicHelp,
  loadHelpValues,
  moveHelpItem,
  renderAnswer,
  updateHelpArticle,
  type HelpValues,
} from '@/lib/help-content'
import { COMMISSION_LABEL } from '@/lib/commission'
import { POST as createCategoryRoute } from '@/app/api/admin/help/categories/route'
import { POST as createArticleRoute } from '@/app/api/admin/help/articles/route'

const VALUES = {
  commission: '15 %',
  part_formateur: '85 %',
  abonnement_formateur: 'Abonnement formateur : 5 000 FCFA/mois.',
  delai_contestation: '14 jours',
  seuil_consommation: '30 %',
  delai_reponse_apprenant: '7 jours',
  delai_suppression: '30 jours',
  retrait_minimum: '5 000 FCFA',
  carence_moyen_paiement: '48 h',
  delai_support: '24 heures ouvrées',
  operateurs: 'MTN, Orange',
  pays: 'Cameroun',
} satisfies HelpValues

function signInAs(user: { id: string; role: 'LEARNER' | 'ADMIN'; adminRole?: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION' | null } | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    user ? ({ user: { email: 'x@test.com', adminRole: null, trainerId: null, ...user } } as never) : null,
  )
}

function post(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

async function admin(adminRole: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION') {
  const user = await prisma.user.create({ data: { email: `${adminRole.toLowerCase()}@test.com`, role: 'ADMIN', adminRole } })
  return { id: user.id, role: adminRole as 'SUPER_ADMIN' | 'MODERATION' }
}

describe('Aide & FAQ — le texte d\'une réponse', () => {
  it('remplace les marqueurs par les valeurs en vigueur et garde les liens internes', () => {
    const segments = renderAnswer(
      'NKAMVA retient {commission}. Voir les [conditions](/legal/conditions).',
      VALUES,
    )
    expect(segments).toEqual([
      { type: 'text', value: 'NKAMVA retient 15 %. Voir les ' },
      { type: 'link', label: 'conditions', href: '/legal/conditions' },
      { type: 'text', value: '.' },
    ])
  })

  it('refuse un marqueur inconnu, un lien externe et un lien qui sortirait du domaine', () => {
    expect(answerProblems('Il retient {comission}.')).toEqual(['Marqueur inconnu : {comission}.'])
    expect(answerProblems('[ici](https://exemple.com)')).toHaveLength(1)
    expect(answerProblems('[ici](//exemple.com)')).toHaveLength(1)
    expect(answerProblems('[ici](javascript:alert(1))')).toHaveLength(1)
    expect(answerProblems('Rien à redire, {retrait_minimum}, [tarifs](/tarifs).')).toEqual([])
  })

  it('n\'interprète aucun HTML : une balise reste du texte', () => {
    const segments = renderAnswer('<b>gras</b> <script>x</script>', VALUES)
    expect(segments).toEqual([{ type: 'text', value: '<b>gras</b> <script>x</script>' }])
  })

  it('les valeurs réelles viennent de leur source unique', async () => {
    const values = await loadHelpValues()
    expect(values.commission).toBe(COMMISSION_LABEL)
    // Sans marché ouvert, pas de parenthèse vide : une formule de repli.
    expect(values.operateurs.length).toBeGreaterThan(0)
  })
})

describe('Aide & FAQ — contenu en base', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  it('le site ne montre que les questions publiées, et pas les rubriques vides', async () => {
    const actor = await admin('MODERATION')
    const pay = await createHelpCategory({ title: 'Paiements', hint: 'Mobile money', icon: 'credit-card' }, actor)
    await createHelpCategory({ title: 'Vide', hint: '', icon: 'book' }, actor)
    await createHelpArticle({ categoryId: pay.id, question: 'Publiée ?', answer: 'Oui, {commission}.', published: true, onHomepage: false }, actor)
    await createHelpArticle({ categoryId: pay.id, question: 'Brouillon ?', answer: 'Pas encore.', published: false, onHomepage: true }, actor)

    const help = await listPublicHelp(VALUES)
    expect(help.map((c) => c.slug)).toEqual(['paiements'])
    expect(help[0].articles.map((a) => a.question)).toEqual(['Publiée ?'])
    expect(help[0].articles[0].answer).toEqual([{ type: 'text', value: 'Oui, 15 %.' }])

    // Cochée « accueil » mais masquée : elle n'apparaît pas non plus sur l'accueil.
    expect(await listHomepageFaq(VALUES)).toEqual([])
  })

  it('la FAQ de l\'accueil suit l\'ordre de l\'aide', async () => {
    const actor = await admin('SUPER_ADMIN')
    const a = await createHelpCategory({ title: 'A', hint: '', icon: 'book' }, actor)
    const b = await createHelpCategory({ title: 'B', hint: '', icon: 'book' }, actor)
    await createHelpArticle({ categoryId: b.id, question: 'B1', answer: 'x', published: true, onHomepage: true }, actor)
    await createHelpArticle({ categoryId: a.id, question: 'A1', answer: 'x', published: true, onHomepage: false }, actor)
    await createHelpArticle({ categoryId: a.id, question: 'A2', answer: 'x', published: true, onHomepage: true }, actor)

    expect((await listHomepageFaq(VALUES)).map((q) => q.question)).toEqual(['A2', 'B1'])

    await moveHelpItem('category', b.id, 'up', actor)
    expect((await listHomepageFaq(VALUES)).map((q) => q.question)).toEqual(['B1', 'A2'])
  })

  it('monter et descendre échangent avec la voisine, sans rien faire aux extrémités', async () => {
    const actor = await admin('MODERATION')
    const cat = await createHelpCategory({ title: 'Compte', hint: '', icon: 'user-cog' }, actor)
    const q1 = await createHelpArticle({ categoryId: cat.id, question: 'Q1', answer: 'x', published: true, onHomepage: false }, actor)
    const q2 = await createHelpArticle({ categoryId: cat.id, question: 'Q2', answer: 'x', published: true, onHomepage: false }, actor)

    expect(await moveHelpItem('article', q1.id, 'up', actor)).toBe(false)
    expect(await moveHelpItem('article', q2.id, 'up', actor)).toBe(true)
    const order = (await listPublicHelp(VALUES))[0].articles.map((a) => a.question)
    expect(order).toEqual(['Q2', 'Q1'])
    expect(await prisma.auditLog.count({ where: { action: 'HELP_ARTICLE_MOVED' } })).toBe(1)
  })

  it('une rubrique ne se supprime que vide, et changer de rubrique place la question à la fin', async () => {
    const actor = await admin('SUPER_ADMIN')
    const from = await createHelpCategory({ title: 'Départ', hint: '', icon: 'book' }, actor)
    const to = await createHelpCategory({ title: 'Arrivée', hint: '', icon: 'book' }, actor)
    await createHelpArticle({ categoryId: to.id, question: 'Déjà là', answer: 'x', published: true, onHomepage: false }, actor)
    const moving = await createHelpArticle({ categoryId: from.id, question: 'Partante', answer: 'x', published: true, onHomepage: false }, actor)

    await expect(deleteHelpCategory(from.id, actor)).rejects.toThrow('HELP_CATEGORY_NOT_EMPTY')

    await updateHelpArticle(moving.id, { categoryId: to.id, question: 'Partante', answer: 'x', published: true, onHomepage: false }, actor)
    await deleteHelpCategory(from.id, actor)
    const help = await listPublicHelp(VALUES)
    expect(help.map((c) => c.title)).toEqual(['Arrivée'])
    expect(help[0].articles.map((a) => a.question)).toEqual(['Déjà là', 'Partante'])
  })

  it('deux rubriques au même titre ont deux ancres distinctes', async () => {
    const actor = await admin('MODERATION')
    const one = await createHelpCategory({ title: 'Paiements', hint: '', icon: 'book' }, actor)
    const two = await createHelpCategory({ title: 'Paiements', hint: '', icon: 'book' }, actor)
    expect([one.slug, two.slug]).toEqual(['paiements', 'paiements-2'])
  })

  it('chaque modification est journalisée avec son auteur', async () => {
    const actor = await admin('MODERATION')
    const cat = await createHelpCategory({ title: 'Lives', hint: '', icon: 'video' }, actor)
    await createHelpArticle({ categoryId: cat.id, question: 'Q', answer: 'x', published: true, onHomepage: false }, actor)
    const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: 'HELP_' } }, orderBy: { createdAt: 'asc' } })
    expect(logs.map((l) => [l.action, l.actorId, l.actorRole])).toEqual([
      ['HELP_CATEGORY_CREATED', actor.id, 'MODERATION'],
      ['HELP_ARTICLE_CREATED', actor.id, 'MODERATION'],
    ])
  })
})

describe('Aide & FAQ — qui peut écrire', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  it('la Modération et le Super-admin écrivent ; les Finances et les apprenants non', async () => {
    const moderation = await admin('MODERATION')
    const finances = await admin('FINANCES')
    const learner = await prisma.user.create({ data: { email: 'apprenant@test.com', role: 'LEARNER' } })

    signInAs({ id: moderation.id, role: 'ADMIN', adminRole: 'MODERATION' })
    const ok = await createCategoryRoute(post('http://localhost/api/admin/help/categories', { title: 'Paiements', hint: '', icon: 'credit-card' }))
    expect(ok.status).toBe(201)

    signInAs({ id: finances.id, role: 'ADMIN', adminRole: 'FINANCES' })
    const refused = await createCategoryRoute(post('http://localhost/api/admin/help/categories', { title: 'X', hint: '', icon: 'book' }))
    expect(refused.status).toBe(403)

    signInAs({ id: learner.id, role: 'LEARNER' })
    expect((await createCategoryRoute(post('http://localhost/api/admin/help/categories', { title: 'X', hint: '', icon: 'book' }))).status).toBe(403)

    signInAs(null)
    expect((await createCategoryRoute(post('http://localhost/api/admin/help/categories', { title: 'X', hint: '', icon: 'book' }))).status).toBe(401)

    expect(await prisma.helpCategory.count()).toBe(1)
  })

  it('une réponse avec un lien externe est refusée par la route, avec un message lisible', async () => {
    const moderation = await admin('MODERATION')
    const cat = await createHelpCategory({ title: 'Compte', hint: '', icon: 'user-cog' }, moderation)
    signInAs({ id: moderation.id, role: 'ADMIN', adminRole: 'MODERATION' })

    const res = await createArticleRoute(post('http://localhost/api/admin/help/articles', {
      categoryId: cat.id, question: 'Où ?', answer: 'Allez [là](https://ailleurs.example).', published: true, onHomepage: false,
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('HELP_ANSWER_INVALID')
    expect(await prisma.helpArticle.count()).toBe(0)
  })
})
