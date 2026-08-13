// ==========================================================================
// Purge du journal d'audit — conservation limitée
// ==========================================================================
// Le journal n'avait **aucune durée de conservation**, et personne ne l'avait
// remarqué : il grossit sans jamais rien rendre. Un registre sans durée est une
// conservation illimitée, ce que la loi n° 2024/017 n'admet pas — et ce qu'un
// contrôle relève en premier. Voir `docs/registre-des-traitements.md`, T12.
//
// ── Pourquoi trois régimes et non une durée unique ──────────────────────────
//
// Une purge uniforme détruirait la preuve de ce qui doit précisément être
// prouvé. Les lignes du journal n'ont pas la même nature :
//
//   1. **Protégées** — décisions financières, d'identité et de sanction. Leur
//      durée est celle des écritures comptables, qui n'est pas arbitrée (voir
//      « Points non arbitrés »). Tant qu'elle ne l'est pas, on **conserve** :
//      détruire par défaut une preuve dont on ignore la durée légale est le
//      seul choix qu'on ne peut pas rattraper.
//   2. **Techniques** — passages de jobs, échecs de notification, marqueurs de
//      préavis. Ce sont des traces de machine ; personne ne les relit après un
//      an, et ce sont elles qui font le volume.
//   3. **Le reste** — la vie ordinaire de la plateforme : trois ans.
//
// ── Le piège à ne pas rater ─────────────────────────────────────────────────
//
// `sendNoticeOnce` (`src/lib/notices.ts`) se sert du journal comme **mémoire**
// de ce qui a déjà été annoncé : purger un marqueur `*_NOTICE_*` ferait repartir
// un préavis déjà envoyé. C'est sans danger ici, et il faut savoir pourquoi
// plutôt que d'avoir de la chance : le plus long horizon de préavis est de
// 60 jours (bascule tarifaire), très en deçà des 12 mois du régime technique.
// Raccourcir ce régime sous 3 mois rouvrirait le défaut — d'où la garde de
// `assertNoticeMemoryOutlivesHorizon()`.
// ==========================================================================

import { db } from '../db'
import { auditStandalone } from '../audit'
import { TARIFF_SWITCH_NOTICE_DAYS } from '../notices'

const MONTH_MS = 30 * 86_400_000

/**
 * Familles jamais purgées par ce job. Elles portent l'argent, l'identité et les
 * sanctions : ce sont les seules lignes qu'on relit des années après, et leur
 * durée dépend d'une obligation comptable qui reste à fixer.
 */
export const AUDIT_PROTECTED_PREFIXES = [
  // Argent
  'PURCHASE', 'INVOICE', 'PAYMENT_', 'WALLET', 'FUND_RESERVATION',
  'PAYOUT', 'REFUND', 'SUBSCRIPTION', 'MEMBERSHIP', 'CHARGEBACK',
  'DOUBLE_DEBIT', 'MANUAL_REFUND_TASK', 'PLATFORM_TARIFF', 'PLATFORM_DISCOUNT',
  // Identité et décisions sur les personnes
  'TRAINER_APPLICATION', 'TRAINER_DOCUMENT', 'DISPUTE', 'REPORT_',
  'USER_', 'ACCOUNT_', 'ADMIN_ACCOUNT', 'ADMIN_ROLE', 'GDPR_',
  'SUPER_ADMIN_BOOTSTRAP', 'SETTING_UPDATED',
] as const

/** Traces de machine. Le gros du volume, et la moindre valeur probante. */
export const AUDIT_TECHNICAL_PREFIXES = [
  'SCHEDULED_JOB', 'NOTIFICATION_', 'WEBHOOK_', 'PAWAPAY', 'MUX_', 'STRIPE_',
  // Marqueurs de préavis (`src/lib/notices.ts`) : leur seule fonction est
  // d'empêcher un second envoi, et l'événement annoncé est passé depuis
  // longtemps quand ils expirent.
  '_NOTICE_',
] as const

export const AUDIT_TECHNICAL_RETENTION_MONTHS = 12
export const AUDIT_DEFAULT_RETENTION_MONTHS = 36

/** Combien de lignes par tour de boucle. Une suppression de masse sur une table
 *  qui grossit indéfiniment tiendrait le verrou trop longtemps. */
const BATCH = 1_000

/**
 * Garde-fou explicite : la mémoire des préavis doit survivre à l'horizon du
 * préavis le plus long. Elle est vérifiée au chargement du module plutôt qu'en
 * commentaire — un commentaire ne casse pas la construction quand quelqu'un
 * ramène le régime technique à un mois.
 */
