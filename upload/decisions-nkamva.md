Décisions produit

1. KYC — Score de 0 à 100 calculé, affiché en 3 badges.
   PI vérifiée 40 · RIB vérifié 30 · Ancienneté ≥ 30 jours 10 ·
   ≥ 3 ventes réglées sans litige 10 · Aucun litige ouvert 10.
   ≥ 80 « Vérifié » · 50-79 « À vérifier » · < 50 « Non vérifié ».
   Retrait auto-approuvable seulement si ≥ 80.

2. Remboursement — Règle cumulative : ≤ 14 jours ET < 30 % consulté.
   % = durée vidéo lue pour les formats vidéo, ratio leçons/sections
   ouvertes pour PDF/kit/Notion. Pas de plafond en FCFA ; au-delà des
   critères, demande manuelle traitée par le support.

3. Parcours formateur — J'aligne la maquette sur le réel.
   Inscription légère → candidature (PI + diplôme + vidéo) → RIB
   collecté uniquement avant le premier retrait. Retirer l'étape
   RIB du wizard d'inscription de la maquette.
   Raison : minimisation RGPD + friction + le RIB n'est utile qu'au payout.

4. Mode école — Hors périmètre. Flag désactivé, aucun écran à concevoir.
   Ne pas modéliser Quiz/Certificate/Lesson pour l'instant.

5. Boutons marqués .soon dans la maquette — Hors périmètre, sauf export
   RGPD, suppression de compte et changement de mot de passe (déjà actifs
   côté réel : c'est la maquette qui est en retard).

6. Onboarding apprenant — Hors périmètre maquette.
   Recherche transversale : pas d'écran dédié, elle reste intégrée
   au catalogue avec filtres par type.

7. Permissions admin :
   • Super-admin : tout, y compris équipe, configuration, audit.
   • Finances : transactions, retraits, remboursements, abonnements,
     rapports. Lecture seule sur les utilisateurs. Aucun accès à la modération.
   • Modération : signalements, modération des ressources, interactions,
     règles, validation des formateurs. Aucun accès aux finances.
   Le journal d'audit est lisible par le Super-admin uniquement, mais
   toutes les actions des 3 rôles y sont écrites.

8. Litige vs payout — À l'ouverture d'un litige, la part formateur de
   la vente concernée passe en solde « réservé », exclue du montant
   retirable. Libération à la résolution (rejet du litige) ou
   débit définitif (remboursement accordé).

9. Community — 1 formateur = 1 communauté dans cette version, mais
   modélisé en 1-to-many (Community.trainerId) avec contrainte
   applicative. Pas de contrainte d'unicité en base.

10. Upload 2 Go — URL pré-signée S3 en direct, obligatoire. Jamais de
    proxy via Hono. Liste blanche MIME : mp4, pdf, zip, xlsx, docx, png,
    jpg, webp. Quota par formateur selon son plan SaaS.

11. Commission 15 % — Sur le prix payé, prélevée au moment de la vente
    (le wallet formateur est crédité de 85 %), identique pour les ventes
    directes et via communauté.


Sur la base de ces arbitrages, produis les SPECS D'IMPLÉMENTATION du Lot 1
(Validation formateurs) uniquement. Tu n'as PAS accès au repo du produit réel :
ne prétends pas modifier des fichiers que tu n'as pas vus, ni citer du code existant.

Cible technique : API Hono (TypeScript), Prisma, PostgreSQL. Next.js côté front.

Livrables, dans cet ordre :

1. Schéma Prisma à ajouter (blocs complets et commentés, pas un diff) : modèles
   TrainerDocument, TrainerApplication, enums de statut, relations, index.
   TrainerDocument.type est un enum limité à : ID_CARD, DIPLOMA, VIDEO.
   Le RIB ne fait PAS partie de cet enum ni de ce lot : il sera porté par un
   modèle PayoutMethod distinct, collecté avant le premier retrait (lot 3).
   Ne le modélise pas ici, mais signale l'accroche prévue.
   TrainerApplication ne doit inclure aucun champ RIB (cf. décision n°3).

2. Contrats API en OpenAPI 3.1 pour ces deux modèles : endpoints upload
   de document, listing admin, approbation, rejet partiel (par document, avec
   motif), re-soumission. Codes d'erreur inclus pour chaque endpoint.

3. Machines à états de TrainerApplication et TrainerDocument, sous
   forme de tableau : transition | acteur | condition | effet de bord.

4. Mapping écran → endpoint pour la maquette Admin Validation formateurs.dc.html :
   pour chaque zone de l'écran, quelle donnée affichée, quel appel API,
   quel état de chargement et quel état d'erreur.

5. Règles de sécurité : qui peut lire un document (rôle Modération uniquement,
   cf. décision n°7 — Finances n'a pas accès à cette validation), durée de vie
   des URLs signées, journalisation des accès aux pièces d'identité, durée de
   conservation des documents après décision (approbation comme rejet) et
   procédure de purge.

Contraintes : respecte les tokens et composants de la maquette
(--green #0d6b4d, .adm-modal, .stpill, .adm-table). Ne propose aucune
nouvelle dépendance sans la justifier. Signale explicitement, section par
section, tout ce que tu approximes faute d'accès au repo.