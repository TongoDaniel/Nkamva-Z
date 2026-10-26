// ==========================================================================
// Factures — émission, numérotation continue, rendu PDF
// ==========================================================================
// Deux propriétés gouvernent tout ce module, et ce sont des propriétés
// comptables avant d'être techniques :
//
// 1. **Une facture est immuable.** Ni son numéro, ni son montant, ni sa date ne
//    changent après émission. Ce qui doit être corrigé l'est par un avoir. C'est
//    pourquoi rien ici ne met à jour une facture, et pourquoi le PDF est
//    regénéré à la demande plutôt que stocké : régénérer une pièce dont aucune
//    donnée ne peut bouger redonne exactement la même.
//
// 2. **La suite des numéros est continue.** Une séquence Postgres serait plus
//    simple, mais `nextval` avance même quand la transaction échoue : la suite
//    y prendrait des trous, ce qu'une numérotation de facture ne tolère pas.
//    D'où `InvoiceCounter`, une ligne verrouillée par l'`UPDATE` le temps de la
//    transaction — deux émissions simultanées se sérialisent, et un échec rend
//    le numéro.
//
// ⚠️ Ce module **n'invente aucune règle fiscale**. Il ne calcule pas de TVA, ne
// porte pas de mentions légales propres à un pays, et ne remplace pas l'avis
// d'un comptable. Il émet une pièce justificative lisible et numérotée ; sa
// conformité à un régime donné reste à valider.
// ==========================================================================

import type { InvoiceKind } from '@prisma/client'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { db } from './db'
import { fmtCount } from './format'
import { auditStandalone } from './audit'
import type { PrismaTransaction } from './types'

/** Préfixe des numéros. `NK-2026-000001`, lisible et triable. */
const PREFIX = 'NK'

/**
 * Réserve le numéro suivant de l'exercice. **À n'appeler que dans une
 * transaction** : c'est l'`UPDATE` qui verrouille, et c'est le commit qui rend
 * le numéro définitif.
 */
