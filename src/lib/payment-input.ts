// Saisie du moyen de paiement mobile money — schéma partagé.
//
// Deux tunnels demandent la même chose (l'achat à l'unité et l'adhésion à une
// communauté) : le schéma vit ici pour qu'ils ne divergent pas. C'est la seule
// exception au principe « chaque route porte son schéma », et elle se justifie
// par le fait que les deux alimentent le même appel fournisseur.
import { z } from 'zod'

/**
 * Opérateurs proposés à la saisie. Volontairement plus restreint que
 * l'énumération Prisma `MobileMoneyOperator` : celle-ci sert aussi aux moyens de
 * versement des formateurs, où WAVE reste possible en circuit manuel. À
 * l'encaissement, seuls les opérateurs distribués par PawaPay ont un sens —
 * proposer Wave ici ouvrirait un tunnel qui ne peut pas aboutir.
 */
export const PAYABLE_OPERATORS = ['MTN_MOMO', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'M_PESA'] as const

export const OPERATOR_LABELS: Record<(typeof PAYABLE_OPERATORS)[number], string> = {
  MTN_MOMO: 'MTN Mobile Money',
  ORANGE_MONEY: 'Orange Money',
  AIRTEL_MONEY: 'Airtel Money',
  M_PESA: 'M-Pesa',
}

/**
 * Le numéro est accepté large et normalisé côté serveur (`toMsisdn`) : exiger
 * un format canonique dans le formulaire ferait échouer une saisie parfaitement
 * lisible comme « 6 70 00 00 00 ». On borne seulement la longueur en chiffres.
 */
export const MobileMoneyPayerSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .min(6, 'Numéro trop court')
    .max(20, 'Numéro trop long')
    .refine((v) => v.replace(/\D/g, '').length >= 8, 'Saisissez un numéro de téléphone valide'),
  operator: z.enum(PAYABLE_OPERATORS),
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
