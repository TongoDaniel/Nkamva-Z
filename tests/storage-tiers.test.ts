// ==========================================================================
// Extension de stockage — arbitrages 54 et 69
// ==========================================================================
// Le prix du palier n'a jamais eu besoin d'être tranché : la décision 59 dit
// que les tarifs sont administrés. Ces tests vérifient surtout ce que cela
// implique — qu'aucun montant n'est en dur, et qu'un tarif absent facture zéro
// plutôt que d'inventer une créance.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  getTrainerStorage, setTrainerStorageTiers, storageChargeFor,
  quotaBytesFor, STORAGE_TIER_BYTES,
} from '@/lib/storage-tiers'
import { trainerStorage, TRAINER_STORAGE_QUOTA_BYTES } from '@/lib/courses'
import { getCurrentTariff, setTariff } from '@/lib/pricing'
import { renewDueSubscriptions } from '@/lib/subscriptions'

const GB = 1024 ** 3

describe('Extension de stockage', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date() },
    })
    const admin = await prisma.user.create({
      data: { email: 'admin@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { user, trainer, admin }
  }

  /** Occupe de l'espace par une ressource, comme le ferait un téléversement. */
  function fill(trainerId: string, bytes: number, slug = 'r1') {
    return prisma.course.create({
      data: {
        trainerId, slug, title: 'Ressource', blurb: 'Accroche', description: 'Description',
        category: 'dev', format: 'video', priceFcfa: 5000,
        contentSizeBytes: BigInt(bytes),
      },
    })
  }

  const inAnHour = () => new Date(Date.now() + 3_600_000)

  it('sans palier, le quota est celui de l\'arbitrage 54', async () => {
    const { trainer } = await setup()
    const view = await getTrainerStorage(trainer.id)
    expect(view.quotaBytes).toBe(TRAINER_STORAGE_QUOTA_BYTES)
    expect(view.tiers).toBe(0)
    expect(quotaBytesFor(0)).toBe(40 * GB)
  })

  it('chaque palier ajoute 50 Go, et le quota d\'upload suit', async () => {
    const { trainer, user } = await setup()
    await setTrainerStorageTiers(trainer.id, user.id, 2)

    expect(quotaBytesFor(2)).toBe(40 * GB + 2 * STORAGE_TIER_BYTES)
    // Le garde-fou de téléversement lit `trainerStorage` : sans cela, un
    // formateur paierait de l'espace sans jamais pouvoir s'en servir.
    expect((await trainerStorage(trainer.id)).quotaBytes).toBe(140 * GB)
  })

  it('aucun prix posé : le palier ne facture rien', async () => {
    const { trainer, user } = await setup()
    await setTrainerStorageTiers(trainer.id, user.id, 3)

    // L'absence de tarif n'invente pas de créance (décision 59).
    const view = await getTrainerStorage(trainer.id)
    expect(view.tierPriceFcfa).toBe(0)
    expect(view.monthlyTiersFcfa).toBe(0)
    expect(await storageChargeFor(trainer.id, 'MONTHLY', new Date())).toEqual({
      tiers: 3, amountFcfa: 0,
    })
  })

  it('le prix est administré, pas déployé', async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({
      kind: 'STORAGE_TIER', cadence: 'MONTHLY', amountFcfa: 2000,
      validFrom: inAnHour(), actorId: admin.id,
    })
    await setTrainerStorageTiers(trainer.id, user.id, 2)

    const at = new Date(Date.now() + 2 * 3_600_000)
    expect(await storageChargeFor(trainer.id, 'MONTHLY', at)).toEqual({
      tiers: 2, amountFcfa: 4000,
    })
  })

  it('un tarif de palier ne se confond pas avec celui de l\'abonnement', async () => {
    const { admin } = await setup()
    await setTariff({
      cadence: 'MONTHLY', amountFcfa: 9000, validFrom: inAnHour(), actorId: admin.id,
    })
    await setTariff({
      kind: 'STORAGE_TIER', cadence: 'MONTHLY', amountFcfa: 2000,
      validFrom: inAnHour(), actorId: admin.id,
    })

    const at = new Date(Date.now() + 2 * 3_600_000)
    // Sans le filtre sur `kind`, le dernier tarif posé écraserait l'autre :
    // l'abonnement serait facturé 2 000 FCFA.
    expect((await getCurrentTariff('MONTHLY', at))?.amountFcfa).toBe(9000)
    // Et le tarif d'abonnement précédent n'a pas été borné par le palier.
    expect(await prisma.platformTariff.count({ where: { validUntil: { not: null } } })).toBe(0)
  })

  it('arbitrage 69 — le palier est facturé avec l\'abonnement, à sa cadence', async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({
      cadence: 'MONTHLY', amountFcfa: 9000, validFrom: inAnHour(), actorId: admin.id,
    })
    await setTariff({
      kind: 'STORAGE_TIER', cadence: 'MONTHLY', amountFcfa: 2000,
      validFrom: inAnHour(), actorId: admin.id,
    })
    await setTrainerStorageTiers(trainer.id, user.id, 2)
    await prisma.trainerProfile.update({
      where: { id: trainer.id },
      data: { subscriptionCurrentPeriodEnd: new Date(Date.now() + 2 * 3_600_000) },
    })

    await renewDueSubscriptions(new Date(Date.now() + 3 * 3_600_000))

    const charge = await prisma.subscriptionCharge.findFirstOrThrow({
      where: { trainerId: trainer.id },
    })
    // Une seule ligne à régler, un seul impayé possible.
    expect(charge.storageTiers).toBe(2)
    expect(charge.storageFcfa).toBe(4000)
    expect(charge.amountDueFcfa).toBe(13_000)
  })

  it('le montant du stockage est figé à l\'ouverture de la période', async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({
      kind: 'STORAGE_TIER', cadence: 'MONTHLY', amountFcfa: 2000,
      validFrom: inAnHour(), actorId: admin.id,
    })
    await setTrainerStorageTiers(trainer.id, user.id, 1)
    await prisma.trainerProfile.update({
      where: { id: trainer.id },
      data: { subscriptionCurrentPeriodEnd: new Date(Date.now() + 2 * 3_600_000) },
    })
    await renewDueSubscriptions(new Date(Date.now() + 3 * 3_600_000))

    // Le formateur libère son palier : la période déjà ouverte ne bouge pas.
    await setTrainerStorageTiers(trainer.id, user.id, 0)
    const charge = await prisma.subscriptionCharge.findFirstOrThrow({
      where: { trainerId: trainer.id },
    })
    expect(charge.storageFcfa).toBe(2000)
  })

  it('réduire en dessous de ce qui est stocké est refusé', async () => {
    const { trainer, user } = await setup()
    await setTrainerStorageTiers(trainer.id, user.id, 2)
    // 60 Go occupés : au-delà des 40 inclus, il faut au moins un palier.
    await fill(trainer.id, 60 * GB)

    expect((await getTrainerStorage(trainer.id)).minimumTiers).toBe(1)
    await expect(setTrainerStorageTiers(trainer.id, user.id, 0)).rejects.toThrow('STORAGE_IN_USE')

    // Descendre à un palier reste possible : 40 + 50 = 90 Go couvrent les 60.
    expect((await setTrainerStorageTiers(trainer.id, user.id, 1)).tiers).toBe(1)
  })

  it('un abonnement suspendu ne prend pas d\'engagement supplémentaire', async () => {
    const { trainer, user } = await setup()
    await prisma.trainerProfile.update({
      where: { id: trainer.id }, data: { subscriptionStatus: 'SUSPENDED' },
    })

    await expect(setTrainerStorageTiers(trainer.id, user.id, 1))
      .rejects.toThrow('SUBSCRIPTION_SUSPENDED')
    // Libérer reste permis : on ne retient personne dans une dépense.
    await prisma.trainerProfile.update({ where: { id: trainer.id }, data: { storageTiers: 2 } })
    expect((await setTrainerStorageTiers(trainer.id, user.id, 1)).tiers).toBe(1)
  })

  it('un nombre de paliers négatif ou fractionnaire est refusé', async () => {
    const { trainer, user } = await setup()
    await expect(setTrainerStorageTiers(trainer.id, user.id, -1)).rejects.toThrow('INVALID_AMOUNT')
    await expect(setTrainerStorageTiers(trainer.id, user.id, 1.5)).rejects.toThrow('INVALID_AMOUNT')
  })
})
