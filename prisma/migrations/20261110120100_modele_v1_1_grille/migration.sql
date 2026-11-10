-- Modèle v1.1 : la grille d'abonnement du lancement.
--
-- Séparée de la migration précédente parce qu'une valeur d'énumération ajoutée
-- (`PRO_SUBSCRIPTION`) ne peut pas servir dans la transaction qui l'a créée.
--
-- Rien n'est réécrit (décision 59) : les tarifs en cours sont bornés à
-- l'instant de la migration, et les nouveaux commencent au même instant.

-- Plan de base : 0 FCFA, aux deux cadences.
UPDATE "platform_tariffs" SET "validUntil" = CURRENT_TIMESTAMP
WHERE "kind" = 'SUBSCRIPTION' AND ("validUntil" IS NULL OR "validUntil" > CURRENT_TIMESTAMP)
  AND "validFrom" <= CURRENT_TIMESTAMP;
INSERT INTO "platform_tariffs" ("id", "kind", "cadence", "amountFcfa", "validFrom", "label", "createdAt")
VALUES
  (gen_random_uuid()::text, 'SUBSCRIPTION', 'MONTHLY', 0, CURRENT_TIMESTAMP, 'Vous ne payez que quand vous vendez', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SUBSCRIPTION', 'YEARLY', 0, CURRENT_TIMESTAMP, 'Vous ne payez que quand vous vendez', CURRENT_TIMESTAMP);

-- Plan Pro : 15 000 FCFA par mois.
INSERT INTO "platform_tariffs" ("id", "kind", "cadence", "amountFcfa", "validFrom", "label", "createdAt")
VALUES (gen_random_uuid()::text, 'PRO_SUBSCRIPTION', 'MONTHLY', 15000, CURRENT_TIMESTAMP, 'Pro', CURRENT_TIMESTAMP);
