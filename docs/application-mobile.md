# Application mobile NKAMVA (iOS + Android)

> Cadrage du 31 octobre 2026, branche `feat/app-mobile-expo`.
> Choix de départ arbitré par Daniel : **Expo / React Native**, une app native
> réécrite écran par écran et branchée sur l'API existante, plutôt qu'une
> coquille Capacitor autour du site.

---

## 1. Principe

- **Le serveur ne change pas de rôle.** L'app parle aux routes `src/app/api/**`
  déjà en place (environ 170, aucune action serveur cachée). Toute la logique
  métier, les règles d'argent et les contrôles d'accès restent dans les
  services `src/lib/**` : l'app n'en recopie aucun.
- **Le code de l'app vit dans `mobile/`**, à la racine du dépôt, avec son propre
  `package.json`. Il n'entre pas dans le build Next.
- **Une seule source pour la marque** : couleurs, rayons et polices sont repris
  de `src/app/globals.css` (papier chaud, bleu `#1c5ed0`, navy `#022342`,
  Bricolage Grotesque + Instrument Sans).

## 2. Authentification : un jeton porteur

Le site s'authentifie par cookie NextAuth. Une app native n'a pas de cookie
fiable : elle envoie `Authorization: Bearer <jeton>`.

- `POST /api/auth/mobile/token` : e-mail, mot de passe et, au besoin, code de
  second facteur. Passe par **la même fonction** que le site
  (`authorizeCredentials`) : plafonds anti-force brute, compte suspendu, 2FA,
  obligation 2FA admin, tout est hérité.
- Le jeton est un JWT NextAuth chiffré avec `NEXTAUTH_SECRET`, même format et
  même durée (30 jours) que le cookie.
- `getAuthContext()` lit le jeton porteur quand il est présent et le fait passer
  par **le même callback `session`** que le cookie : rafraîchissement du rôle
  toutes les 5 minutes, compte suspendu ou supprimé, révocation par
  `sessionsValidAfter`. Une révocation coupe donc l'app comme le site.
- Le jeton est rangé dans le trousseau du téléphone (`expo-secure-store`),
  jamais en clair.
- Pas de CORS à ouvrir : une app native n'est pas soumise à la politique
  d'origine des navigateurs.

## 3. Achats : sur le site, pas dans l'app

Apple et Google imposent leur propre paiement (15 à 30 % de commission, pas de
Mobile Money) pour vendre du contenu numérique dans une app. V1 :

- l'app sert à **consulter, apprendre et échanger** ;
- **aucun bouton d'achat, aucun prix, aucun lien vers le paiement** n'apparaît
  dans l'app (Apple interdit même la mention dans la plupart des pays) ;
- une ressource non possédée affiche « Pas encore dans ta bibliothèque » ;
- l'achat se fait sur nkamva.com, et apparaît dans l'app au rechargement.

⚠️ Choix réversible. Risque connu : Apple peut juger que des formations relèvent
de son paiement intégré. Si c'est le cas à la revue, on décidera entre le
paiement Apple et le retrait de la vente côté iOS.

### Parcourir sans compte, payer sur le site

