-- EmailOtp : séparation des usages (vérification d'adresse vs réinitialisation).
-- Un code n'est désormais consommable que pour son usage. Colonne non-null avec
-- défaut : les codes existants (à durée de vie courte) deviennent EMAIL_VERIFICATION.
ALTER TABLE "email_otps" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'EMAIL_VERIFICATION';

-- La recherche d'un code se fait désormais par (email, purpose).
CREATE INDEX "email_otps_email_purpose_idx" ON "email_otps"("email", "purpose");
