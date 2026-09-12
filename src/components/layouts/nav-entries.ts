import {
  Bell,
  Compass,
  FileBadge,
  FileText,
  Heart,
  CircleUser,
  Home,
  LayoutDashboard,
  LifeBuoy,
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

/*
  Les quatre destinations de la barre basse, plus la case « Compte » que la
  coquille ajoute elle-même. Même ordre pour les deux rôles — accueil,
  communauté, catalogue, messagerie —, seule la première change de cible.

  Ce que cet ordre dit, et ce qu'il a coûté :

  · **La troisième case mène à ses ressources, pas au catalogue.** Elle a
    d'abord pointé vers le catalogue, en laissant à l'accueil le soin de porter
    la bibliothèque. Ça mettait le magasin à portée de pouce et ce qu'on a déjà
    payé deux gestes plus loin — alors qu'on ouvre sa bibliothèque pour
    reprendre un cours, tous les jours, et le catalogue quand on cherche à
    acheter. Le catalogue s'ouvre depuis cette page, d'un bouton en tête ; il
    reste **rattaché** à la case, pour qu'elle ne s'éteigne pas quand on y
    passe.
  · Le catalogue est le même pour tous. Un formateur reste un apprenant — il
    achète —, et sa publication n'est pas une destination mais un geste : elle
    a rejoint l'en-tête, à droite (voir `app-shell.tsx`).
  · Les libellés ne sont plus rendus (`labels={false}`), mais ils restent ici :
    ce sont eux que la barre pose en `aria-label`, et que la feuille du compte
    affiche en toutes lettres.
*/

/**
 * La cinquième case, commune aux deux rôles.
 *
 * Elle ouvrait une feuille glissante ; c'est une route depuis que `/compte`
 * existe. Une page a une adresse, un retour, et tient une liste longue sans
 * réclamer les deux tiers de l'écran — ce que la feuille ne savait pas faire.
 *
 * Son icône n'est presque jamais rendue : la barre y met le portrait de la
 * personne. Elle sert de repli tant qu'il n'y a pas de photo à montrer.
 */
export const COMPTE_TAB: NavEntry = { href: "/compte", label: "Compte", icon: CircleUser };

/**
 * Apprenant.
 *
 * La troisième case mène à sa bibliothèque, et le catalogue y est rattaché : il
 * s'ouvre depuis cette page. Les deux adresses restent dans l'espace connecté —
 * `/ressources` rendrait la coquille publique, avec « Se connecter », et on
 * sortirait de chez soi.
 */
export const LEARNER_TABS: NavEntry[] = [
  { href: "/accueil", label: "Accueil", icon: Home },
  {
    href: "/mes-communautes",
    label: "Communauté",
    icon: Users,
  },
  { href: "/mes-ressources", label: "Mes ressources", icon: Library, related: ["/catalogue"] },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare },
  COMPTE_TAB,
];

/**
 * Formateur. Sa première case mène à son espace, pas à l'accueil de l'apprenant :
 * son tableau de bord **est** son accueil. `/accueil` reste rattaché — le logo y
 * mène encore — pour que la case reste allumée quand on y passe.
 *
 * `/formateur/communaute` est rattaché à la deuxième case : la communauté qu'il
 * anime et celles qu'il suit relèvent du même endroit.
 */
export const TRAINER_TABS: NavEntry[] = [
  {
    href: "/formateur",
    label: "Accueil",
    icon: Home,
    related: ["/accueil"],
  },
  {
    href: "/mes-communautes",
    label: "Communauté",
    icon: Users,
    related: ["/formateur/communaute"],
  },
  { href: "/mes-ressources", label: "Mes ressources", icon: Library, related: ["/catalogue"] },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare },
  COMPTE_TAB,
];

/**
 * Barre haute de bureau, espace connecté. Elle garde les libellés longs de la
 * maquette — la place n'y manque pas.
 */
export const LEARNER_BAR: NavEntry[] = [
  { href: "/mes-ressources", label: "Mes ressources", icon: Library, related: ["/catalogue"] },
  { href: "/mes-communautes", label: "Mes communautés", icon: Users },
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
  // L'aide ferme la liste. Elle vivait dans le pied de page de l'espace
  // connecté — retiré, ce pied n'ayant ici aucun rôle qu'une navigation ne
  // tienne mieux (voir `app-shell.tsx`). Sans cette entrée, `/aide` n'aurait
  // plus **aucun** chemin une fois connecté : la page existe, et plus rien n'y
  // mène. Elle reste en dernier, comme le lien qu'elle remplace, qui se tenait
  // au bout de la barre.
  { href: "/aide", label: "Aide", icon: LifeBuoy },
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
  // Juste avant « Profil et paramètres » : c'est du compte qu'il relève. Repéré
  // par son `href` et non par sa position — la liste ne se terminait par le
  // profil que jusqu'à l'arrivée de l'aide, et « l'avant-dernier » aurait
  // silencieusement glissé d'un cran.
  const at = ACCOUNT_LINKS.findIndex((link) => link.href === "/profil");
  return [...ACCOUNT_LINKS.slice(0, at), APPLICATION_LINK, ...ACCOUNT_LINKS.slice(at)];
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
