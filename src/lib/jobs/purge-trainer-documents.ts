// ==========================================================================
// Job : effacement des pièces justificatives 90 jours après la décision (D7)
// ==========================================================================
// Une pièce d'identité, un diplôme et une vidéo de présentation n'ont plus
// aucune raison d'être conservés une fois la candidature tranchée. Le délai
// couvre les recours : au-delà, le fichier part et la ligne n'en garde qu'une
// trace exsangue — le type, l'état, et la date d'effacement.
//
// Toutes les versions sont concernées, y compris celles archivées par une
// re-soumission : elles contiennent les mêmes données personnelles.
// ==========================================================================

import { db } from '../db'
import { audit } from '../audit'
import { deleteObject } from '../s3'
import { DOCUMENT_RETENTION_DAYS } from '../trainer-applications'

const DAY = 86_400_000

export interface PurgeDocumentsResult {
  eligible: number
  purged: number
  /** Objets que le stockage n'a pas confirmé supprimés : la ligne est laissée intacte. */
  failed: number
}

/**
 * Effacement d'une pièce. La suppression du fichier précède l'écriture en base :
 * si elle échoue, la ligne garde sa clé et le prochain passage réessaiera. Dans
 * l'ordre inverse, un échec laisserait un fichier orphelin que plus rien ne
 * référence.
 */
async function purgeDocument(
  documentId: string,
  s3Key: string,
  remove: (key: string) => Promise<boolean>,
): Promise<boolean> {
  if (!(await remove(s3Key))) return false

  await db.$transaction(async (tx) => {
    const { count } = await tx.trainerDocument.updateMany({
      where: { id: documentId, purgedAt: null },
      data: {
        purgedAt: new Date(),
        // `s3Key` et `sha256` sont non nuls au schéma : on les vide plutôt que
        // de les annuler. `originalFileName` porte souvent le nom de la
        // personne — il part aussi.
        s3Key: '',
        sha256: '',
        originalFileName: null,
      },
    })
    if (count === 0) return
    await audit(tx, {
      actorRole: 'SYSTEM',
      action: 'TRAINER_DOCUMENT_PURGED',
      targetType: 'TrainerDocument',
      targetId: documentId,
      meta: { retentionDays: DOCUMENT_RETENTION_DAYS },
    })
  })

  return true
}

export async function purgeTrainerDocuments(
  now: Date = new Date(),
  remove: (key: string) => Promise<boolean> = deleteObject,
): Promise<PurgeDocumentsResult> {
  const cutoff = new Date(now.getTime() - DOCUMENT_RETENTION_DAYS * DAY)

  const documents = await db.trainerDocument.findMany({
    where: {
      purgedAt: null,
      application: {
        status: { in: ['APPROVED', 'REJECTED'] },
        // Une seule de ces deux dates est renseignée selon l'issue.
        OR: [{ approvedAt: { lte: cutoff } }, { rejectedAt: { lte: cutoff } }],
      },
    },
    select: { id: true, s3Key: true },
    orderBy: { createdAt: 'asc' },
    take: 500,
  })

  let purged = 0
  let failed = 0
  for (const document of documents) {
    try {
      if (await purgeDocument(document.id, document.s3Key, remove)) purged++
      else failed++
    } catch (err) {
      failed++
      console.error('[JOB:purge-trainer-documents] échec', {
        documentId: document.id,
        error: String(err),
      })
    }
  }

  return { eligible: documents.length, purged, failed }
}
