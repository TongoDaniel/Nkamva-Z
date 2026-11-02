import { searchCourses } from "@/lib/catalog";
import { getSettingNumber } from "@/lib/settings";
import type { CourseListItem } from "@/lib/dto";
import type { CommunityCardData } from "@/components/nk/community-card";
import { db } from "@/lib/db";
import { listPublicCommunities } from "@/lib/communities";
import { listPublicTrainers, PUBLIC_TRAINER_WHERE, type PublicTrainer } from "@/lib/trainers";
import { userAvatarSrc } from "@/lib/avatars";

export interface FeaturedResult {
  courses: CourseListItem[];
  /**
   * Vrai quand la base n'a pas pu être interrogée — à distinguer d'un catalogue
   * réellement vide : l'écran ne dit pas la même chose dans les deux cas.
   */
  unavailable: boolean;
  /**
   * Vrai quand l'ordre vient des ventes réelles (tri « popular »). Faux quand
   * il n'y en a pas assez pour classer : ce sont alors les nouveautés, et
   * l'écran ne doit pas les présenter comme les plus populaires.
   */
  ranked: boolean;
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
    // Le carrousel s'intitulait « Ressources populaires » en triant par date.
    const result = await searchCourses({ sort: "popular", page: 1, pageSize: limit });
    return { courses: result.items as unknown as CourseListItem[], unavailable: false, ranked: result.ranked };
  } catch {
    // Une base injoignable ne doit pas faire tomber toute la page d'accueil,
    // mais elle ne doit pas non plus se faire passer pour un catalogue vide.
    return { courses: [], unavailable: true, ranked: false };
  }
}

export interface PlatformShowcase {
  /** Comptages en base, sans arrondi ni « + » : ce qui est, pas ce qu'on espère. */
  counts: { courses: number; trainers: number; communities: number };
  communities: CommunityCardData[];
  trainers: PublicTrainer[];
}

/**
 * Ce que l'accueil public montre de la plateforme : des chiffres comptés en
 * base et de vraies communautés, de vrais formateurs. Les règles de
 * visibilité sont celles de leurs pages (catalogue marchand, communautés
 * actives et publiques, annuaire des formateurs). Pas d'avis ni de note :
 * aucun n'alimente `ratingAverage`.
 *
 * `null` si la base ne répond pas : l'accueil se passe alors de la section
 * plutôt que d'afficher des zéros.
 */
export async function platformShowcase(): Promise<PlatformShowcase | null> {
  try {
    const [courses, trainers, communities, page, directory] = await Promise.all([
      db.course.count({ where: { status: "published", circuit: "MARKETPLACE" } }),
      db.trainerProfile.count({ where: PUBLIC_TRAINER_WHERE }),
      db.community.count({ where: { status: "active", visibility: "PUBLIC" } }),
      listPublicCommunities({ page: 1, pageSize: 4 }),
      listPublicTrainers(),
    ]);
    return {
      counts: { courses, trainers, communities },
      communities: page.items.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        priceFcfa: c.priceFcfa,
        membersCount: c.membersCount,
        visibility: c.visibility,
        trainerName: c.trainer.fullName ?? "Formateur NKAMVA",
        trainerAvatarUrl: userAvatarSrc({
          id: c.trainer.userId,
          avatarS3Key: c.trainer.avatarS3Key,
          avatarUrl: c.trainer.avatarUrl,
        }),
      })),
      trainers: directory.slice(0, 8),
    };
  } catch {
    return null;
  }
}
