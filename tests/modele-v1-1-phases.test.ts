// Plan d'action du 10 novembre 2026, phases 1 à 3 : les règles pures (sans
// base) : plans Community, replays, pilotage, signal Pro, archivage.
import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_GRID_AT, billedPlanFor, chargeIsPlansOnly, communityStorageBytes, effectivePlan,
  liveParticipantCap, membershipCap, replayRecordsVideo, requiredPlanFor,
} from '@/lib/community-plans'
import { businessHoursBetween, parsePeriod, toCsv } from '@/lib/pilotage'
import { shouldSignalPro } from '@/lib/trainer-follow-up'
import { inactivityStep, lastActivityOf } from '@/lib/inactivity-archive'

const GO = 1024 ** 3
const LAUNCH = new Date('2026-12-15T10:00:00Z')
const MARCH = new Date('2027-03-10T10:00:00Z')
const base = { plan: 'DECOUVERTE' as const, maxPlan: null, planUnpaidAt: null }

describe('plans Community (grille du 1er mars 2027)', () => {
  it('le plan suit la taille', () => {
    expect(requiredPlanFor(0)).toBe('DECOUVERTE')
    expect(requiredPlanFor(20)).toBe('DECOUVERTE')
    expect(requiredPlanFor(21)).toBe('ESSENTIEL')
    expect(requiredPlanFor(200)).toBe('ESSENTIEL')
    expect(requiredPlanFor(201)).toBe('CROISSANCE')
    expect(requiredPlanFor(1_001)).toBe('PREMIUM')
    expect(requiredPlanFor(3_000)).toBe('PREMIUM')
  })

  it('le plafond voulu par le formateur borne le plan facturé', () => {
    expect(billedPlanFor({ membersCount: 150, maxPlan: null })).toBe('ESSENTIEL')
    expect(billedPlanFor({ membersCount: 150, maxPlan: 'DECOUVERTE' })).toBe('DECOUVERTE')
    expect(billedPlanFor({ membersCount: 10, maxPlan: 'PREMIUM' })).toBe('DECOUVERTE')
  })

  it('avant la grille : aucune limite, replays en audio', () => {
    expect(COMMUNITY_GRID_AT.toISOString()).toBe('2027-02-28T23:00:00.000Z')
    expect(effectivePlan({ ...base, plan: 'PREMIUM' }, LAUNCH)).toBeNull()
    expect(membershipCap(base, LAUNCH)).toBeNull()
    expect(liveParticipantCap(base, false, LAUNCH)).toBeNull()
    expect(replayRecordsVideo({ ...base, plan: 'PREMIUM' }, LAUNCH)).toBe(false)
    expect(communityStorageBytes([base], LAUNCH)).toBe(0)
  })

  it('après la grille : droits du plan payé', () => {
    expect(replayRecordsVideo(base, MARCH)).toBe(false)
    expect(replayRecordsVideo({ ...base, plan: 'ESSENTIEL' }, MARCH)).toBe(true)
    expect(liveParticipantCap(base, false, MARCH)).toBe(20)
    expect(liveParticipantCap({ ...base, plan: 'CROISSANCE' }, false, MARCH)).toBe(300)
    expect(liveParticipantCap({ ...base, plan: 'CROISSANCE' }, true, MARCH)).toBe(1_000)
    expect(membershipCap(base, MARCH)).toBe(3_000)
    expect(membershipCap({ ...base, maxPlan: 'DECOUVERTE' }, MARCH)).toBe(20)
    expect(communityStorageBytes([base, { ...base, plan: 'ESSENTIEL' }], MARCH)).toBe(12 * GO)
  })

  it('un plan impayé redonne les droits Découverte, sans retirer de membre', () => {
    const unpaid = { plan: 'ESSENTIEL' as const, maxPlan: null, planUnpaidAt: new Date('2027-04-01') }
    expect(effectivePlan(unpaid, MARCH)).toBe('DECOUVERTE')
    expect(membershipCap(unpaid, MARCH)).toBe(20)
    expect(replayRecordsVideo(unpaid, MARCH)).toBe(false)
  })

  it('une échéance faite de plans seuls redescend au lieu de suspendre', () => {
    expect(chargeIsPlansOnly({ plan: 'BASE', amountDueFcfa: 10_000, storageFcfa: 0, communityPlansFcfa: 10_000 })).toBe(true)
    expect(chargeIsPlansOnly({ plan: 'PRO', amountDueFcfa: 25_000, storageFcfa: 0, communityPlansFcfa: 10_000 })).toBe(true)
    expect(chargeIsPlansOnly({ plan: 'BASE', amountDueFcfa: 15_000, storageFcfa: 5_000, communityPlansFcfa: 10_000 })).toBe(false)
    expect(chargeIsPlansOnly({ plan: 'BASE', amountDueFcfa: 3_000, storageFcfa: 0, communityPlansFcfa: 0 })).toBe(false)
  })
})

