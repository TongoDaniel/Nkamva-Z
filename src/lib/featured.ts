import { searchCourses } from "@/lib/catalog";
import { DEMO_COURSES } from "@/lib/demo/catalog";
import type { CourseListItem } from "@/lib/dto";

export interface FeaturedResult {
  courses: CourseListItem[];
  /** Vrai quand le catalogue affiché vient de `DEMO_COURSES`, pas de la base. */
  isDemo: boolean;
}

/**
 * Catalogue mis en avant sur les écrans publics.
 *
 * Une base injoignable ou vide ne doit pas produire une page d'accueil trouée :
 * on retombe sur le catalogue de démonstration de la maquette, en le signalant
 * pour que l'écran puisse afficher le bandeau qui va bien. Le repli n'est
 * jamais silencieux.
 */
export async function featuredCourses(limit = 8): Promise<FeaturedResult> {
  try {
    const result = await searchCourses({ sort: "newest", page: 1, pageSize: limit });
    const items = result.items as unknown as CourseListItem[];
    if (items.length > 0) return { courses: items, isDemo: false };
  } catch {
    // Traité comme un catalogue vide : le repli ci-dessous s'en charge.
  }
  return { courses: DEMO_COURSES.slice(0, limit), isDemo: true };
}
