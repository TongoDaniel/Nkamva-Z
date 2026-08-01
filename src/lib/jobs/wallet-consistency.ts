// ==========================================================================
// Jobs : cohérence des portefeuilles et alerte sur solde négatif
// ==========================================================================
// Sept chemins touchent aujourd'hui à `reservedBalance` — ouverture d'un litige
// par l'apprenant ou par un chargeback, rejet, remboursement, annulation d'une
// tâche manuelle, chargeback gagné, chargeback perdu. Chacun est testé
// isolément, mais rien ne vérifie l'invariant global. Ce filet le fait.
//
// Distinction qui gouverne tout ce fichier :
//   — `reservedBalance` et `pendingPayoutBalance` sont des dénormalisations.
//     Elles se recalculent à partir des réservations et des retraits en cours,
//     donc les corriger est légitime.
//   — `balance` est le registre lui-même. Rien ne permet de le recalculer, et
//     le « corriger » masquerait le défaut au lieu de le révéler. Le job n'y
//     touche jamais.
// Une correction n'est pas une routine : c'est le symptôme d'un défaut en
// amont, et elle est signalée comme tel.
// ==========================================================================

import type { PayoutStatus } from '@prisma/client'
import { db } from '../db'
import { auditStandalone } from '../audit'
import { notifyAdminSubRole } from '../notification'

const DAY = 86_400_000

/** Au-delà, un solde négatif cesse d'être un incident et devient une créance. */
export const WALLET_NEGATIVE_ALERT_DAYS = 60

/** Statuts de retrait qui immobilisent des fonds sans les avoir encore versés. */
const HOLDING_PAYOUT_STATUSES: PayoutStatus[] = ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED']

/** Auteur des corrections automatiques : aucun humain n'est derrière. */
const SYSTEM_ACTOR = 'SYSTEM'

export interface ReconcileResult {
  checked: number
  /** Portefeuilles dont au moins un champ a dû être corrigé. */
  drifted: number
  corrections: number
}

/**
 * Recalcule les soldes dérivés et corrige les écarts.
 * Le montant précédent, le nouveau et l'écart sont conservés dans
 * `WalletReconciliation` : une correction doit rester lisible après coup, y
 * compris des mois plus tard.
 */
export async function reconcileWallets(): Promise<ReconcileResult> {
  const wallets = await db.wallet.findMany({
    select: { id: true, trainerId: true, reservedBalance: true, pendingPayoutBalance: true },
  })

  // Deux agrégations globales plutôt qu'une par portefeuille.
  const [reservations, payouts] = await Promise.all([
    db.fundReservation.groupBy({
      by: ['walletId'],
      where: { status: 'ACTIVE' },
      _sum: { reservedAmountFcfa: true },
    }),
    db.payout.groupBy({
      by: ['trainerId'],
      where: { status: { in: HOLDING_PAYOUT_STATUSES } },
      _sum: { amountFcfa: true },
    }),
  ])

  const reservedByWallet = new Map(
    reservations.map((r) => [r.walletId, r._sum.reservedAmountFcfa ?? 0]),
  )
  const pendingByTrainer = new Map(payouts.map((p) => [p.trainerId, p._sum.amountFcfa ?? 0]))

  let drifted = 0
  let corrections = 0

  for (const wallet of wallets) {
    const expected = {
      reservedBalance: reservedByWallet.get(wallet.id) ?? 0,
      pendingPayoutBalance: pendingByTrainer.get(wallet.trainerId) ?? 0,
    }

    const gaps = (['reservedBalance', 'pendingPayoutBalance'] as const)
      .map((field) => ({ field, previous: wallet[field], next: expected[field] }))
      .filter((gap) => gap.previous !== gap.next)

    if (gaps.length === 0) continue
    drifted++

    await db.$transaction(async (tx) => {
      for (const gap of gaps) {
        await tx.walletReconciliation.create({
          data: {
            walletId: wallet.id,
            field: gap.field,
            previousValue: gap.previous,
            newValue: gap.next,
            delta: gap.next - gap.previous,
            reason: 'Recalcul automatique à partir des réservations et des retraits en cours',
            reconciledById: SYSTEM_ACTOR,
          },
        })
        corrections++
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: Object.fromEntries(gaps.map((gap) => [gap.field, gap.next])),
      })
    })

    // Une divergence n'est jamais normale : elle signale un chemin de code qui
    // a manqué une mise à jour.
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'WALLET_RECONCILED',
      targetType: 'Wallet',
      targetId: wallet.id,
      meta: {
        trainerId: wallet.trainerId,
        gaps: gaps.map((g) => ({ field: g.field, previous: g.previous, next: g.next })),
      },
    })
  }

  if (drifted > 0) {
    await notifyAdminSubRole('FINANCES', {
      type: 'WALLET_DRIFT_DETECTED',
      title: 'Écart détecté sur des portefeuilles',
      body: `${drifted} portefeuille${drifted > 1 ? 's ont' : ' a'} dû être recalculé${drifted > 1 ? 's' : ''}. Un chemin de code a manqué une mise à jour.`,
      link: '/admin/remboursements',
    })
  }

  return { checked: wallets.length, drifted, corrections }
}

