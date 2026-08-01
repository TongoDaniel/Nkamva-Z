-- Base dédiée aux tests d'intégration (tests/setup.ts).
-- Séparée de la base applicative : la suite vide les tables entre chaque test
-- par TRUNCATE CASCADE, ce qui effacerait les données de développement si les
-- deux partageaient la même base.
CREATE DATABASE nkamva_test OWNER edulink;
