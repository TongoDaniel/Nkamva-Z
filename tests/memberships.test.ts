// ==========================================================================
// Adhésion payante aux communautés — arbitrages 40, 44, 48, 58
// ==========================================================================
// Le cœur de ces tests est la frontière entre payer et appartenir : aucune
// adhésion ne doit exister avant que le webhook ait confirmé le paiement, et
// aucune ne doit disparaître sans laisser derrière elle l'accès qu'elle a
// ouvert.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  initiateMembershipPayment, activateMembershipForPurchase, getMembership,
  cancelMembership, resumeMembership, listMyMemberships, isMember,
  renewDueMemberships, expireOverdueMemberships, periodEndFor,
  MEMBERSHIP_GRACE_DAYS,
} from '@/lib/memberships'
import { linkCourseToCommunity, hasCommunityAccess } from '@/lib/communities'

const DAY = 86_400_000

describe('Adhésion aux communautés', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: 'Les artisans du back', slug: 'artisans-back',
        priceFcfa: 5000, commissionRate: 0.15,
      },
    })
    const learner = await prisma.user.create({ data: { email: 'membre@test.com', role: 'LEARNER' } })
    return { trainerUser, trainer, community, learner }
  }

  /** Le parcours complet : paiement ouvert, puis confirmé comme le fait le webhook. */
  async function join(communityId: string, learnerId: string) {
    const intent = await initiateMembershipPayment(communityId, learnerId, 'STRIPE')
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: intent.purchaseId },
        data: { providerStatus: 'SUCCEEDED' },
      })
      await activateMembershipForPurchase(tx, intent.purchaseId)
    })
    return intent
  }

  it('rien n\'est ouvert avant que le paiement soit confirmé', async () => {
    const { community, learner } = await setup()

    const intent = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    expect(intent.kind).toBe('JOIN')
    expect(intent.amountFcfa).toBe(5000)

    // L'achat existe, l'adhésion non : c'est toute la frontière.
    expect(await getMembership(community.id, learner.id)).toBeNull()
    expect(await isMember(community.id, learner.id)).toBe(false)
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(0)

    await prisma.$transaction((tx) => activateMembershipForPurchase(tx, intent.purchaseId))

    const membership = await getMembership(community.id, learner.id)
    expect(membership!.status).toBe('ACTIVE')
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(1)
  })

  it('la part du formateur est figée à la commission de la communauté', async () => {
    const { community, learner } = await setup()
    const intent = await initiateMembershipPayment(community.id, learner.id, 'CINETPAY')

    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: intent.purchaseId } })
    expect(purchase.trainerShareFcfa).toBe(4250)
    expect(purchase.platformShareFcfa).toBe(750)
    expect(purchase.courseId).toBeNull()
    expect(purchase.communityId).toBe(community.id)
  })

  it('deux clics n\'ouvrent qu\'un seul paiement', async () => {
    const { community, learner } = await setup()

    const [a, b] = await Promise.all([
      initiateMembershipPayment(community.id, learner.id, 'STRIPE'),
      initiateMembershipPayment(community.id, learner.id, 'STRIPE'),
    ])
    expect(a.purchaseId).toBe(b.purchaseId)

    const count = await prisma.purchase.count({
      where: { learnerId: learner.id, communityId: community.id },
    })
    expect(count).toBe(1)
  })

  it('refuse une seconde adhésion et l\'adhésion à sa propre communauté', async () => {
    const { community, learner, trainerUser } = await setup()
    await join(community.id, learner.id)

    await expect(
      initiateMembershipPayment(community.id, learner.id, 'STRIPE'),
    ).rejects.toThrow('ALREADY_MEMBER')

    await expect(
      initiateMembershipPayment(community.id, trainerUser.id, 'STRIPE'),
    ).rejects.toThrow('CANNOT_JOIN_OWN_COMMUNITY')
  })

  it('l\'adhésion ouvre l\'accès aux ressources incluses', async () => {
    const { community, learner, trainer, trainerUser } = await setup()
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'ddd', title: 'Masterclass DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
      },
    })
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)

    expect(await hasCommunityAccess(learner.id, course.id)).toBe(false)
    await join(community.id, learner.id)
    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  // --- Résiliation ---

  it('résilier ne coupe rien : le mois entamé reste servi', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)

    await cancelMembership(community.id, learner.id)

    const membership = await getMembership(community.id, learner.id)
    expect(membership!.status).toBe('ACTIVE')
    expect(membership!.canceledAt).not.toBeNull()
    expect(await isMember(community.id, learner.id)).toBe(true)
    // Le compteur ne bouge pas non plus : la personne est encore membre.
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(1)
  })

  it('on peut revenir sur une résiliation, une fois seulement', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await cancelMembership(community.id, learner.id)

    await expect(cancelMembership(community.id, learner.id)).rejects.toThrow('MEMBERSHIP_ALREADY_CANCELED')

    await resumeMembership(community.id, learner.id)
    expect((await getMembership(community.id, learner.id))!.canceledAt).toBeNull()
    await expect(resumeMembership(community.id, learner.id)).rejects.toThrow('MEMBERSHIP_NOT_CANCELED')
  })

  it('l\'adhésion résiliée s\'éteint à l\'échéance, sans nouvelle facture', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await cancelMembership(community.id, learner.id)

    const result = await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    expect(result.ended).toBe(1)
    expect(result.due).toBe(0)

    const sub = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(sub.status).toBe('CANCELED')
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(0)
    // Aucune échéance n'a été ouverte : on ne facture pas qui est parti.
    expect(await prisma.purchase.count({ where: { providerStatus: 'PENDING' } })).toBe(0)
  })

  // --- Renouvellement et impayé ---

  it('le renouvellement ouvre une période due, sans prélever', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    const before = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })

    const result = await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    expect(result.due).toBe(1)

    // Les bornes de la souscription ne bougent pas : elles décrivent ce qui a
    // été payé, et le mois ouvert ne l'est pas.
    const after = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(after.status).toBe('PAST_DUE')
    expect(after.periodStart.getTime()).toBe(before.periodStart.getTime())
    expect(after.periodEnd.getTime()).toBe(before.periodEnd.getTime())

    // L'échéance est un achat en attente — le formateur n'est crédité de rien.
    const due = await prisma.purchase.findFirstOrThrow({
      where: { learnerId: learner.id, providerStatus: 'PENDING' },
    })
    expect(due.amountFcfa).toBe(5000)
    expect(due.periodStart!.getTime()).toBe(before.periodEnd.getTime())
    expect(due.periodEnd!.getTime()).toBe(periodEndFor(before.periodEnd).getTime())
    expect((await prisma.wallet.findFirstOrThrow({ where: { trainerId: community.trainerId } })).balance).toBe(0)

    // L'accès n'est pas coupé pendant le délai de grâce.
    expect(await isMember(community.id, learner.id)).toBe(true)
  })

  it('rejouer le renouvellement ne facture pas deux fois', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    const at = new Date(Date.now() + 32 * DAY)

    await renewDueMemberships(at)
    const second = await renewDueMemberships(at)

    expect(second.due).toBe(0)
    expect(await prisma.purchase.count({ where: { learnerId: learner.id } })).toBe(2)
  })

  it('le montant d\'une échéance ouverte ne suit pas un changement de prix', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await renewDueMemberships(new Date(Date.now() + 32 * DAY))

    await prisma.community.update({ where: { id: community.id }, data: { priceFcfa: 9000 } })

    const membership = await getMembership(community.id, learner.id)
    expect(membership!.dueAmountFcfa).toBe(5000)
  })

  it('régler l\'échéance avance le terme sans décaler l\'entrée', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    const before = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })

    const intent = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    expect(intent.kind).toBe('DUE')
    // Le mois réglé est celui qui court déjà, pas un mois qui commencerait
    // aujourd'hui.
    expect(intent.periodStart.getTime()).toBe(before.periodEnd.getTime())

    await prisma.$transaction((tx) => activateMembershipForPurchase(tx, intent.purchaseId))

    const settled = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(settled.status).toBe('ACTIVE')
    expect(settled.periodStart.getTime()).toBe(before.periodStart.getTime())
    expect(settled.periodEnd.getTime()).toBe(periodEndFor(before.periodEnd).getTime())
    // Toujours un seul membre : un renouvellement n'en ajoute pas un.
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(1)
  })

  it('l\'impayé met fin à l\'adhésion au terme du délai, pas avant', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await renewDueMemberships(new Date(Date.now() + 32 * DAY))

    // Le sursis court depuis l'ouverture du mois impayé — la fin du dernier
    // mois réglé —, pas depuis le passage du job.
    const sub = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    const dueSince = sub.periodEnd.getTime()

    const eve = new Date(dueSince + (MEMBERSHIP_GRACE_DAYS - 1) * DAY)
    expect((await expireOverdueMemberships(eve)).expired).toBe(0)
    expect(await isMember(community.id, learner.id)).toBe(true)

    const after = new Date(dueSince + (MEMBERSHIP_GRACE_DAYS + 1) * DAY)
    expect((await expireOverdueMemberships(after)).expired).toBe(1)

    const closed = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(closed.status).toBe('EXPIRED')
    expect(await isMember(community.id, learner.id)).toBe(false)
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(0)

    // L'échéance restée en attente est annulée : un paiement mobile money
    // arrivé après coup ne ressuscite pas une adhésion close.
    expect(await prisma.purchase.count({
      where: { learnerId: learner.id, providerStatus: 'PENDING' },
    })).toBe(0)
  })

  it('une adhésion close laisse derrière elle l\'accès qu\'elle a ouvert', async () => {
    const { community, learner, trainer, trainerUser } = await setup()
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'ddd', title: 'Masterclass DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
      },
    })
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await join(community.id, learner.id)

    await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    const sub = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    await expireOverdueMemberships(
      new Date(sub.periodEnd.getTime() + (MEMBERSHIP_GRACE_DAYS + 1) * DAY),
    )

    // Arbitrage 48 — la ligne close reste dans le calcul du chevauchement.
    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  it('un membre banni garde sa place mais n\'est pas reconduit', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await prisma.communitySubscription.updateMany({
      where: { learnerId: learner.id },
      data: { status: 'BANNED', bannedAt: new Date() },
    })

    // Tant que la période court, il reste membre : on écarte la parole, pas l'accès.
    expect(await isMember(community.id, learner.id)).toBe(true)

    const result = await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    expect(result.closed).toBe(1)
    expect(result.due).toBe(0)

    const sub = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(sub.status).toBe('EXPIRED')
  })

  it('régler son dû ne lève pas un bannissement', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    await prisma.communitySubscription.updateMany({
      where: { learnerId: learner.id },
      data: { status: 'BANNED', bannedAt: new Date() },
    })

    const intent = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    await prisma.$transaction((tx) => activateMembershipForPurchase(tx, intent.purchaseId))

    const sub = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(sub.status).toBe('BANNED')
  })

  it('une communauté fermée ne reconduit plus personne', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await prisma.community.update({ where: { id: community.id }, data: { status: 'closed' } })

    const result = await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    expect(result.closed).toBe(1)
    expect(
      (await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })).status,
    ).toBe('EXPIRED')
  })

  it('un ancien membre peut revenir, et repart sur une adhésion neuve', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await prisma.communitySubscription.updateMany({
      where: { learnerId: learner.id },
      data: { status: 'EXPIRED' },
    })
    await prisma.community.update({ where: { id: community.id }, data: { membersCount: 0 } })

    await join(community.id, learner.id)

    expect(await prisma.communitySubscription.count({ where: { learnerId: learner.id } })).toBe(2)
    expect((await getMembership(community.id, learner.id))!.status).toBe('ACTIVE')
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(1)
  })

  it('« mes communautés » ne liste que les adhésions ouvertes', async () => {
    const { community, learner } = await setup()
    expect(await listMyMemberships(learner.id)).toHaveLength(0)

    await join(community.id, learner.id)
    const mine = await listMyMemberships(learner.id)
    expect(mine).toHaveLength(1)
    expect(mine[0].community.name).toBe('Les artisans du back')
    expect(mine[0].community.trainerName).toBe('Awa Sarr')

    await prisma.communitySubscription.updateMany({
      where: { learnerId: learner.id }, data: { status: 'EXPIRED' },
    })
    expect(await listMyMemberships(learner.id)).toHaveLength(0)
  })
})
