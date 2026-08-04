-- Le contenu vendu n'était référencé nulle part.
--
-- `presignCourseUpload` déposait sous `course-assets/{courseId}/…` sans rien
-- enregistrer, et `getCourseContentUrl` signait une clé devinée,
-- `course-content/{courseId}/main.mp4` — un objet que personne n'avait jamais
-- écrit. Un apprenant qui payait recevait une URL vers du vide.
--
-- La taille est stockée avec la clé : elle sert aussi de base au quota de
-- stockage du formateur (arbitrage 54), qui n'avait rien à compter.
ALTER TABLE "courses" ADD COLUMN "coverSizeBytes" INTEGER;
ALTER TABLE "courses" ADD COLUMN "contentS3Key" TEXT;
ALTER TABLE "courses" ADD COLUMN "contentSizeBytes" INTEGER;
ALTER TABLE "courses" ADD COLUMN "contentMimeType" TEXT;
