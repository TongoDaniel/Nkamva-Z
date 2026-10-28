-- La recherche ignore les accents dans les deux sens (campagne du 12 octobre
-- 2026, m6, seconde moitié). « rôbe » trouvait déjà « robe » en retirant les
-- accents de la saisie ; « robe » ne trouvait pas « rôbe », parce que PostgreSQL
-- compare les lettres accentuées du texte stocké telles quelles.
--
-- `unaccent` est une extension « trusted » depuis PostgreSQL 13 : le
-- propriétaire de la base peut la créer sans être superutilisateur.
CREATE EXTENSION IF NOT EXISTS unaccent;
