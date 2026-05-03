/* Simple PWA Service Worker (no external deps) */

const SHELL_CACHE = "louvre-shell-v1";
const MEDIA_CACHE = "louvre-media-v1";

const SHELL_ASSETS = ["./", "./index.html", "./app.css", "./app.js", "./data/items.json", "./data/maps.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k !== SHELL_CACHE && k !== MEDIA_CACHE) return caches.delete(k);
          return Promise.resolve();
        }),
      );
      await self.clients.claim();
    })(),
  );
});

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

function isMediaRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname.toLowerCase();
  return path.endsWith(".mp3") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png");
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const resp = await fetch(req);
  if (resp.ok) cache.put(req, resp.clone());
  return resp;
}

function parseRangeHeader(rangeHeader, size) {
  // "bytes=start-end"
  if (!rangeHeader) return null;
  const match = /^bytes=(\d+)-(\d+)?$/i.exec(rangeHeader);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function respondRangeFromCache(url, rangeHeader) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(url);
  if (!cached) return null;
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const range = parseRangeHeader(rangeHeader, size);
  if (!range) return null;
  const sliced = buf.slice(range.start, range.end + 1);
  const headers = new Headers(cached.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(sliced.byteLength));
  if (!headers.get("Content-Type")) headers.set("Content-Type", "audio/mpeg");
  return new Response(sliced, { status: 206, statusText: "Partial Content", headers });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests.
  if (!isSameOrigin(req.url)) return;

  // Audio range requests need special handling for offline.
  const rangeHeader = req.headers.get("Range");
  if (rangeHeader && url.pathname.toLowerCase().endsWith(".mp3")) {
    event.respondWith(
      (async () => {
        const fromCache = await respondRangeFromCache(req.url, rangeHeader);
        if (fromCache) return fromCache;
        // Fallback to network (browser will handle range)
        return fetch(req);
      })(),
    );
    return;
  }

  // Media: cache-first so offline works after caching.
  if (isMediaRequest(req)) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
    return;
  }

  // Shell: cache-first with network fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match("./index.html");
        if (cached) return cached;
        return fetch(req);
      })(),
    );
    return;
  }

  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "CACHE_URLS") {
    const { urls, cacheName, jobId } = msg;
    event.waitUntil(
      (async () => {
        const cache = await caches.open(cacheName || MEDIA_CACHE);
        let done = 0;
        const failed = [];
        for (const url of urls || []) {
          try {
            const resp = await fetch(new Request(url, { cache: "no-cache" }));
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            await cache.put(url, resp.clone());
          } catch {
            failed.push(url);
            event.source?.postMessage({
              type: "CACHE_PROGRESS",
              jobId,
              done: done + 1,
              total: urls.length,
              failedUrl: url,
            });
            done += 1;
            continue;
          }
          done += 1;
          event.source?.postMessage({ type: "CACHE_PROGRESS", jobId, done, total: urls.length });
        }
        event.source?.postMessage({ type: "CACHE_DONE", jobId, total: urls.length, failed });
      })(),
    );
  }
});
