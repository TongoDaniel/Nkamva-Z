// Arbitrages 1, 2, 5 — le formateur pilote son propre abonnement.
//
// Trois champs modélisés n'étaient écrits par personne : `pendingCadence`
// (décision 52), `subscriptionCanceledAt`, et le drapeau de renouvellement
// automatique. Cette route est ce qui leur donne enfin un auteur.
import { z } from 'zod'
import { success, error, requireTrainer, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { auditStandalone } from '@/lib/audit'
import { cancelSubscription, resumeSubscription } from '@/lib/subscriptions'

const UpdateSchema = z.object({
  /** Décision 52 — prend effet au renouvellement, jamais en cours de période. */
  cadence: z.enum(['MONTHLY', 'YEARLY']).optional(),
  /** Arbitrage 8 — le prélèvement sur solde est un consentement. */
  autoRenew: z.boolean().optional(),
})

export async function PATCH(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed
  const { cadence, autoRenew } = parsed.data
  if (cadence === undefined && autoRenew === undefined) {
    return error('NOTHING_TO_UPDATE', 'Aucune modification demandée.', 400)
  }

  const profile = await db.trainerProfile.findUnique({
    where: { id: ctx.user.trainerId! },
    select: { subscriptionCadence: true, subscriptionCanceledAt: true },
  })
  if (!profile) return error('TRAINER_NOT_FOUND', 'Profil introuvable.', 404)
  if (profile.subscriptionCanceledAt) {
    return error(
      'SUBSCRIPTION_CANCELED',
      "Votre abonnement est résilié : reprenez-le d'abord pour le modifier.",
      409,
    )
  }

  const updated = await db.trainerProfile.update({
    where: { id: ctx.user.trainerId! },
    data: {
      // Choisir la cadence déjà en vigueur efface l'intention plutôt que de la
      // dupliquer : sans cela, revenir sur son choix laisserait un
      // `pendingCadence` identique à la cadence courante, et le renouvellement
      // annoncerait un changement qui n'en est pas un.
      ...(cadence !== undefined && {
        pendingCadence: cadence === profile.subscriptionCadence ? null : cadence,
      }),
      ...(autoRenew !== undefined && { autoRenew }),
    },
    select: { subscriptionCadence: true, pendingCadence: true, autoRenew: true },
  })

  await auditStandalone({
    actorId: ctx.user.id, actorRole: 'TRAINER',
    action: 'SUBSCRIPTION_PREFERENCES_UPDATED',
    targetType: 'TrainerProfile', targetId: ctx.user.trainerId!,
    meta: { cadence: cadence ?? null, autoRenew: autoRenew ?? null },
  })

  return success(updated)
}

/** Résilier — à effet fin de période, sans rien couper (arbitrage 1). */
export async function DELETE() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  try {
    return success(await cancelSubscription(ctx.user.trainerId!, ctx.user.id))
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'ACTIVE_PAID_MEMBERS') {
      return error(
        'ACTIVE_PAID_MEMBERS',
        'Des membres payants sont encore abonnés à votre communauté. Fermez-la : leurs adhésions ' +
          "s'éteindront à leur terme, et vous pourrez alors résilier.",
        409,
      )
    }
    if (code === 'ALREADY_CANCELED') {
      return error('ALREADY_CANCELED', 'Votre abonnement est déjà résilié.', 409)
    }
    if (code === 'TRAINER_NOT_FOUND') return error('TRAINER_NOT_FOUND', 'Profil introuvable.', 404)
    console.error('[API:SUBSCRIPTION_CANCEL]', err)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}

/** Revenir sur sa résiliation, tant que la période court. */
export async function POST() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  try {
    await resumeSubscription(ctx.user.trainerId!, ctx.user.id)
    return success({ resumed: true })
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'NOT_CANCELED') {
      return error('NOT_CANCELED', "Votre abonnement n'est pas résilié.", 409)
    }
    if (code === 'ALREADY_ENDED') {
      return error(
        'ALREADY_ENDED',
        'Votre abonnement a pris fin. Réactivez votre espace en réglant un nouvel abonnement.',
        409,
      )
    }
    if (code === 'TRAINER_NOT_FOUND') return error('TRAINER_NOT_FOUND', 'Profil introuvable.', 404)
    console.error('[API:SUBSCRIPTION_RESUME]', err)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
