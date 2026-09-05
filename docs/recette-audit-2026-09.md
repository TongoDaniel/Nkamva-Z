# Recette de l'audit fonctionnel du 1er septembre 2026

*Établie le 5 septembre 2026, branche `develop`. Ce document relie chaque
constat de l'audit à ce qui le couvre aujourd'hui, et nomme ce qui reste.*

> **Sur la source.** Le rapport transmis est un document d'**une page** : un
> tableau de synthèse à neuf domaines, avec un constat et une priorité chacun.
> Il ne contient pas de checklist détaillée. La recette ci-dessous suit donc les
> neuf domaines qu'il énonce, complétés par les règles opposables du cahier —
> et non une liste que le document ne porte pas.

---

## 1. Les neuf domaines de l'audit

| Domaine | Constat de l'audit | Priorité | Où il en est |
|---|---|---|---|
| Compte / profil | Inscription, connexion, profil et modification testés avec succès | OK | Inchangé. Couvert par `tests/auth-session.test.ts`, `tests/lot0-auth.test.ts` |
| Création formation | Fonctionne, mais les contrôles de cohérence doivent être vérifiés | Haute | **Corrigé (lot 6).** La fiche et le fichier ne peuvent plus se contredire (arbitrage 133) ; la durée est mesurée, le nombre de sessions retiré. `tests/duree-mesuree.test.ts`, `scripts/smoke-duree-mesuree.ts` |
| Paiement | Carte, historique, confirmation et accès après achat OK | OK | Inchangé, et rejoué de bout en bout par `scripts/recette-nominale.ts` |
| Progression | La position dans une formation n'est pas conservée | P0 | **Corrigé (lot 7).** Position réelle par format — seconde, page, marqueur —, visualiseur PDF embarqué. `tests/position-de-lecture.test.ts`, `scripts/smoke-position-lecture.ts` |
| Communautés | Accès dispersés entre Marketplace / ressources / Mes communautés | P0 | **Corrigé (lot 8).** « Mes ressources » réunit les deux façons d'y avoir droit, chaque ressource incluse ouvrant sa communauté. `tests/ressources-communautes.test.ts` |
| Notifications | E-mails et notifications temps réel insuffisants | P0 | **Corrigé (lot 2).** Cinq événements, deux préférences, un point d'entrée unique pour les cinq chemins de règlement. `tests/notifications-achat.test.ts`, `tests/preferences-email.test.ts` |
| Messagerie | Actualisation manuelle + doublons observés | P0 | **Corrigé (lot 4).** Clé d'idempotence conservée entre tentatives, sondage 8 s / 15 s incrémental. `tests/messagerie-idempotence.test.ts` |
| Invitations | Acceptation non répercutée côté formateur | P0 | **Corrigé (lot 5).** Un lien de parrainage se lit à son compteur, la liste se rafraîchit seule. `tests/invitations-statut.test.ts`, `scripts/smoke-invitations.ts` |
| Lives | Planification, replay, micro/audio et UX à corriger | P0 | **Partiel (lot 9).** La planification **ne se reproduit pas** comme défaut ; le salon rejoint son replay, les enregistrements ont une adresse, un refus de périphérique se dit. Restent l'essai micro à deux participants et la revue de la salle |
| Ventes / revenus | Montants visibles mais détail de vente et notifications insuffisants | P0 | **Corrigé (lot 3).** Historique ligne à ligne : brut, commission, net, statut. `tests/ventes-formateur.test.ts`, `scripts/smoke-ventes-formateur.ts` |

---

## 2. Le scénario nominal, joué de bout en bout

`bun scripts/recette-nominale.ts` — de l'inscription au revenu retiré, en neuf
étapes et trente-cinq vérifications.

1. Une personne s'inscrit — le compte naît apprenant.
2. Elle candidate : dossier en brouillon, trois pièces, soumission, rôle en
   attente.
3. Un administrateur approuve.
4. **L'espace s'ouvre.** Au règlement du premier abonnement, ou dès
   l'approbation quand il n'y a rien à régler — voir la réserve ci-dessous.
5. Elle ouvre sa communauté, publie une ressource vendue et en inclut une
   seconde.
6. Un apprenant achète : paiement confirmé, commission figée à 15 %, accès
   ouvert, facture émise, les deux parties prévenues.
7. Il consulte : la position est enregistrée, la ressource passe en
   « commencée ».
8. La formatrice voit sa vente, ses trois montants, et son portefeuille crédité
   de 17 000 FCFA sur une vente à 20 000.
9. Elle demande son retrait sur un moyen vérifié, hors carence.

**Par où il passe, et pourquoi.** Par les services, pas par les écrans :
l'inscription réelle enverrait de vrais courriels (la clé Resend du `.env` de
développement est active), le règlement réel appellerait Stripe, et le dépôt
réel écrirait dans le seau **de production**. Les écrans, eux, sont couverts un
à un par les trente-deux smoke tests des lots précédents.

---

## 3. Ce que la recette a mis en évidence

**La branche gratuite est celle qui s'exécute.** La grille d'abonnement est à
zéro : l'espace formateur s'ouvre donc **à l'approbation**, pas au règlement.
La règle « c'est le paiement qui fait le formateur » est bien là et testée,
mais elle n'est pas empruntée aujourd'hui. Elle le sera le jour où un montant
sera fixé — ce qui reste, au §14, la plus ancienne question ouverte du produit,
et la seule qui se voie en vitrine : `/tarifs` annonce « 9 000 FCFA/mois » et
« 0 FCFA/an », une paire incohérente pour qui la lit.

La recette joue la branche qui s'applique et **dit laquelle** à chaque
exécution. Aucune réécriture ne sera nécessaire le jour du basculement.

---

## 4. Ce qui reste, et qui n'est pas de mon ressort

**L'essai par une personne réelle, sans assistance.** C'est la troisième ligne
du lot 10, et elle ne peut pas être scriptée : cette recette établit que la
mécanique tient, pas qu'elle se comprend. Il faut quelqu'un qui n'a pas écrit le
code, devant un navigateur, sans qu'on lui souffle où cliquer.

**L'essai du micro à deux participants.** Permissions, coupure, réouverture. Il
demande deux navigateurs équipés d'un périphérique audio et deux personnes dans
la même salle. Ce qui était corrigeable sans appareil l'a été : un refus du
navigateur est désormais nommé dans la salle au lieu de laisser le bouton
éteint sans explication.

**La revue de la disposition de la salle.** C'est un arbitrage de conception,
pas une correction de défaut.

---

## 5. Les échecs préexistants de la suite de tests

La suite rend **728 tests verts et onze à treize rouges**, dans cinq fichiers
toujours les mêmes : `dispute-review`, `lot2-invariants`, `lot2-routes`,
`lot4-invariants`, `memberships`. Un seul domaine — litiges, remboursements,
chargebacks, adhésions.

Le nombre varie parce que **deux de ces échecs sont instables** : ils dépendent
de l'ordre d'exécution et de la charge, et le jeu exact change d'une exécution
à l'autre. C'est pourquoi on parle d'une fourchette et non d'un chiffre.

Ils étaient là avant le premier lot et n'ont pas bougé depuis. Aucun n'a été
introduit par ce chantier : le compte a été relevé après chacun des onze lots.

Ils ne sont pas couverts par cette recette et n'ont jamais fait partie du
périmètre de l'audit. Ils méritent leur propre chantier.
