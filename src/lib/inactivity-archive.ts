// ==========================================================================
// Archivage pour inactivité : modèle économique v1.1, plan d'action 2.4
// ==========================================================================
// « Après 6 mois sans connexion ni vente, ses fichiers sont archivés, avec un
// préavis de 30 jours et une restauration sur simple demande. »
//
// Ce que fait l'archivage, et ce qu'il ne fait pas :
//   · les ressources publiées du formateur sortent du catalogue, marquées
//     (`Course.inactivityArchivedAt`) pour que la restauration republie
//     celles-là et seulement celles-là ;
//   · rien n'est supprimé, et ceux qui ont acheté gardent leur accès
//     (principe 5 : on ne coupe jamais brutalement) ;
//   · les fichiers restent en place sur R2. Les passer en classe « accès peu
//     fréquent » coûterait des frais de lecture et 30 jours minimum de
//     facturation pour quelques centimes d'économie à cette échelle
//     (5 Go ≈ 45 FCFA par mois) : décision à reprendre si les volumes montent.
//
// Calendrier : préavis à 5 mois d'inactivité, archivage 30 jours plus tard si
// rien n'a bougé. Une connexion ou une vente annule le préavis.
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { absoluteUrl, deliverSideEffects, notifyWithEmail } from './notification'
import { fmtDate } from './format'

const DAY = 86_400_000
export const INACTIVITY_NOTICE_DAYS = 30
/** 6 mois, comptés en jours pour rester simple et prévisible. */
export const INACTIVITY_ARCHIVE_DAYS = 182

/** Pur : la dernière trace d'activité d'un formateur. */
export function lastActivityOf(t: { approvedAt: Date | null; lastLoginAt: Date | null; lastSaleAt: Date | null }): Date | null {
  const dates = [t.approvedAt, t.lastLoginAt, t.lastSaleAt].filter((d): d is Date => d !== null)
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null
}

/** Pur : que faire de ce formateur aujourd'hui ? */
export function inactivityStep(input: {
  lastActivity: Date | null
  noticeAt: Date | null
  archivedAt: Date | null
  now: Date
}): 'NONE' | 'NOTICE' | 'CANCEL_NOTICE' | 'ARCHIVE' {
  if (input.archivedAt || !input.lastActivity) return 'NONE'
  const idleDays = (input.now.getTime() - input.lastActivity.getTime()) / DAY
  if (input.noticeAt) {
    if (input.lastActivity > input.noticeAt) return 'CANCEL_NOTICE'
    const sinceNotice = (input.now.getTime() - input.noticeAt.getTime()) / DAY
    return sinceNotice >= INACTIVITY_NOTICE_DAYS && idleDays >= INACTIVITY_ARCHIVE_DAYS ? 'ARCHIVE' : 'NONE'
  }
  return idleDays >= INACTIVITY_ARCHIVE_DAYS - INACTIVITY_NOTICE_DAYS ? 'NOTICE' : 'NONE'
}

