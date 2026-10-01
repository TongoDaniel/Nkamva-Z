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
  // On ne divulgue pas la pile technique.
  poweredByHeader: false,
  // En-têtes de sécurité, absents jusqu'ici sur toutes les réponses. Posés ici
  // (et non uniquement dans Caddy) pour qu'ils suivent l'app quel que soit le
  // proxy en tête, y compris en build standalone.
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      // 'unsafe-inline'/'unsafe-eval' : Next injecte des scripts/styles en ligne.
      // À resserrer (nonces) une fois la CSP passée en mode strict.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Polices et styles sont auto-hébergés (next/font → /_next/static/media) :
      // navigation de staging vérifiée, aucune requête vers Google Fonts. On ne
      // garde donc pas fonts.googleapis.com / fonts.gstatic.com.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "media-src 'self' blob: https:",
      "worker-src 'self' blob:",
      // LiveKit (wss), R2/S3 et Stripe passent par https/wss vers l'extérieur.
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // `display-capture=(self)` est explicite : le partage d'écran des lives
          // (LiveKit getDisplayMedia) doit rester autorisé sur notre origine. Non
          // listé, il resterait `self` par défaut, mais l'écrire évite qu'un
          // resserrement futur ne le ferme par inadvertance.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self)" },
          // CSP en Report-Only d'abord : elle observe sans rien casser (LiveKit,
          // Stripe, R2, polices). À basculer en `Content-Security-Policy` stricte
          // une fois les rapports vérifiés.
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
