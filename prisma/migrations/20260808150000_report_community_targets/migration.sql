-- Signalement du fil de communauté (décision 7)
--
-- Les billets et leurs réponses étaient la seule surface conversationnelle sans
-- issue : un membre qui lisait un propos haineux dans le fil ne pouvait que
-- signaler la communauté entière depuis sa fiche publique.
--
-- Deux valeurs et non une : une réponse se retire seule, sans emporter le
-- billet qui la porte. Les fusionner obligerait la Modération à deviner ce
-- qu'elle instruit.
--
-- `ADD VALUE` sans `USING` : aucune ligne existante n'est réécrite.
ALTER TYPE "ReportTargetType" ADD VALUE 'COMMUNITY_POST' BEFORE 'MESSAGE';
ALTER TYPE "ReportTargetType" ADD VALUE 'COMMUNITY_POST_REPLY' BEFORE 'MESSAGE';
