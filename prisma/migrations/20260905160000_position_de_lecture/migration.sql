-- F3.1 — la position de lecture devient réelle, et dépend du format.
--
-- Jusqu'ici une seule mesure existait : `watchedSeconds`, calculée pour les
-- seules vidéos munies d'une durée. Un PDF n'avait pas de position du tout, et
-- l'écran de lecture le rendait dans une balise `<video>` — écran noir, rien
-- à mesurer. C'est le constat 6 de l'audit du 1er septembre 2026.
--
--   · `courses.pageCount`         le total, mesuré sur le fichier au dépôt,
--                                 comme l'est déjà la durée d'une vidéo.
--   · `course_views.lastPage`     la page où l'apprenant s'est arrêté.
--   · `course_views.completedAt`  le marqueur « terminé » d'une archive, que
--                                 l'apprenant pose lui-même faute de rendu
--                                 possible en ligne.
--
-- Trois colonnes nulles : rien à reprendre sur l'existant. Une ressource déjà
-- déposée obtient son compte de pages à son prochain dépôt, et les positions
-- naissent à la première lecture.
ALTER TABLE "courses" ADD COLUMN "pageCount" INTEGER;
ALTER TABLE "course_views" ADD COLUMN "lastPage" INTEGER;
ALTER TABLE "course_views" ADD COLUMN "completedAt" TIMESTAMP(3);
