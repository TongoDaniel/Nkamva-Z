// ==========================================================================
// Lot 0 §2.12 / Lot 1 §8 — PendingAttachment : nettoyage des pièces jointes
// présignées jamais consommées avant expiration
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { deleteObject } from './s3'

export async function cleanupExpiredPendingAttachments(): Promise<number> {
  const expired = await db.pendingAttachment.findMany({ where: { status: 'PENDING', expiresAt: { lt: new Date() } } })
  for (const attachment of expired) {
    await deleteObject(attachment.s3Key)
    await db.pendingAttachment.update({ where: { id: attachment.id }, data: { status: 'EXPIRED' } })
  }
  if (expired.length > 0) {
    await auditStandalone({ action: 'PENDING_ATTACHMENTS_CLEANED', meta: { count: expired.length } })
  }
  return expired.length
}
