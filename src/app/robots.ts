import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/notification";

/**
 * Ce que les robots peuvent parcourir. L'ancien `public/robots.txt` autorisait
 * tout, espaces connectés, administration et API compris, et ne désignait
 * aucun plan du site.
 *
 * Les espaces fermés reprennent `GUARDED_PREFIXES` du middleware : ils
 * renvoient à la connexion, rien n'y est à indexer. `/catalogue` est le jumeau
 * connecté de `/ressources` : l'indexer doublerait chaque page du catalogue.
 *
 * `/formateur` est écrit en deux règles : en préfixe nu, il fermerait aussi
 * l'annuaire public `/formateurs`. `/devenir-formateur` reste ouvert : c'est
 * une page d'entrée publique.
 */
const CLOSED = [
  "/api/",
  "/admin",
  "/auth",
  "/mon-compte",
  "/accueil",
  "/achat",
  "/adhesion",
  "/mes-communautes",
  "/catalogue",
  "/profil",
  "/candidature",
  "/mes-achats",
  "/mes-ressources",
  "/mes-litiges",
  "/mes-lives",
  "/messagerie",
  "/notifications",
  "/favoris",
  "/formateur$",
  "/formateur/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: CLOSED }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
