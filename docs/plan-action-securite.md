# Plan d'action sécurité — NKAMVA

- **Source** : test d'intrusion de `staging.nkamva.com` (voir `docs/pentest-staging-2026-10-01.md`)
- **Date** : 1er octobre 2026
- **État général** : aucune faille critique ni IDOR exploitable.
  - **PR #10** : findings 1, 2, 3, 4, 8, 9, 12, + 6 (documenté) + 4b (partiel, Google Fonts retiré).
  - **PR #12** : finding 7 (inscription non-énumérable).
  - **Restants, dépendant de toi** : 11 (valider un vrai `next build`), 5 (lancer gitleaks), 10 (config Caddy staging), 4b-enforce (observer les flux authentifiés après déploiement), 12b (bloqué — voir la note « double-consume » plus bas).

> ⚠️ **Découverte hors pentest — à regarder** : le parcours UI de réinitialisation de mot de passe consomme le code **deux fois** (`verify-otp` puis `reset-password`), et aucun test ne couvre ce chemin. Si la réinitialisation par l'écran fonctionne aujourd'hui, c'est fragile ; si elle ne fonctionne pas, c'est un bug fonctionnel réel. **À vérifier avec la base de test** avant de toucher à l'OTP (finding 12b en dépend).

---

## Vue d'ensemble

| Priorité | Finding | Sévérité | Effort | État |
|---|---|---|---|---|
| ✅ Fait | 1 · Secret NextAuth de repli | Élevée (latente) | — | **PR #10** |
| ✅ Fait | 2 · Webhook Stripe fail-open | Élevée (latente) | — | **PR #10** |
| ✅ Fait | 3 · Proxy Caddy `XTransformPort` | Élevée (latente) | — | **PR #10** |
| ✅ Fait | 4 · En-têtes de sécurité (base) | Moyenne | — | **PR #10** |
| ✅ Fait | 8 · `X-Powered-By` | Faible | — | **PR #10** |
| ✅ Doc | 6 · Rate-limit en mémoire | Moyenne | M | **PR #10** (mono-instance documenté ; Redis si multi) |
| 🟡 Partiel | 4b · CSP `Report-Only` → stricte | Moyenne | M | **PR #10** (Google Fonts retiré) ; enforce après obs. flux auth |
| ✅ Fait | 7 · Énumération à l'inscription | Faible/Moy. | S | **PR #12** |
| ⏸ Toi | 11 · `ignoreBuildErrors: true` | Faible | M→L | `tsc` vert ; valider par un vrai `next build` |
| ✅ Fait | 9 · `/api/health` sans auth | Faible | S | **PR #10** |
| ⏸ Toi | 5 · Scan historique + rotation | Faible/Info | S | rien trouvé en local ; lancer gitleaks sur l'historique distant |
| ⏸ Toi | 10 · TRACE actif | Info | S | Config Caddy staging (hors dépôt) |
| ✅ Fait | 12 · Code mort `isPublicRoute` | Info | S | **PR #10** |
| ⏸ Bloqué | 12b · OTP sans séparation d'usage | Info | S | Besoin base de test + résoudre le double-consume (voir note) |

*Effort : S = < 1 h · M = quelques heures · L = étalé.*

---

## Déjà corrigé — à faire suivre (PR #10 → `develop`)

1. **Merger la PR #10** après avoir rejoué les tests DB-dépendants avec la base up :
   `npx vitest run tests/lot4-invariants.test.ts tests/notifications-achat.test.ts`
2. **Déployer sur staging**, puis vérifier :
   - `curl -I https://staging.nkamva.com` montre `strict-transport-security`, `x-frame-options`, `x-content-type-options`, `referrer-policy`, `permissions-policy`, et l'absence de `x-powered-by` ;
   - la connexion fonctionne toujours (le secret est présent) ;
   - un POST non signé sur `/api/webhooks/stripe` renvoie 400.

---

## P1 — Avant la prochaine montée en charge

### Finding 6 — Rate-limiting en mémoire de processus
**Problème** : les compteurs vivent dans une `Map` locale (`src/lib/rate-limit.ts`). Ils sont remis à zéro à chaque redémarrage et **ne sont pas partagés entre instances** : en cas de scale horizontal, chaque réplique a son propre plafond, ce qui multiplie d'autant les seuils de connexion, OTP, présignature et initiation de paiement.

