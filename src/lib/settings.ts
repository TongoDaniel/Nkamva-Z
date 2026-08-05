// ==========================================================================
// Réglages système — `Setting`
// ==========================================================================
// Le modèle existe depuis le Lot 0 et rien ne l'écrit ni ne le lit : les
// trois lignes du jeu de démonstration sont les seules qui existent, posées
// directement en base par le seed, faute de chemin.
//
// Ce module ouvre l'écriture. Il n'invente pas de nouvelles clés : une route
// qui laisserait composer n'importe quelle clé transformerait cette table en
// fourre-tout que personne ne documenterait. Seule la valeur d'une clé déjà
// posée peut changer — par le seed aujourd'hui, par une migration plus tard.
//
// Honnêteté à garder en tête : **aucun chemin applicatif ne relit ces
// valeurs aujourd'hui**. Les modifier ici change ce qui est stocké, pas ce
// que fait la plateforme — exactement comme `PLATFORM_RULES` sur l'écran
// Paramètres documente des constantes que la modification, elle, exigerait
// une livraison. Câbler la lecture est un chantier séparé, par réglage,
// quand un écran en aura réellement besoin.
// ==========================================================================

import { db } from './db'
import { audit } from './audit'

export interface SettingRow {
  key: string
  value: string
  description: string | null
  updatedAt: Date
}

export async function listSettings(): Promise<SettingRow[]> {
  return db.setting.findMany({
    select: { key: true, value: true, description: true, updatedAt: true },
    orderBy: { key: 'asc' },
  })
}

/** Change la valeur d'une clé existante. Ne crée jamais une clé nouvelle. */
export async function updateSetting(
  key: string,
  value: string,
  actorId: string,
): Promise<SettingRow> {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('VALUE_REQUIRED')
  if (trimmed.length > 500) throw new Error('VALUE_TOO_LONG')

  const existing = await db.setting.findUnique({ where: { key } })
  if (!existing) throw new Error('SETTING_NOT_FOUND')
  if (existing.value === trimmed) throw new Error('VALUE_UNCHANGED')

  return db.$transaction(async (tx) => {
    const updated = await tx.setting.update({
      where: { key },
      data: { value: trimmed, updatedById: actorId },
      select: { key: true, value: true, description: true, updatedAt: true },
    })
    await audit(tx, {
      actorId, actorRole: 'SUPER_ADMIN',
      action: 'SETTING_UPDATED', targetType: 'Setting', targetId: key,
      meta: { from: existing.value, to: trimmed },
    })
    return updated
  })
}