async function nextNumber(tx: PrismaTransaction, year: number): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "invoice_counters" ("year", "value") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "invoice_counters"."value" + 1
    RETURNING "value"
  `
  const value = rows[0]?.value ?? 1
  return `${PREFIX}-${year}-${String(value).padStart(6, '0')}`
}

export interface IssueInvoiceInput {
  kind: InvoiceKind
  userId: string
  label: string
  amountFcfa: number
  purchaseId?: string | null
  subscriptionChargeId?: string | null
  issuedAt?: Date
}

/**
 * Émet une facture. Réentrante : rappelée pour le même achat ou la même période,
 * elle rend celle qui existe déjà plutôt que d'en créer une seconde — l'unicité
 * en base le garantit même en cas de course.
 */
export async function issueInvoice(input: IssueInvoiceInput) {
  const existing = await findExisting(input)
  if (existing) return existing

  const issuedAt = input.issuedAt ?? new Date()

  try {
    const invoice = await db.$transaction(async (tx) => {
      const number = await nextNumber(tx, issuedAt.getFullYear())
      return tx.invoice.create({
        data: {
          number,
          kind: input.kind,
          userId: input.userId,
          label: input.label,
          amountFcfa: input.amountFcfa,
          purchaseId: input.purchaseId ?? null,
          subscriptionChargeId: input.subscriptionChargeId ?? null,
          issuedAt,
        },
      })
    })

    await auditStandalone({
      actorId: null, actorRole: 'SYSTEM',
      action: 'INVOICE_ISSUED', targetType: 'Invoice', targetId: invoice.id,
      meta: { number: invoice.number, kind: input.kind, amountFcfa: input.amountFcfa },
    })

    return invoice
  } catch (err: unknown) {
    // Course sur la même pièce : le perdant retombe sur celle du gagnant. Son
    // numéro réservé est rendu par le rollback — c'est tout l'intérêt du
    // compteur en table plutôt qu'en séquence.
    if ((err as { code?: string })?.code !== 'P2002') throw err
    const winner = await findExisting(input)
    if (!winner) throw err
    return winner
  }
}

function findExisting(input: IssueInvoiceInput) {
  if (input.purchaseId) return db.invoice.findUnique({ where: { purchaseId: input.purchaseId } })
  if (input.subscriptionChargeId) {
    return db.invoice.findUnique({ where: { subscriptionChargeId: input.subscriptionChargeId } })
  }
  return Promise.resolve(null)
}

// --- Émission depuis les objets métier ---

/** Facture d'un achat — ressource ou adhésion. Émise au paiement confirmé. */
export async function issueInvoiceForPurchase(purchaseId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true, learnerId: true, amountFcfa: true, providerStatus: true, createdAt: true,
      course: { select: { title: true } },
      community: { select: { name: true } },
      periodStart: true, periodEnd: true,
    },
  })
  if (!purchase) throw new Error('PURCHASE_NOT_FOUND')
  // On ne facture pas ce qui n'a pas été encaissé.
  if (purchase.providerStatus !== 'SUCCEEDED') throw new Error('PURCHASE_NOT_SUCCEEDED')

  const label = purchase.course
    ? `Ressource — ${purchase.course.title}`
    : purchase.community
      ? `Adhésion — ${purchase.community.name}`
      : 'Achat NKAMVA'

  return issueInvoice({
    kind: 'PURCHASE',
    userId: purchase.learnerId,
    label,
    amountFcfa: purchase.amountFcfa,
    purchaseId: purchase.id,
    issuedAt: purchase.createdAt,
  })
}

/** Facture d'une période d'abonnement, stockage compris (arbitrage 69). */
export async function issueInvoiceForSubscriptionCharge(chargeId: string) {
  const charge = await db.subscriptionCharge.findUnique({
    where: { id: chargeId },
    select: {
      id: true, amountDueFcfa: true, periodStart: true, periodEnd: true,
      storageTiers: true, status: true,
      trainerProfile: { select: { userId: true } },
    },
  })
  if (!charge) throw new Error('SUBSCRIPTION_CHARGE_NOT_FOUND')
  // Un mois offert n'est pas une créance : une facture à 0 FCFA émise chaque
  // mois de gratuité encombrait l'espace du formateur et le registre
  // (campagne du 12 octobre 2026, m20).
  if (charge.amountDueFcfa === 0) return null

  const period = `${charge.periodStart.toLocaleDateString('fr-FR')} – ${charge.periodEnd.toLocaleDateString('fr-FR')}`
  const storage = charge.storageTiers > 0 ? ` · ${fmtCount(charge.storageTiers, 'palier de stockage', 'paliers de stockage')}` : ''

  return issueInvoice({
    kind: 'SUBSCRIPTION',
    userId: charge.trainerProfile.userId,
    label: `Abonnement NKAMVA — ${period}${storage}`,
    amountFcfa: charge.amountDueFcfa,
    subscriptionChargeId: charge.id,
    issuedAt: charge.periodStart,
  })
}

/**
 * Émet la facture d'un achat sans jamais faire échouer l'appelant.
 *
 * Appelée depuis les webhooks : un provider qui reçoit une erreur rejoue sa
 * notification, et l'accès de l'apprenant ne doit pas dépendre d'une pièce
 * comptable. L'échec est journalisé pour être rattrapé.
 */
export async function issueInvoiceQuietly(purchaseId: string): Promise<void> {
  try {
    await issueInvoiceForPurchase(purchaseId)
  } catch (err) {
    console.error('[INVOICE:FAILED]', { purchaseId, error: String(err) })
    await auditStandalone({
      action: 'INVOICE_ISSUE_FAILED', targetType: 'Purchase', targetId: purchaseId,
      meta: { error: String(err) },
    }).catch(() => { /* l'audit ne doit pas masquer l'erreur d'origine */ })
  }
}

// --- Lecture ---

export async function listMyInvoices(userId: string) {
  return db.invoice.findMany({
    where: { userId },
    orderBy: { issuedAt: 'desc' },
    take: 100,
  })
}

export async function getInvoice(invoiceId: string, userId: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  // Le 404 plutôt que le 403 : dire « pas à vous » confirmerait son existence.
  if (!invoice || invoice.userId !== userId) throw new Error('INVOICE_NOT_FOUND')
  return invoice
}

// --- Rendu PDF ---

const FCFA = new Intl.NumberFormat('fr-FR')

/**
 * Rend un texte encodable par les polices standard d'un PDF (WinAnsi).
 *
 * Ce n'est pas de la coquetterie typographique : `Intl.NumberFormat('fr-FR')`
 * sépare les milliers par une **espace fine insécable** (U+202F), que WinAnsi
 * ne connaît pas. `drawText` lève alors — et la facture d'un montant à quatre
 * chiffres, c'est-à-dire à peu près toutes, échouait à se générer.
 *
 * Les caractères connus sont traduits ; le reste est écarté plutôt que de faire
 * échouer la pièce. Un nom qui perd un accent exotique reste une facture ; une
 * facture qui ne se génère pas n'est rien.
 */
function winAnsi(value: string): string {
  return value
    .replace(/[    ]/g, ' ')
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/·/g, '-')
    .replace(/[^\x20-\xFF]/g, '')
}

/**
 * Rend la facture en PDF. Regénérée à la demande plutôt que stockée : aucune de
 * ses données ne pouvant bouger, deux rendus donnent la même pièce — et on
 * s'épargne un objet de plus à sauvegarder, purger et facturer au stockage.
 *
 * `pdf-lib` est du JavaScript pur : ni binaire natif, ni navigateur sans tête à
 * faire tourner en production. Un choix d'outil, réversible.
 */
export async function renderInvoicePdf(invoiceId: string, userId: string): Promise<Uint8Array> {
  const invoice = await getInvoice(invoiceId, userId)
  const user = await db.user.findUniqueOrThrow({
    where: { id: invoice.userId },
    select: { fullName: true, email: true },
  })

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Facture ${invoice.number}`)
  const page = pdf.addPage([595, 842]) // A4 en points
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)

  // Les tokens de marque sont recopiés en dur, comme dans les gabarits d'e-mail :
  // un PDF ne charge ni feuille de style ni variable CSS.
  const navy = rgb(0.008, 0.137, 0.259)
  const ink = rgb(0.082, 0.129, 0.106)
  const ink2 = rgb(0.298, 0.353, 0.322)

  let y = 780
  const text = (
    value: string,
    opts: { size?: number; font?: typeof regular; color?: typeof ink; x?: number } = {},
  ) => {
    page.drawText(winAnsi(value), {
      x: opts.x ?? 56,
      y,
      size: opts.size ?? 11,
      font: opts.font ?? regular,
      color: opts.color ?? ink,
    })
  }

  text('NKAMVA', { size: 22, font: bold, color: navy })
  y -= 18
  text('Plateforme de formation', { size: 10, color: ink2 })

  y -= 46
  text(`Facture ${invoice.number}`, { size: 16, font: bold })
  y -= 20
  text(`Émise le ${invoice.issuedAt.toLocaleDateString('fr-FR', { dateStyle: 'long' })}`, {
    size: 10, color: ink2,
  })

  y -= 40
  text('Destinataire', { size: 9, font: bold, color: ink2 })
  y -= 15
  text(user.fullName ?? user.email, { size: 11 })
  if (user.fullName) {
    y -= 14
    text(user.email, { size: 10, color: ink2 })
  }

  y -= 42
  page.drawLine({
    start: { x: 56, y },
    end: { x: 539, y },
    thickness: 1,
    color: rgb(0.886, 0.871, 0.827),
  })

  y -= 24
  text('Désignation', { size: 9, font: bold, color: ink2 })
  text('Montant', { size: 9, font: bold, color: ink2, x: 470 })

  y -= 20
  text(invoice.label, { size: 11 })
  text(`${FCFA.format(invoice.amountFcfa)} FCFA`, { size: 11, x: 470 })

  y -= 30
  page.drawLine({
    start: { x: 56, y },
    end: { x: 539, y },
    thickness: 1,
    color: rgb(0.886, 0.871, 0.827),
  })

  y -= 26
  text('Total', { size: 13, font: bold })
  text(`${FCFA.format(invoice.amountFcfa)} FCFA`, { size: 13, font: bold, x: 470 })

  y -= 60
  text('Montants exprimés en francs CFA, toutes taxes comprises le cas échéant.', {
    size: 9, color: ink2,
  })
  y -= 13
  text('Document généré par NKAMVA. Sa conservation vaut justificatif de paiement.', {
    size: 9, color: ink2,
  })

  return pdf.save()
}
