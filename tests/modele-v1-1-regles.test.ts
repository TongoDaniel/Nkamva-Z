// Modèle économique v1.1 et plan d'action du 10 novembre 2026 : les règles
// pures (sans base) : plans, stockage, rôles, séparation des tâches, plafond
// des lives, surveillance des erreurs.
import { describe, expect, it, beforeEach } from 'vitest'
import {
  PLATFORM_COMMISSION_RATE, PRO_COMMISSION_RATE, COMMISSION_LABEL, TRAINER_SHARE_LABEL, trainerShareFor,
} from '@/lib/commission'
import {
  commissionRateForPlan, monthlyCostByPlan, proAvailableFor, PRO_BREAK_EVEN_FCFA, PRO_OPEN_TO_ALL_AT,
} from '@/lib/trainer-plans'
import { includedStorageBytes, DISPUTE_OPENING_WINDOW_DAYS, TRAINER_STORAGE_QUOTA_BYTES, PRO_STORAGE_QUOTA_BYTES } from '@/lib/rules'
import {
  canDecideTrainerApplication, canOpen, canValidateRefund, hasAdminRole, rolesOf,
} from '@/lib/admin-roles'
import { budgetState, weekStartUtc, LIVEKIT_INCLUDED_PARTICIPANT_HOURS } from '@/lib/live-budget'
import { defaultFaultFor, reasonClosesOnAccess, trainerShareOf } from '@/lib/disputes'
import { fingerprintOf, resetErrorThrottle, shouldAlert } from '@/lib/error-monitor'

const GO = 1024 ** 3

describe('commission (modèle v1.1)', () => {
  it('10 % sur le plan de base, 3 % en Pro', () => {
    expect(PLATFORM_COMMISSION_RATE).toBe(0.1)
    expect(PRO_COMMISSION_RATE).toBe(0.03)
    expect(COMMISSION_LABEL).toBe('10 %')
    expect(TRAINER_SHARE_LABEL).toBe('90 %')
    expect(trainerShareFor(20_000, 0.1)).toBe(18_000)
    expect(trainerShareFor(20_000, 0.03)).toBe(19_400)
  })

  it('le litige réserve la part au taux figé sur l’achat, pas au taux annoncé', () => {
    expect(trainerShareOf(20_000, 0.03)).toBe(19_400)
    expect(trainerShareOf(20_000, 0.15)).toBe(17_000)
    expect(trainerShareOf(20_000)).toBe(18_000)
  })
})

describe('plans Marketplace', () => {
  it('le taux suit le plan', () => {
    expect(commissionRateForPlan('BASE')).toBe(0.1)
    expect(commissionRateForPlan('PRO')).toBe(0.03)
  })

  it('reproduit le tableau du modèle : égalité à ~214 000 FCFA', () => {
    expect(monthlyCostByPlan(0)).toEqual({ BASE: 0, PRO: 15_000 })
    expect(monthlyCostByPlan(100_000)).toEqual({ BASE: 10_000, PRO: 18_000 })
    expect(monthlyCostByPlan(500_000)).toEqual({ BASE: 50_000, PRO: 30_000 })
    expect(monthlyCostByPlan(2_000_000)).toEqual({ BASE: 200_000, PRO: 75_000 })
    expect(PRO_BREAK_EVEN_FCFA).toBeGreaterThan(214_000)
    expect(PRO_BREAK_EVEN_FCFA).toBeLessThan(215_000)
  })

  it('le Pro est ouvert aux fondateurs dès le lancement, à tous au 1er mars 2027', () => {
    const launch = new Date('2026-11-30T09:00:00+01:00')
    expect(proAvailableFor({ founder: true }, launch)).toBe(true)
    expect(proAvailableFor({ founder: false }, launch)).toBe(false)
    expect(proAvailableFor({ founder: false }, new Date('2027-02-28T23:00:00+01:00'))).toBe(false)
    expect(proAvailableFor({ founder: false }, PRO_OPEN_TO_ALL_AT)).toBe(true)
  })
})

describe('stockage (modèle v1.1)', () => {
  it('5 Go sur le plan de base, +1 Go par tranche de 50 000 FCFA vendus, 100 Go en Pro', () => {
    expect(TRAINER_STORAGE_QUOTA_BYTES).toBe(5 * GO)
    expect(includedStorageBytes({ plan: 'BASE', cumulativeSalesFcfa: 0 })).toBe(5 * GO)
    expect(includedStorageBytes({ plan: 'BASE', cumulativeSalesFcfa: 49_999 })).toBe(5 * GO)
    expect(includedStorageBytes({ plan: 'BASE', cumulativeSalesFcfa: 150_000 })).toBe(8 * GO)
    expect(includedStorageBytes({ plan: 'PRO', cumulativeSalesFcfa: 0 })).toBe(PRO_STORAGE_QUOTA_BYTES)
    expect(PRO_STORAGE_QUOTA_BYTES).toBe(100 * GO)
  })
})

