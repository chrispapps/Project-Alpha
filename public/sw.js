// Service worker for the Content Credentials Validator.
//
// - Keeps the app usable offline: the page, its hashed JS/CSS, the C2PA Wasm
//   binary and the trust list are cached as they're used. Images are checked
//   on-device, so nothing else needs the network.
// - Receives images shared to the installed app (manifest share_target) and
//   hands them to the page through the Cache API.

const SHELL_CACHE = "cc-shell-v1";
const SHARE_CACHE = "cc-share";
const SHARED_FILE_KEY = "/__shared-file";
const PRECACHE = ["/", "/trust/C2PA-TRUST-LIST.pem", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL_CACHE && key !== SHARE_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cacheable(response) {
  return response && response.ok && response.type === "basic";
}

async function put(request, response) {
  if (!cacheable(response)) return;
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(request, response);
}

// Pages: always try the network so deploys show up immediately; fall back to
// the cached app shell when offline.
async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (new URL(request.url).pathname === "/") await put("/", response.clone());
    return response;
  } catch {
    const cached = await caches.match("/");
    if (cached) return cached;
    throw new Error("offline and no cached page");
  }
}

// Content-hashed or version-stamped files never change at the same URL.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await put(request, response.clone());
  return response;
}

// Trust list, icons, manifest: serve from cache, refresh in the background.
async function staleWhileRevalidate(event) {
  const cached = await caches.match(event.request);
  const refresh = fetch(event.request)
    .then(async (response) => {
      await put(event.request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const response = await refresh;
  if (response) return response;
  throw new Error("offline and not cached");
}

// Only one Wasm version is ever needed; drop older ones when a new one lands.
async function wasm(request) {
  const response = await cacheFirst(request);
  const cache = await caches.open(SHELL_CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((key) => new URL(key.url).pathname.startsWith("/c2pa/") && key.url !== request.url)
      .map((key) => cache.delete(key)),
  );
  return response;
}

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (file && typeof file === "object" && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        SHARED_FILE_KEY,
        new Response(file, {
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name || "shared-image"),
          },
        }),
      );
      return Response.redirect("/?shared=1", 303);
    }
  } catch {
    // Fall through to the "nothing received" state.
  }
  return Response.redirect("/?shared=none", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith("/c2pa/")) {
    event.respondWith(wasm(request));
  } else if (
    url.pathname.startsWith("/trust/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon.svg" ||
    url.pathname.startsWith("/apple-icon")
  ) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
