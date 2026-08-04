-- Les tailles en octets débordent d'un INT4.
--
-- Une seule vidéo peut peser 2 Go (COURSE_UPLOAD_LIMITS), soit exactement un
-- octet de plus que le maximum d'un entier 32 bits signé — et le quota par
-- formateur est de 40 Go, donc leur somme n'y tient jamais. Un test a fait
-- remonter l'erreur Postgres avant que la première vraie vidéo ne le fasse.
ALTER TABLE "courses" ALTER COLUMN "coverSizeBytes" TYPE BIGINT;
ALTER TABLE "courses" ALTER COLUMN "contentSizeBytes" TYPE BIGINT;
