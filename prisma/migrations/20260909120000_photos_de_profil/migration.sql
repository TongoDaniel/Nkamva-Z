-- Photos de profil : une personne, et un groupe.
--
-- L'écran de profil annonçait depuis le début que « l'envoi d'une photo
-- arrivera avec le stockage de fichiers ». Le stockage est là ; ces colonnes
-- portent enfin ce qu'il dépose.
--
-- `avatarUrl` reste : il porte une **adresse**, posée d'ailleurs (comptes
-- d'essai, demain une photo Google). `avatarS3Key` porte une **clé** dans notre
-- seau, servie par une route qui redirige vers une URL signée — la clé ne sort
-- jamais du serveur, et le lien ne se périme pas dans un JSON déjà rendu.
--
-- Le portrait d'une personne n'a pas de colonne de taille : le quota de
-- l'arbitrage 54 pèse ce qu'un formateur **publie**, et un apprenant n'a aucun
-- quota. La photo d'un groupe, elle, est publiée : elle est pesée comme la
-- bannière, et `trainerStorageUsedBytes()` l'additionne.
ALTER TABLE "users" ADD COLUMN "avatarS3Key" TEXT;
ALTER TABLE "communities" ADD COLUMN "avatarS3Key" TEXT;
ALTER TABLE "communities" ADD COLUMN "avatarSizeBytes" BIGINT;
