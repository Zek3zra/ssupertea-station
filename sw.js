"use strict";

const CACHE_VERSION = "v7";
const STATIC_CACHE = `ssupertea-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ssupertea-runtime-${CACHE_VERSION}`;
const CACHE_PREFIX = "ssupertea-";

/*
 * These files exist in Phase 2 and can be safely pre-cached now.
 * Customer/admin HTML, CSS, and feature scripts will be cached at runtime
 * as they are introduced in later phases.
 */
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",
  "/js/app.js",
  "/js/supabase-config.js",
  "/js/openstreetmap-config.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/maskable-icon-512.png",
  "/assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);

      await Promise.all(
        APP_SHELL.map(async (assetUrl) => {
          try {
            const response = await fetch(
              new Request(assetUrl, { cache: "reload" })
            );

            if (response.ok) {
              await cache.put(assetUrl, response);
            }
          } catch (error) {
            console.warn(`Unable to pre-cache ${assetUrl}:`, error);
          }
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(CACHE_PREFIX) &&
              cacheName !== STATIC_CACHE &&
              cacheName !== RUNTIME_CACHE
          )
          .map((cacheName) => caches.delete(cacheName))
      );

      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  /*
   * Supabase, Leaflet CDN, and OpenStreetMap tile requests are cross-origin and deliberately excluded. The service worker only caches this application's own files.
   */
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  /*
   * Configuration files should prefer the network so a newly entered API
   * key or Supabase project setting is not hidden behind an older cache.
   */
  if (
    requestUrl.pathname === "/js/openstreetmap-config.js" ||
    requestUrl.pathname === "/js/supabase-config.js" ||
    requestUrl.pathname === "/js/app.js" ||
    requestUrl.pathname === "/css/style.css"
  ) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  const cacheableDestinations = new Set([
    "style",
    "script",
    "image",
    "font",
    "manifest",
  ]);

  if (cacheableDestinations.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

async function networkFirstNavigation(event) {
  const { request } = event;
  const runtimeCache = await caches.open(RUNTIME_CACHE);

  try {
    const preloadResponse = await event.preloadResponse;
    const networkResponse = preloadResponse || (await fetch(request));

    if (isCacheableResponse(networkResponse)) {
      await runtimeCache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const exactCachedPage = await runtimeCache.match(request);

    if (exactCachedPage) {
      return exactCachedPage;
    }

    const cachedHome =
      (await runtimeCache.match("/")) ||
      (await runtimeCache.match("/index.html"));

    if (cachedHome) {
      return cachedHome;
    }

    return createOfflineResponse();
  }
}

async function networkFirstAsset(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);

  try {
    const networkResponse = await fetch(request, {
      cache: "no-cache",
    });

    if (isCacheableResponse(networkResponse)) {
      await runtimeCache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cachedResponse =
      (await runtimeCache.match(request)) ||
      (await caches.match(request));

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response(
      "This configuration file is unavailable.",
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const cachedResponse =
    (await runtimeCache.match(request)) ||
    (await caches.match(request));

  const networkUpdate = fetch(request)
    .then(async (networkResponse) => {
      if (isCacheableResponse(networkResponse)) {
        await runtimeCache.put(request, networkResponse.clone());
      }

      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    event.waitUntil(networkUpdate);
    return cachedResponse;
  }

  const networkResponse = await networkUpdate;

  if (networkResponse) {
    return networkResponse;
  }

  return new Response("This resource is currently unavailable offline.", {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isCacheableResponse(response) {
  return Boolean(
    response &&
      response.ok &&
      (response.type === "basic" || response.type === "default")
  );
}

function createOfflineResponse() {
  const offlineHtml = `<!doctype html>
<html lang="en-PH">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0E5B3B">
  <title>Ssupertea Station | Offline</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f3e9;
      color: #173b2c;
    }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
    }
    main {
      width: min(100%, 420px);
    }
    .icon {
      width: 72px;
      height: 72px;
      margin: 0 auto 20px;
      display: grid;
      place-items: center;
      border-radius: 22px;
      background: #0e5b3b;
      color: #fff;
      font-size: 32px;
      font-weight: 800;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.6rem;
    }
    p {
      margin: 0 0 22px;
      line-height: 1.6;
      color: #486457;
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 12px 22px;
      background: #0e5b3b;
      color: #fff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main>
    <div class="icon" aria-hidden="true">S</div>
    <h1>You are offline</h1>
    <p>Reconnect to the internet, then try loading Ssupertea Station again.</p>
    <button type="button" onclick="window.location.reload()">Try again</button>
  </main>
</body>
</html>`;

  return new Response(offlineHtml, {
    status: 503,
    statusText: "Offline",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

self.addEventListener("message", (event) => {
  const messageType = event.data?.type;

  if (messageType === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (messageType === "CLEAR_APP_CACHES") {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys();

        await Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
            .map((cacheName) => caches.delete(cacheName))
        );
      })()
    );
  }
});
