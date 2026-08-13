// ==========================================================================
// Réglages système — registre, bornes, et première écriture
// ==========================================================================
// Le défaut que ces tests empêchent de revenir : une clé **câblée dans le code
// mais sans ligne en base** n'apparaissait pas sur `/admin/parametres`, et
// `updateSetting` la refusait en `SETTING_NOT_FOUND`. Le réglage existait,
// agissait par son défaut, et restait introuvable pour qui voulait le changer —
// ce qui est la pire des trois situations, puisque rien ne le signalait.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  updateSetting, getSettingNumber, SETTING_SPECS, isNumericSettingKey,
} from '@/lib/settings'

const KEY = 'invitations.gift_monthly_quota'

describe('Réglages système', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function superAdmin() {
    return prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
  }

  it('une clé du registre sans ligne en base agit par son défaut', async () => {
    expect(await prisma.setting.findUnique({ where: { key: KEY } })).toBeNull()
    expect(await getSettingNumber(KEY)).toBe(SETTING_SPECS[KEY].fallback)
  })

  it('la première modification matérialise la ligne au lieu de la refuser', async () => {
    const admin = await superAdmin()

    const updated = await updateSetting(KEY, '40', admin.id)

    expect(updated.value).toBe('40')
    expect(await getSettingNumber(KEY)).toBe(40)
    // Le journal dit que la ligne est née de ce geste : sans ce drapeau, une
    // création se relit comme une modification d'une valeur qui n'existait pas.
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SETTING_UPDATED', targetId: KEY },
    })
    expect((entry.meta as { created?: boolean }).created).toBe(true)
    expect((entry.meta as { from?: string }).from).toBe(String(SETTING_SPECS[KEY].fallback))
  })

  it('les bornes tiennent, y compris à la première écriture', async () => {
    const admin = await superAdmin()
    const spec = SETTING_SPECS[KEY]

    await expect(updateSetting(KEY, String(spec.max + 1), admin.id))
      .rejects.toThrow('SETTING_VALUE_INVALID')
    await expect(updateSetting(KEY, 'beaucoup', admin.id))
      .rejects.toThrow('SETTING_VALUE_INVALID')

    // Rien n'a été écrit : une valeur refusée ne laisse pas de ligne derrière.
    expect(await prisma.setting.findUnique({ where: { key: KEY } })).toBeNull()
  })

  it('une clé hors registre reste refusée', async () => {
    const admin = await superAdmin()
    expect(isNumericSettingKey('invitations.inventee')).toBe(false)
    await expect(updateSetting('invitations.inventee', '3', admin.id))
      .rejects.toThrow('SETTING_NOT_FOUND')
  })

  it('reposer la même valeur ne compte pas comme un changement', async () => {
    const admin = await superAdmin()
    await updateSetting(KEY, '40', admin.id)
    await expect(updateSetting(KEY, '40', admin.id)).rejects.toThrow('VALUE_UNCHANGED')
  })
})
