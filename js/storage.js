Claude
Storage · JS
/* Homebase: LOCAL CACHE (IndexedDB) and the SCRIPT LOADER.
   This file loads first, on its own. It opens the browser's IndexedDB database, reads everything
   saved there into memory, moves old localStorage data over the first time, and only then loads the
   other js/ files (the list is in index.html). That way every other file can keep reading its saved
   data instantly with HBStore.get(), exactly like it used to with localStorage.
 
   Why: localStorage holds only about 5 MB per site (less on iPhone Safari). IndexedDB holds far more.
 
   HBStore (shared by all files):
     get(key, fallback)   the saved value (an object, array, string…) or fallback
     has(key)             true if something is saved under key
     set(key, value)      save it (written to IndexedDB a moment later, in the background)
     remove(key)          forget it
     flush()              write anything pending right now (Promise)
     bytes()              {total, by:{key: bytes}} for the Storage panel
     onError(fn)          called when a background write fails (for example, the disk is full)
     mode                 "idb" (normal), "local" (old localStorage way), or "memory" (nothing saved locally)
   Cached files (for offline viewing; js/files.js uses these):
     fileGet(id), filePut(id, blob, meta), fileDel(id), fileClear(), fileIndex()
   Old localStorage copy (kept until the move is confirmed):
     backupInfo(), backupData(), removeBackup()
 
   Kept in localStorage on purpose (small, or needed before the page draws): the theme
   (homebase.theme.v1), the sync project address (homebase.cloud.v1), the sign-in session,
   the Claude API key, the Notes sidebar toggle, and the Lifts app's own small keys.
 
   Live Server (http://127.0.0.1:5500) and GitHub Pages are different sites to the browser, so each has
   its own separate cache. Both fill themselves from Supabase after you sign in. */
"use strict";
 
