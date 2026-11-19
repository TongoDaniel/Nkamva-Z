// ==========================================================================
// Les notes de replay, gardées sur le compte — revue du 16 novembre 2026
// ==========================================================================
// Ce que ces tests fixent :
// - une note s'écrit, se relit, se réécrit, et une note vide disparaît ;
// - elle est privée : un autre membre, l'animateur compris, lit la sienne,
//   jamais celle d'un autre ;
// - le droit de l'écrire est celui de voir le replay ;
// - elle part avec l'effacement du compte, et figure dans l'export.
//
// Ils demandent la migration `20261119120000_replay_notes` sur la base de test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { getReplayNote, saveReplayNote } from '@/lib/lives'
import { buildGdprExport } from '@/lib/profile'
import { purgeAccount } from '@/lib/jobs/purge-deleted-accounts'

const JOUR = 86_400_000

describe('Notes de replay sur le compte', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function decor() {
    const trainerUser = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Cercle des directs', slug: 'cercle-des-directs',
        priceFcfa: 5_000, status: 'active', eventsEnabled: true,
      },
    })
    const debut = new Date(Date.now() - 3 * JOUR)
    const session = await prisma.liveSession.create({
      data: {
        communityId: community.id, trainerId: profile.id,
        title: 'Revue de checklists QA', scheduledStartAt: debut,
        status: 'ENDED', startedAt: debut, endedAt: new Date(debut.getTime() + 3_600_000),
        roomName: `nkamva-${Math.random().toString(36).slice(2, 10)}`,
      },
    })
    const replay = await prisma.replay.create({
      data: {
        sessionId: session.id, communityId: community.id, trainerId: profile.id,
        title: session.title, recordedAt: debut, durationSeconds: 3_600,
        status: 'READY', s3Key: 'replays/fixture.mp4',
        purgeAt: new Date(Date.now() + 700 * JOUR),
      },
    })
    return { trainerUser, community, replay }
  }

  async function membre(communityId: string) {
    const learner = await prisma.user.create({
      data: { email: `m-${Math.random().toString(36).slice(2, 8)}@test.com`, role: 'LEARNER', fullName: 'Koffi' },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId, learnerId: learner.id, status: 'ACTIVE',
        periodStart: new Date(Date.now() - 5 * JOUR),
        periodEnd: new Date(Date.now() + 25 * JOUR),
      },
    })
    return learner
  }

  it("s'écrit, se relit et se réécrit", async () => {
    const { community, replay } = await decor()
    const learner = await membre(community.id)

    expect((await getReplayNote(replay.id, learner.id)).body).toBe('')

    await saveReplayNote(replay.id, learner.id, 'Revoir le découpage à 12 min.')
    expect((await getReplayNote(replay.id, learner.id)).body).toBe('Revoir le découpage à 12 min.')

    await saveReplayNote(replay.id, learner.id, 'Version corrigée.')
    const relue = await getReplayNote(replay.id, learner.id)
    expect(relue.body).toBe('Version corrigée.')
    expect(relue.updatedAt).not.toBeNull()
    expect(await prisma.replayNote.count()).toBe(1)
  })

  it('une note vide est retirée', async () => {
    const { community, replay } = await decor()
    const learner = await membre(community.id)
    await saveReplayNote(replay.id, learner.id, 'À effacer')
    await saveReplayNote(replay.id, learner.id, '   ')
    expect(await prisma.replayNote.count()).toBe(0)
    expect((await getReplayNote(replay.id, learner.id)).updatedAt).toBeNull()
  })

  it("est privée : ni un autre membre ni l'animateur ne la lisent", async () => {
    const { trainerUser, community, replay } = await decor()
    const aminata = await membre(community.id)
    const koffi = await membre(community.id)
    await saveReplayNote(replay.id, aminata.id, 'Note personnelle')

    expect((await getReplayNote(replay.id, koffi.id)).body).toBe('')
    expect((await getReplayNote(replay.id, trainerUser.id)).body).toBe('')
  })

  it("demande le droit de voir le replay", async () => {
    const { replay } = await decor()
    const etranger = await prisma.user.create({
      data: { email: 'etranger@test.com', role: 'LEARNER', fullName: 'Hors communauté' },
    })
    await expect(saveReplayNote(replay.id, etranger.id, 'Intrusion')).rejects.toThrow('NOT_MEMBER')
    await expect(getReplayNote(replay.id, etranger.id)).rejects.toThrow('NOT_MEMBER')
    await expect(getReplayNote('00000000-0000-0000-0000-000000000000', etranger.id)).rejects.toThrow(
      'REPLAY_NOT_FOUND',
    )
  })

  it("figure dans l'export des données, et part avec l'effacement du compte", async () => {
    const { community, replay } = await decor()
    const learner = await membre(community.id)
    await saveReplayNote(replay.id, learner.id, 'À exporter')

    const exported = await buildGdprExport(learner.id)
    expect(exported?.notesDeReplay.map((n) => n.body)).toEqual(['À exporter'])

    await prisma.communitySubscription.updateMany({
      where: { learnerId: learner.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    })
    await prisma.user.update({
      where: { id: learner.id },
      data: { deletionRequestedAt: new Date(Date.now() - 40 * JOUR) },
    })
    await purgeAccount(learner.id, new Date())
    expect(await prisma.replayNote.count({ where: { userId: learner.id } })).toBe(0)
  })
})
