import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/notification";
import { PUBLIC_TRAINER_WHERE } from "@/lib/trainers";

// Relu à chaque demande : une ressource publiée doit y entrer sans redéploiement.
export const dynamic = "force-dynamic";

/** Les pages de l'espace visiteur qui existent sans paramètre. */
const STATIC_PAGES = [
  "/",
  "/ressources",
  "/communautes",
  "/formateurs",
  "/tarifs",
  "/devenir-formateur",
  "/aide",
  "/contact",
  "/legal/conditions",
  "/legal/confidentialite",
  "/legal/mentions",
];

/**
 * Plan du site pour les moteurs de recherche. Il ne liste que ce qu'un
 * visiteur peut ouvrir, avec les mêmes règles que les pages elles-mêmes :
 *
 * - ressources : publiées et vendues à l'unité, comme le catalogue
 *   (`searchCourses`) ;
 * - communautés : actives et publiques (arbitrage 81, une privée n'est
 *   annoncée nulle part) ;
 * - formateurs : ceux de l'annuaire (`PUBLIC_TRAINER_WHERE`), sans quoi le plan
 *   mènerait à des fiches 404.
 *
 * Une base injoignable rend le plan des pages fixes plutôt qu'une erreur.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = STATIC_PAGES.map((path) => ({ url: absoluteUrl(path) }));
  try {
    const [courses, communities, trainers] = await Promise.all([
      db.course.findMany({
        where: { status: "published", circuit: "MARKETPLACE" },
        select: { slug: true, updatedAt: true },
      }),
      db.community.findMany({
        where: { status: "active", visibility: "PUBLIC" },
        select: { slug: true, updatedAt: true },
      }),
      db.trainerProfile.findMany({ where: PUBLIC_TRAINER_WHERE, select: { id: true } }),
    ]);
    return [
      ...fixed,
      ...courses.map((c) => ({ url: absoluteUrl(`/ressources/${c.slug}`), lastModified: c.updatedAt })),
      ...communities.map((c) => ({ url: absoluteUrl(`/communautes/${c.slug}`), lastModified: c.updatedAt })),
      ...trainers.map((t) => ({ url: absoluteUrl(`/formateurs/${t.id}`) })),
    ];
  } catch {
    return fixed;
  }
}
