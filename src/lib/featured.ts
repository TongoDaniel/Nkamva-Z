import { searchCourses } from "@/lib/catalog";
import { getSettingNumber } from "@/lib/settings";
import type { CourseListItem } from "@/lib/dto";

export interface FeaturedResult {
  courses: CourseListItem[];
  /**
   * Vrai quand la base n'a pas pu être interrogée — à distinguer d'un catalogue
   * réellement vide : l'écran ne dit pas la même chose dans les deux cas.
   */
  unavailable: boolean;
}

/**
 * Catalogue mis en avant sur les écrans publics.
 *
 * Aucun repli sur des données écrites en dur : une vitrine peuplée de
 * ressources qui n'existent pas en base promet des liens qui mènent à une 404,
 * et un tunnel d'achat sur un cours introuvable. Une base vide donne une liste
 * vide, et l'écran l'annonce.
 *
 * Le nombre de cartes vient du réglage `catalog.featured_limit`, lu ici plutôt
 * que par l'appelant : il tombe ainsi dans le même `try` que la recherche, et
 * une base injoignable donne « catalogue indisponible » comme avant, pas une
 * page d'accueil en erreur.
 */
export async function featuredCourses(): Promise<FeaturedResult> {
  try {
    const limit = await getSettingNumber("catalog.featured_limit");
    const result = await searchCourses({ sort: "newest", page: 1, pageSize: limit });
    return { courses: result.items as unknown as CourseListItem[], unavailable: false };
  } catch {
    // Une base injoignable ne doit pas faire tomber toute la page d'accueil,
    // mais elle ne doit pas non plus se faire passer pour un catalogue vide.
    return { courses: [], unavailable: true };
  }
}
