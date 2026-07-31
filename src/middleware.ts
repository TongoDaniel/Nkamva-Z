import withAuth from "next-auth/middleware";

/**
 * Garde des pages de l'espace connecté. Les routes /api sont protégées
 * séparément par requireAuth()/requireRole() : ce middleware ne couvre que la
 * navigation, pour éviter d'afficher une coquille vide à un visiteur anonyme.
 */
export default withAuth({
  pages: { signIn: "/auth/connexion" },
});

export const config = {
  matcher: ["/accueil/:path*", "/mes-ressources/:path*", "/mes-achats/:path*", "/achat/:path*", "/profil/:path*"],
};
