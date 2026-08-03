// ==========================================================================
// Navigation admin — types et filtrage par sous-rôle (décision 7)
// ==========================================================================
// Ce module ne contient **aucune donnée** : `ADMIN_NAV` vit dans
// `admin-shell.tsx`, avec ses icônes. Les icônes sont des composants React, et
// un composant défini côté serveur ne peut pas être passé en prop à un
// composant client — la navigation doit donc rester du côté client, où elle
// est rendue.
//
// Ce qui vit ici, c'est la règle : une fonction pure, sans icône, importable
// des deux côtés.
// ==========================================================================

export type AdminSubRole = "SUPER_ADMIN" | "FINANCES" | "MODERATION";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  /**
   * Sous-rôles autorisés (décision 7). Omis = visible par tous les admins ;
   * tableau vide = Super-admin uniquement, qui voit tout sans être listé.
   */
  roles?: AdminSubRole[];
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

/**
 * Ne garde que ce que ce sous-rôle peut réellement ouvrir. Sans ce filtre, un
 * admin Modération voit « Transactions », clique, et se fait rediriger vers le
 * tableau de bord sans explication : la navigation lui promettait une page à
 * laquelle la décision 7 lui interdit l'accès.
 */
export function navForSubRole(nav: AdminNavGroup[], adminRole: string | null): AdminNavGroup[] {
  if (adminRole === "SUPER_ADMIN") return nav;
  return nav
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.roles || item.roles.includes(adminRole as AdminSubRole),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