describe('règle de remboursement (modèle v1.1)', () => {
  it('7 jours pour demander', () => {
    expect(DISPUTE_OPENING_WINDOW_DAYS).toBe(7)
  })

  it('seul le changement d’avis se ferme à l’accès au contenu', () => {
    expect(reasonClosesOnAccess('CHANGE_OF_MIND')).toBe(true)
    expect(reasonClosesOnAccess('OTHER')).toBe(true)
    expect(reasonClosesOnAccess('ACCESS_ISSUE')).toBe(false)
    expect(reasonClosesOnAccess('DOUBLE_CHARGE')).toBe(false)
    expect(reasonClosesOnAccess('CONTENT_MISMATCH')).toBe(false)
    expect(reasonClosesOnAccess('LIVE_CANCELED')).toBe(false)
  })

  it('« qui paie » : la faute proposée suit le motif', () => {
    expect(defaultFaultFor('CONTENT_MISMATCH')).toBe('TRAINER')
    expect(defaultFaultFor('LIVE_CANCELED')).toBe('TRAINER')
    expect(defaultFaultFor('ACCESS_ISSUE')).toBe('TECHNICAL')
    expect(defaultFaultFor('DOUBLE_CHARGE')).toBe('TECHNICAL')
    expect(defaultFaultFor('CHANGE_OF_MIND')).toBe('BUYER')
  })
})

describe('rôles cumulables et séparation des tâches', () => {
  const merveille = { id: 'm', role: 'ADMIN', adminRole: 'SUPPORT', adminRoles: ['SUPPORT', 'MODERATION'] }
  const jaures = { id: 'j', role: 'ADMIN', adminRole: 'SUPER_ADMIN', adminRoles: ['SUPER_ADMIN', 'PILOTAGE', 'FINANCES'] }
  const obama = { id: 'o', role: 'ADMIN', adminRole: 'SALES', adminRoles: ['SALES'] }
  const legacy = { id: 'l', role: 'ADMIN', adminRole: 'FINANCES', adminRoles: [] as string[] }

  it('un administrateur reçoit la somme des permissions de ses rôles', () => {
    expect(canOpen(merveille, 'customers')).toBe(true)
    expect(canOpen(merveille, 'reports')).toBe(true)
    expect(canOpen(merveille, 'payouts')).toBe(false)
    expect(canOpen(obama, 'discounts')).toBe(true)
    expect(canOpen(obama, 'users')).toBe(false)
  })

  it('un compte d’avant la migration garde son rôle unique', () => {
    expect(rolesOf(legacy)).toEqual(['FINANCES'])
    expect(canOpen(legacy, 'payouts')).toBe(true)
  })

  it('le Propriétaire passe partout', () => {
    expect(hasAdminRole(jaures, 'TECHNICAL')).toBe(true)
    expect(canOpen(jaures, 'integrations')).toBe(true)
  })

  it('règle 1 : on ne valide pas un remboursement qu’on a proposé, Propriétaire compris', () => {
    expect(canValidateRefund(jaures, 'm')).toBe(true)
    expect(canValidateRefund(jaures, 'j')).toBe(false)
    expect(canValidateRefund(merveille, 'x')).toBe(false)
  })

  it('règle 4 : le Commercial ne tranche pas une candidature, même avec la Modération', () => {
    expect(canDecideTrainerApplication({ adminRoles: ['MODERATION'] })).toBe(true)
    expect(canDecideTrainerApplication({ adminRoles: ['SALES', 'MODERATION'] })).toBe(false)
    expect(canDecideTrainerApplication(jaures)).toBe(true)
  })
})

describe('plafond mensuel des lives', () => {
  it('sans plafond fixé, rien n’est restreint', () => {
    expect(budgetState(10_000, 0).state).toBe('NO_CAP')
  })

  it('alerte à 80 %, audio à 100 %', () => {
    const cap = 34_000 // 1 000 h-participants de dépassement
    const at = (hours: number) => budgetState(LIVEKIT_INCLUDED_PARTICIPANT_HOURS + hours, cap).state
    expect(budgetState(2_000, cap).state).toBe('OK')
    expect(at(500)).toBe('OK')
    expect(at(800)).toBe('ALERT')
    expect(at(1_000)).toBe('AUDIO_ONLY')
  })

  it('la semaine commence le lundi', () => {
    expect(weekStartUtc(new Date('2026-12-03T10:00:00Z')).toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(weekStartUtc(new Date('2026-11-30T00:00:00Z')).toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(weekStartUtc(new Date('2026-12-06T23:59:00Z')).toISOString()).toBe('2026-11-30T00:00:00.000Z')
  })
})

describe('surveillance des erreurs', () => {
  beforeEach(() => resetErrorThrottle())

  it('une même erreur garde la même empreinte, identifiants retirés', () => {
    const a = fingerprintOf(new Error('Purchase 3f2b1c4d-1111-2222-3333-444455556666 introuvable'), { source: 'api', path: '/api/x?y=1' })
    const b = fingerprintOf(new Error('Purchase 9a8b7c6d-aaaa-bbbb-cccc-ddddeeeeffff introuvable'), { source: 'api', path: '/api/x?y=2' })
    expect(a).toBe(b)
  })

  it('n’alerte qu’une fois par heure pour la même empreinte', () => {
    const t0 = Date.now()
    expect(shouldAlert('f', t0)).toBe(true)
    expect(shouldAlert('f', t0 + 10 * 60_000)).toBe(false)
    expect(shouldAlert('f', t0 + 61 * 60_000)).toBe(true)
    expect(shouldAlert('g', t0)).toBe(true)
  })
})