describe('pilotage', () => {
  it('six derniers mois par défaut, période bornée et ordonnée', () => {
    const now = new Date('2027-01-20T12:00:00Z')
    const p = parsePeriod(undefined, undefined, now)
    expect(p.months.map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
    expect(parsePeriod('2027-02', '2026-12', now).months.map((m) => m.key)).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(parsePeriod('n/a', 'zz', now).months).toHaveLength(6)
    expect(parsePeriod('2020-01', '2027-01', now).months).toHaveLength(24)
  })

  it('les 72 h ouvrées ne comptent ni le samedi ni le dimanche', () => {
    // Vendredi 11 décembre 2026, 17 h à Douala, jusqu'au lundi 14, 17 h.
    const fri = new Date('2026-12-11T16:00:00Z')
    const mon = new Date('2026-12-14T16:00:00Z')
    expect(businessHoursBetween(fri, mon)).toBe(24)
    expect(businessHoursBetween(mon, fri)).toBe(0)
  })

  it('le CSV s’ouvre dans un tableur français, sans injection de formule', () => {
    const csv = toCsv(['a', 'b'], [['=SOMME(A1)', 'x;y'], [12, null]])
    expect(csv.startsWith('﻿a;b\r\n')).toBe(true)
    expect(csv).toContain("'=SOMME(A1)")
    expect(csv).toContain('"x;y"')
    expect(csv).toContain('12;\r\n')
  })
})

describe('signal « passez en Pro »', () => {
  const now = new Date('2027-01-01T08:00:00Z')
  it('après deux mois au-dessus du seuil, sur le plan de base', () => {
    expect(shouldSignalPro({ plan: 'BASE', pendingPlan: null, lastTwoMonthsSalesFcfa: [250_000, 230_000], proSignalAt: null, now })).toBe(true)
    expect(shouldSignalPro({ plan: 'BASE', pendingPlan: null, lastTwoMonthsSalesFcfa: [250_000, 100_000], proSignalAt: null, now })).toBe(false)
    expect(shouldSignalPro({ plan: 'PRO', pendingPlan: null, lastTwoMonthsSalesFcfa: [250_000, 230_000], proSignalAt: null, now })).toBe(false)
    expect(shouldSignalPro({ plan: 'BASE', pendingPlan: 'PRO', lastTwoMonthsSalesFcfa: [250_000, 230_000], proSignalAt: null, now })).toBe(false)
  })
  it('pas deux fois en deux mois', () => {
    expect(shouldSignalPro({ plan: 'BASE', pendingPlan: null, lastTwoMonthsSalesFcfa: [250_000, 230_000], proSignalAt: new Date('2026-12-01'), now })).toBe(false)
  })
})

describe('archivage pour inactivité', () => {
  const day = 86_400_000
  const now = new Date('2027-08-01T07:00:00Z')
  const ago = (d: number) => new Date(now.getTime() - d * day)

  it('la dernière activité est la plus récente des traces', () => {
    expect(lastActivityOf({ approvedAt: ago(300), lastLoginAt: ago(10), lastSaleAt: ago(50) })).toEqual(ago(10))
    expect(lastActivityOf({ approvedAt: null, lastLoginAt: null, lastSaleAt: null })).toBeNull()
  })

  it('préavis à 5 mois, archivage 30 jours après, annulation si le formateur revient', () => {
    expect(inactivityStep({ lastActivity: ago(100), noticeAt: null, archivedAt: null, now })).toBe('NONE')
    expect(inactivityStep({ lastActivity: ago(155), noticeAt: null, archivedAt: null, now })).toBe('NOTICE')
    expect(inactivityStep({ lastActivity: ago(185), noticeAt: ago(31), archivedAt: null, now })).toBe('ARCHIVE')
    expect(inactivityStep({ lastActivity: ago(170), noticeAt: ago(20), archivedAt: null, now })).toBe('NONE')
    expect(inactivityStep({ lastActivity: ago(2), noticeAt: ago(20), archivedAt: null, now })).toBe('CANCEL_NOTICE')
    expect(inactivityStep({ lastActivity: ago(400), noticeAt: ago(200), archivedAt: ago(170), now })).toBe('NONE')
  })
})
