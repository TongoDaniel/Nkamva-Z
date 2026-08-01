// ==========================================================================
// Lot 1 — Nettoyage des pièces jointes non consommées
// ==========================================================================
// Une PendingAttachment est une URL d'upload délivrée mais jamais rattachée à
// un objet métier (litige, contestation). Passé son TTL, l'objet R2 éventuel
// est supprimé et la ligne marquée EXPIRED — on ne la supprime pas, elle garde
// la trace d'une clé signée délivrée.
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { deleteObject } from './s3'

export async function cleanupExpiredPendingAttachments(): Promise<{ cleaned: number }> {
  const expired = await db.pendingAttachment.findMany({
    where: { status: 'PENDING', consumedAt: null, expiresAt: { lt: new Date() } },
    select: { id: true, s3Key: true, issuerId: true, scope: true },
  })

  for (const attachment of expired) {
    await deleteObject(attachment.s3Key)
    await db.pendingAttachment.update({
      where: { id: attachment.id },
      data: { status: 'EXPIRED' },
    })
    await auditStandalone({
      action: 'PENDING_ATTACHMENT_EXPIRED', targetType: 'PendingAttachment', targetId: attachment.id,
      meta: { issuerId: attachment.issuerId, scope: attachment.scope },
    })
  }

  return { cleaned: expired.length }
}
