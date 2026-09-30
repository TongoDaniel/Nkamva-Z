// ==========================================================================
// lib/rules — les règles affichées sont celles qu'appliquent les modules serveur
// ==========================================================================
// Tests purs : aucune base, aucun réseau.
// ==========================================================================

import { describe, expect, it } from 'vitest'
import {
  COVER_IMAGE_MAX_BYTES,
  CONSUMPTION_THRESHOLD_LABEL,
  LARGE_FILE_MAX_BYTES,
  PDF_MAX_BYTES,
  AVATAR_MAX_BYTES,
  STORAGE_TIER_BYTES,
  TRAINER_STORAGE_QUOTA_BYTES,
  sizeLimitLabel,
} from '@/lib/rules'
import { COURSE_UPLOAD_LIMITS } from '@/lib/courses'
import { AVATAR_LIMITS } from '@/lib/avatars'
import { COMMUNITY_COVER_LIMITS } from '@/lib/communities'
import { quotaBytesFor } from '@/lib/storage-tiers'

describe('sizeLimitLabel', () => {
  it('écrit les plafonds ronds sans décimale parasite', () => {
    expect(sizeLimitLabel(AVATAR_MAX_BYTES)).toBe('2 Mo')
    expect(sizeLimitLabel(COVER_IMAGE_MAX_BYTES)).toBe('5 Mo')
    expect(sizeLimitLabel(PDF_MAX_BYTES)).toBe('10 Mo')
    expect(sizeLimitLabel(LARGE_FILE_MAX_BYTES)).toBe('2 Go')
    expect(sizeLimitLabel(TRAINER_STORAGE_QUOTA_BYTES)).toBe('40 Go')
    expect(sizeLimitLabel(STORAGE_TIER_BYTES)).toBe('50 Go')
  })

  it('garde la virgule française pour un plafond non entier', () => {
    expect(sizeLimitLabel(1.5 * 1024 ** 3)).toBe('1,5 Go')
  })
})

describe('règles appliquées = règles affichées', () => {
  it('les plafonds de dépôt du serveur lisent rules.ts', () => {
    expect(COURSE_UPLOAD_LIMITS.video.maxSize).toBe(LARGE_FILE_MAX_BYTES)
    expect(COURSE_UPLOAD_LIMITS.archive.maxSize).toBe(LARGE_FILE_MAX_BYTES)
    expect(COURSE_UPLOAD_LIMITS.pdf.maxSize).toBe(PDF_MAX_BYTES)
    expect(COURSE_UPLOAD_LIMITS.image.maxSize).toBe(COVER_IMAGE_MAX_BYTES)
    expect(COMMUNITY_COVER_LIMITS.maxSize).toBe(COVER_IMAGE_MAX_BYTES)
    expect(AVATAR_LIMITS.maxSize).toBe(AVATAR_MAX_BYTES)
  })

  it('le quota de stockage se calcule avec les mêmes tailles', () => {
    expect(quotaBytesFor(2)).toBe(TRAINER_STORAGE_QUOTA_BYTES + 2 * STORAGE_TIER_BYTES)
  })

  it("le seuil s'écrit avec une espace insécable, comme la commission", () => {
    expect(CONSUMPTION_THRESHOLD_LABEL).toBe('30\u00a0%')
  })
})
