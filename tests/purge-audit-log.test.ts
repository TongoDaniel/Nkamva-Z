// ==========================================================================
// Purge du journal d'audit — conservation limitée
// ==========================================================================
// Ce que ces tests tiennent, c'est l'asymétrie : **ce qui prouve reste, ce qui
// encombre part**. Une purge uniforme passerait tous les tests d'une purge et
// détruirait exactement ce qu'un journal existe pour montrer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  purgeAuditLog, auditRetention,
  AUDIT_TECHNICAL_RETENTION_MONTHS, AUDIT_DEFAULT_RETENTION_MONTHS,
} from '@/lib/jobs/purge-audit-log'
import { TARIFF_SWITCH_NOTICE_DAYS } from '@/lib/notices'

const MONTH = 30 * 86_400_000

describe('Purge du journal d\'audit', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  /** Une ligne datée dans le passé — `createdAt` accepte une valeur explicite. */
  function entry(action: string, monthsAgo: number) {
    return prisma.auditLog.create({
      data: {
        action,
        actorRole: 'SYSTEM',
        targetType: 'Test',
        createdAt: new Date(Date.now() - monthsAgo * MONTH),
      },
    })
  }

  const actionsLeft = async () =>
    (await prisma.auditLog.findMany({ select: { action: true }, orderBy: { action: 'asc' } }))
      .map((r) => r.action)
      .filter((a) => a !== 'AUDIT_LOG_PURGED')

  it('les traces de machine partent, les décisions financières restent', async () => {
    await entry('SCHEDULED_JOB_COMPLETED', AUDIT_TECHNICAL_RETENTION_MONTHS + 1)
    await entry('NOTIFICATION_DELIVERY_FAILED', AUDIT_TECHNICAL_RETENTION_MONTHS + 1)
    // Bien plus vieilles, et pourtant conservées : leur durée est celle des
    // écritures comptables, qui n'est pas arbitrée.
    await entry('PAYOUT_APPROVED', AUDIT_DEFAULT_RETENTION_MONTHS + 24)
    await entry('DISPUTE_RESOLVED', AUDIT_DEFAULT_RETENTION_MONTHS + 24)
    await entry('USER_SANCTION_CHANGED', AUDIT_DEFAULT_RETENTION_MONTHS + 24)

    const result = await purgeAuditLog()

    expect(result.technical).toBe(2)
    expect(result.protectedKept).toBe(3)
    expect(await actionsLeft()).toEqual(['DISPUTE_RESOLVED', 'PAYOUT_APPROVED', 'USER_SANCTION_CHANGED'])
  })

  it('la vie ordinaire de la plateforme part à 36 mois, pas avant', async () => {
    await entry('COMMUNITY_CREATED', AUDIT_DEFAULT_RETENTION_MONTHS - 1)
    await entry('LIVE_SESSION_SCHEDULED', AUDIT_DEFAULT_RETENTION_MONTHS + 1)

    const result = await purgeAuditLog()

    expect(result.ordinary).toBe(1)
    expect(await actionsLeft()).toEqual(['COMMUNITY_CREATED'])
  })

  it('une trace de machine récente n\'est pas touchée', async () => {
    await entry('SCHEDULED_JOB_COMPLETED', AUDIT_TECHNICAL_RETENTION_MONTHS - 1)

    const result = await purgeAuditLog()

    expect(result.technical).toBe(0)
    expect(await actionsLeft()).toEqual(['SCHEDULED_JOB_COMPLETED'])
  })

  /**
   * Le piège : `sendNoticeOnce` se sert du journal comme mémoire de ce qui a
   * déjà été annoncé. Purger un marqueur ferait repartir un préavis. C'est sans
   * danger parce que le plus long horizon — 60 jours — est très en deçà des
   * 12 mois du régime technique, et ce test fixe cet écart.
   */
  it('la mémoire des préavis survit largement à l\'horizon du préavis', async () => {
    const horizonMonths = TARIFF_SWITCH_NOTICE_DAYS / 30
    expect(AUDIT_TECHNICAL_RETENTION_MONTHS).toBeGreaterThan(horizonMonths * 2)

    await entry('TARIFF_SWITCH_NOTICE_60', horizonMonths + 1)
    await purgeAuditLog()
    expect(await actionsLeft()).toEqual(['TARIFF_SWITCH_NOTICE_60'])
  })

  it('rejouer la purge ne supprime rien de plus et ne se journalise pas pour rien', async () => {
    await entry('SCHEDULED_JOB_COMPLETED', AUDIT_TECHNICAL_RETENTION_MONTHS + 1)

    expect((await purgeAuditLog()).technical).toBe(1)
    const second = await purgeAuditLog()

    expect(second.technical).toBe(0)
    expect(second.ordinary).toBe(0)
    // Un seul compte rendu : le second passage n'avait rien à dire.
    expect(await prisma.auditLog.count({ where: { action: 'AUDIT_LOG_PURGED' } })).toBe(1)
  })

  it('le régime se lit sur l\'action', () => {
    expect(auditRetention('PAYOUT_APPROVED')).toBe('PROTECTED')
    expect(auditRetention('SETTING_UPDATED')).toBe('PROTECTED')
    expect(auditRetention('SCHEDULED_JOB_FAILED')).toBe('TECHNICAL')
    expect(auditRetention('MEMBERSHIP_END_NOTICE_7')).toBe('TECHNICAL')
    expect(auditRetention('COMMUNITY_CREATED')).toBe('DEFAULT')
  })
})
