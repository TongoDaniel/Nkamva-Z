// Saisie du moyen de paiement mobile money — schéma partagé.
//
// Deux tunnels demandent la même chose (l'achat à l'unité et l'adhésion à une
// communauté) : le schéma vit ici pour qu'ils ne divergent pas. C'est la seule
// exception au principe « chaque route porte son schéma », et elle se justifie
// par le fait que les deux alimentent le même appel fournisseur.
import { z } from 'zod'

/**
 * L'apprenant choisit un **code opérateur PawaPay** (`MTN_MOMO_CMR`,
 * `HALOTEL_TZA`), pas une marque générique.
 *
 * La liste des marques figée ici auparavant — quatre valeurs — ne pouvait pas
 * exprimer HaloPesa, TNM, Moov, Free, Tigo ni Zamtel, et obligeait à recroiser
 * marque × pays dans une table écrite à la main dont sept entrées désignaient
 * des opérateurs inexistants. La liste proposée à l'écran est désormais celle
 * que `/v2/active-conf` déclare pour le pays de l'apprenant : elle ne peut pas
 * annoncer un opérateur que le compte ne distribue pas.
 *
 * Le format est validé ici, l'existence l'est côté serveur par `resolveProvider`
 * — une valeur inventée est refusée avant tout appel au fournisseur.
 */
export const PROVIDER_CODE_RE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/

export const MobileMoneyPayerSchema = z.object({
  /**
   * Le numéro est accepté large et normalisé côté serveur (`toMsisdn`) : exiger
   * un format canonique dans le formulaire ferait échouer une saisie
   * parfaitement lisible comme « 6 70 00 00 00 ». On borne seulement la
   * longueur en chiffres.
   */
  phoneNumber: z
    .string()
    .trim()
    .min(6, 'Numéro trop court')
    .max(20, 'Numéro trop long')
    .refine((v) => v.replace(/\D/g, '').length >= 8, 'Saisissez un numéro de téléphone valide'),
  provider: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(PROVIDER_CODE_RE, 'Opérateur invalide'),
})

export type MobileMoneyPayerInput = z.infer<typeof MobileMoneyPayerSchema>

/** Miroir client de la règle ci-dessus, pour un message avant l'aller-retour. */
export function phoneNumberError(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return 'Saisissez le numéro qui recevra la demande de paiement.'
  if (digits.length < 8) return 'Ce numéro semble incomplet.'
  if (digits.length > 15) return 'Ce numéro comporte trop de chiffres.'
  return null
}

/** Forme minimale d'un opérateur telle que les écrans la consomment. */
export interface PayableProvider {
  provider: string
  displayName: string
  countryCode: string
}