- **Visiteur** : après l'onboarding (« Découvrir NKAMVA »), l'app s'ouvre sur un
  accueil sans compte (ressources à découvrir, communautés). Le catalogue, la
  fiche d'une ressource et celle d'une communauté (`GET /api/communities/[slug]`,
  ajoutée pour l'app) se lisent sans compte. Le compte est demandé au moment
  utile, avec ce qu'il débloque : favori, bibliothèque, messages, signalement,
  rejoindre une communauté. Exiger l'inscription d'emblée fait fuir, et l'App
  Store le refuse (règle 5.1.1(v)).
- **Payer** : acheter une ressource, adhérer à une communauté, régler
  l'abonnement formateur se font sur nkamva.com. Hors des États-Unis, Apple
  interdit tout bouton, lien ou mention qui renverrait vers un paiement
  extérieur (règle 3.1.1 / 3.1.3) ; Google Play applique la même règle.
  L'app n'affiche donc ni prix ni lien vers une page de paiement, y compris
  depuis une notification (`openSiteLink` neutralise `/achat`, `/adhesion`,
  `/tarifs`, `/formateur/abonnement`). Ce qui est acheté sur le site apparaît
  dans l'app au rechargement.
- **Retraits formateur** : ce n'est pas un achat, la règle ne s'applique pas.
  Ils se demandent dans l'app (écran Portefeuille).
- **Pour faire connaître le site sans enfreindre la règle** : e-mail de
  bienvenue, notifications par e-mail, réseaux sociaux. Le jour où l'option
  existera dans nos pays, l'achat intégré (Apple/Google, 15 à 30 %) ou le
  lien externe autorisé (entitlement régional) pourront être réétudiés.

## 4. Périmètre

### V1 : l'apprenant

| Écran | Routes utilisées |
|---|---|
| Connexion, inscription, code e-mail, mot de passe oublié | `auth/mobile/token`, `auth/register`, `auth/otp`, `auth/verify-otp`, `auth/reset-password` |
| Accueil | `me/resources`, `lives`, `me/notifications` |
| Catalogue et recherche | `catalog/courses` |
| Fiche ressource | `courses/[slug]` |
| Ma bibliothèque + lecteur (vidéo, PDF, fichiers) | `me/resources`, `me/resources/[id]/content`, `.../progress` |
| Mes communautés et espace d'une communauté (groupe, écrire à l'animateur, lives, ressources incluses) | `me/communities`, `me/communities/[slug]` (ajoutées pour l'app), `me/conversations` (POST) |
| Lives : agenda | `lives` |
| Messagerie | `me/conversations`, `me/conversations/[id]` |
| Notifications | `me/notifications` |
| Compte : profil, préférences d'e-mail, mot de passe, déconnexion | `me/profile`, `me/password` |
| Onboarding (premier lancement) | aucune |
| Supprimer son compte (exigé par Apple et Google), avec annulation pendant 30 jours | `me/deletion` (POST, DELETE) |
| Signaler un message, une ressource, une communauté (exigé pour le contenu publié par les utilisateurs) | `reports` |
| Favoris | `me/favorites` |
| Hors ligne : contenu déjà vu gardé sur le téléphone une semaine, bandeau « Hors ligne » | aucune |
| Lives : bouton « Entrer dans la salle » un quart d'heure avant, la salle s'ouvre dans le navigateur | page web `/mes-lives/live/[id]` |

Barre d'onglets native, cinq destinations : **Accueil, Explorer, Bibliothèque,
Messages, Compte**. Sur iOS 26, c'est la barre flottante Liquid Glass du système ;
sur Android, la barre Material 3 aux couleurs de la marque.

**État au 1er novembre 2026 :** tout le tableau ci-dessus est construit et vérifié
sur l'émulateur Android (Expo Go) avec les données de démonstration, et testé par
Daniel sur iPhone. Routes serveur ajoutées pour l'app : `auth/mobile/token`,
`me/notifications` (GET), `me/communities`, `me/communities/[slug]`.

### V1.1

- Rejoindre un live en vidéo (`@livekit/react-native`, demande un build natif,
  pas Expo Go)
- **Partage d'écran depuis le téléphone**, que le navigateur mobile ne permet
  pas (`getDisplayMedia` n'existe pas sur mobile, cf. `live-console.tsx` et
  `plan-action-securite.md`). Il passe par ReplayKit (extension de diffusion
  iOS) et MediaProjection (service de premier plan Android). La règle reste
  celle de l'arbitrage 144 : l'animateur partage de plein droit, un
  participant demande, et c'est le jeton LiveKit (`canPublishSources`) qui
  tranche. Rien à changer côté serveur.
- Notifications push (`expo-notifications` + une table de jetons d'appareil côté
  serveur)
- Liens profonds (`nkamva://` et liens universels `nkamva.com`)

### V2 : le formateur

Un formateur garde tout l'espace apprenant et bascule vers son espace depuis
l'onglet Compte (« Passer en mode formateur », sur le modèle du mode hôte
d'Airbnb). Le mode formateur a sa propre barre d'onglets : **Accueil,
Ressources, Lives, Messages, Compte**. Le choix est retenu sur l'appareil et
revient à « apprenant » à la déconnexion.

| Écran | Routes utilisées |
|---|---|
| Tableau de bord : solde retirable, à faire, chiffres, dernières ventes, prochain live | `trainer/overview` (ajoutée pour l'app, mêmes agrégats que `/formateur`), `trainer/sales`, `lives?role=trainer` |
| Ventes : montants de tête et historique paginé | `trainer/sales` (ajoutée pour l'app) |
| Portefeuille : détail du solde, demande de retrait, historique | `trainer/overview`, `trainer/payouts` (GET, POST) |
| Ressources : liste par statut, ventes par ressource, publier, archiver | `trainer/courses`, `trainer/courses/[id]/publish`, `.../archive` |
| Lives : à venir et passés, programmer (date et heure natives), annuler | `lives?role=trainer`, `lives` (POST), `lives/[id]` (`cancel`) |
| Ma communauté : membres et état de leur adhésion | `trainer/communities`, `trainer/communities/[id]/members` |
| Litiges : liste, signalement de ceux sans réponse | `trainer/disputes` |

Restent sur le site, ouverts dans le navigateur intégré depuis l'app : création
et modification d'une ressource (texte long, téléversement), moyen de paiement
et KYC, abonnement, invitations et modération des membres, réponse à un
litige, et la salle du live (console) tant que la vidéo native n'est pas là.

**État au 1er novembre 2026 :** construit et vérifié sur l'émulateur Android
avec le compte de démonstration de Moussa Traoré (retrait, programmation et
annulation d'un live testés de bout en bout).

### Hors app

Le back-office admin reste sur le web.

## 5. Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Socle | Expo SDK 58, React Native 0.88, TypeScript | Même version que Lignée : un seul socle à suivre |
| Navigation | `expo-router` (fichiers) | Mêmes conventions que `src/app` côté Next |
| Données | `@tanstack/react-query` | Déjà utilisé par le site ; cache et reprise réseau |
| Jeton | `expo-secure-store` | Trousseau iOS / Keystore Android |
| Vidéo | `expo-video` | Lecture native, plein écran, reprise de position |
| PDF | Visionneuse web embarquée (`react-native-webview`) | Pas de module natif à maintenir |
| Build et stores | EAS Build | Compile iOS sans Mac |

## 6. Ce que Daniel devra fournir (plus tard, pas pour tester)

- Un compte **Apple Developer** (99 $/an) et un compte **Google Play Console**
  (25 $ une fois) au nom de la société
- Un compte **Expo** (gratuit) pour EAS Build
- La validation des textes de fiche store et des captures

## 7. Tester

**Expo Go d'abord.** Tout le V1 n'utilise que des modules présents dans Expo Go
(SDK 58) : on teste sur un vrai iPhone ou Android en scannant le QR code, sans
build. Règle : **aucune dépendance native hors Expo Go n'entre dans le V1.**

- Serveur : `npm run dev` à la racine (base Postgres Docker, stockage S3 local).
- App : `cd mobile && npx expo start --go --lan`, puis scanner le QR code avec
  l'appareil photo de l'iPhone (ou l'app Expo Go sur Android).
- `mobile/.env.local` porte `EXPO_PUBLIC_API_URL=http://<IP Wi-Fi du PC>:3000`,
  et le `.env` du serveur `AWS_ENDPOINT_URL=http://<IP Wi-Fi du PC>:8333`, pour
  que le téléphone joigne le serveur et les fichiers. Le téléphone et le PC
  doivent être sur le même Wi-Fi.

**Build de développement ensuite, pour les lives.** Le partage d'écran et la
vidéo LiveKit demandent des modules natifs qu'Expo Go n'embarque pas. Ils
vivront dans un build de développement (EAS), installé à côté d'Expo Go.
Dans Expo Go, l'écran des lives le détecte et l'annonce au lieu de planter.
Installer un build sur un iPhone demande le compte Apple Developer.
