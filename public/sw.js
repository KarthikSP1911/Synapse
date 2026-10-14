/* Mathz service worker: makes the app open and run with no connection, and stay usable on a poor one.
 *
 *  - Screens (HTML): network first, but after NAV_TIMEOUT_MS the last copy is shown instead of waiting
 *    on a weak signal. The network request keeps going and refreshes the copy for next time.
 *  - Scripts, styles, fonts (/_next/static): content-hashed, so a cached file never goes stale; served
 *    from the cache first.
 *  - Icons and the manifest: cached copy first, refreshed in the background.
 *  - The page asks this worker to download the main screens (and the files they use) while online, so
 *    they are ready before the connection is lost ("warm").
 *  - API calls and Server Actions are never touched: practice runs on the device (see src/features/offline/lib/guest/api.ts)
 *    and its results are uploaded by the page when the network allows.
 *
 * The page and asset caches are not versioned on purpose: assets never change for a given URL, and pages
 * are only a fallback, so a new worker keeps working copies instead of throwing them away. Bump VERSION
 * only to change the shell files below.
 */
const VERSION = "v2";
const SHELL_CACHE = `mathz-shell-${VERSION}`;
const ASSET_CACHE = "mathz-assets";
const PAGE_CACHE = "mathz-pages";
const KNOWN_CACHES = new Set([SHELL_CACHE, ASSET_CACHE, PAGE_CACHE]);

const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icon.svg"];

const NAV_TIMEOUT_MS = 4000;
const RSC_TIMEOUT_MS = 6000;
const MAX_ASSETS = 600;
const MAX_PAGES = 60;

/** Screens worth keeping a copy of. Login, sign-up and error pages are never stored. */
const PAGE_PATHS = new Set([
  "/",
  "/skills/multiplication",
  "/skills/addition",
  "/skills/subtraction",
  "/skills/division",
  "/skills/percentage",
  "/skills/fraction",
  "/skills/square",
  "/skills/exponents",
  "/play",
  "/play/summary",
  "/games/mindsprint",
  "/games/recall",
  "/games/sudoku",
  "/games/2048",
  "/games/queens",
  "/games/zip",
  "/games/patches",
  "/progress",
  "/tables",
  "/settings",
  "/profile",
  "/rewards",
]);
/** Same page for every session (the id is in the query string), so one stored copy serves them all. */
const SHARED_SHELLS = new Set(["/play", "/play/summary"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((error) => {
        // Without the shell files the worker is useless offline: say why, and let the install fail so the browser retries.
        console.error("[mathz sw] Could not store the offline shell:", error);
        throw error;
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("mathz-") && !KNOWN_CACHES.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
      // Pages hold on to the previous worker's view of the world; let them refresh their offline copies.
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.postMessage({ type: "sw-activated" }));
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "skip-waiting") self.skipWaiting();
  else if (data.type === "clear-pages") event.waitUntil(caches.delete(PAGE_CACHE));
  else if (data.type === "warm" && Array.isArray(data.urls)) event.waitUntil(warm(data.urls));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, request, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE, MAX_ASSETS));
    return;
  }
  if (isShellFile(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request, SHELL_CACHE));
    return;
  }
  // Client-side navigations ask for a data payload instead of a page. If the network cannot deliver it, fail
  // fast so Next.js falls back to a normal page load, which the navigation handler above can answer from the cache.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(withTimeout(fetch(request), RSC_TIMEOUT_MS).catch(() => Response.error()));
  }
  // Everything else (API routes) goes straight to the network.
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const pageKey = (url) => url.origin + url.pathname + (SHARED_SHELLS.has(url.pathname) ? "" : url.search);

async function handleNavigation(event, request, url) {
  const network = fetch(request);
  // Whatever the outcome for this visit, a good response refreshes the stored copy.
  const refresh = network.then((response) => storePage(url, response)).catch(() => {});
  event.waitUntil(refresh);

  try {
    return await withTimeout(network, NAV_TIMEOUT_MS);
  } catch (error) {
    const cached = await findPage(url);
    if (cached) return cached;
    if (error && error.message === "timeout") {
      // Nothing stored yet for this screen: a slow answer is still better than none.
      try {
        return await network;
      } catch {
        /* fall through to the offline page */
      }
    }
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function storePage(url, response) {
  if (!PAGE_PATHS.has(url.pathname)) return;
  const type = response.headers.get("Content-Type") || "";
  // Redirects (e.g. to the login screen when signed out) and errors are not screens worth keeping.
  if (response.status !== 200 || response.redirected || !type.includes("text/html")) return;
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(pageKey(url), response.clone());
  await trim(cache, MAX_PAGES);
}

async function findPage(url) {
  if (!PAGE_PATHS.has(url.pathname)) return undefined;
  const cache = await caches.open(PAGE_CACHE);
  return (await cache.match(pageKey(url))) || (await cache.match(url.origin + url.pathname)) || (await cache.match(url.origin + url.pathname, { ignoreSearch: true }));
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const isShellFile = (path) =>
  path.startsWith("/icons/") || path === "/icon.svg" || path === "/manifest.webmanifest" || path.startsWith("/apple-icon") || path === "/favicon.ico";

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache, max);
  }
  return response;
}

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return (await update) || Response.error();
}

/** Keeps a cache bounded by dropping the oldest entries (the Cache API lists keys oldest first). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Warm-up: download the main screens and every script, style and font they use
// ---------------------------------------------------------------------------

const ASSET_PATTERN = /\/_next\/static\/[\w\-./%~@[\]]+?\.(?:js|css|woff2?|png|svg|ico|json)(?:\?[\w=\-]+)?/g;

function assetUrlsIn(text, base) {
  const found = new Set();
  // Inline page data escapes slashes in some places, so normalise before matching.
  for (const match of text.replace(/\\u002F|\\\//gi, "/").matchAll(ASSET_PATTERN)) found.add(new URL(match[0], base).href);
  return found;
}

async function warm(paths) {
  const assets = await caches.open(ASSET_CACHE);
  const wanted = new Set();

  for (const path of paths) {
    try {
      const url = new URL(path, self.location.origin);
      const response = await fetch(url.href, { credentials: "same-origin", cache: "no-store" });
      if (response.status !== 200 || response.redirected) continue;
      await storePage(url, response.clone());
      assetUrlsIn(await response.text(), url.href).forEach((href) => wanted.add(href));
    } catch {
      /* Offline or the server is down: keep whatever is already stored. */
    }
  }

  // Styles name the fonts they use, so those are fetched too.
  const queue = [...wanted];
  for (let i = 0; i < queue.length; i++) {
    const href = queue[i];
    try {
      let response = await assets.match(href);
      if (!response) {
        response = await fetch(href, { credentials: "same-origin" });
        if (!response.ok) continue;
        await assets.put(href, response.clone());
      }
      if (new URL(href).pathname.endsWith(".css")) {
        for (const nested of assetUrlsIn(await response.clone().text(), href)) {
          if (!wanted.has(nested)) {
            wanted.add(nested);
            queue.push(nested);
          }
        }
      }
    } catch {
      /* One missing file must not stop the rest. */
    }
  }
  await trim(assets, MAX_ASSETS);
}
