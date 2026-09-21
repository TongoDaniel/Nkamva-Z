// ==========================================================================
// Ce qui suit un achat réellement encaissé (F12.5, arbitrages 119 et 125)
// ==========================================================================
// **Un seul endroit**, appelé par les cinq chemins qui créditent un achat : les
// deux webhooks Stripe, celui de PawaPay, la réconciliation au retour de
// l'apprenant, et le règlement simulé du mode développement.
//
// Ces cinq chemins portaient déjà, chacun, le même couple
// `if (credit.credited && credit.purchaseId) await issueInvoiceQuietly(…)`.
// Y ajouter les annonces aurait fait cinq copies d'une même règle — la forme
// exacte qui produit un oubli sur l'un et un doublon sur un autre, ce que F12.7
// interdit. Le garde-fou reste celui qui existait : `creditWalletOnPurchase`
// est idempotent, `credited` n'est vrai **qu'une fois**, et tout ce qui pend à
// cette branche part donc une fois.
//
// Les montants viennent de l'achat, pas d'un calcul refait ici : ce sont les
// valeurs figées à la vente qui font foi (F7.11). Un taux de commission qui
// évolue ne réécrit pas un reçu déjà envoyé.
// ==========================================================================

import { db } from './db'
import { issueInvoiceQuietly } from './invoices'
import { absoluteUrl, deliverSideEffects, notifyWithEmail, TRANSACTIONAL } from './notification'
import { fmtFcfa } from './format'

/**
 * Facture, puis annonces — dans cet ordre.
 *
 * La facture d'abord parce que le reçu y renvoie : annoncer une vente dont la
 * facture n'existe pas encore enverrait l'acheteur sur un écran vide.
 */
export async function onPurchaseSettled(purchaseId: string): Promise<void> {
  await issueInvoiceQuietly(purchaseId)
  await deliverSideEffects('PURCHASE_SETTLED', { type: 'Purchase', id: purchaseId }, () =>
    announceSettledPurchase(purchaseId),
  )
}

/**
 * Prévient **les deux parties**. L'acheteur reçoit une preuve, le formateur
 * apprend qu'il a vendu.
 *
 * Cette seconde moitié n'existait nulle part : aucun `notify()` ne se trouvait
 * sur le chemin d'un achat, et un formateur ne pouvait apprendre une vente
 * qu'en allant regarder son tableau de bord. C'est le constat 7 de l'audit.
 *
 * Tout est transactionnel, donc incoupable : un reçu et une entrée d'argent ne
 * sont pas des annonces dont on se lasse.
 */
async function announceSettledPurchase(purchaseId: string): Promise<void> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      learnerId: true,
      amountFcfa: true,
      trainerShareFcfa: true,
      platformShareFcfa: true,
      course: { select: { title: true, slug: true } },
      community: { select: { name: true, slug: true } },
      trainerProfile: { select: { userId: true } },
    },
  })
  if (!purchase) return

  const estAdhesion = Boolean(purchase.community)
  const intitule = purchase.course?.title ?? purchase.community?.name ?? 'votre achat'
  const trainerUserId = purchase.trainerProfile?.userId ?? null

  // --- Côté acheteur ------------------------------------------------------
  // Un achat de ressource ouvre un accès à vie ; une adhésion ouvre un espace.
  // Les deux ne s'annoncent pas dans les mêmes mots, et ne mènent pas au même
  // écran.
  const lienAcheteur = estAdhesion
    ? `/mes-communautes/${purchase.community!.slug}`
    : '/mes-ressources'

  await notifyWithEmail(
    purchase.learnerId,
    {
      type: estAdhesion ? 'MEMBERSHIP_STARTED' : 'PURCHASE_CONFIRMED',
      title: estAdhesion ? `Bienvenue dans ${intitule}` : `Votre achat est confirmé`,
      body: estAdhesion
        ? `Votre adhésion est active. ${fmtFcfa(purchase.amountFcfa)} réglés.`
        : `${intitule} — ${fmtFcfa(purchase.amountFcfa)}. L'accès est à vie.`,
      link: lienAcheteur,
    },
    {
      subject: estAdhesion
        ? `NKAMVA — bienvenue dans ${intitule}`
        : `NKAMVA — votre achat de « ${intitule} »`,
      title: estAdhesion ? `Bienvenue dans ${intitule}` : 'Votre achat est confirmé',
      paragraphs: estAdhesion
        ? [
            'Bonjour,',
            `Votre adhésion à ${intitule} est active. Vous avez accès aux ressources incluses, aux sessions en direct et à leurs replays.`,
            `Montant réglé : ${fmtFcfa(purchase.amountFcfa)}. Votre facture est disponible dans « Mes factures ».`,
          ]
        : [
            'Bonjour,',
            `Votre achat de « ${intitule} » est confirmé. L'accès vous reste acquis, sans limite de durée.`,
            `Montant réglé : ${fmtFcfa(purchase.amountFcfa)}. Votre facture est disponible dans « Mes factures ».`,
          ],
      cta: {
        label: estAdhesion ? 'Ouvrir la communauté' : 'Accéder à la ressource',
        url: absoluteUrl(lienAcheteur),
      },
    },
    TRANSACTIONAL,
  )

  // --- Côté formateur -----------------------------------------------------
  // Un formateur qui achèterait sa propre ressource n'existe pas (F3.5), mais
  // une adhésion offerte peut faire coïncider les deux : on ne s'annonce pas
  // une vente à soi-même.
  if (!trainerUserId || trainerUserId === purchase.learnerId) return

  // Les trois montants, nommés. Le formateur qui voit 1 700 arriver sur une
  // vente à 2 000 doit retrouver les 300 retenus sans les calculer (F7.11).
  const detail =
    `${fmtFcfa(purchase.amountFcfa)} encaissés · ` +
    `${fmtFcfa(purchase.platformShareFcfa)} de commission · ` +
    `${fmtFcfa(purchase.trainerShareFcfa)} pour vous`

  await notifyWithEmail(
    trainerUserId,
    {
      type: estAdhesion ? 'MEMBERSHIP_SOLD' : 'COURSE_SOLD',
      title: estAdhesion ? `Nouveau membre dans ${intitule}` : `Vous avez vendu « ${intitule} »`,
      body: detail,
      link: '/formateur/ventes',
    },
    {
      subject: estAdhesion
        ? `NKAMVA — nouveau membre dans ${intitule}`
        : `NKAMVA — vous avez vendu « ${intitule} »`,
      title: estAdhesion ? `Nouveau membre dans ${intitule}` : 'Vous avez fait une vente',
      paragraphs: [
        'Bonjour,',
        estAdhesion
          ? `Quelqu'un vient d'adhérer à ${intitule}.`
          : `« ${intitule} » vient d'être acheté.`,
        detail + '. Votre part est déjà créditée sur votre portefeuille.',
      ],
      cta: { label: 'Voir mes ventes', url: absoluteUrl('/formateur/ventes') },
    },
    TRANSACTIONAL,
  )
}
