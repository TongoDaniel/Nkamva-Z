// ==========================================================================
// La page /tarifs ne se contredit plus — campagne du 12 octobre 2026, M9
// ==========================================================================
// Une fois le tarif formateur à 5 000 FCFA/mois en vigueur, le chapeau de la
// page, écrit à la main, disait « Pas d'abonnement obligatoire, ni pour
// apprendre, ni pour publier », et le bloc juste en dessous « Formateur
// 5 000 FCFA/mois ». La recette du 5 septembre relevait déjà « 9 000 FCFA/mois »
// à côté de « 0 FCFA/an ».

import { describe, it, expect } from 'vitest'
import { publicPricingCopy, subscriptionAnnouncement, type PublicPlan } from '@/lib/pricing'

/** `fmtNumber` sépare les milliers par une espace fine insécable, comme partout sur le site. */
const plain = (s: string) => s.replace(/[  ]/g, " ")

function plans(monthly: number, yearly: number, savingPercent: number | null = null): PublicPlan[] {
  return [
    { cadence: 'MONTHLY', name: 'Mensuelle', period: 'mois', amountFcfa: monthly, free: monthly === 0, tariffLabel: 'Fin de la gratuité', savingPercent: null },
    { cadence: 'YEARLY', name: 'Annuelle', period: 'an', amountFcfa: yearly, free: yearly === 0, tariffLabel: null, savingPercent },
  ]
}

describe('M9 — /tarifs dit ce que la grille facture', () => {
  it('grille gratuite : pas d\'abonnement pour publier, et la page le dit', () => {
    const copy = publicPricingCopy(plans(0, 0), '15 %')
    expect(copy.lead).toMatch(/ni pour publier/)
    expect(copy.trainerPrice).toBe('15 % de commission')
    expect(copy.trainerNote).toBe("Prélevés sur chaque vente. Rien à payer d'avance.")
  })

  it('grille payante : le chapeau ne nie plus l\'abonnement qu\'annonce la carte', () => {
    const copy = publicPricingCopy(plans(5000, 50000, 17), '15 %')
    expect(copy.lead).not.toMatch(/ni pour publier/)
    expect(copy.lead).toMatch(/publier demande l'abonnement formateur/)
    expect(plain(copy.trainerPrice)).toBe('5 000 FCFA/mois')
    expect(plain(copy.trainerNote)).toBe('Ou 50 000 FCFA/an (−17 %), plus 15 % de commission sur chaque vente.')
  })

  it('l\'intitulé administratif d\'un tarif ne s\'affiche pas au public', () => {
    for (const copy of [publicPricingCopy(plans(0, 0), '15 %'), publicPricingCopy(plans(5000, 0), '15 %')]) {
      expect(JSON.stringify(copy)).not.toMatch(/Fin de la gratuité/)
    }
  })

  it('une cadence à zéro n\'est jamais annoncée « 0 FCFA »', () => {
    const copy = publicPricingCopy(plans(9000, 0), '15 %')
    expect(plain(copy.trainerPrice)).toBe('9 000 FCFA/mois')
    expect(copy.trainerNote).toBe('Plus 15 % de commission sur chaque vente.')
    expect(plain(subscriptionAnnouncement(plans(9000, 0)))).toBe(
      'Abonnement formateur : 9 000 FCFA/mois, réglé après validation de votre candidature.',
    )
    expect(JSON.stringify(copy)).not.toMatch(/\b0 FCFA/)
  })
})
