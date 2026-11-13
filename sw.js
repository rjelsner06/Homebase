/* Homebase: OFFLINE COPY (service worker). Registered at the bottom of index.html.
   Keeps a copy of Homebase's own files (and the fonts / libraries it loads from CDNs) so the site still
   opens with no signal, for example in the grocery store. Your data is already saved on the device
   (IndexedDB) and syncs once you're back online; this file only makes sure the page itself loads.

   Network first: when you're online you always get the newest files (a copy is saved as they arrive).
   The saved copy is used only when the network fails, or doesn't answer within a few seconds.
   Supabase, weather, ntfy and every other site are never touched: they always go straight to the network.

   To wipe the offline copy (rarely needed): change VERSION below, push, and reload twice. */
"use strict";
const VERSION = "hb-offline-v1";
const SLOW_MS = 4000;
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION && k.startsWith("hb-offline-")) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.headers.has("range")) return;
  const u = new URL(r.url), own = u.origin === self.location.origin;
  if (!own && !CDN.test(r.url)) return;
  e.respondWith(netFirst(e, r, u, own));
});

async function save(r, u, own, res){
  try {
    if (!res || !(res.ok || res.type === "opaque")) return;
    const c = await caches.open(VERSION);
    /* scripts carry ?v=… : forget older versions of the same file so the copy doesn't keep growing */
    if (own && u.search) for (const k of await c.keys()){ const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.search !== u.search) await c.delete(k); }
    await c.put(r, res);
  } catch(_){}
}
async function fromCache(r){
  const c = await caches.open(VERSION);
  return (await c.match(r)) || (r.mode === "navigate" ? (await c.match(r, {ignoreSearch:true})) || (await c.match("./")) || (await c.match("index.html")) : null);
}
function netFirst(e, r, u, own){
  return new Promise(resolve => {
    let done = false;
    const finish = res => { if (!done && res){ done = true; resolve(res); } };
    const net = fetch(r).then(res => { e.waitUntil(save(r, u, own, res.clone())); return res; });
    net.then(finish, async err => { const c = await fromCache(r); if (c) finish(c); else if (!done){ done = true; resolve(Response.error()); } });
    /* a weak signal: use the saved copy if the network is slow, but keep the newer one coming for next time */
    setTimeout(async () => { if (done) return; const c = await fromCache(r); if (c) finish(c); else net.then(finish, () => {}); }, SLOW_MS);
  });
}
