// ==========================================================================
// Réglages système — `Setting`
// ==========================================================================
// Le modèle existait depuis le Lot 0 sans que rien ne l'écrive ni ne le lise.
// L'écriture a été ouverte d'abord, la lecture ensuite : ces trois clés sont
// désormais relues par les écrans qu'elles décrivent, et les modifier change
// ce que fait la plateforme.
//
// Le registre ci-dessous est volontairement fermé. Une route qui laisserait
// composer n'importe quelle clé transformerait cette table en fourre-tout que
// personne ne documenterait ; une clé qu'aucun écran ne relit serait un
// bouton qui ne commande rien. Toute clé nouvelle s'ajoute ici *et* dans le
// code qui la consomme, dans le même changement.
//
// Ce qui reste dans le code plutôt qu'ici : les valeurs qui portent un
// arbitrage — taux de commission, retrait minimum, délai de carence. Les
// changer demande une livraison, parce qu'elles engagent la plateforme.
// Voir `src/app/admin/parametres/rules.ts`.
// ==========================================================================

import { db } from './db'
import { audit } from './audit'

export interface SettingRow {
  key: string
  value: string
  description: string | null
  updatedAt: Date
}

export interface SettingSpec {
  /**
   * Valeur retenue quand la ligne manque ou que ce qui est stocké est
   * illisible. Ce n'est pas un repli permissif au sens de la garde de
   * sécurité — aucune décision d'accès, de paiement ni de session ne dépend
   * de ces clés : ce sont un nombre de cartes, un délai affiché et un seuil
   * d'alerte. Le défaut est exactement la valeur que le code appliquait avant
   * que le réglage n'existe, donc l'absence de ligne ne change rien.
   */
  fallback: number
  min: number
  max: number
  /** Où la valeur agit réellement — affiché sur /admin/parametres. */
  effect: string
}

/**
 * Les clés câblées, avec leurs bornes. Les bornes ne sont pas décoratives :
 * `catalog.featured_limit` à 5 000 ferait charger le catalogue entier sur la
 * page d'accueil, et un délai négatif mettrait toute la file de retraits
 * « hors délai ». La borne est le garde-fou de l'écran, pas une préférence.
 */
export const SETTING_SPECS = {
  'catalog.featured_limit': {
    fallback: 8,
    min: 1,
    max: 24,
    effect: "Page d'accueil publique — nombre de ressources mises en avant.",
  },
  'payouts.review_sla_hours': {
    fallback: 48,
    min: 1,
    max: 720,
    effect:
      'Files /admin/retraits et /admin/moyens-de-paiement (compteur « hors délai »), alertes Finances, et le délai annoncé au formateur sur son portefeuille.',
  },
  'support.response_time_hours': {
    fallback: 24,
    min: 1,
    max: 720,
    effect: 'Délai annoncé sur Contact, le Centre d’aide et les Mentions légales.',
  },
  // Arbitrage 102 — ces deux-là sont des **limites de dégât**, pas des règles
  // produit : elles ne sont annoncées nulle part comme une caractéristique de
  // l'offre, et les reclasser ici évite d'avoir à les arbitrer. La règle
  // produit, elle, reste dans le code — un lien partageable ne mène jamais
  // qu'au tarif plein (arbitrage 74), et c'est ça le vrai garde-fou.
  'invitations.gift_monthly_quota': {
    fallback: 20,
    min: 0,
    max: 500,
    effect:
      'Nombre d’adhésions offertes qu’une communauté peut émettre sur 30 jours glissants.',
  },
  'invitations.share_link_max_uses': {
    fallback: 25,
    min: 1,
    max: 1000,
    effect: 'Nombre d’acceptations d’un lien de parrainage avant qu’il ne s’épuise.',
  },
} as const satisfies Record<string, SettingSpec>

export type NumericSettingKey = keyof typeof SETTING_SPECS

export function isNumericSettingKey(key: string): key is NumericSettingKey {
  return Object.hasOwn(SETTING_SPECS, key)
}

/**
 * Lit une valeur stockée et la ramène à un entier dans les bornes.
 * Retourne `null` — pas le défaut — pour que l'écriture puisse refuser ce que
 * la lecture, elle, doit savoir absorber.
 */
export function parseSettingNumber(key: NumericSettingKey, raw: string): number | null {
  const spec = SETTING_SPECS[key]
  if (!/^-?\d+$/.test(raw.trim())) return null
  const parsed = Number(raw.trim())
  if (!Number.isSafeInteger(parsed)) return null
  if (parsed < spec.min || parsed > spec.max) return null
  return parsed
}

export async function listSettings(): Promise<SettingRow[]> {
  return db.setting.findMany({
    select: { key: true, value: true, description: true, updatedAt: true },
    orderBy: { key: 'asc' },
  })
}

/**
 * Valeur numérique effective d'un réglage.
 *
 * Une base injoignable rend le défaut plutôt que de faire tomber l'écran :
 * `/contact` et les mentions légales sont précisément les pages qu'on
 * consulte quand le reste ne marche pas, et elles ne touchaient pas la base
 * avant ce câblage. Le back-office, lui, échoue de toute façon sur ses
 * propres requêtes — cette lecture-ci n'y masque rien.
 */
export async function getSettingNumber(key: NumericSettingKey): Promise<number> {
  const spec = SETTING_SPECS[key]
  try {
    const row = await db.setting.findUnique({ where: { key }, select: { value: true } })
    if (!row) return spec.fallback
    return parseSettingNumber(key, row.value) ?? spec.fallback
  } catch {
    return spec.fallback
  }
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

  // Une clé câblée ne se contente plus d'être stockée : elle est relue. Une
  // valeur que la lecture devrait rattraper au défaut serait un réglage qui
  // affiche 5 000 et applique 8 — l'écran mentirait sur ce qu'il fait.
  if (isNumericSettingKey(key) && parseSettingNumber(key, trimmed) === null) {
    throw new Error('SETTING_VALUE_INVALID')
  }

  const existing = await db.setting.findUnique({ where: { key } })
  // Une clé du registre sans ligne en base n'est pas une erreur : elle agit par
  // son défaut, et la première modification la matérialise. Refuser ici rendait
  // inéditable tout réglage câblé après le dernier seed — l'écran le proposait,
  // l'enregistrement répondait « introuvable ».
  if (!existing && !isNumericSettingKey(key)) throw new Error('SETTING_NOT_FOUND')
  if (existing?.value === trimmed) throw new Error('VALUE_UNCHANGED')

  const before = existing?.value ?? String(SETTING_SPECS[key as NumericSettingKey].fallback)

  return db.$transaction(async (tx) => {
    const updated = await tx.setting.upsert({
      where: { key },
      create: { key, value: trimmed, updatedById: actorId },
      update: { value: trimmed, updatedById: actorId },
      select: { key: true, value: true, description: true, updatedAt: true },
    })
    await audit(tx, {
      actorId, actorRole: 'SUPER_ADMIN',
      action: 'SETTING_UPDATED', targetType: 'Setting', targetId: key,
      meta: { from: before, to: trimmed, created: existing === null },
    })
    return updated
  })
}
