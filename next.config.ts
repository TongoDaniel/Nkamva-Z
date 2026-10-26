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
    // `livekit-server-sdk` importe `node:crypto` dynamiquement : Turbopack en
    // fait un fragment nommé `[externals]_node:crypto_….js`. Sous Windows le
    // deux-points ouvre un flux de données alternatif, et la copie vers
    // `.next/standalone` casse en fin de build (EINVAL). Sans préfixe, le
    // fragment s'appelle `[externals]_crypto_….js` et le module est le même.
    resolveAlias: { "node:crypto": "crypto" },
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
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      // 'unsafe-inline' : Next injecte ses données de rendu en scripts en ligne.
      // Le retirer demande des nonces, donc un rendu dynamique de toutes les
      // pages — un arbitrage de performance à part. 'unsafe-eval' ne sert qu'au
      // rechargement à chaud du serveur de dev : la production s'en passe.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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
      // Chaque violation laisse une ligne `[csp]` dans les journaux du serveur.
      "report-uri /api/csp-report",
      "report-to csp",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(self)" },
          // CSP appliquée (elle était en Report-Only depuis la PR #10). Aucune
          // page ne charge de script, de cadre ni de police d'un tiers : la
          // politique bloque ce qui n'a rien à faire là, et la route de rapport
          // dit ce qu'elle aurait bloqué à tort.
          { key: "Content-Security-Policy", value: csp },
          { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
        ],
      },
    ];
  },
};

export default nextConfig;
