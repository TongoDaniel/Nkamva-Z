import { db } from './db'
import type { PrismaTransaction } from './types'

export interface AuditParams {
  actorId?: string | null
  actorRole?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  meta?: Record<string, unknown> | null
}

export async function audit(tx: PrismaTransaction, params: AuditParams): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      actorRole: params.actorRole ?? 'SYSTEM',
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      meta: params.meta ?? null,
    },
  })
}

export async function auditStandalone(params: AuditParams): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      actorRole: params.actorRole ?? 'SYSTEM',
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      meta: params.meta ?? null,
    },
  })
}
