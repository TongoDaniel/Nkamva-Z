// ==========================================================================
// Surveillance des erreurs en production : plan d'action, action 0.4
// ==========================================================================
// Prérequis du lancement (modèle v1.1, « Nos coûts ») : la base contient les
// soldes des formateurs, une panne silencieuse n'est pas acceptable.
//
// Aucun fournisseur nouveau, aucun coût : une erreur serveur imprévue
//
//   1. est écrite au journal du conteneur (`[ERREUR]`, une ligne JSON) ;
//   2. est consignée au journal d'audit (`SERVER_ERROR`), que le rôle
//      Technique lit déjà ;
//   3. alerte les administrateurs Technique et Propriétaires, par notification
//      et par e-mail ;
//   4. part, si `ERROR_ALERT_WEBHOOK_URL` est posé, vers un salon (Slack,
//      Discord, Telegram via un relais), en JSON `{ text }`.
//
// Anti-rafale : une même erreur (même message, même chemin) n'alerte qu'une
// fois par heure et par processus ; les suivantes ne font que le journal. Une
// boucle d'erreurs ne doit pas épuiser le quota d'e-mails de Resend (100 par
// jour sur l'offre gratuite, d'où l'offre Pro au modèle).
//
// Cette fonction ne lève jamais : signaler une panne ne doit pas en créer une.
// ==========================================================================

import { db } from './db'
import { sendEmail, renderSimpleEmail } from './email'
import { absoluteUrl } from './notification'

const THROTTLE_MS = 60 * 60 * 1000
const lastAlert = new Map<string, number>()

export interface ErrorContext {
  /** D'où vient l'erreur : `api`, `render`, `job:WALLET_RECONCILIATION`… */
  source: string
  path?: string | null
  method?: string | null
  digest?: string | null
  /** L'erreur de test passe l'anti-rafale : on veut voir l'alerte à chaque essai. */
  force?: boolean
}

function describe(err: unknown): { name: string; message: string; stack: string | null } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack ?? null }
  return { name: 'NonError', message: String(err), stack: null }
}

export function fingerprintOf(err: unknown, ctx: ErrorContext): string {
  const { message } = describe(err)
  // Les identifiants varient d'une requête à l'autre : on les retire pour que
  // la même panne garde la même empreinte.
  const normalized = message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\d+/g, ':n').slice(0, 200)
  return `${ctx.source}|${(ctx.path ?? '').split('?')[0]}|${normalized}`
}

/** Vrai si cette empreinte doit alerter maintenant (et note l'instant). */
export function shouldAlert(fingerprint: string, now = Date.now()): boolean {
  const last = lastAlert.get(fingerprint)
  if (last !== undefined && now - last < THROTTLE_MS) return false
  lastAlert.set(fingerprint, now)
  return true
}

/** Réservé aux tests : remet l'anti-rafale à zéro. */
export function resetErrorThrottle(): void {
  lastAlert.clear()
}

export async function reportServerError(err: unknown, ctx: ErrorContext): Promise<void> {
  try {
    const info = describe(err)
    const fingerprint = fingerprintOf(err, ctx)
    console.error('[ERREUR]', JSON.stringify({ ...ctx, ...info, fingerprint, at: new Date().toISOString() }))

    if (process.env.NODE_ENV === 'test') return
    if (!ctx.force && !shouldAlert(fingerprint)) return

    await db.auditLog.create({
      data: {
        actorRole: 'SYSTEM', action: 'SERVER_ERROR', targetType: 'Platform', targetId: ctx.source,
        meta: { ...ctx, name: info.name, message: info.message.slice(0, 1000), fingerprint },
      },
    }).catch(() => undefined)

    const recipients = await db.user.findMany({
      where: {
        role: 'ADMIN', deletedAt: null, suspendedAt: null,
        OR: [{ adminRoles: { hasSome: ['TECHNICAL', 'SUPER_ADMIN'] } }, { adminRole: { in: ['TECHNICAL', 'SUPER_ADMIN'] } }],
      },
      select: { id: true, email: true },
    }).catch(() => [])

    const title = `Erreur serveur : ${info.message.slice(0, 80)}`
    const body = `${ctx.source}${ctx.path ? ` · ${ctx.method ?? ''} ${ctx.path}` : ''} · ${info.name}: ${info.message.slice(0, 300)}`

    if (recipients.length) {
      await db.notification.createMany({
        data: recipients.map((r) => ({ userId: r.id, type: 'SERVER_ERROR', title, body, link: '/admin/journal-audit' })),
      }).catch(() => undefined)
      const { html, text } = renderSimpleEmail({
        title: 'Une erreur serveur est survenue',
        paragraphs: [
          body,
          'Les occurrences suivantes de la même erreur, dans l’heure, ne font que le journal.',
          ...(ctx.digest ? [`Référence Next.js : ${ctx.digest}`] : []),
        ],
        cta: { label: 'Ouvrir le journal d’audit', url: absoluteUrl('/admin/journal-audit') },
      })
      for (const r of recipients) {
        await sendEmail({ to: r.email, subject: `NKAMVA · ${title}`, html, text, tags: ['server-error'] }).catch(() => undefined)
      }
    }

    const webhook = process.env.ERROR_ALERT_WEBHOOK_URL
    if (webhook) {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `NKAMVA · ${body}` }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => undefined)
    }
  } catch {
    // Jamais de seconde panne depuis le signalement de la première.
  }
}
