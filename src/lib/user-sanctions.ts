// ==========================================================================
// Sanctions de compte — arbitrage 63
// ==========================================================================
// Deux états distincts, pas un booléen :
//
//   RESTRICTED — on écarte la parole, on ne retire pas l'accès. Le compte se
//                connecte, lit tout ce qu'il a payé, mais n'écrit plus : ni
//                litige, ni message. Même patron que le membre banni d'une
//                communauté (arbitrage 40).
//   BANNED     — la connexion est coupée ET l'accès aux ressources déjà payées
//                est retiré. C'est une privation de biens achetés, qui peut
//                légitimement produire un litige : réservée au Super-admin.
//
// `suspendedAt` reste le champ que lit l'authentification ; il suit désormais
// le niveau au lieu de le remplacer.
// ==========================================================================

import type { SanctionLevel } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { notify, deliverSideEffects } from './notification'
import { sendEmail, renderSimpleEmail } from './email'

export interface SanctionInput {
  level: SanctionLevel
  reason: string
  actorId: string
  actorAdminRole: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION'
}

const LABELS: Record<SanctionLevel, string> = {
  NONE: 'levée',
  RESTRICTED: 'restriction',
  BANNED: 'exclusion',
}

/**
 * Applique — ou lève — une sanction. Le passage à `BANNED` et la levée d'un
 * `BANNED` sont tous deux réservés au Super-admin : rendre l'accès à quelqu'un
 * qu'on a privé de ses achats est une décision du même poids que la privation.
 */
export async function applySanction(userId: string, input: SanctionInput) {
  const reason = input.reason.trim()
  if (reason.length < 10) throw new Error('JUSTIFICATION_REQUIRED')

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, sanctionLevel: true, deletedAt: true },
  })
  if (!user || user.deletedAt) throw new Error('USER_NOT_FOUND')
  if (user.sanctionLevel === input.level) throw new Error('SANCTION_UNCHANGED')

  const touchesBan = input.level === 'BANNED' || user.sanctionLevel === 'BANNED'
  if (touchesBan && input.actorAdminRole !== 'SUPER_ADMIN') throw new Error('SANCTION_FORBIDDEN')

  // Un administrateur ne se sanctionne pas lui-même : la console deviendrait
  // inaccessible à celui qui vient d'y agir.
  if (userId === input.actorId) throw new Error('SANCTION_SELF_FORBIDDEN')
  if (user.role === 'ADMIN' && input.actorAdminRole !== 'SUPER_ADMIN') throw new Error('SANCTION_FORBIDDEN')

  const now = new Date()
  const banned = input.level === 'BANNED'

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: userId },
      data: {
        sanctionLevel: input.level,
        sanctionReason: input.level === 'NONE' ? null : reason,
        sanctionedAt: input.level === 'NONE' ? null : now,
        sanctionedById: input.level === 'NONE' ? null : input.actorId,
        // `suspendedAt` pilote la coupure de connexion : il ne se pose que sur
        // l'exclusion. Une restriction laisse entrer.
        suspendedAt: banned ? now : null,
        suspendedReason: banned ? reason : null,
        // Tout changement de niveau invalide les sessions ouvertes : sans ça un
        // jeton déjà émis continuerait d'écrire pendant cinq minutes.
        sessionsValidAfter: now,
      },
      select: { id: true, sanctionLevel: true, sanctionedAt: true },
    })

    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorAdminRole,
      action: 'USER_SANCTION_CHANGED', targetType: 'User', targetId: userId,
      meta: { from: user.sanctionLevel, to: input.level, reason },
    })

    return result
  })

  await deliverSideEffects('USER_SANCTION_CHANGED', { type: 'User', id: userId }, async () => {
    // La notification in-app n'atteint pas un compte exclu, qui ne peut plus se
    // connecter : l'e-mail est le seul canal qui lui reste.
    if (input.level !== 'BANNED') {
      await notify(userId, {
        type: 'USER_SANCTION_CHANGED',
        title: input.level === 'NONE' ? 'Votre compte est rétabli' : 'Votre compte est restreint',
        body: input.level === 'NONE' ? 'Vous retrouvez toutes vos possibilités.' : reason,
        link: '/profil',
      })
    }

    const { html, text } = renderSimpleEmail({
      title:
        input.level === 'NONE'
          ? 'Votre compte est rétabli'
          : input.level === 'BANNED'
            ? 'Votre compte a été fermé'
            : 'Votre compte est restreint',
      paragraphs:
        input.level === 'NONE'
          ? ['Votre compte NKAMVA retrouve toutes ses possibilités.']
          : [
              input.level === 'BANNED'
                ? 'Votre compte NKAMVA a été fermé et vos accès ont été retirés.'
                : 'Votre compte NKAMVA est restreint : vous conservez l\'accès à vos ressources, mais vous ne pouvez plus publier ni écrire.',
              `Motif : ${reason}`,
            ],
      footnote: 'Si vous pensez qu\'il s\'agit d\'une erreur, répondez à cet e-mail.',
    })
    await sendEmail({
      to: user.email,
      subject: `NKAMVA — ${LABELS[input.level]} de votre compte`,
      html,
      text,
      tags: ['account-sanction'],
    })
  })

  return updated
}

/**
 * Droit d'écrire — ouvrir un litige, poster un message, publier. La lecture
 * n'est jamais concernée : un compte restreint garde ce qu'il a payé.
 */
export async function canUserWrite(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { sanctionLevel: true },
  })
  return user?.sanctionLevel === 'NONE' || user?.sanctionLevel === undefined
}

export async function assertCanWrite(userId: string): Promise<void> {
  if (!(await canUserWrite(userId))) throw new Error('ACCOUNT_RESTRICTED')
}
