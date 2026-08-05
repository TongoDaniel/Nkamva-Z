import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Un `package-lock.json` traîne dans le dossier personnel de l'utilisateur.
  // Next remonte l'arborescence à la recherche d'un fichier de verrou, le
  // trouve là-haut, et déclare `C:\Users\<nom>` racine du projet. En mode
  // `standalone` la conséquence n'est pas cosmétique : le traçage des fichiers
  // part de cette racine, et le serveur produit peut embarquer — ou manquer —
  // ce qu'il ne faut pas. On désigne la racine explicitement.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
