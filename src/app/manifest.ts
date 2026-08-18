import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installable.
 *
 * Servi par Next sur `/manifest.webmanifest`. Trois choix méritent un mot :
 *
 * - `start_url: "/accueil"` — une personne qui installe NkamVa a un compte ;
 *   l'ouvrir sur la vitrine publique la ferait repasser par la navigation.
 *   Les visiteurs non connectés sont redirigés vers la connexion par le
 *   middleware, donc l'entrée reste correcte dans les deux cas.
 * - `display: "standalone"` — sans barre d'URL, l'app se comporte comme une
 *   application native. `browser` annulerait tout l'intérêt de l'installation.
 * - `orientation: "any"` — arbitrage 114. Le manifeste verrouillait
 *   `portrait-primary`, ce qui se battait avec les **quatre lecteurs vidéo** du
 *   produit (cours, replay, direct apprenant, console formateur) : le plein
 *   écran paysage est le geste naturel pour regarder un cours, et c'est
 *   précisément ce que le verrou empêchait dans la PWA installée. Les écrans
 *   supportent la rotation — l'audit mobile ne relève aucun débordement.
 * - deux jeux d'icônes : `any` garde les coins arrondis du logo, `maskable`
 *   laisse Android recadrer dans sa propre forme sans rogner le dessin.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NkamVa — Prêt à apprendre ou à transmettre ?",
    short_name: "NkamVa",
    description:
      "Cours vidéo, guides et modèles créés par des formateurs africains. Achetez une fois par mobile money ou carte bancaire — la ressource reste à vous, à vie.",
    start_url: "/accueil",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f3ec",
    theme_color: "#022342",
    lang: "fr",
    dir: "ltr",
    categories: ["education", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Raccourcis au appui long sur l'icône, sur Android et sur les bureaux qui
    // les gèrent. On s'en tient aux trois entrées les plus fréquentes.
    shortcuts: [
      { name: "Le catalogue", short_name: "Catalogue", url: "/ressources" },
      { name: "Mes ressources", short_name: "Mes ressources", url: "/mes-ressources" },
      { name: "Messagerie", short_name: "Messages", url: "/messagerie" },
    ],
  };
}
