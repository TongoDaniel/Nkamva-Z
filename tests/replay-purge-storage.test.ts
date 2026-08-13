// ==========================================================================
// Purge des replays — l'objet part, pas seulement la ligne (arbitrages 51, 94)
// ==========================================================================
// Le défaut que ce fichier existe pour empêcher : la purge vidait `s3Key` et
// `sizeBytes` **sans jamais supprimer le fichier**. Le quota était rendu au
// formateur, les octets restaient dans le seau, et la facture de stockage ne
// baissait jamais. Une purge qui ne purge que la comptabilité coûte plus cher
// que pas de purge du tout, puisqu'elle autorise à reremplir la place.
//
// Ce test vit dans son propre fichier parce qu'il **remplace** le module de
// stockage : le mocker dans `lives.test.ts` priverait les autres cas de
// `presignDownload`. `importOriginal` garde donc tout le reste intact, et seule
// `deleteObject` est observée.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

const deleted: string[] = []

vi.mock('@/lib/s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/s3')>()),
  deleteObject: vi.fn(async (key: string) => { deleted.push(key) }),
}))

import { purgeExpiredReplays, REPLAY_RETENTION_MONTHS } from '@/lib/lives'
import { trainerStorageUsedBytes } from '@/lib/courses'

const DAY = 86_400_000

describe('Purge des replays — stockage', () => {
  beforeEach(async () => { await cleanDatabase(); deleted.length = 0 })
  afterEach(async () => { await cleanDatabase() })

  async function replay(overrides: Record<string, unknown> = {}) {
    const trainerUser = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date() },
    })
    // Communauté gratuite : ses replays comptent dans le quota du formateur
    // (arbitrage 17 de `docs/abonnement-formateur.md`), ce qui rend la
    // restitution d'espace observable.
    const community = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Les artisans', slug: 'artisans', priceFcfa: 0 },
    })
    const session = await prisma.liveSession.create({
      data: {
        communityId: community.id, trainerId: trainer.id, title: 'Revue de checklists',
        scheduledStartAt: new Date(Date.now() - 400 * DAY),
        roomName: `nkamva-${crypto.randomUUID()}`,
        status: 'ENDED',
      },
    })
    const recordedAt = new Date(Date.now() - 400 * DAY)
    const purgeAt = new Date(recordedAt)
    purgeAt.setMonth(purgeAt.getMonth() + REPLAY_RETENTION_MONTHS)

    const created = await prisma.replay.create({
      data: {
        sessionId: session.id, communityId: community.id, trainerId: trainer.id,
        title: 'Revue de checklists', recordedAt, purgeAt, status: 'READY',
        s3Key: `replays/${session.id}/enregistrement.mp4`,
        sizeBytes: BigInt(1_400_000_000),
        audioS3Key: `replays/${session.id}/enregistrement.ogg`,
        audioSizeBytes: BigInt(60_000_000),
        ...overrides,
      },
    })
    return { replay: created, trainer }
  }

  it('la vidéo **et** la variante audio sont supprimées du seau', async () => {
    const { replay: r, trainer } = await replay()
    const after = new Date(r.purgeAt.getTime() + DAY)

    expect(await trainerStorageUsedBytes(trainer.id)).toBe(1_460_000_000)

    const result = await purgeExpiredReplays(after)

    expect(result.purged).toBe(1)
    // C'est **l'objet** qui doit partir, pas seulement la ligne : sans cette
    // assertion, le défaut d'origine repasserait sans que rien ne bronche.
    expect(deleted.sort()).toEqual([r.audioS3Key, r.s3Key].sort())

    const purged = await prisma.replay.findUniqueOrThrow({ where: { id: r.id } })
    expect(purged.status).toBe('PURGED')
    expect(purged.s3Key).toBeNull()
    expect(purged.audioS3Key).toBeNull()
    expect(purged.sizeBytes).toBeNull()
    expect(purged.audioSizeBytes).toBeNull()
    expect(await trainerStorageUsedBytes(trainer.id)).toBe(0)
  })

  it('un replay hébergé ailleurs n\'a aucune clé à supprimer', async () => {
    const { replay: r } = await replay({
      s3Key: null, sizeBytes: null, audioS3Key: null, audioSizeBytes: null,
      muxAssetId: 'asset-123', muxPlaybackId: 'play-123',
    })

    await purgeExpiredReplays(new Date(r.purgeAt.getTime() + DAY))

    // Aucun appel : chercher à supprimer une clé nulle ferait échouer la purge
    // de tous les replays d'avant la bascule vers le stockage objet.
    expect(deleted).toEqual([])
  })

  it('les octets libérés sont journalisés, audio compris', async () => {
    const { replay: r } = await replay()

    await purgeExpiredReplays(new Date(r.purgeAt.getTime() + DAY))

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'REPLAY_PURGED', targetId: r.id },
    })
    expect((entry.meta as { freedBytes?: number }).freedBytes).toBe(1_460_000_000)
  })
})
