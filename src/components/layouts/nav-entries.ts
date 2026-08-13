import {
  Bell,
  Compass,
  FileBadge,
  FileText,
  Heart,
  Home,
  LayoutDashboard,
  Library,
  LogIn,
  MessageSquare,
  Radio,
  Settings,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Source unique des entrées de navigation.
 * ==========================================================================
 * Arbitrage 112 — une seule liste, deux rendus. Avant ce module, la barre haute
 * de bureau et le panneau mobile tenaient chacun leur copie : rien ne les
 * gardait d'accord, et une entrée ajoutée d'un côté et pas de l'autre passait
 * le `tsc` sans que rien ne le signale.
 *
 * Les icônes vivent ici, donc ce module est importé par des composants clients.
 * Un composant serveur ne peut pas passer une icône en prop — c'est la même
 * raison qui garde `ADMIN_NAV` dans `admin-shell.tsx`.
 * ==========================================================================
 */

export interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Routes rattachées à cette entrée : elles l'allument faute d'avoir une entrée
   * à elles. Sans ça, ouvrir ses factures éteint toute la barre — plus rien ne
   * dit où l'on se trouve.
   */
  related?: string[];
}

/**
 * Barre d'onglets basse — arbitrage 111.
 *
 * Quatre destinations, plus « Plus » quand il reste des écrans à atteindre.
 * Cinq emplacements est le maximum tenable sur 360 px sans réduire les libellés
 * à des icônes muettes.
 */

/** Visiteur : pas de « Plus », la quatrième place va à la connexion. */
export const VISITOR_TABS: NavEntry[] = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/ressources", label: "Catalogue", icon: Compass },
  { href: "/communautes", label: "Communautés", icon: Users },
  { href: "/auth/connexion", label: "Connexion", icon: LogIn },
];

/** Apprenant. Le catalogue pointe vers `/catalogue` : la version visiteur
 *  rendrait la coquille publique, avec « Se connecter » — on sortirait de son
 *  espace. */
export const LEARNER_TABS: NavEntry[] = [
  { href: "/accueil", label: "Accueil", icon: Home },
  { href: "/mes-ressources", label: "Mes ressources", icon: Library },
  { href: "/catalogue", label: "Catalogue", icon: Compass },
  { href: "/mes-communautes", label: "Communautés", icon: Users, related: ["/catalogue/communautes"] },
];

/**
 * Formateur. Un formateur reste un apprenant : sa barre **ajoute**, elle ne
 * remplace pas — c'est la règle que tenait déjà `TRAINER_NAV`. « Mes
 * communautés » cède sa place, parce que sa communauté à lui vit dans l'espace
 * formateur, et reste atteignable par « Plus ».
 */
export const TRAINER_TABS: NavEntry[] = [
  { href: "/accueil", label: "Accueil", icon: Home },
  { href: "/formateur", label: "Formateur", icon: LayoutDashboard },
  { href: "/mes-ressources", label: "Mes ressources", icon: Library },
  { href: "/catalogue", label: "Catalogue", icon: Compass },
];

/**
 * Barre haute de bureau, espace connecté. Elle garde les libellés longs de la
 * maquette — la place n'y manque pas.
 */
export const LEARNER_BAR: NavEntry[] = [
  { href: "/mes-ressources", label: "Mes ressources", icon: Library, related: ["/catalogue"] },
  { href: "/mes-communautes", label: "Mes communautés", icon: Users, related: ["/catalogue/communautes"] },
  { href: "/mes-achats", label: "Mes achats", icon: ShoppingBag, related: ["/mes-factures", "/mes-litiges"] },
];

export const TRAINER_BAR: NavEntry[] = [
  { href: "/formateur", label: "Espace formateur", icon: LayoutDashboard },
];

/** Barre haute de bureau, site public. */
export const PUBLIC_BAR: NavEntry[] = [
  { href: "/ressources", label: "Ressources", icon: Compass },
  { href: "/communautes", label: "Communautés", icon: Users },
  { href: "/formateurs", label: "Formateurs", icon: Users },
  { href: "/tarifs", label: "Tarifs", icon: FileText },
  { href: "/recherche", label: "Recherche", icon: Compass },
];

/**
 * Tout ce qui relève du compte. Rendu dans le menu déroulant de l'avatar sur
 * grand écran, et dans la feuille « Plus » sur téléphone — deux présentations,
 * une seule liste.
 */
export const ACCOUNT_LINKS: NavEntry[] = [
  { href: "/mes-ressources", label: "Mes ressources", icon: Library },
  { href: "/mes-communautes", label: "Mes communautés", icon: Users },
  { href: "/mes-lives", label: "Mes lives", icon: Radio },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare },
  { href: "/favoris", label: "Favoris", icon: Heart },
  { href: "/mes-achats", label: "Mes achats", icon: ShoppingBag },
  // Juste après les achats, parce que c'en est la pièce comptable — et non sous
  // « Profil et paramètres », où une facture n'est pas un réglage.
  { href: "/mes-factures", label: "Mes factures", icon: FileText },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profil", label: "Profil et paramètres", icon: Settings },
];

/**
 * Le suivi du dossier de candidature, ajouté tant qu'un dossier est en cours.
 *
 * Hors de `ACCOUNT_LINKS` parce qu'il n'est pas permanent : il naît à la
 * création du dossier et disparaît à la décision. Sans lui, un candidat n'avait
 * **aucun** chemin vers son suivi une fois la page quittée.
 *
 * `/candidature` et non `/candidature/statut` : c'est la page qui sait où
 * envoyer selon l'état du dossier.
 */
export const APPLICATION_LINK: NavEntry = {
  href: "/candidature",
  label: "Ma candidature",
  icon: FileBadge,
};

/** Les entrées de compte, dossier de candidature inséré à sa place s'il y a lieu. */
export function accountLinksFor(hasOpenApplication: boolean): NavEntry[] {
  if (!hasOpenApplication) return ACCOUNT_LINKS;
  // Juste avant « Profil et paramètres » : c'est du compte qu'il relève.
  return [
    ...ACCOUNT_LINKS.slice(0, -1),
    APPLICATION_LINK,
    ACCOUNT_LINKS[ACCOUNT_LINKS.length - 1],
  ];
}

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Le href par lequel cette entrée revendique la route courante, ou `null`.
 *
 * On renvoie le href plutôt qu'un booléen parce que deux entrées peuvent
 * revendiquer la même route : sur `/catalogue/communautes`, « Catalogue » matche
 * par `/catalogue` et « Communautés » par le chemin entier. La longueur
 * départage — le plus précis gagne.
 */
function claimedHref(pathname: string, item: NavEntry, listed?: Set<string>) {
  const candidates = [item.href, ...(item.related ?? []).filter((h) => !listed?.has(h))];
  let best: string | null = null;
  for (const href of candidates) {
    if (isActive(pathname, href) && (!best || href.length > best.length)) best = href;
  }
  return best;
}

/** Index de l'entrée courante, ou -1 si aucune ne revendique la route. */
export function currentIndex(pathname: string, items: NavEntry[], listed?: Set<string>) {
  let index = -1;
  let length = 0;
  items.forEach((item, i) => {
    const href = claimedHref(pathname, item, listed);
    if (href && href.length > length) {
      index = i;
      length = href.length;
    }
  });
  return index;
}