export interface NegativeWalletResult {
  negative: number
  /** Portefeuilles qui viennent de passer sous zéro. */
  newlyNegative: number
  /** Portefeuilles repassés à l'équilibre. */
  recovered: number
  /** Portefeuilles négatifs depuis plus que le seuil. */
  alerted: number
}

/**
 * Suit les soldes négatifs dans le temps.
 * Un solde peut passer sous zéro légitimement — un remboursement débité après
 * un retrait, par exemple. Ce qui inquiète n'est pas le passage, c'est la
 * durée : au-delà du seuil, la somme ne sera vraisemblablement pas récupérée
 * sur les ventes à venir et relève d'un recouvrement.
 */
export async function alertNegativeWallets(now: Date = new Date()): Promise<NegativeWalletResult> {
  const wallets = await db.wallet.findMany({
    where: { OR: [{ balance: { lt: 0 } }, { negativeSince: { not: null } }] },
    select: {
      id: true, trainerId: true, balance: true, negativeSince: true,
      trainerProfile: { select: { user: { select: { email: true, fullName: true } } } },
    },
  })

  let newlyNegative = 0
  let recovered = 0
  let alerted = 0
  const negative = wallets.filter((w) => w.balance < 0)

  for (const wallet of wallets) {
    if (wallet.balance >= 0) {
      // Revenu à l'équilibre : le compteur repart de zéro.
      if (wallet.negativeSince) {
        await db.wallet.update({ where: { id: wallet.id }, data: { negativeSince: null } })
        recovered++
        await auditStandalone({
          actorRole: 'SYSTEM',
          action: 'WALLET_BALANCE_RECOVERED',
          targetType: 'Wallet',
          targetId: wallet.id,
          meta: { trainerId: wallet.trainerId, balance: wallet.balance },
        })
      }
      continue
    }

    if (!wallet.negativeSince) {
      await db.wallet.update({ where: { id: wallet.id }, data: { negativeSince: now } })
      newlyNegative++
      await auditStandalone({
        actorRole: 'SYSTEM',
        action: 'WALLET_BALANCE_NEGATIVE',
        targetType: 'Wallet',
        targetId: wallet.id,
        meta: { trainerId: wallet.trainerId, balance: wallet.balance },
      })
      continue
    }

    const days = (now.getTime() - wallet.negativeSince.getTime()) / DAY
    if (days < WALLET_NEGATIVE_ALERT_DAYS) continue

    alerted++
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'WALLET_NEGATIVE_TOO_LONG',
      targetType: 'Wallet',
      targetId: wallet.id,
      meta: {
        trainerId: wallet.trainerId,
        balance: wallet.balance,
        negativeSince: wallet.negativeSince.toISOString(),
        days: Math.floor(days),
      },
    })
    await notifyAdminSubRole('FINANCES', {
      type: 'WALLET_NEGATIVE_TOO_LONG',
      title: 'Solde formateur négatif de longue date',
      body: `${wallet.trainerProfile?.user?.fullName ?? 'Un formateur'} présente un solde de ${wallet.balance} FCFA depuis ${Math.floor(days)} jours.`,
      link: '/admin/remboursements',
    })
  }

  return { negative: negative.length, newlyNegative, recovered, alerted }
}