/** Job quotidien. */
export async function runInactivityArchive(now = new Date()): Promise<{ noticed: number; canceled: number; archived: number }> {
  const trainers = await db.trainerProfile.findMany({
    where: { approvedAt: { not: null }, inactivityArchivedAt: null, user: { deletedAt: null } },
    select: {
      id: true, userId: true, approvedAt: true, inactivityNoticeAt: true, inactivityArchivedAt: true,
      user: { select: { lastLoginAt: true } },
    },
  })
  if (trainers.length === 0) return { noticed: 0, canceled: 0, archived: 0 }
  const lastSales = await db.purchase.groupBy({
    by: ['trainerId'],
    where: { trainerId: { in: trainers.map((t) => t.id) }, providerStatus: 'SUCCEEDED' },
    _max: { createdAt: true },
  })
  const lastSaleOf = new Map(lastSales.map((r) => [r.trainerId, r._max.createdAt]))

  let noticed = 0, canceled = 0, archived = 0
  for (const t of trainers) {
    const lastActivity = lastActivityOf({ approvedAt: t.approvedAt, lastLoginAt: t.user.lastLoginAt, lastSaleAt: lastSaleOf.get(t.id) ?? null })
    const step = inactivityStep({ lastActivity, noticeAt: t.inactivityNoticeAt, archivedAt: t.inactivityArchivedAt, now })

    if (step === 'NOTICE') {
      const archiveOn = new Date(now.getTime() + INACTIVITY_NOTICE_DAYS * DAY)
      await db.trainerProfile.update({ where: { id: t.id }, data: { inactivityNoticeAt: now } })
      await auditStandalone({ actorId: null, actorRole: 'SYSTEM', action: 'TRAINER_INACTIVITY_NOTICE', targetType: 'TrainerProfile', targetId: t.id })
      const title = 'Vos ressources seront archivées sans nouvelle connexion'
      const p1 = `Vous ne vous êtes pas connecté et n'avez rien vendu depuis près de 6 mois. Le ${fmtDate(archiveOn)}, vos ressources sortiront du catalogue. Rien ne sera supprimé, et ceux qui les ont achetées y garderont accès.`
      const p2 = 'Il suffit de vous connecter avant cette date pour que rien ne change. Après, vous pourrez tout restaurer en un clic depuis votre espace.'
      await deliverSideEffects('TRAINER_INACTIVITY_NOTICE', { type: 'TrainerProfile', id: t.id }, () =>
        notifyWithEmail(
          t.userId,
          { type: 'TRAINER_INACTIVITY_NOTICE', title, body: `${p1} ${p2}`, link: '/formateur' },
          { subject: `NKAMVA · ${title}`, title, paragraphs: [p1, p2], cta: { label: 'Me connecter', url: absoluteUrl('/formateur') } },
          null,
        ),
      )
      noticed++
    } else if (step === 'CANCEL_NOTICE') {
      await db.trainerProfile.update({ where: { id: t.id }, data: { inactivityNoticeAt: null } })
      canceled++
    } else if (step === 'ARCHIVE') {
      const count = await db.$transaction(async (tx) => {
        const { count } = await tx.course.updateMany({
          where: { trainerId: t.id, status: 'published' },
          data: { status: 'archived', inactivityArchivedAt: now },
        })
        await tx.trainerProfile.update({ where: { id: t.id }, data: { inactivityArchivedAt: now } })
        await audit(tx, {
          actorId: null, actorRole: 'SYSTEM',
          action: 'TRAINER_INACTIVITY_ARCHIVED', targetType: 'TrainerProfile', targetId: t.id,
          meta: { coursesArchived: count },
        })
        return count
      })
      const title = 'Vos ressources sont archivées'
      const p1 = `Après 6 mois sans connexion ni vente, ${count > 1 ? `vos ${count} ressources sont sorties` : 'votre ressource est sortie'} du catalogue. Rien n'est supprimé, et ceux qui les ont achetées y gardent accès.`
      const p2 = 'Pour les remettre en vente, connectez-vous et cliquez sur « Restaurer mes ressources » dans votre espace formateur.'
      await deliverSideEffects('TRAINER_INACTIVITY_ARCHIVED', { type: 'TrainerProfile', id: t.id }, () =>
        notifyWithEmail(
          t.userId,
          { type: 'TRAINER_INACTIVITY_ARCHIVED', title, body: `${p1} ${p2}`, link: '/formateur' },
          { subject: `NKAMVA · ${title}`, title, paragraphs: [p1, p2], cta: { label: 'Restaurer mes ressources', url: absoluteUrl('/formateur') } },
          null,
        ),
      )
      archived++
    }
  }
  return { noticed, canceled, archived }
}

/**
 * Restauration sur simple demande : par le formateur lui-même, ou par le
 * service client. Republie ce que l'archivage a retiré, et seulement cela.
 */
export async function restoreInactivityArchive(trainerId: string, actor: { id: string; role: 'TRAINER' | 'SUPPORT' }) {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerId },
    select: { inactivityArchivedAt: true, inactivityNoticeAt: true, subscriptionStatus: true, suspendedAt: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  // Un formateur suspendu (impayé, sanction) ne republie rien par ce chemin :
  // c'est le règlement, ou la levée de la sanction, qui en décide.
  if (profile.subscriptionStatus === 'SUSPENDED' || profile.suspendedAt) throw new Error('TRAINER_SUSPENDED')
  if (!profile.inactivityArchivedAt && !profile.inactivityNoticeAt) return { restored: 0 }
  return db.$transaction(async (tx) => {
    const { count } = await tx.course.updateMany({
      where: { trainerId, inactivityArchivedAt: { not: null } },
      data: { status: 'published', inactivityArchivedAt: null },
    })
    await tx.trainerProfile.update({ where: { id: trainerId }, data: { inactivityArchivedAt: null, inactivityNoticeAt: null } })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role,
      action: 'TRAINER_INACTIVITY_RESTORED', targetType: 'TrainerProfile', targetId: trainerId,
      meta: { coursesRestored: count },
    })
    return { restored: count }
  })
}
