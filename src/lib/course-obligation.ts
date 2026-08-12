// ==========================================================================
// Contenu sous obligation — arbitrages 13 et 19
// ==========================================================================
// Une ressource **payée par quelqu'un** ne peut plus être effacée : elle doit
// continuer d'être servie à ses acheteurs. Ce qu'un formateur ne peut pas
// effacer ne lui est plus compté — ni dans son quota, ni sur sa facture.
//
// L'arbitrage dénoue deux blocages d'un coup :
//
// 1. **Le verrou de palier.** Réduire ses paliers est refusé dès que l'espace
//    est occupé (`STORAGE_IN_USE`), et ce qui l'occupe est en bonne partie du
//    contenu vendu qu'il n'a pas le droit de supprimer. Il était enfermé dans un
//    palier payant sans aucun moyen d'en sortir.
// 2. **Le stockage après le départ.** Au terme d'une résiliation, la ligne de
//    stockage disparaît avec l'abonnement — mais les fichiers, eux, doivent
//    rester servis. Personne ne payait plus pour un stockage obligatoire.
//
// ⚠️ **Pourquoi un champ, et pas un `count` d'achats à la volée.** Deux raisons,
// et la seconde est un arbitrage, pas une optimisation :
//
// - la lecture du quota est sur le chemin de **chaque téléversement** ;
// - l'arbitrage 19 exige que l'appartenance ne bouge **qu'au renouvellement**.
//   Un calcul en direct ferait retomber la ressource dans le quota le jour même
//   du remboursement, et pourrait bloquer les téléversements d'un formateur du
//   jour au lendemain sans qu'il ait rien fait.
//
// La date posée est celle du **premier** achat abouti, jamais celle du passage
// du code : c'est ce que le champ signifie, et c'est ce que la révision
// recalcule à l'identique.
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import type { PrismaTransaction } from './types'

/**
 * Ce qu'est un achat abouti. Même couple que le filtre `SOLD` de
 * `trainer-stats.ts` et `analytics.ts` — un achat remboursé ne vaut pas
 * obligation, son acheteur n'a plus accès.
 */
const SOLD = { providerStatus: 'SUCCEEDED', refundedAt: null } as const

/**
 * Pose le marqueur au **premier** achat abouti d'une ressource.
 *
 * `updateMany` avec `obligationAt: null` en condition plutôt qu'un `update` :
 * le deuxième acheteur ne doit pas repousser la date du premier. La condition
 * est dans la requête, pas dans une lecture préalable — deux achats simultanés
 * ne peuvent donc pas se marcher dessus.
 */
export async function markCourseObligation(
  tx: PrismaTransaction,
  courseId: string,
  at: Date,
): Promise<boolean> {
  const { count } = await tx.course.updateMany({
    where: { id: courseId, obligationAt: null },
    data: { obligationAt: at },
  })
  return count > 0
}

export interface ObligationRevision {
  /** Ressources entrées sous obligation depuis la dernière revue. */
  marked: number
  /** Ressources qui en sortent — leur dernier achat a été remboursé. */
  cleared: number
}

/**
 * Revoit les marqueurs d'un formateur. **Appelée au renouvellement, et là
 * seulement** (arbitrage 19) : c'est ce qui donne à un remboursement son délai
 * avant de rendre l'espace au quota.
 *
 * Elle marque autant qu'elle démarque. Le sens « marquer » n'est pas
 * redondant avec `markCourseObligation` : il rattrape une ressource dont
 * l'achat aurait abouti par un chemin qui n'est pas passé par le webhook —
 * un règlement constaté à la main, une reprise de transaction. Sans ce
 * rattrapage, l'écart serait silencieux et durerait indéfiniment.
 */
export async function reviseTrainerObligations(
  trainerId: string,
  at = new Date(),
): Promise<ObligationRevision> {
  const [courses, sold] = await Promise.all([
    db.course.findMany({
      where: { trainerId },
      select: { id: true, obligationAt: true },
    }),
    db.purchase.groupBy({
      by: ['courseId'],
      where: { trainerId, courseId: { not: null }, ...SOLD },
      _min: { createdAt: true },
    }),
  ])

  const firstPaidAt = new Map(
    sold
      .filter((row): row is typeof row & { courseId: string } => row.courseId !== null)
      .map((row) => [row.courseId, row._min.createdAt ?? at]),
  )

  const toMark = courses.filter((c) => c.obligationAt === null && firstPaidAt.has(c.id))
  const toClear = courses.filter((c) => c.obligationAt !== null && !firstPaidAt.has(c.id))

  // Les marquages portent chacun leur propre date : un seul `updateMany` les
  // écraserait toutes avec la même, et la date du premier achat serait perdue.
  for (const course of toMark) {
    await db.course.update({
      where: { id: course.id },
      data: { obligationAt: firstPaidAt.get(course.id) },
    })
  }

  if (toClear.length > 0) {
    await db.course.updateMany({
      where: { id: { in: toClear.map((c) => c.id) } },
      data: { obligationAt: null },
    })
  }

  // Une ressource qui sort d'obligation rend des octets au quota du formateur,
  // et peut le remettre en dépassement. L'événement doit être retrouvable :
  // c'est la seule trace de ce qui a changé son quota sans qu'il touche à rien.
  if (toMark.length > 0 || toClear.length > 0) {
    await auditStandalone({
      actorId: null, actorRole: 'SYSTEM',
      action: 'COURSE_OBLIGATION_REVISED', targetType: 'TrainerProfile', targetId: trainerId,
      meta: {
        marked: toMark.map((c) => c.id),
        cleared: toClear.map((c) => c.id),
      },
    })
  }

  return { marked: toMark.length, cleared: toClear.length }
}