const HBStore = (() => {
  const DB_NAME = "homebase", DB_VER = 1, KV = "kv", FILES = "files";
  const FLAG = "homebase.idb.v1";              // in localStorage (and a copy in IndexedDB): when the move happened
  const FLAG_IDB = "homebase.idb.flag";
  const FIDX = "homebase.filecache.v1";        // index of cached files: {id: {size, at, name, type}}
  /* Everything that used to live in localStorage and now lives in IndexedDB. */
  const MOVE = ["homebase.items.v2", "homebase.events.v1", "homebase.notes.v1", "homebase.settings.v1",
    "homebase.links.v1", "homebase.lifts.workouts.v1", "homebase.lifts.sessions.v1", "homebase.appdata.v1",
    "homebase.facts.v1", "homebase.weekgoals.v1", "homebase.sync.outbox.v1", "homebase.sync.meta.v1"];
  const FILE_CACHE_MAX = 200 * 1024 * 1024, FILE_CACHE_COUNT = 60;
  const BACKUP_DAYS = 3, DAY = 864e5;
 
  let db = null, mode = "memory", flushT = 0, chain = Promise.resolve();
  const mem = new Map(), dirty = new Set(), errSubs = new Set();
  const info = {openError:"", migrateError:"", migratedNow:false, bootAt:Date.now()};
 
  /* ---------- small helpers ---------- */
  const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch(e){ return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch(e){} };
  const readFlag = () => { try { return JSON.parse(lsGet(FLAG) || "null") || mem.get(FLAG_IDB) || null; } catch(e){ return mem.get(FLAG_IDB) || null; } };
  const reportErr = e => { console.error("Homebase local cache:", e); errSubs.forEach(f => { try { f(e); } catch(_){} }); };
  const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("The browser stopped a save to IndexedDB")); });
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const sizeOf = v => { try { return new Blob([typeof v === "string" ? v : JSON.stringify(v)]).size; } catch(e){ return 0; } };
 
  function openDB(){
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("This browser has no IndexedDB."));
      let r, done = false;
      const t = setTimeout(() => { if (!done){ done = true; rej(new Error("IndexedDB didn't open in time.")); } }, 6000);
      try { r = indexedDB.open(DB_NAME, DB_VER); } catch(e){ clearTimeout(t); return rej(e); }
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
        if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES);
      };
      r.onsuccess = () => {
        const d = r.result;
        if (done){ try { d.close(); } catch(_){} return; }
        done = true; clearTimeout(t);
        d.onversionchange = () => { try { d.close(); } catch(_){} if (db === d) db = null; };
        d.onclose = () => { if (db === d) db = null; };
        res(d);
      };
      r.onerror = () => { if (!done){ done = true; clearTimeout(t); rej(r.error); } };
    });
  }
  /* Runs fn(store) in a transaction. If iPhone Safari dropped the connection (it does after the app
     sits in the background), the database is opened again and the work is tried once more. */
  async function withStore(name, rw, fn){
    for (let tryNo = 0; tryNo < 2; tryNo++){
      try {
        if (!db) db = await openDB();
        const t = db.transaction(name, rw), out = fn(t.objectStore(name));
        await txDone(t);
        return out && typeof out.then === "function" ? await out : out;
      } catch(e){
        const lost = !db || /InvalidState|closing|closed|connection|UnknownError/i.test((e && (e.name + " " + e.message)) || "");
        if (tryNo === 0 && lost){ db = null; continue; }
        throw e;
      }
    }
  }
  function loadAll(){
    return withStore(KV, "readonly", s => new Promise((res, rej) => {
      const out = new Map(), c = s.openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur){ out.set(cur.key, cur.value); cur.continue(); } else res(out); };
      c.onerror = () => rej(c.error);
    }));
  }
  /* structured-clone the value; if it holds something IndexedDB can't copy, store a plain JSON copy */
  function putVal(s, k, v){ try { s.put(v, k); } catch(e){ s.put(JSON.parse(JSON.stringify(v)), k); } }
 
  /* ---------- moving the old localStorage data over (first load only) ---------- */
  async function migrate(){
    const flag = readFlag();
    if (flag && flag.verifiedAt) return flag;
    const found = [];
    for (const k of MOVE){
      const raw = lsGet(k); if (raw == null || mem.has(k)) continue;   // already in IndexedDB: that copy is newer
      let v; try { v = JSON.parse(raw); } catch(e){ continue; }
      found.push({k, v, raw});
    }
    if (found.length){
      await withStore(KV, "readwrite", s => { for (const f of found) putVal(s, f.k, f.v); });
      /* read it all back and compare before trusting it */
      const back = await loadAll(), bad = found.filter(f => !back.has(f.k) || JSON.stringify(back.get(f.k)) !== JSON.stringify(f.v));
      if (bad.length){
        /* undo the half-done copy so the next try starts clean from localStorage */
        try { await withStore(KV, "readwrite", s => { for (const f of found) s.delete(f.k); }); } catch(_){}
        throw new Error("The copy check failed for " + bad.map(f => f.k).join(", "));
      }
      for (const f of found) mem.set(f.k, back.get(f.k));
    }
    const now = Date.now();
    const nf = {v:1, migratedAt:now, verifiedAt:now, keys:found.map(f => f.k), bytes:found.reduce((n, f) => n + f.raw.length, 0)};
    lsSet(FLAG, JSON.stringify(nf));   // may fail if localStorage is already full; the IndexedDB copy below covers that
    mem.set(FLAG_IDB, nf); await withStore(KV, "readwrite", s => putVal(s, FLAG_IDB, nf));
    info.migratedNow = found.length > 0;
    return nf;
  }
  function saveFlag(f){ lsSet(FLAG, JSON.stringify(f)); set(FLAG_IDB, f); }
  /* The old localStorage copy stays until a later page load finds everything still in IndexedDB
     and at least BACKUP_DAYS have passed. Then it's removed to free that space. */
  function maybeRemoveBackup(){
    const f = readFlag(); if (mode !== "idb" || !f || !f.verifiedAt || f.backupRemovedAt) return;
    if (!(f.keys || []).every(k => mem.has(k))) return;              // something went missing: keep the backup
    if (!f.confirmedAt && f.verifiedAt < info.bootAt - 60000){ f.confirmedAt = Date.now(); saveFlag(f); }
    if (f.confirmedAt && Date.now() - f.verifiedAt >= BACKUP_DAYS * DAY) removeBackup();
  }
  function backupInfo(){
    const f = readFlag(), keys = MOVE.filter(k => lsGet(k) != null);
    const bytes = keys.reduce((n, k) => n + sizeOf(lsGet(k) || ""), 0);
    return {flag:f, keys, bytes, until:f && f.verifiedAt && !f.backupRemovedAt ? f.verifiedAt + BACKUP_DAYS * DAY : null};
  }
  function backupData(){ const o = {}; for (const k of MOVE){ const v = lsGet(k); if (v != null) o[k] = v; } return o; }
  function removeBackup(){
    if (mode !== "idb") return false;
    const f = readFlag() || {};
    /* the theme snippet in index.html falls back to the old settings key until the new theme key exists */
    for (const k of MOVE) if (k !== "homebase.settings.v1" || lsGet("homebase.theme.v1") != null) lsDel(k);
    f.backupRemovedAt = Date.now(); saveFlag(f);
    return true;
  }
 
  /* ---------- start ---------- */
  async function start(){
    try {
      db = await openDB();
      for (const [k, v] of await loadAll()) mem.set(k, v);
      mode = "idb";
      try { await migrate(); }
      catch(e){ info.migrateError = e.message || String(e); console.error("Homebase: moving data to IndexedDB failed; using localStorage this time.", e); mode = "local"; }
    } catch(e){
      info.openError = (e && e.message) || String(e);
      console.warn("Homebase: IndexedDB unavailable:", info.openError);
      const f = readFlag();
      /* before the move: carry on with localStorage as before. After it: the local copy is in IndexedDB,
         which can't be reached right now, so run from memory and let Supabase fill things in. */
      mode = f && f.verifiedAt ? "memory" : "local";
    }
    if (mode === "local"){
      for (const k of MOVE){ const raw = lsGet(k); if (raw == null) continue; try { mem.set(k, JSON.parse(raw)); } catch(_){} }
    }
    if (mode === "idb"){
      setTimeout(maybeRemoveBackup, 8000);
      /* ask the browser not to clear this site's data under storage pressure (silent in Chrome and Safari) */
      try { if (navigator.storage && navigator.storage.persist && !/firefox/i.test(navigator.userAgent)) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {}); } catch(_){}
    }
  }
  const ready = start().catch(e => { console.error(e); mode = "memory"; });
 
  /* ---------- reading and writing ---------- */
  function get(k, fallback = null){ return mem.has(k) ? mem.get(k) : fallback; }
  function has(k){ return mem.has(k); }
  function set(k, v){
    mem.set(k, v);
    if (mode === "local"){ if (!lsSet(k, JSON.stringify(v))){ reportErr(Object.assign(new Error("This browser's storage is full."), {name:"QuotaExceededError"})); return false; } return true; }
    if (mode === "idb"){ dirty.add(k); clearTimeout(flushT); flushT = setTimeout(flush, 40); }
    return mode !== "memory";
  }
  function remove(k){
    mem.delete(k);
    if (mode === "local") lsDel(k);
    if (mode === "idb"){ dirty.add(k); clearTimeout(flushT); flushT = setTimeout(flush, 40); }
  }
  function flush(){
    clearTimeout(flushT);
    if (mode !== "idb" || !dirty.size) return chain;
    const keys = [...dirty]; dirty.clear();
    chain = chain.then(() => withStore(KV, "readwrite", s => { for (const k of keys) mem.has(k) ? putVal(s, k, mem.get(k)) : s.delete(k); }))
      .catch(e => { keys.forEach(k => dirty.add(k)); reportErr(e); });
    return chain;
  }
  /* write right away when the tab is hidden or closed (switching apps on an iPhone counts) */
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
 
  function bytes(){
    const by = {}; let total = 0;
    for (const [k, v] of mem){ if (k === FLAG_IDB) continue; const n = sizeOf(v); by[k] = n; total += n; }
    return {total, by};
  }
 
  /* ---------- cached files (stored as bytes, which every browser can keep in IndexedDB) ---------- */
  const fileIndex = () => ({...get(FIDX, {})});
  async function fileGet(id){
    if (mode !== "idb") return null;
    try {
      const rec = await withStore(FILES, "readonly", s => reqP(s.get(id)));
      if (!rec || !rec.buf) return null;
      const idx = fileIndex(); if (idx[id]){ idx[id] = {...idx[id], at:Date.now()}; set(FIDX, idx); }
      return {blob:new Blob([rec.buf], {type:rec.type || "application/octet-stream"}), name:rec.name || "", type:rec.type || ""};
    } catch(e){ console.warn("Couldn't read a cached file", e); return null; }
  }
  async function filePut(id, blob, meta = {}){
    if (mode !== "idb" || !blob || blob.size > FILE_CACHE_MAX / 2) return false;
    const idx = fileIndex();
    /* make room: least recently opened goes first */
    const ids = Object.keys(idx).filter(x => x !== id).sort((a, b) => (idx[a].at || 0) - (idx[b].at || 0));
    let total = ids.reduce((n, x) => n + (idx[x].size || 0), 0);
    const drop = [];
    while (ids.length && (total + blob.size > FILE_CACHE_MAX || ids.length >= FILE_CACHE_COUNT)){ const x = ids.shift(); total -= idx[x].size || 0; drop.push(x); }
    try {
      const buf = await blob.arrayBuffer();
      await withStore(FILES, "readwrite", s => { drop.forEach(x => s.delete(x)); s.put({buf, type:blob.type || meta.type || "", name:meta.name || ""}, id); });
      drop.forEach(x => delete idx[x]);
      idx[id] = {size:blob.size, at:Date.now(), name:meta.name || "", type:blob.type || meta.type || ""};
      set(FIDX, idx);
      return true;
    } catch(e){ reportErr(e); return false; }
  }
  async function fileDel(id){
    const idx = fileIndex(); if (!(id in idx) && mode !== "idb") return;
    delete idx[id]; set(FIDX, idx);
    if (mode === "idb") try { await withStore(FILES, "readwrite", s => s.delete(id)); } catch(e){ console.warn(e); }
  }
  async function fileClear(){
    set(FIDX, {});
    if (mode === "idb") try { await withStore(FILES, "readwrite", s => s.clear()); } catch(e){ console.warn(e); }
  }
 
  /* ---------- loading the rest of Homebase ---------- */
  /* Scripts are added in the given order with async=false, so the browser runs them one after another,
     exactly like plain <script src> tags. They all share one global scope, as before. */
  function boot(version, list){
    if (Array.isArray(version)){ list = version; version = ""; }
    ready.then(() => {
      for (const src of list){
        const s = document.createElement("script");
        s.src = version ? `${src}?v=${encodeURIComponent(version)}` : src; s.async = false;
        s.onerror = () => {
          console.error("Homebase: couldn't load " + src);
          const n = document.getElementById("store-note"); if (n) n.textContent = `Couldn't load ${src}. Check the file is there and reload.`;
        };
        document.body.appendChild(s);
      }
    });
  }
 
  return {
    ready, boot,
    get, has, set, remove, flush, bytes,
    keys: () => [...mem.keys()],
    onError(f){ errSubs.add(f); },
    get mode(){ return mode; },
    info: () => ({...info, mode, flag:readFlag()}),
    fileGet, filePut, fileDel, fileClear, fileIndex, FILE_CACHE_MAX,
    backupInfo, backupData, removeBackup,
  };
})();
 
Claude is responding
