// ==========================================================================
// Lot 7 — La position de lecture est réelle, et dépend du format (F3.1-F3.6)
// ==========================================================================
// L'écran de lecture rendait tout dans une balise `<video>`, et une seule
// mesure existait : `watchedSeconds`, calculée pour les seules vidéos munies
// d'une durée. Quatre des cinq ressources de staging étant des PDF ou des kits,
// l'acheteur obtenait un rectangle noir et une progression figée à zéro.
//
// Ce fichier tient les règles qui remplacent ça :
//
//   · une position par format — une seconde, une page, un marqueur ;
//   · **les bornes viennent du serveur**, jamais du navigateur, parce que la
//     même donnée alimente le seuil de consommation d'un litige (F3.6) ;
//   · la vidéo garde son maximum, le document sa dernière page, et cette
//     asymétrie est délibérée ;
//   · le marqueur d'une archive **ne change aucune éligibilité** (F8.1).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  updateReadingPosition,
  updateWatchProgress,
  markCourseDownloaded,
  listMyResources,
} from '@/lib/access'
import { computeConsumptionSnapshot } from '@/lib/disputes'

describe('Lot 7 — position de lecture', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function acheteur(opts: {
    format: string
    durationSeconds?: number | null
    pageCount?: number | null
  }) {
    const trainerUser = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

    const course = await prisma.course.create({
      data: {
        trainerId: profile.id,
        slug: `ressource-${opts.format}-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Une ressource',
        blurb: 'Une accroche',
        description: 'Une description complète.',
        category: 'dev',
        format: opts.format,
        priceFcfa: 15_000,
        durationSeconds: opts.durationSeconds ?? null,
        pageCount: opts.pageCount ?? null,
        status: 'published',
        publishedAt: new Date(),
        contentS3Key: 'course-assets/fixture/content',
        contentSizeBytes: BigInt(1024),
      },
    })

    const learner = await prisma.user.create({
      data: { email: 'apprenant@test.com', role: 'LEARNER', fullName: "Koffi N'Da" },
    })
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: 15_000, commissionRate: 0.15,
        trainerShareFcfa: 12_750, platformShareFcfa: 2_250,
        provider: 'STRIPE', providerStatus: 'SUCCEEDED',
        providerTransactionId: `pi_${Math.random().toString(36).slice(2, 12)}`,
      },
    })

    return { course, learner, purchase, profile }
  }

  const vue = (courseId: string, learnerId: string) =>
    prisma.courseView.findUnique({ where: { courseId_learnerId: { courseId, learnerId } } })

  // --- Une position par format ---------------------------------------------

  it('une vidéo se repère en secondes', async () => {
    const { course, learner } = await acheteur({ format: 'video', durationSeconds: 3_600 })
    await updateReadingPosition(course.id, learner.id, { watchedSeconds: 900 })

    const v = await vue(course.id, learner.id)
    expect(v?.watchedSeconds).toBe(900)
    expect(v?.lastPage).toBeNull()
  })

  it('un document se repère en pages', async () => {
    const { course, learner } = await acheteur({ format: 'pdf', pageCount: 40 })
    await updateReadingPosition(course.id, learner.id, { lastPage: 12 })

    const v = await vue(course.id, learner.id)
    expect(v?.lastPage).toBe(12)
    // Une page n'est pas une seconde : le compteur vidéo ne bouge pas.
    expect(v?.watchedSeconds).toBe(0)
  })

  it('une archive porte un marqueur, posé et retiré par l\'apprenant', async () => {
    const { course, learner } = await acheteur({ format: 'kit' })

    await updateReadingPosition(course.id, learner.id, { completed: true })
    expect((await vue(course.id, learner.id))?.completedAt).toBeInstanceOf(Date)

    await updateReadingPosition(course.id, learner.id, { completed: false })
    expect((await vue(course.id, learner.id))?.completedAt).toBeNull()
  })

  // --- Les bornes viennent du serveur --------------------------------------

  it('une seconde annoncée au-delà de la durée est ramenée à la durée', async () => {
    const { course, learner } = await acheteur({ format: 'video', durationSeconds: 1_200 })
    // Sans borne, il suffisait d'annoncer n'importe quoi pour peser sur le
    // seuil des 30 % — un nombre venu du navigateur décidait d'un
    // remboursement.
    await updateReadingPosition(course.id, learner.id, { watchedSeconds: 99_999 })

    expect((await vue(course.id, learner.id))?.watchedSeconds).toBe(1_200)
  })

  it('une page annoncée au-delà du total est ramenée au total', async () => {
    const { course, learner } = await acheteur({ format: 'pdf', pageCount: 24 })
    await updateReadingPosition(course.id, learner.id, { lastPage: 900 })

    expect((await vue(course.id, learner.id))?.lastPage).toBe(24)
  })

  it('sans longueur mesurée, la position est acceptée telle quelle', async () => {
    // Une vidéo dont la durée n'a pas pu être lue reste lisible : on ne va pas
    // refuser d'enregistrer une position faute de savoir la borner.
    const { course, learner } = await acheteur({ format: 'video', durationSeconds: null })
    await updateReadingPosition(course.id, learner.id, { watchedSeconds: 4_242 })

    expect((await vue(course.id, learner.id))?.watchedSeconds).toBe(4_242)
  })

  // --- Maximum pour la vidéo, dernière page pour le document ---------------

  it('la vidéo garde le point le plus loin, pas le dernier vu', async () => {
    const { course, learner } = await acheteur({ format: 'video', durationSeconds: 3_600 })
    await updateReadingPosition(course.id, learner.id, { watchedSeconds: 1_800 })
    await updateReadingPosition(course.id, learner.id, { watchedSeconds: 60 })

    // Ce nombre arbitre automatiquement un remboursement : un recul ne doit pas
    // rouvrir un droit que la lecture a consommé.
    expect((await vue(course.id, learner.id))?.watchedSeconds).toBe(1_800)
  })

  it('le document garde la dernière page, pas la plus lointaine', async () => {
    const { course, learner } = await acheteur({ format: 'pdf', pageCount: 40 })
    await updateReadingPosition(course.id, learner.id, { lastPage: 30 })
    await updateReadingPosition(course.id, learner.id, { lastPage: 4 })

    // C'est là qu'on reprendra : garder la page la plus lointaine ferait perdre
    // sa page à qui revient en arrière.
    expect((await vue(course.id, learner.id))?.lastPage).toBe(4)
  })

  it('l\'ancienne porte d\'entrée écrit toujours au même endroit', async () => {
    const { course, learner } = await acheteur({ format: 'video', durationSeconds: 3_600 })
    await updateWatchProgress(course.id, learner.id, 720)

    expect((await vue(course.id, learner.id))?.watchedSeconds).toBe(720)
  })

  it('une position sur une ressource non achetée est refusée', async () => {
    const { course } = await acheteur({ format: 'pdf', pageCount: 10 })
    const etranger = await prisma.user.create({
      data: { email: 'etranger@test.com', role: 'LEARNER' },
    })

    await expect(updateReadingPosition(course.id, etranger.id, { lastPage: 3 }))
      .rejects.toThrow('NOT_PURCHASED')
  })

  // --- Ce que la liste des ressources en fait -------------------------------

  it('lire un document en ligne suffit à ranger la ressource dans « commencées »', async () => {
    const { course, learner } = await acheteur({ format: 'pdf', pageCount: 40 })

    const avant = await listMyResources(learner.id)
    expect(avant.counts.started).toBe(0)

    await updateReadingPosition(course.id, learner.id, { lastPage: 3 })

    const apres = await listMyResources(learner.id)
    // Sans la page, un apprenant qui avait lu la moitié d'un PDF en ligne
    // restait rangé dans « pas commencé ».
    expect(apres.counts.started).toBe(1)
    expect(apres.items[0].courseView?.lastPage).toBe(3)
    expect(apres.items[0].course?.pageCount).toBe(40)
  })

  it('une archive marquée terminée compte comme commencée', async () => {
    const { course, learner } = await acheteur({ format: 'tableur' })
    await updateReadingPosition(course.id, learner.id, { completed: true })

    expect((await listMyResources(learner.id)).counts.started).toBe(1)
  })

  // --- Le litige : renseigné, pas modifié ----------------------------------

  it('le résumé de consommation porte la page lue en ligne', async () => {
    const { course, learner, purchase } = await acheteur({ format: 'pdf', pageCount: 24 })
    await updateReadingPosition(course.id, learner.id, { lastPage: 24 })

    const snapshot = await computeConsumptionSnapshot({
      id: purchase.id, learnerId: learner.id, courseId: course.id,
      communityId: null, periodStart: null, periodEnd: null,
    })

    expect(snapshot.lastPage).toBe(24)
    expect(snapshot.coursePageCount).toBe(24)
  })

  it('mais elle ne change ni le pourcentage ni le blocage (F8.1)', async () => {
    const { course, learner, purchase } = await acheteur({ format: 'pdf', pageCount: 24 })
    await updateReadingPosition(course.id, learner.id, { lastPage: 24 })

    const snapshot = await computeConsumptionSnapshot({
      id: purchase.id, learnerId: learner.id, courseId: course.id,
      communityId: null, periodStart: null, periodEnd: null,
    })

    // Un format téléchargeable échappe à la règle automatique : lu ou non, il
    // part en décision manuelle. Faire dépendre l'éligibilité de la lecture en
    // ligne serait un arbitrage de paiement, pas une conséquence de lot.
    expect(snapshot.ruleApplies).toBe(false)
    expect(snapshot.consumptionPercent).toBe(0)
    expect(snapshot.blocked).toBeNull()
  })

  it('le marqueur « terminé » n\'ouvre ni ne ferme aucun droit', async () => {
    const { course, learner, purchase } = await acheteur({ format: 'kit' })
    await updateReadingPosition(course.id, learner.id, { completed: true })

    const snapshot = await computeConsumptionSnapshot({
      id: purchase.id, learnerId: learner.id, courseId: course.id,
      communityId: null, periodStart: null, periodEnd: null,
    })

    // Seul `downloaded` bloque, et il n'a pas été posé.
    expect(snapshot.downloaded).toBe(false)
    expect(snapshot.blocked).toBeNull()
  })

  it('le téléchargement, lui, bloque toujours', async () => {
    const { course, learner, purchase } = await acheteur({ format: 'kit' })
    await markCourseDownloaded(course.id, learner.id)

    const snapshot = await computeConsumptionSnapshot({
      id: purchase.id, learnerId: learner.id, courseId: course.id,
      communityId: null, periodStart: null, periodEnd: null,
    })

    expect(snapshot.blocked).toBe('RESOURCE_DOWNLOADED')
    expect(snapshot.consumptionPercent).toBe(100)
  })

  it('la règle des 30 % d\'une vidéo n\'a pas bougé', async () => {
    const { course, learner, purchase } = await acheteur({ format: 'video', durationSeconds: 3_600 })
    await updateReadingPosition(course.id, learner.id, { watchedSeconds: 1_200 })

    const snapshot = await computeConsumptionSnapshot({
      id: purchase.id, learnerId: learner.id, courseId: course.id,
      communityId: null, periodStart: null, periodEnd: null,
    })

    expect(snapshot.consumptionPercent).toBe(33)
    expect(snapshot.ruleApplies).toBe(true)
    expect(snapshot.blocked).toBe('RESOURCE_CONSUMED')
  })
})
