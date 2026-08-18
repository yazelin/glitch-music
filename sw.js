/* 格莉奇音樂 service worker：shell / asset 兩層快取。
   HTML network-first、tracks.json stale-while-revalidate、資產 cache-first。
   音檔離線要能播：從快取回應帶 Range 的請求時自己合成 206。
   yazelin.github.io 是共用 origin：只清 glmusic- 前綴，不碰其他站的快取。 */

/* cache:start — scripts/update_sw_hashes.py 產生，勿手改 */
const SHELL_CACHE = 'glmusic-shell-6b857ad17645';
const ASSET_CACHE = 'glmusic-assets-5d2376b9217a';
/* cache:end */
const KEEP = [SHELL_CACHE, ASSET_CACHE];
const MATCH = { ignoreSearch: true, ignoreVary: true };

const SHELL_FILES = [
/* shell:start */
  './', './index.html', './manifest.webmanifest', './tracks.json',
  './js/id3.js', './js/lrc.js', './js/mp4meta.js', './js/vendor-hls.light.min.js',
  './images/icon-192.png', './images/icon-512.png', './images/icon-maskable-512.png'
/* shell:end */
];
const PRIORITY_ASSETS = [
/* priority:start */
  './images/cover-4kb.jpg'
/* priority:end */
];
const WARM_ASSETS = [
/* warm:start */
  './audio/glitch-4kb.mp3'
/* warm:end */
];

const isAsset = (url) => /\/(?:images|audio)\//.test(url.pathname);
const isLiveData = (url) => /\/tracks\.json$/.test(url.pathname);
const cacheable = (response) => !!response && response.ok && response.status !== 206;

async function store(cacheName, request, response) {
  try {
    await (await caches.open(cacheName)).put(request, response);
    return true;
  } catch (_) {
    return false;
  }
}

async function cacheOne(cacheName, path) {
  const cache = await caches.open(cacheName);
  if (await cache.match(path, MATCH)) return true;
  try {
    const response = await fetch(new Request(path, { cache: 'reload' }));
    return cacheable(response) ? store(cacheName, path, response) : false;
  } catch (_) {
    return false;
  }
}

let warming = null;
function warmAssets() {
  if (warming) return warming;
  warming = (async () => {
    for (const path of WARM_ASSETS) await cacheOne(ASSET_CACHE, path);
  })().finally(() => { warming = null; });
  return warming;
}

// 離線徽章實查：fetch 成功不等於存進快取，逐項 cache.match 一個不缺才回 ok
async function verifyOffline(client) {
  const missing = [];
  for (const [name, list] of [[SHELL_CACHE, SHELL_FILES], [ASSET_CACHE, PRIORITY_ASSETS.concat(WARM_ASSETS)]]) {
    const cache = await caches.open(name);
    for (const path of list) {
      if (!await cache.match(path, MATCH)) missing.push(path);
    }
  }
  client.postMessage({ type: 'offline-verified', ok: missing.length === 0, missing });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    for (const path of PRIORITY_ASSETS) await cacheOne(ASSET_CACHE, path);
    // Promise.allSettled 心法的逐檔版：單一檔失敗不擋整批
    for (const path of SHELL_FILES) await cacheOne(SHELL_CACHE, path);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('glmusic-') && !KEEP.includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
    warmAssets().catch(() => {});
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'warm-assets') event.waitUntil(warmAssets());
  if (event.data?.type === 'verify-offline' && event.source) event.waitUntil(verifyOffline(event.source));
});

async function rangedResponse(request, response) {
  const range = request.headers.get('range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match) return response;
  const buffer = await response.arrayBuffer();
  const length = buffer.byteLength;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) {
    start = Math.max(0, length - end);
    end = length - 1;
  } else {
    start ??= 0;
    end = end === null ? length - 1 : Math.min(end, length - 1);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= length) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${length}` } });
  }
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('content-range', `bytes ${start}-${end}/${length}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(buffer.slice(start, end + 1), { status: 206, headers });
}

async function backfillAsset(url) {
  const cache = await caches.open(ASSET_CACHE);
  if (await cache.match(url, MATCH)) return;
  try {
    const full = await fetch(url, { cache: 'no-cache' });
    if (cacheable(full)) await store(ASSET_CACHE, url, full);
  } catch (_) {}
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const html = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  if (html) {
    event.respondWith((async () => {
      const shell = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (cacheable(response) && !url.search) await store(SHELL_CACHE, request, response.clone());
        return response;
      } catch (_) {
        return await shell.match(request, MATCH) || await shell.match('./index.html', MATCH) || Response.error();
      }
    })());
    return;
  }

  if (isLiveData(url)) {
    event.respondWith((async () => {
      const shell = await caches.open(SHELL_CACHE);
      const cached = await shell.match(request, MATCH);
      const refresh = (async () => {
        try {
          const response = await fetch(request);
          if (cacheable(response)) await store(SHELL_CACHE, request, response.clone());
          return response;
        } catch (_) {
          return null;
        }
      })();
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return await refresh || Response.error();
    })());
    return;
  }

  const asset = isAsset(url);
  const cacheName = asset ? ASSET_CACHE : SHELL_CACHE;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, MATCH);
    if (cached) return asset ? rangedResponse(request, cached) : cached;
    try {
      const response = await fetch(request);
      if (cacheable(response) && !url.search) await store(cacheName, request, response.clone());
      else if (asset && response.status === 206) event.waitUntil(backfillAsset(url.href));
      return response;
    } catch (_) {
      const fallback = await cache.match(request, MATCH);
      return fallback ? (asset ? rangedResponse(request, fallback) : fallback) : Response.error();
    }
  })());
});