**À faire** :
1. Trancher la **topologie cible** : instance unique ou plusieurs répliques ? (non versionnée aujourd'hui — cf. mémoire « serveur staging/prod »).
2. Si mono-instance : **documenter explicitement** la contrainte en tête de `rate-limit.ts` et poser un garde-fou de déploiement (une seule réplique).
3. Si multi-instances : déporter les compteurs vers un **magasin partagé** (Redis / Upstash). Conserver l'API actuelle (`peekRateLimit` / `recordRateLimitHit` / `clearRateLimit`) et n'échanger que l'implémentation du `Map`.

**Fichiers** : `src/lib/rate-limit.ts`.

### Finding 4b — Passer la CSP de `Report-Only` à stricte
**Problème** : la CSP posée en PR #10 est en `Content-Security-Policy-Report-Only` (elle observe, elle ne bloque pas) et tolère `unsafe-inline` / `unsafe-eval`.

**À faire** :
1. Brancher un **endpoint de collecte** des rapports (`report-to` / `report-uri`) — ou lire les rapports navigateur en staging.
2. Naviguer tous les parcours (achat Stripe, live LiveKit, lecture PDF, upload R2) et **relever les violations**.
3. Resserrer : retirer `unsafe-inline`/`unsafe-eval` de `script-src` via **nonces** (Next les supporte), affiner `connect-src`/`frame-src` aux hôtes réellement utilisés.
4. Basculer l'en-tête en `Content-Security-Policy` (enforcing).

**Fichiers** : `next.config.ts` (bloc `headers()`).

---

## P2 — Correctifs ciblés

### Finding 7 — Énumération de comptes à l'inscription
**Problème** : `POST /api/auth/register` renvoie `409 EMAIL_ALREADY_USED` si l'adresse existe, `201` sinon → on peut tester l'existence d'un compte.

**À faire** : réponse **uniforme**. Toujours renvoyer `201` « vérifiez votre boîte mail » ; si l'adresse existe déjà, envoyer à la place un e-mail « un compte existe déjà, connectez-vous / réinitialisez ». Arbitrage UX à valider (le formulaire ne doit plus distinguer les deux cas côté client).

**Fichiers** : `src/app/api/auth/register/route.ts`, e-mail associé.

### Finding 11 — `typescript.ignoreBuildErrors: true`
**Problème** : les erreurs de typage n'empêchent pas le build (`next.config.ts`) — une régression type-dépendante (dont de sécurité) peut passer.

**À faire** : lancer `npx tsc --noEmit`, corriger les erreurs par lots, puis **passer le drapeau à `false`**. Effort étalé selon la dette de types.

**Fichiers** : `next.config.ts`, + corrections de types.

### Finding 9 — `/api/health` expose l'état de la base sans auth
**Problème** : renvoie `database: "up"` + horodatage à tout visiteur.

**À faire** : soit réduire la réponse publique à `200 { status: "ok" }` (déplacer le détail derrière une auth admin ou un réseau interne), soit restreindre la route au réseau de supervision. Sans urgence.

**Fichiers** : `src/app/api/health/route.ts`.

---

## P3 — Hygiène

### Finding 5 — Confirmer l'absence de secrets dans l'historique
Le scan local (`git log --all`) n'a trouvé **aucun vrai secret** (seul un chemin SQLite dans le `.env` initial ; les `sk_test_`/`whsec_` sont des valeurs de test). **À confirmer** sur l'historique distant complet :
```bash
gitleaks detect --source . --log-opts="--all"
# ou : trufflehog git file://. --since-commit <initial>
```
Rotationner uniquement ce que le scanner remonterait. Garder `.env` hors de tout merge.

### Finding 10 — Désactiver TRACE
Pas un XST (vérifié : aucun écho), mais TRACE ne devrait pas répondre 200. Le désactiver au niveau Caddy (`@method TRACE` → `respond 405`).

**Fichiers** : configuration Caddy de staging/prod (hors dépôt).

### Finding 12 — OTP et code mort
- **OTP sans séparation d'usage** : un code de vérification d'e-mail vaut pour la réinitialisation de mot de passe. Choix documenté et acceptable ; si on veut le durcir, ajouter une colonne `purpose` à `EmailOtp` et la vérifier dans `consumeOtp`.
- **Code mort** : `isPublicRoute` dans `src/lib/api.ts` n'a aucun appelant — le retirer pour ne pas laisser croire à une garde centralisée des routes.

**Fichiers** : `src/lib/otp.ts` (optionnel), `src/lib/api.ts`.

---

## Tests à compléter (nécessitent une action de ta part)

Ces deux volets n'ont pas pu être menés en dynamique — non par défaut de l'app, mais par contrainte d'outillage :

- **B · IDOR en écriture** : prouver qu'un formateur ne peut pas *modifier/supprimer* l'objet d'un autre (pas seulement le lire). Nécessite un **objet jetable** créé pour l'occasion et l'autorisation d'une mutation de test (la couche de sécurité bloque les écritures sur ressources partagées distantes). Déjà établi indirectement (garde dans la couche service + lecture croisée en `NOT_OWNER`).
- **C · Cloisonnement des sous-rôles admin** : prouver qu'un admin `MODÉRATION` ne peut pas toucher une route `FINANCES` (approuver un retrait). Nécessite que tu **crées un admin à sous-rôle limité** depuis la console Super-admin et me passes son cookie de session.

---

## Durcissements continus (recommandés, hors findings)

1. **CI de sécurité** : ajouter `gitleaks` et `npm audit --production` (ou `bun audit`) en GitHub Actions sur les PR — le dépôt n'a aucune CI aujourd'hui.
2. **Dépendances** : auditer et tenir à jour (`next`, `next-auth`, `@aws-sdk`, `stripe`, `livekit`).
3. **En-têtes** : envisager `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` une fois la CSP stricte en place.
4. **Rotation périodique** de `NEXTAUTH_SECRET` (invalide toutes les sessions — à planifier hors pic).

---

## Séquence conseillée

1. Rejouer les tests DB → **merger PR #10** → déployer → vérifier les en-têtes.
2. Trancher la topologie → **finding 6**.
3. **Findings 7, 9** (rapides) dans une PR groupée.
4. Lancer la collecte CSP → **finding 4b** (itératif).
5. **Findings 5, 10, 12** en hygiène.
6. **Finding 11** en fond de tâche (dette de types).
7. Mettre en place la **CI de sécurité**.
8. Compléter les tests **B** et **C** quand les prérequis sont réunis.
