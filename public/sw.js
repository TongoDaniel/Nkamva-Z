/*
 * Service worker NKAMVA.
 *
 * Règle de conduite : NKAMVA sert des pages authentifiées. Un service worker
 * qui met en cache des réponses de navigation ferait fuiter l'écran d'un
 * compte vers le suivant sur un téléphone partagé — et le partage d'appareil
 * est courant sur le marché visé. On ne met donc en cache que ce qui est
 * public et immuable :
 *
 *   - `/_next/static/*`   : noms hachés par le contenu, donc jamais périmés.
 *   - les images de `public/` : logo, icônes, visuels de paiement.
 *   - la page hors-ligne, précachée à l'installation.
 *
 * Tout le reste — navigations, `/api/*`, `/auth/*` — part sur le réseau et
 * n'est jamais conservé. Hors-ligne, une navigation retombe sur la page
 * `hors-ligne.html` au lieu du dinosaure du navigateur.
 *
 * La version du cache est dans le nom : changer `VERSION` invalide tout à
 * l'activation suivante.
 */

const VERSION = "nkamva-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/hors-ligne.html";

/** Ressources indispensables pour afficher quelque chose sans réseau. */
const PRECACHE = [OFFLINE_URL, "/logo.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Le nouveau worker prend la main sans attendre la fermeture des onglets.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Ce qui peut être mis en cache sans risque : public, immuable, non nominatif. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  return /\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?)$/i.test(url.pathname);
}

/** Routes qui ne doivent jamais être servies depuis un cache. */
function isNeverCached(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/admin")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Les écritures ne passent pas par ici, et un cache ne répond pas à un POST.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  // — Navigations : réseau d'abord, page hors-ligne en dernier recours —
  // La réponse n'est jamais conservée : elle peut être nominative.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ??
          new Response("Hors ligne", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  // — Ressources statiques : cache d'abord, réseau en remplissage —
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            // `basic` écarte les réponses opaques, qu'on ne peut pas inspecter.
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