function assertNoticeMemoryOutlivesHorizon(): void {
  const horizonMonths = TARIFF_SWITCH_NOTICE_DAYS / 30
  if (AUDIT_TECHNICAL_RETENTION_MONTHS <= horizonMonths * 2) {
    throw new Error(
      'AUDIT_TECHNICAL_RETENTION_MONTHS est trop court : les marqueurs de préavis ' +
        'seraient purgés avant l\'événement qu\'ils annoncent, et le préavis repartirait.',
    )
  }
}
assertNoticeMemoryOutlivesHorizon()

function matches(action: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => (p.startsWith('_') ? action.includes(p) : action.startsWith(p)))
}

/** Le marqueur de préavis, reconnaissable partout dans le nom de l'action. */
const NOTICE_MARKER = '_NOTICE_'

/**
 * Le régime d'une action. Exporté pour que l'écran du journal puisse dire, à
 * terme, jusqu'à quand une ligne sera lisible.
 *
 * **Les marqueurs de préavis passent en premier, et l'ordre n'est pas un
 * détail** : `MEMBERSHIP_END_NOTICE_7` commence par un préfixe protégé alors
 * que ce n'est pas une décision d'adhésion — c'est la mémoire d'un envoi. Testé
 * dans l'ordre inverse, il aurait été conservé indéfiniment, et le journal se
 * serait rempli de la seule famille de lignes qui n'a aucune valeur probante.
 */
export function auditRetention(action: string): 'PROTECTED' | 'TECHNICAL' | 'DEFAULT' {
  if (action.includes(NOTICE_MARKER)) return 'TECHNICAL'
  if (matches(action, AUDIT_PROTECTED_PREFIXES)) return 'PROTECTED'
  if (matches(action, AUDIT_TECHNICAL_PREFIXES)) return 'TECHNICAL'
  return 'DEFAULT'
}

export interface AuditPurgeResult {
  technical: number
  ordinary: number
  protectedKept: number
}

/**
 * Supprime les lignes échues. Idempotent par construction : ce qui a été
 * supprimé ne se retrouve plus dans la fenêtre au tour suivant.
 *
 * Les préfixes protégés sont exclus par la requête elle-même, pas filtrés après
 * coup : une exclusion appliquée en mémoire sur un lot de mille lignes laisse
 * passer ce que la requête a déjà choisi de charger.
 */
export async function purgeAuditLog(now = new Date()): Promise<AuditPurgeResult> {
  const technicalCutoff = new Date(now.getTime() - AUDIT_TECHNICAL_RETENTION_MONTHS * MONTH_MS)
  const defaultCutoff = new Date(now.getTime() - AUDIT_DEFAULT_RETENTION_MONTHS * MONTH_MS)

  const technicalFilter = AUDIT_TECHNICAL_PREFIXES.map((prefix) =>
    prefix.startsWith('_')
      ? { action: { contains: prefix } }
      : { action: { startsWith: prefix } },
  )

  // Protégé **sauf marqueur de préavis** — même règle que `auditRetention`, et
  // pour la même raison : `MEMBERSHIP_END_NOTICE_7` n'est pas une décision
  // d'adhésion. Deux définitions divergentes de « protégé » entre la
  // classification et la requête feraient mentir le compte rendu du job.
  const protectedWhere = {
    OR: AUDIT_PROTECTED_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })),
    NOT: { action: { contains: NOTICE_MARKER } },
  }

  const technical = await deleteInBatches({
    createdAt: { lt: technicalCutoff },
    OR: technicalFilter,
    NOT: protectedWhere,
  })

  const ordinary = await deleteInBatches({
    createdAt: { lt: defaultCutoff },
    NOT: { OR: [protectedWhere, ...technicalFilter] },
  })

  // Ce qui a passé la date mais reste conservé : le chiffre qui justifie la
  // ligne « conservation illimitée » du registre tant que la durée comptable
  // n'est pas arbitrée.
  const protectedKept = await db.auditLog.count({
    where: { createdAt: { lt: defaultCutoff }, ...protectedWhere },
  })

  if (technical + ordinary > 0) {
    await auditStandalone({
      actorId: null, actorRole: 'SYSTEM',
      action: 'AUDIT_LOG_PURGED', targetType: 'AuditLog', targetId: null,
      meta: {
        technical, ordinary, protectedKept,
        technicalRetentionMonths: AUDIT_TECHNICAL_RETENTION_MONTHS,
        defaultRetentionMonths: AUDIT_DEFAULT_RETENTION_MONTHS,
      },
    })
  }

  return { technical, ordinary, protectedKept }
}

async function deleteInBatches(where: Record<string, unknown>): Promise<number> {
  let removed = 0
  for (;;) {
    const batch = await db.auditLog.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    })
    if (batch.length === 0) return removed

    const { count } = await db.auditLog.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    })
    removed += count
    // Un lot incomplet signifie qu'on a vidé la fenêtre : inutile de
    // redemander pour se faire répondre zéro.
    if (batch.length < BATCH) return removed
  }
}
