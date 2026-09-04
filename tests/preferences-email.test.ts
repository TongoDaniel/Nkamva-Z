// ==========================================================================
// Lot 2 — Deux catégories d'email, une seule coupable (arbitrage 119)
// ==========================================================================
// La règle tient en une phrase : **le transactionnel ne se coupe pas**. Un
// reçu, une facture, un accès qui s'ouvre sont des preuves, pas des annonces —
// un réglage capable de les éteindre transformerait une préférence de confort
// en perte de droits, et quelqu'un qui ne retrouve pas son reçu n'a plus rien à
// opposer.
//
// La notification in-app, elle, part **toujours**, dans les deux cas : c'est la
// trace consultable dans le compte. L'email n'en est que le porte-voix.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Le module d'email est remplacé : sans clé Resend il journalise au lieu
// d'envoyer, ce qui rend l'envoi invisible et donc invérifiable.
// Le faux rendu **doit** reporter la note de bas de page : c'est elle qui porte
// la sortie, et c'est précisément ce que les deux derniers tests observent. Un
// gabarit qui l'ignorerait rendrait ces tests aveugles à leur propre sujet.
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => {}),
  renderSimpleEmail: (p: { title: string; paragraphs: string[]; footnote?: string }) => ({
    html: `<h1>${p.title}</h1>`,
    text: [...p.paragraphs, ...(p.footnote ? [p.footnote] : [])].join('\n'),
  }),
}))

import { prisma, cleanDatabase } from './setup'
import { sendEmail } from '@/lib/email'
import { notifyWithEmail, TRANSACTIONAL } from '@/lib/notification'

const envoye = vi.mocked(sendEmail)

const CORPS = {
  subject: 'Sujet',
  title: 'Titre',
  paragraphs: ['Bonjour,'],
}

describe('Lot 2 — préférences d\'email', () => {
  beforeEach(async () => {
    await cleanDatabase()
    envoye.mockClear()
  })
  afterEach(async () => { await cleanDatabase() })

  async function unUtilisateur(prefs: { relationalEmails?: boolean; subscriptionNoticeEmails?: boolean } = {}) {
    return prisma.user.create({
      data: { email: 'destinataire@test.com', role: 'LEARNER', ...prefs },
    })
  }

  it('envoie un email relationnel quand la préférence est active', async () => {
    const user = await unUtilisateur({ relationalEmails: true })
    await notifyWithEmail(user.id, { type: 'MESSAGE', title: 'T', body: 'B' }, CORPS, 'relationalEmails')
    expect(envoye).toHaveBeenCalledTimes(1)
  })

  it('se tait quand la préférence relationnelle est coupée', async () => {
    const user = await unUtilisateur({ relationalEmails: false })
    await notifyWithEmail(user.id, { type: 'MESSAGE', title: 'T', body: 'B' }, CORPS, 'relationalEmails')
    expect(envoye).not.toHaveBeenCalled()
  })

  it('laisse la notification in-app même quand l\'email est coupé', async () => {
    const user = await unUtilisateur({ relationalEmails: false })
    await notifyWithEmail(user.id, { type: 'MESSAGE', title: 'T', body: 'B' }, CORPS, 'relationalEmails')
    const rows = await prisma.notification.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
  })

  it('envoie un transactionnel même avec toutes les préférences coupées', async () => {
    const user = await unUtilisateur({ relationalEmails: false, subscriptionNoticeEmails: false })
    await notifyWithEmail(user.id, { type: 'PURCHASE_CONFIRMED', title: 'T', body: 'B' }, CORPS, TRANSACTIONAL)
    expect(envoye).toHaveBeenCalledTimes(1)
  })

  it('ne propose pas de se désabonner de ce qui ne se coupe pas', async () => {
    const user = await unUtilisateur()
    await notifyWithEmail(user.id, { type: 'PURCHASE_CONFIRMED', title: 'T', body: 'B' }, CORPS, TRANSACTIONAL)
    const [{ text }] = envoye.mock.calls.map((c) => c[0] as { text: string })
    expect(text).not.toContain('désactiver')
  })

  it('dit comment se désabonner de ce qui se coupe', async () => {
    const user = await unUtilisateur({ relationalEmails: true })
    await notifyWithEmail(user.id, { type: 'MESSAGE', title: 'T', body: 'B' }, CORPS, 'relationalEmails')
    const [{ text }] = envoye.mock.calls.map((c) => c[0] as { text: string })
    expect(text).toContain('désactiver')
  })

  it('n\'écrit rien à un compte supprimé, quelle que soit la catégorie', async () => {
    const user = await prisma.user.create({
      data: { email: 'parti@test.com', role: 'LEARNER', deletedAt: new Date() },
    })
    await notifyWithEmail(user.id, { type: 'PURCHASE_CONFIRMED', title: 'T', body: 'B' }, CORPS, TRANSACTIONAL)
    expect(envoye).not.toHaveBeenCalled()
  })

  it('la préférence relationnelle est active par défaut', async () => {
    const user = await unUtilisateur()
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { relationalEmails: true },
    })
    expect(row.relationalEmails).toBe(true)
  })
})
