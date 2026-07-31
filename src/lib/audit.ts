import { Prisma } from '@prisma/client'
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

function toData(params: AuditParams): Prisma.AuditLogCreateInput {
  return {
    actorId: params.actorId ?? null,
    actorRole: params.actorRole ?? 'SYSTEM',
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    // Un champ Json? nullable refuse le `null` JavaScript : Prisma exige
    // `Prisma.DbNull` pour écrire NULL en base (`JsonNull` écrirait le littéral
    // JSON `null`). Sans cela, tout audit sans `meta` lève une erreur.
    meta: (params.meta ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
  }
}

export async function audit(tx: PrismaTransaction, params: AuditParams): Promise<void> {
  await tx.auditLog.create({ data: toData(params) })
}

export async function auditStandalone(params: AuditParams): Promise<void> {
  await db.auditLog.create({ data: toData(params) })
}
