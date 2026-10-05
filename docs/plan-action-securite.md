# Plan d'action sécurité & correctifs — NKAMVA

- **Source** : test d'intrusion de `staging.nkamva.com` (voir `docs/pentest-staging-2026-10-01.md`), puis investigation du live/replay.
- **Dernière mise à jour** : 1er octobre 2026.
- **État général** : aucune faille critique ni IDOR exploitable. Tous les findings de code sont **corrigés et mergés dans `develop`** ; il reste deux PR de live ouvertes, des **portes de déploiement**, et quelques items qui dépendent de toi.

---

## Vue d'ensemble

| # | Sujet | État |
|---|---|---|
| 1 | Secret NextAuth de repli | ✅ Mergé (PR #10) |
| 2 | Webhook Stripe fail-open | ✅ Mergé (PR #10) |
| 3 | Proxy Caddy `XTransformPort` (loopback) | ✅ Mergé (PR #10) |
| 4 | En-têtes de sécurité (+ `display-capture`) | ✅ Mergé (PR #10) |
| 6 | Rate-limit en mémoire (documenté mono-instance) | ✅ Mergé (PR #10) |
| 8 | `X-Powered-By` retiré | ✅ Mergé (PR #10) |
| 9 | `/api/health` minimisé | ✅ Mergé (PR #10) |
| 12 | Code mort `isPublicRoute` retiré | ✅ Mergé (PR #10) |
| 7 | Inscription non-énumérable | ✅ Mergé (PR #12) |
| 12b | OTP par usage **+ fix du double-consume reset** | ✅ Mergé (PR #13) |
| — | **Webhook LiveKit** : clôture auto des lives + replays | 🟢 **Ouverte — PR #14** |
| — | **Partage d'écran** robuste tous navigateurs | 🟢 **Ouverte — PR #15** |
| 4b | CSP `Report-Only` → stricte | ⏳ Partiel (Google Fonts retiré) ; enforce à faire |
| 11 | `typescript.ignoreBuildErrors: true` | ⏸ Toi (valider un vrai `next build`) |
| 5 | Secrets dans l'historique Git | ⏸ Toi (scanner l'historique distant) |
| 10 | TRACE actif (pas un XST) | ⏸ Toi (config Caddy staging) |
| — | IDOR & escalade de privilèges | ✅ Testé, aucun défaut (§13 du rapport) |

---

## Rapport externe du 28 septembre 2026 (trié le 5 octobre)

Second test d'intrusion, mené par un tiers sur le staging **avant** les correctifs du 1er octobre.

| § | Constat | Verdict |
|---|---|---|
| 3.1 | Connexion sans limite (25 × 302) | Probable faux positif : `authorizeCredentials` plafonne IP + e-mail (5/min) depuis août, mais NextAuth répond 302 dans tous les cas — le refus est dans `Location: …?error=TOO_MANY_ATTEMPTS`. **À reconfirmer par le testeur en lisant l'en-tête `Location`.** |
| 3.2 | Énumération à l'inscription | ✅ Déjà corrigé (PR #12) |
| 3.3 | En-têtes de sécurité absents | ✅ Déjà corrigé, vérifié en ligne le 5 oct. (CSP encore en report-only → 4b) |
| 3.4 | OTP non invalidé | ✅ Déjà en place : 5 échecs grillent le code (`OTP_MAX_ATTEMPTS`) |
| 3.5 | Enrôlement 2FA sans mot de passe | ✅ Corrigé sur `fix/securite-rapport-externe` |
| 3.6 | Communautés publiques | Choix produit (catalogue public) |
| 3.7 | 500 sur `%00` | ✅ Corrigé sur `fix/securite-rapport-externe` (filtre middleware) |
| + | Mots de passe fuités | ✅ Ajouté : contrôle HIBP k-anonymat (inscription, reset, changement) |

**Ménage à faire sur le staging** : supprimer `pentest-role-test-1@mailinator.com`, `enum-probe-1234@mailinator.com` et les achats en attente laissés par le test.

**Porte de lancement prod** : le staging est aujourd'hui le seul environnement. La prod devra avoir ses **propres** clés et son **propre** seau (aucune réutilisation de ce qu'utilise le staging).

---

## 🔴 Portes de déploiement — à ne pas oublier

`develop` contient maintenant une **migration Prisma** et des **comportements auth sensibles**. Avant de pousser vers la prod :

1. **Migration OTP** (PR #13) : au déploiement de `develop`, `prisma migrate deploy` doit appliquer `20261001120000_otp_purpose` **avant** le `compose up` (sinon le code attend la colonne `purpose` absente). `prisma generate` tourne au build.
2. **Rejouer la suite de tests** sur `develop` — elle n'a pas pu être lancée pendant les développements (base/Docker indisponibles) :
   ```bash
   npx vitest run tests/lot0-auth.test.ts tests/lives.test.ts tests/lot4-invariants.test.ts tests/notifications-achat.test.ts
   ```
3. **Smoke test du parcours « mot de passe oublié »** de bout en bout (c'est le vrai bug réparé par #13) : demander un code → le saisir → poser un nouveau mot de passe → se connecter avec.
4. **Vérifier les en-têtes** (PR #10) : `curl -I https://staging.nkamva.com` doit montrer `strict-transport-security`, `x-frame-options`, `x-content-type-options`, `referrer-policy`, `permissions-policy` (avec `display-capture=(self)`), et **pas** de `x-powered-by`. Un POST non signé sur `/api/webhooks/stripe` doit renvoyer 400.
5. **Webhook LiveKit** (PR #14, au merge) : configurer LiveKit pour POSTer ses webhooks vers `https://staging.nkamva.com/api/webhooks/livekit` (signés avec `LIVEKIT_API_KEY`). Sans cette config, les lives ne se clôturent toujours pas et aucun replay n'est produit.

---

## PR ouvertes — ordre de merge

#14 et #15 sont **indépendantes** l'une de l'autre et de ce qui est mergé (fichiers disjoints) → **merge dans n'importe quel ordre**.

- **PR #14 — Webhook LiveKit** : répare « les replays ne fonctionnent pas ». Gate : `npx vitest run tests/lives.test.ts` + la config LiveKit ci-dessus au déploiement.
- **PR #15 — Partage d'écran partout** : client seul. Gate : coup d'œil visuel (Chrome actif / Firefox-Safari repli sans audio / mobile désactivé avec message).

---

## Reste à faire — dépend de toi

### 4b — CSP `Report-Only` → stricte
La CSP (PR #10) observe sans bloquer et tolère `unsafe-inline`/`unsafe-eval`.
1. Déployer, puis **naviguer les flux authentifiés** (live LiveKit/wss, checkout Stripe, replay Mux, upload R2) et relever les violations.
2. Resserrer `script-src` via **nonces** (retirer `unsafe-inline`/`unsafe-eval`), affiner `connect-src`/`frame-src` aux hôtes réels.
3. Basculer en `Content-Security-Policy` (enforcing). **Fichier** : `next.config.ts`.

### 11 — `typescript.ignoreBuildErrors: true`
`tsc --noEmit` est vert, mais je ne peux pas valider un vrai `next build` ici (bug ADS standalone Windows connu). Lance `next build` ; s'il passe, bascule le drapeau à `false` dans `next.config.ts`.

### 5 — Confirmer l'absence de secrets dans l'historique
Mon scan local n'a trouvé **aucun vrai secret** (seul un chemin SQLite dans le `.env` initial ; les `sk_test_`/`whsec_` sont des valeurs de test). À confirmer sur l'historique **distant complet** :
```bash
gitleaks detect --source . --log-opts="--all"
```
Rotationner uniquement ce que le scanner remonterait.

### 10 — Désactiver TRACE
Pas un XST (vérifié), mais TRACE ne devrait pas répondre 200. Au niveau du Caddy de **staging** (hors dépôt) : `@method TRACE` → `respond 405`.

---

## Tests à compléter (dépend de toi)

- **B · IDOR en écriture** : prouver qu'un formateur ne peut pas *modifier/supprimer* l'objet d'un autre. Nécessite un **objet jetable** + l'autorisation d'une mutation de test (la couche de sécurité bloque les écritures distantes). Établi indirectement (garde service + lecture croisée `NOT_OWNER`).
- **C · Sous-rôles admin** : prouver qu'un admin `MODÉRATION` ne peut pas toucher une route `FINANCES`. Nécessite que tu crées un admin à sous-rôle limité et me passes son cookie.

---

## Durcissements continus (recommandés)

1. **CI de sécurité** : `gitleaks` + `bun audit` en GitHub Actions sur les PR — le dépôt n'a aucune CI aujourd'hui (ni pour les tests). C'est ce qui aurait attrapé, en amont, un déploiement sans migration ou une régression de types.
2. **Dépendances** : auditer et tenir à jour (`next`, `next-auth`, `@aws-sdk`, `stripe`, `livekit`).
3. **Rate-limit partagé (finding 6)** : le jour d'un passage multi-instances, déporter les compteurs vers Redis (l'API de `rate-limit.ts` est déjà prête pour n'échanger que le stockage).
4. **En-têtes** : `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` une fois la CSP stricte.
5. **Rotation périodique** de `NEXTAUTH_SECRET` (invalide toutes les sessions — hors pic).
6. **Clôture des lives** : si un jour le partage d'écran mobile devient nécessaire, il faut une app native (ReplayKit / MediaProjection) — impossible depuis un navigateur mobile.

---

## Séquence conseillée (à partir de maintenant)

1. Rejouer la suite de tests sur `develop` (portes §2) → corriger si rouge.
2. **Merger #14 et #15**.
3. **Déployer `develop`** en respectant les portes : migration OTP, config webhook LiveKit, vérif des en-têtes.
4. Smoke tests : mot de passe oublié, un live complet (partage d'écran + replay), inscription avec un e-mail déjà pris.
5. Lancer la collecte CSP → **4b** (itératif).
6. **5, 10** en hygiène ; **11** en fond de tâche.
7. Mettre en place la **CI** (tests + sécurité).
8. Compléter les tests **B** et **C** quand les prérequis sont réunis.
