-- Retrait d'un message par la Modération (décision 7)
--
-- Retenir un signalement ne savait faire qu'une chose : archiver une
-- ressource. Sur les surfaces conversationnelles — les seules où le
-- harcèlement se joue — la Modération ne pouvait que rédiger une note.
--
-- Retrait et non suppression, comme pour les billets de communauté : la ligne
-- reste, la preuve de ce qui a été instruit avec elle. Seul le texte cesse
-- d'être servi.
ALTER TABLE "messages" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "deletedById" TEXT;

ALTER TABLE "live_messages" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "live_messages" ADD COLUMN "deletedById" TEXT;
