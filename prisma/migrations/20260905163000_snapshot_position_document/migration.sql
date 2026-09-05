-- Le résumé de consommation figé à l'ouverture d'un litige porte la position
-- documentaire.
--
-- Un format téléchargeable échappe à la règle des 30 % et part en décision
-- **manuelle** du support (F8.1). Depuis que le PDF se lit en ligne (F3.2),
-- l'agent pouvait avoir sous les yeux « non téléchargée, 0 % » pour un document
-- lu de bout en bout : rien qui l'aide à trancher.
--
-- Ces deux colonnes **renseignent, elles n'arbitrent pas**. Aucune éligibilité
-- ne change : `consumptionPercent`, `ruleApplies` et le motif de blocage
-- gardent exactement la sémantique de F8.1.
ALTER TABLE "consumption_snapshots" ADD COLUMN "lastPage" INTEGER;
ALTER TABLE "consumption_snapshots" ADD COLUMN "coursePageCount" INTEGER;
