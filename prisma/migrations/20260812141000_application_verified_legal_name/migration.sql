-- L'identité retenue par la modération doit survivre entre l'approbation et le
-- règlement : le TrainerProfile qui la portera ne naît plus dans la même
-- transaction que l'approbation.
ALTER TABLE "trainer_applications" ADD COLUMN "verifiedLegalName" TEXT;
