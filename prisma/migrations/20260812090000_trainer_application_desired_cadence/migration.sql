-- Cadence d'abonnement demandée à la candidature (parcours « Devenir formateur »).
-- Nullable : les dossiers ouverts depuis /candidature ne posent pas la question,
-- et l'approbation retombe alors sur la valeur par défaut du profil.
ALTER TABLE "trainer_applications" ADD COLUMN "desiredCadence" "PlanCadence";
