import { searchCourses } from "@/lib/catalog";
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
 */
export async function featuredCourses(limit = 8): Promise<FeaturedResult> {
  try {
    const result = await searchCourses({ sort: "newest", page: 1, pageSize: limit });
    return { courses: result.items as unknown as CourseListItem[], unavailable: false };
  } catch {
    // Une base injoignable ne doit pas faire tomber toute la page d'accueil,
    // mais elle ne doit pas non plus se faire passer pour un catalogue vide.
    return { courses: [], unavailable: true };
  }
}
