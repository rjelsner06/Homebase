/* Homebase: CONFIG, UTILITIES ($, $$, dates), DATA LAYER (Store), CLOUD SYNC (Supabase), SETTINGS (theme, colors), derived views.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";
 
 
 
/* =====================================================================
   CONFIG
   ===================================================================== */
const TYPES = ["Homework","Exam","Quiz","Lab","Project","Reading","Lecture","Recitation","Review","No Class","Event","Task","Other"];
/* Types left off the to-do list unless you change it (Settings → Types) or switch an item on in its details. */
const CALENDAR_ONLY = new Set(["Lecture","Recitation","Lab","Review","No Class","Event"]);
const PRIORITIES = ["None","Low","Medium","High"];
const PRI_RANK = {None:0, Low:1, Medium:2, High:3};
const SCHEDULED_TYPES = new Set(["Lecture","Recitation","Review","Exam","Quiz","Lab","Event"]);   // have a start and end time; every other type has a due time
const SERIES_FIELDS = ["title","category","course","type","time","endTime","location","priority","flagged","notes","reminders","todo"];  // shared when editing a whole series
const COURSE_COLORS = 10;
const MAX_OCC = 200;
const TYPE_VAR = t => `var(--t-${String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-")})`;
const TI = {
  Homework:'<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  Exam:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  Quiz:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6"/><path d="M12 17h.01"/>',
  Lab:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  Project:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  Reading:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  Lecture:'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  Recitation:'<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-3 2.2-5 5-5s5 2 5 5M11 20c0-3 2.2-5 5-5s5 2 5 5"/>',
  Review:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  "No Class":'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  Event:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  Task:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  Other:'<circle cx="12" cy="12" r="3"/>',
};
const typeIcon = t => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TI[t] || TI.Other}</svg>`;
const typeBadge = t => `<span class="tb" style="--tc:${TYPE_VAR(t)}">${typeIcon(t)}${t}</span>`;
const typeDot = t => `<span class="ti" style="--tc:${TYPE_VAR(t)}" title="${t}">${typeIcon(t)}</span>`;
const PRI_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const priBadge = r => { const n = PRI_RANK[r.priority]; return n ? `<span class="prb p${n}" title="${r.priority} priority">${n > 1 ? PRI_ARROW : ""}${r.priority === "Medium" ? "Med" : r.priority}</span>` : ""; };
const priClass = r => !r.completed && PRI_RANK[r.priority] ? "p" + PRI_RANK[r.priority] : "";
/* To add a category, add a line here. hasCourse:true = colored by course; look:"outline" = dashed style. */
const CATEGORIES = [
  {name:"School",   hasCourse:true,  look:"solid"},
  {name:"Personal", hasCourse:false, look:"outline", color:"var(--pers)"},
];
const PURGE_DAYS = 30;
 
/* =====================================================================
   UTILITIES
   ===================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const MS_DAY = 864e5;
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const todayS = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + Number(n)); return ymd(d); };
const daysFromToday = s => Math.round((parseYmd(s) - startOfDay(new Date())) / MS_DAY);
const weekStart = d => { const s = startOfDay(d); s.setDate(s.getDate() - s.getDay()); return s; };
const plural = (n, w) => `${n} ${w}${n===1?"":"s"}`;
const trunc = (s, n=40) => s.length > n ? s.slice(0, n-1) + "…" : s;
const fmtTime = t => { if(!t) return ""; const [h,m] = t.split(":").map(Number); return `${(h%12)||12}:${pad(m)} ${h<12?"AM":"PM"}`; };
const fmtDate = (s, o={weekday:"short",month:"short",day:"numeric"}) => parseYmd(s).toLocaleDateString(undefined, o);
const fmtDT = iso => new Date(iso).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const catDef = n => CATEGORIES.find(c => c.name === n) || {name:n, hasCourse:false, look:"outline", color:"var(--pers)"};
/* Your own types (Settings → Types, or "+ New type" in an item). Stored in Settings so they sync. */
function customTypes(){ try { return (Settings.get().types || {}).custom || []; } catch(e){ return []; } }
const allTypes = () => [...TYPES, ...customTypes().map(c => c.name).filter(n => n && !TYPES.includes(n))];
const customType = t => customTypes().find(c => c.name === t);
/* Type order and how many are "main" (Settings → Types). Kept here because the to-do page uses them while loading. */
function typeOrder(){
  const DEF = ["Homework","Exam","Quiz","Lecture","Recitation","Lab","Project","Reading","Review","Event","Task","No Class","Other"];
  const t = (Settings.get().types || {}), hidden = new Set(t.hidden || []), all = allTypes().filter(x => !hidden.has(x));
  const order = (t.order || DEF).filter(x => all.includes(x));
  return [...order, ...all.filter(x => !order.includes(x))];
}
function typeMainCount(){ const n = (Settings.get().types || {}).main; return Number.isFinite(n) ? n : 6; }
const isSchedType = t => SCHEDULED_TYPES.has(t) || !!(customType(t) || {}).scheduled;
/* Does this type go on the to-do list by default? */
function typeTodo(t){
  if (t === "No Class") return false;
  try { const o = (Settings.get().types || {}).todo || {}; if (typeof o[t] === "boolean") return o[t]; } catch(e){}
  const c = customType(t); if (c) return !!c.todo;
  return !CALENDAR_ONLY.has(t);
}
const typeOptions = sel => { let L; try { L = typeOrder(); } catch(e){ L = allTypes(); } if (sel && !L.includes(sel)) L = [...L, sel]; return L.map(t => `<option ${t === sel ? "selected" : ""}>${esc(t)}</option>`).join(""); };
 
/* =====================================================================
   DATA LAYER
   Every read and write of saved data goes through `Store`. The UI never
   touches the browser's storage (HBStore, js/storage.js). Store keeps an in-memory copy (so reads are
   instant) and hands every change to an adapter.
 
   To add sync later (Supabase / Firebase), write an adapter with:
     load()               -> Promise<{items: Record[] | null, migrated?: bool}>
     upsert(records, all) -> Promise   (insert or replace these records)
     remove(ids, all)     -> Promise   (permanently delete these ids)
   then call Store.init(MyAdapter), and call Store.applyRemote(records)
   from a realtime subscription. No UI code needs to change.
   ===================================================================== */
/* =====================================================================
   CLOUD SYNC (Supabase). Optional. Everything still saves to this
   browser first; when you're signed in, each change is also sent to your
   Supabase project and other devices pick it up live.
 
   How it works: every kind of data ("item", "note", "folder", "settings",
   "link", "workout", "factday", "appdata", ...) registers here with
     all()   -> the local records, each with an id
     m(rec)  -> when the record last changed (ms)
     apply(upserts, deletedIds) -> store records that came from the cloud
   Modules call Sync.touch(kind) after they save; Sync diffs against the
   last copy it saw and queues just the changed records. Newer wins.
 
   The Supabase project URL and publishable key are typed in Settings and
   kept in this browser's storage. Nothing secret lives in this file.
   ===================================================================== */
const Sync = (() => {
  const CFG = "homebase.cloud.v1", OUT = "homebase.sync.outbox.v1", META = "homebase.sync.meta.v1", T = "hb_docs";
  const SB_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
  /* The project address stays in localStorage (tiny). The outbox and sync bookkeeping live in IndexedDB (HBStore). */
  const rd = (k, f) => { if (k !== CFG) return HBStore.get(k, f) || f; try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch(e){ return f; } };
  const wr = (k, v) => { if (k !== CFG) return HBStore.set(k, v); try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } };
  const J = o => JSON.stringify(o, (k, v) => k === "_m" ? undefined : v);
  const kinds = {}, snaps = {}, dirty = new Set(), subs = new Set(), localSubs = new Set();
  let outbox = rd(OUT, {}), meta = rd(META, {}), cfg = rd(CFG, null);
  let sb = null, user = null, state = cfg ? "connecting" : "off", err = "", applying = 0, channel = null, flushT = 0, touchT = 0, busy = false, started = null, lastSync = null;
  const emit = () => subs.forEach(f => { try { f(); } catch(e){ console.error(e); } });
  const setState = (s, e = "") => { state = s; err = e; if (s === "ok") lastSync = new Date(); emit(); };
  const msg = e => (e && (e.message || e.error_description || e.msg)) || String(e || "Unknown error");
  const key = (k, id) => k + "\u0001" + id;
  const queueing = () => !!(cfg && meta.userId && !meta.out);
 
  /* ---------- local side ---------- */
  function register(kind, def){ kinds[kind] = def; snaps[kind] = new Map(def.all().map(o => [o.id, J(o)])); }
  function touch(kind){
    dirty.add(kind);
    localSubs.forEach(f => { try { f(kind); } catch(e){ console.error(e); } });
    clearTimeout(touchT); touchT = setTimeout(runTouches, 300);
  }
  function runTouches(){
    clearTimeout(touchT); if (applying) return;
    const ks = [...dirty]; dirty.clear(); let any = false;
    for (const k of ks) any = diff(k) || any;
    if (any){ wr(OUT, outbox); flushSoon(); }
  }
  function diff(kind){
    const def = kinds[kind]; if (!def) return false;
    const snap = snaps[kind], seen = new Set(); let any = false, stamped = false;
    for (const o of def.all()){
      seen.add(o.id); const j = J(o);
      if (snap.get(o.id) === j) continue;
      if (def.stamp){ def.stamp(o); stamped = true; }
      snap.set(o.id, j); queue(kind, o.id, {...o, _m:def.m(o)}, false); any = true;
    }
    for (const id of [...snap.keys()]) if (!seen.has(id)){ snap.delete(id); queue(kind, id, {id, _m:Date.now()}, true); any = true; }
    if (stamped && def.persist) def.persist();
    return any;
  }
  function queue(kind, id, data, deleted){ if (queueing()) outbox[key(kind, id)] = {kind, id, data, deleted}; }
  function queueAll(kind, force){   // after sign-in: send local records the cloud lacks or has older copies of
    const def = kinds[kind]; if (!def) return;
    for (const o of def.all()){ const r = force && force.get(o.id); if (!force || !r || def.m(o) > r.m) outbox[key(kind, o.id)] = {kind, id:o.id, data:{...o, _m:def.m(o)}, deleted:false}; }
  }
 
  /* ---------- applying records from the cloud ---------- */
  function receive(rows, forceKinds){
    runTouches();
    const by = {}, locs = {};
    const loc = k => locs[k] || (locs[k] = new Map(kinds[k].all().map(o => [o.id, o])));
    for (const r of rows){
      const def = kinds[r.kind]; if (!def || !r.data) continue;
      const rm = +r.data._m || 0, pend = outbox[key(r.kind, r.id)], force = forceKinds && forceKinds.has(r.kind);
      if (!force && pend && (+pend.data._m || 0) >= rm) continue;
      const lo = loc(r.kind).get(r.id), b = by[r.kind] || (by[r.kind] = {u:[], d:[]});
      if (r.deleted){ if (lo && (force || rm >= def.m(lo))) b.d.push(r.id); }
      else if (!lo || force || rm > def.m(lo)) b.u.push(r.data);
    }
    apply(by);
  }
  function apply(by){
    applying++;
    try {
      for (const [kind, {u, d}] of Object.entries(by)){
        if (!u.length && !d.length) continue;
        const def = kinds[kind];
        try { def.apply(u, d); } catch(e){ console.error("Sync apply failed for", kind, e); }
        const now = new Map(def.all().map(o => [o.id, o]));
        for (const id of [...u.map(o => o.id), ...d]){ const x = now.get(id); x ? snaps[kind].set(id, J(x)) : snaps[kind].delete(id); }
      }
    } finally { applying--; }
    if (dirty.size){ clearTimeout(touchT); touchT = setTimeout(runTouches, 300); }
  }
 
  /* ---------- talking to Supabase ---------- */
  async function pull(since){
    const out = [];
    for (let a = 0; a < 200000; a += 1000){
      let q = sb.from(T).select("kind,id,data,deleted,updated_at").order("updated_at", {ascending:true}).range(a, a + 999);
      if (since) q = q.gt("updated_at", new Date(Date.parse(since) - 120000).toISOString());   // a 2-minute overlap; re-reading a record is harmless
      const {data, error} = await q; if (error) throw error;
      out.push(...data); if (data.length < 1000) break;
    }
    for (const r of out) if (!meta.lastPull || r.updated_at > meta.lastPull) meta.lastPull = r.updated_at;
    return out;
  }
  /* A kind of record this device didn't know about when it last pulled (for example right after an update adds
     the grocery list). pull() skips unknown kinds but still moves meta.lastPull past them, so their older records
     would never arrive. The first time a device sees a new kind, it fetches everything of that kind once. */
  async function fillNewKinds(){
    const known = new Set(meta.kinds || []), miss = Object.keys(kinds).filter(k => !known.has(k));
    if (!miss.length) return;
    const rows = [];
    for (let a = 0; a < 200000; a += 1000){
      const {data, error} = await sb.from(T).select("kind,id,data,deleted,updated_at").in("kind", miss).order("updated_at", {ascending:true}).range(a, a + 999);
      if (error) throw error;
      rows.push(...data); if (data.length < 1000) break;
    }
    if (rows.length) receive(rows);
    const remote = {};
    for (const r of rows) (remote[r.kind] ||= new Map()).set(r.id, {m:+(r.data && r.data._m) || 0, deleted:r.deleted});
    for (const k of miss) queueAll(k, remote[k] || new Map());   // and send up what only this device has
    meta.kinds = [...known, ...miss]; wr(META, meta); wr(OUT, outbox);
  }
  function flushSoon(ms = 600){ clearTimeout(flushT); flushT = setTimeout(flush, ms); }
  async function flush(){
    if (!sb || !user || busy) return;
    const keys = Object.keys(outbox);
    if (!keys.length){ if (state !== "ok" && state !== "syncing") setState("ok"); return; }
    busy = true; setState("saving");
    try {
      for (let i = 0; i < keys.length; i += 100){
        const batch = keys.slice(i, i + 100).map(k => [k, outbox[k]]).filter(([, e]) => e);
        const {error} = await sb.from(T).upsert(batch.map(([, e]) => ({user_id:user.id, kind:e.kind, id:e.id, data:e.data, deleted:!!e.deleted})), {onConflict:"user_id,kind,id"});
        if (error) throw error;
        batch.forEach(([k, e]) => { if (outbox[k] === e) delete outbox[k]; });
        wr(OUT, outbox);
      }
      busy = false; setState("ok");
      if (Object.keys(outbox).length) flushSoon();
    } catch(e){
      busy = false; setState(navigator.onLine === false ? "offline" : "error", msg(e));
      flushSoon(20000);
    }
  }
  function hasLocalData(){ return Object.values(kinds).some(def => def.all().length && !(def.seedOnly && def.seedOnly())); }
  async function fullSync(firstTime){
    const rows = await pull(null);
    const remote = {};
    for (const r of rows) (remote[r.kind] ||= new Map()).set(r.id, {m:+(r.data && r.data._m) || 0, deleted:r.deleted});
    const remoteHas = rows.some(r => !r.deleted && r.kind !== "settings");
    let mode = "merge";
    if (firstTime && remoteHas) mode = hasLocalData() ? await chooseMode() : "replace";
    if (mode === "replace"){
      const by = {};
      for (const kind of Object.keys(kinds)){
        const rk = remote[kind] || new Map(), b = by[kind] = {u:[], d:[]};
        for (const o of kinds[kind].all()){ const r = rk.get(o.id); if (!r || r.deleted) b.d.push(o.id); }
      }
      for (const r of rows) if (!r.deleted && kinds[r.kind]) by[r.kind].u.push(r.data);
      if (!remote.settings) delete by.settings;
      apply(by);
      if (!remote.settings) queueAll("settings");
    } else {
      if (firstTime && remoteHas){   // merging into an account that has data: this device's sample items and starter notes aren't worth copying
        const by = {};
        for (const [kind, def] of Object.entries(kinds)) if (def.isSeed){ const rk = remote[kind] || new Map(); by[kind] = {u:[], d:def.all().filter(o => !rk.has(o.id) && def.isSeed(o, rows)).map(o => o.id)}; }
        apply(by);
      }
      receive(rows, firstTime && remote.settings ? new Set(["settings"]) : null);   // on a new device the account's settings win
      for (const kind of Object.keys(kinds)) queueAll(kind, remote[kind] || new Map());
    }
    meta.kinds = Object.keys(kinds);   // a full pull covers every kind this device knows
    wr(OUT, outbox);
  }
  /* "Merge" or "Use account data only" when a device with its own data signs in for the first time. */
  function chooseMode(){
    return new Promise(res => {
      const d = $("#dlg-choice");
      $("#ch-title").textContent = "Your account already has Homebase data";
      $("#ch-body").textContent = "This device also has items, notes or other data. Merge keeps both (newest edit wins where the same thing was changed on both). Use account data replaces what's on this device with your account's data.";
      $("#ch-a").textContent = "Merge"; $("#ch-b").textContent = "Use account data only";
      d.returnValue = ""; d.addEventListener("close", () => res(d.returnValue === "b" ? "replace" : "merge"), {once:true});
      d.showModal();
    });
  }
  function subscribeLive(){
    if (channel) sb.removeChannel(channel);
    channel = sb.channel("hb-" + user.id)
      .on("postgres_changes", {event:"*", schema:"public", table:T, filter:`user_id=eq.${user.id}`}, p => { const r = p.new; if (r && r.kind) receive([r]); })
      .subscribe(st => { if (st === "SUBSCRIBED") catchUp(); });
  }
  let catching = false;
  async function catchUp(){
    if (!sb || !user || catching || state === "syncing") return;
    catching = true;
    try { await fillNewKinds(); const rows = await pull(meta.lastPull); if (rows.length) receive(rows); wr(META, meta); await flush(); if (state !== "saving") setState("ok"); }
    catch(e){ setState(navigator.onLine === false ? "offline" : "error", msg(e)); }
    finally { catching = false; }
  }
  let signing = null;
  async function afterSignIn(u){
    if (signing === u.id) return; signing = u.id; user = u;
    setState("syncing");
    try {
      const first = meta.userId !== u.id;
      if (first){ outbox = {}; wr(OUT, outbox); }
      if (first || meta.out || !meta.lastPull) await fullSync(first);
      else { const rows = await pull(meta.lastPull); if (rows.length) receive(rows); await fillNewKinds(); }
      meta.userId = u.id; meta.email = u.email; meta.out = false; wr(META, meta);
      runTouches(); wr(OUT, outbox);
      subscribeLive();
      setState("ok"); await flush();
      readyFns.forEach(f => { try { f(); } catch(e){ console.error(e); } });
    } catch(e){ signing = null; setState(navigator.onLine === false ? "offline" : "error", msg(e)); }
  }
  const readyFns = new Set();
  async function start(){
    cfg = rd(CFG, null);
    if (!cfg){ setState("off"); return; }
    setState("connecting");
    try {
      const mod = await import(SB_ESM);
      sb = mod.createClient(cfg.url, cfg.key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:"homebase.sb.auth"}});
    } catch(e){ sb = null; setState("error", "Couldn't load the Supabase library. Check your connection and reload."); return; }
    sb.auth.onAuthStateChange((ev, session) => {
      const u = session && session.user;
      if (u) setTimeout(() => afterSignIn(u), 0);
      else if (ev === "SIGNED_OUT"){ user = null; signing = null; setState("signedout"); }
    });
    const {data} = await sb.auth.getSession();
    if (data && data.session) afterSignIn(data.session.user); else if (!user) setState("signedout");
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && user) catchUp(); });
  addEventListener("online", () => { if (user) catchUp(); });
  setInterval(() => { if (user && Object.keys(outbox).length) flush(); }, 30000);
 
  const api = {
    register, touch, flush:() => { runTouches(); return flush(); },
    subscribe(f){ subs.add(f); return () => subs.delete(f); },
    onLocal(f){ localSubs.add(f); },
    onReady(f){ readyFns.add(f); if (user && state === "ok") f(); },
    start:() => started || (started = start()),
    get state(){ return state; }, get error(){ return err; },
    configured:() => !!cfg, config:() => cfg,
    user:() => user, client:() => sb, live:() => !!(sb && user),
    pending:() => Object.keys(outbox).length,
    setConfig(c){
      cfg = c; c ? wr(CFG, c) : localStorage.removeItem(CFG);
      started = null; sb = null; user = null; signing = null;
      if (channel){ try { channel.unsubscribe(); } catch(e){} channel = null; }
      return api.start();
    },
    async signIn(email, password){ const {error} = await sb.auth.signInWithPassword({email, password}); if (error) throw error; },
    async signUp(email, password){ const {data, error} = await sb.auth.signUp({email, password, options:{emailRedirectTo:location.origin + location.pathname}}); if (error) throw error; return !data.session; },
    async magicLink(email){ const {error} = await sb.auth.signInWithOtp({email, options:{emailRedirectTo:location.origin + location.pathname}}); if (error) throw error; },
    async signOut(){
      runTouches(); await flush();
      if (channel){ try { await sb.removeChannel(channel); } catch(e){} channel = null; }
      await sb.auth.signOut(); user = null; signing = null;
      outbox = {}; wr(OUT, outbox); meta.out = true; wr(META, meta); setState("signedout");
    },
    async syncNow(){ if (!user) return; runTouches(); await catchUp(); },
    statusText(){
      const p = Object.keys(outbox).length;
      switch (state){
        case "off": return "Saved in this browser. Turn on sync in Settings to use Homebase on your phone too.";
        case "connecting": return "Connecting to sync…";
        case "signedout": return "Signed out of sync. Saved in this browser.";
        case "syncing": return "Syncing…";
        case "saving": return "Saving to the cloud…";
        case "offline": return `Offline. ${p ? plural(p, "change") + " will sync" : "Changes will sync"} when you're back online.`;
        case "error": return `Sync problem: ${err}`;
        default: return `Synced${user && user.email ? " as " + user.email : ""}.`;
      }
    },
  };
  return api;
})();
 
/* A small synced key → record store, used by links, lifts, facts and app data. */
function DocStore(lsKey, kind, seed){
  let map = {};
  map = HBStore.get(lsKey, null) || {};   // lsKey is the storage key (the name is from when this lived in localStorage)
  const seeds = seed ? seed() : [];
  for (const s of seeds) if (!map[s.id]) map[s.id] = s;
  const subs = new Set();
  let warned = false;
  const persist = () => { if (!HBStore.set(lsKey, map) && HBStore.mode === "local" && !warned){ warned = true; setTimeout(() => toast("This browser's storage is full. Remove big uploaded HTML files or old data."), 0); } };
  const emit = () => subs.forEach(f => { try { f(); } catch(e){ console.error(e); } });
  const api = {
    kind,
    all: () => Object.values(map),
    get: id => map[id] ? map[id].d : null,
    put(id, d){ map[id] = {id, d, _m:Date.now()}; persist(); Sync.touch(kind); emit(); },
    putMany(list){ const t = Date.now(); for (const [id, d] of list) map[id] = {id, d, _m:t}; persist(); Sync.touch(kind); emit(); },
    del(id){ if (!map[id]) return; delete map[id]; persist(); Sync.touch(kind); emit(); },
    delMany(ids){ let any = false; for (const id of ids) if (map[id]){ delete map[id]; any = true; } if (any){ persist(); Sync.touch(kind); emit(); } },
    subscribe(f){ subs.add(f); return () => subs.delete(f); },
  };
  Sync.register(kind, {
    all: api.all, m: o => +o._m || 0, persist,
    seedOnly: () => Object.keys(map).every(id => seeds.some(s => s.id === id)),
    apply(u, d){ for (const o of u) if (o && o.id) map[o.id] = {id:o.id, d:o.d, _m:+o._m || 0}; for (const id of d) delete map[id]; persist(); emit(); },
  });
  return api;
}
 
/* Items are kept in the browser's IndexedDB through HBStore (js/storage.js). */
const LocalAdapter = {
  KEY: "homebase.items.v2",
  LEGACY: "homebase.events.v1",   // old format, left in place untouched as a backup
  async load(){
    const items = HBStore.get(this.KEY);
    if (Array.isArray(items)) return {items};
    const old = HBStore.get(this.LEGACY);
    if (Array.isArray(old)) return {items: old, migrated: true};
    return {items: null};
  },
  async upsert(records, all){ if (!HBStore.set(this.KEY, all)) throw new Error("Not saved in this browser"); },
  async remove(ids, all){ if (!HBStore.set(this.KEY, all)) throw new Error("Not saved in this browser"); },
};
 
/* Brings any record (including the old v1 format) up to the current shape. */
function normalize(r){
  const nowIso = new Date().toISOString();
  let type = r.type === "Class" ? "Lecture" : r.type;           // v1 "Class" → "Lecture"
  if (!allTypes().includes(type)) type = "Other";
  const course = String(r.course || "").trim();
  const category = r.category || ((course || !["Event","Task"].includes(type)) ? "School" : "Personal");
  const completed = !!(r.completed ?? r.done);                    // v1 used "done"
  const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : todayS();
  const out = {
    id: r.id || uid(),
    title: String(r.title || "").trim() || "Untitled",
    category,
    course: catDef(category).hasCourse ? course : "",
    type, date,
    time: /^\d{2}:\d{2}$/.test(r.time || "") ? r.time : "",
    endTime: isSchedType(type) && /^\d{2}:\d{2}$/.test(r.time || "") && /^\d{2}:\d{2}$/.test(r.endTime || "") && r.endTime > r.time ? r.endTime : "",
    seriesId: r.seriesId || null,
    repeat: r.seriesId && r.repeat && Array.isArray(r.repeat.days) ? {days: r.repeat.days.map(Number).filter(n => n >= 0 && n <= 6), until: String(r.repeat.until || "")} : null,
    location: String(r.location || "").trim(),
    reading: String(r.reading || "").trim(),
    lectureNumber: r.lectureNumber !== null && r.lectureNumber !== "" && Number.isFinite(+r.lectureNumber) && +r.lectureNumber > 0 ? Math.round(+r.lectureNumber) : null,
    priority: PRIORITIES.includes(r.priority) ? r.priority : "None",
    flagged: !!r.flagged,
    notes: String(r.notes || ""),
    subtasks: Array.isArray(r.subtasks) ? r.subtasks.map(s => ({id: s.id || uid(), text: String(s.text || ""), done: !!s.done})) : [],
    /* null = use the default reminder for this type (Settings → Reminders); [] = none.
       Each is {id, off: minutes before} or {id, at: "YYYY-MM-DDTHH:MM"}. */
    reminders: Array.isArray(r.reminders) ? r.reminders.filter(x => x && (Number.isFinite(+x.off) && x.off !== null && x.off !== "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.at || ""))).slice(0, 8)
      .map(x => /^\d{4}/.test(x.at || "") ? {id: String(x.id || uid()), at: x.at} : {id: String(x.id || uid()), off: Math.max(0, Math.round(+x.off))}) : null,
    todo: typeof r.todo === "boolean" ? r.todo : null,   // null = follow the type's to-do setting
    completed,
    completedAt: completed ? (r.completedAt || `${date}T12:00:00`) : null,
    deletedAt: r.deletedAt || null,
    createdAt: r.createdAt || nowIso,
    updatedAt: r.updatedAt || nowIso,
  };
  if (r.sample) out.sample = true;
  return out;
}
 
const Store = (() => {
  let adapter = LocalAdapter, cache = [], persistent = true;
  const subs = new Set();
  const emit = () => subs.forEach(f => { try { f(); } catch(e){ console.error(e); } });
  const nowIso = () => new Date().toISOString();
  async function write(kind, payload){
    try { await adapter[kind](payload, cache); if (!persistent){ persistent = true; emit(); } }
    catch(e){ console.warn("Save failed:", e); if (persistent){ persistent = false; emit(); } }
  }
  const api = {
    async init(a){
      if (a) adapter = a;
      let res;
      try { res = await adapter.load(); } catch(e){ persistent = false; res = {items: null}; }
      cache = (res.items || seed()).map(normalize);
      if (!res.items || res.migrated) await write("upsert", cache);
      api.purgeExpired();
      emit();
    },
    get persistent(){ return persistent; },
    subscribe(f){ subs.add(f); return () => subs.delete(f); },
    all(){ return cache.filter(r => !r.deletedAt); },
    deleted(){ return cache.filter(r => r.deletedAt); },
    get(id){ return cache.find(r => r.id === id); },
    create(data){ return api.createMany([data])[0]; },
    createMany(list){
      const made = list.map(d => normalize({...d, id: uid(), createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null}));
      cache.push(...made); write("upsert", made); emit(); return made;
    },
    update(id, patch){ return api.updateMany([id], () => patch)[0]; },
    /* fn(record) returns a patch. Completing sets completedAt; un-completing clears it. */
    updateMany(ids, fn){
      const set = new Set(ids), changed = [];
      cache = cache.map(r => {
        if (!set.has(r.id)) return r;
        const p = (typeof fn === "function" ? fn(r) : fn) || {};
        const m = {...r, ...p, updatedAt: nowIso()};
        if (m.completed && !r.completed && !p.completedAt) m.completedAt = nowIso();
        if (!m.completed) m.completedAt = null;
        const n = normalize(m); changed.push(n); return n;
      });
      if (changed.length){ write("upsert", changed); emit(); }
      return changed;
    },
    /* Replace whole records (used for undo). */
    put(records){
      const map = new Map(records.map(r => [r.id, normalize({...r, updatedAt: nowIso()})]));
      cache = cache.map(r => map.get(r.id) || r);
      for (const [id, r] of map) if (!cache.some(x => x.id === id)) cache.push(r);
      write("upsert", [...map.values()]); emit();
    },
    /* Records from another device (see Sync). Keeps their timestamps; saves locally only. */
    applyRemote(records, removedIds = []){
      const gone = new Set(removedIds), map = new Map(records.map(r => [r.id, normalize(r)]));
      cache = cache.filter(r => !gone.has(r.id)).map(r => map.get(r.id) || r);
      for (const [id, r] of map) if (!cache.some(x => x.id === id)) cache.push(r);
      write("upsert", []); emit();
    },
    remove(ids){ const t = nowIso(); return api.updateMany(ids, () => ({deletedAt: t})); },
    restore(ids){ return api.updateMany(ids, () => ({deletedAt: null})); },
    purge(ids){
      const set = new Set(ids); cache = cache.filter(r => !set.has(r.id));
      write("remove", [...set]); emit();
    },
    purgeExpired(){
      const cutoff = Date.now() - PURGE_DAYS * MS_DAY;
      const ids = cache.filter(r => r.deletedAt && new Date(r.deletedAt).getTime() < cutoff).map(r => r.id);
      if (ids.length) api.purge(ids);
    },
  };
  return api;
})();
 
/* =====================================================================
   SETTINGS (theme, course colors). Kept apart from items; it can sync
   the same way later by swapping save/load for an adapter.
   ===================================================================== */
const Settings = (() => {
  const KEY = "homebase.settings.v1";
  const defaults = () => ({theme:{mode:"auto", lightAt:"07:00", darkAt:"22:00", override:null}, courseColors:{}, importProfiles:{},
    ai:{mode:"off", localUrl:"http://localhost:11434", localModel:"llama3.1", claudeModel:"claude-sonnet-5-5"}, mail:{account:"gmail"}, screens:null, myColors:[], calFilter:"both",
    facts:{topics:["Electrical engineering","Energy & power systems","Space","History"], perDay:3, model:""},
    remind:{topic:"", server:"https://ntfy.sh", dayTime:"09:00", defaults:{Exam:[1440], Quiz:[1440]}}, types:{custom:[], todo:{}, hidden:[], order:null, main:6}});   // no API keys in here; see AI module
  const hydrate = p => { const s = defaults(); if (!p) return s;
    return {...s, ...p, theme:{...s.theme, ...(p.theme || {})}, courseColors:{...(p.courseColors || {})}, importProfiles:{...(p.importProfiles || {})}, ai:{...s.ai, ...(p.ai || {})}, mail:{...s.mail, ...(p.mail || {})},
      facts:{...s.facts, ...(p.facts || {})}, types:{...(p.types || {}), custom:[...((p.types && p.types.custom) || [])], todo:{...((p.types && p.types.todo) || {})}, hidden:[...((p.types && p.types.hidden) || [])]}, remind:{...s.remind, ...(p.remind || {}), defaults:{...((p.remind && p.remind.defaults) || s.remind.defaults)}}}; };
  let s;
  try { s = hydrate(HBStore.get(KEY, null)); } catch(e){ s = hydrate(null); }
  /* Settings live in IndexedDB. Only the theme is copied to localStorage, because the snippet in index.html's
     <head> needs it before the page draws (so there's no light/dark flash). */
  const saveTheme = () => { try { localStorage.setItem("homebase.theme.v1", JSON.stringify(s.theme)); } catch(e){} };
  const save = () => { HBStore.set(KEY, s); saveTheme(); };
  saveTheme();
  const hooks = new Set();
  return {
    get: () => s,
    update(fn){ fn(s); s._m = Date.now(); save(); Sync.touch("settings"); },
    /* settings that came from another device */
    replace(p){ s = hydrate(p); save(); hooks.forEach(f => { try { f(); } catch(e){ console.error(e); } }); },
    onReplace(f){ hooks.add(f); },
  };
})();
 
/* Notes color: picked in Settings; sets --h-notes for light and dark. */
const NOTE_COLORS = [["blue","Blue","#2563EB","#60A5FA"],["sky","Sky","#0284C7","#38BDF8"],["teal","Teal","#0D9488","#2DD4BF"],["green","Green","#16A34A","#4ADE80"],["sage","Sage","#4F7F67","#8FC1A9"],["amber","Amber","#CA8A04","#FACC15"],["orange","Orange","#EA580C","#FB923C"],["coral","Coral","#E0533F","#FF8A7A"],["rose","Rose","#D6457A","#F48FB1"],["violet","Violet","#7C3AED","#A78BFA"],["indigo","Indigo","#4F46E5","#818CF8"],["slate","Slate","#475569","#94A3B8"]];
function applyNotesColor(){
  const c = NOTE_COLORS.find(x => x[0] === Settings.get().notesColor) || NOTE_COLORS[0];
  let el = document.getElementById("nt-color-css"); if (!el){ el = document.createElement("style"); el.id = "nt-color-css"; document.head.appendChild(el); }
  el.textContent = `:root{--h-notes:${c[2]}}:root[data-theme="dark"]{--h-notes:${c[3]}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--h-notes:${c[3]}}}`;
}
applyNotesColor();
 
/* Course colors: each course gets its own slot (least-used first) and keeps it. Changeable in Settings. */
function courseIndex(c){
  const key = String(c || "").trim(); if (!key) return -1;
  const map = Settings.get().courseColors;
  if (!(key in map)){
    const used = Object.values(map); let best = 0, bestN = Infinity;
    for (let i = 0; i < COURSE_COLORS; i++){ const n = used.filter(x => x === i).length; if (n < bestN){ best = i; bestN = n; } }
    Settings.update(st => { st.courseColors[key] = best; });
  }
  return Settings.get().courseColors[key];
}
function courseColor(c){ const i = courseIndex(c); return i < 0 ? "var(--t-other)" : `var(--c${i + 1})`; }
 
/* Theme: Automatic (time of day), Light, Dark, or Match device. A manual switch on Automatic lasts until the next scheduled change. */
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const toMin = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return h*60 + m; };
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
const fmtClock = iso => new Date(iso).toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"});
function scheduledTheme(d = new Date()){
  const {lightAt, darkAt} = Settings.get().theme, c = d.getHours()*60 + d.getMinutes(), L = toMin(lightAt), D = toMin(darkAt);
  if (L === D) return "light";
  return (L < D ? (c >= L && c < D) : (c >= L || c < D)) ? "light" : "dark";
}
function nextSwitch(d = new Date()){
  const {lightAt, darkAt} = Settings.get().theme; let best = null;
  for (const t of [lightAt, darkAt]){ const [h, m] = t.split(":").map(Number); const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m); if (x <= d) x.setDate(x.getDate() + 1); if (!best || x < best) best = x; }
  return best;
}
function overrideActive(){ const th = Settings.get().theme; return th.mode === "auto" && th.override && new Date(th.override.until) > new Date(); }
function currentTheme(){
  const th = Settings.get().theme;
  if (th.mode === "light" || th.mode === "dark") return th.mode;
  if (th.mode === "system") return mq && mq.matches ? "dark" : "light";
  return overrideActive() ? th.override.theme : scheduledTheme();
}
function applyTheme(){
  const th = Settings.get().theme;
  if (th.override && !overrideActive()) Settings.update(st => { st.theme.override = null; });
  const t = currentTheme();
  document.documentElement.dataset.theme = t;
  if (window.HB_onTheme) window.HB_onTheme(t);
  const b = $("#btn-theme"); b.innerHTML = t === "dark" ? SUN : MOON;
  b.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode"; b.setAttribute("aria-label", b.title);
  if ($("#dlg-settings").open) renderSettings();
  if (ready) Home.render();
}
function toggleTheme(){
  const th = Settings.get().theme, next = currentTheme() === "dark" ? "light" : "dark";
  Settings.update(st => {
    if (th.mode === "auto") st.theme.override = next === scheduledTheme() ? null : {theme:next, until:nextSwitch().toISOString()};
    else st.theme.mode = next;
  });
  applyTheme();
  const o = Settings.get().theme.override;
  toast(o ? `${cap(next)} mode until ${fmtClock(o.until)}, then back to the schedule` : `${cap(next)} mode`);
}
if (mq && mq.addEventListener) mq.addEventListener("change", applyTheme);
 
function renderSettings(){
  if (ready) $("#st-hs-name").textContent = Home.activeName();
  const th = Settings.get().theme, t = currentTheme(), ov = overrideActive();
  $$("#st-mode [data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === th.mode)));
  $("#st-sched").hidden = th.mode !== "auto";
  $("#st-light").value = th.lightAt; $("#st-dark").value = th.darkAt;
  $("#st-status").textContent = th.mode === "auto"
    ? (ov ? `${cap(t)} for now (switched by hand). Back to the schedule at ${fmtClock(th.override.until)}.` : `${cap(t)} now, on schedule. Next change at ${fmtClock(nextSwitch().toISOString())}.`)
    : th.mode === "system" ? `Following your device, currently ${t}.` : `Always ${t}.`;
  $("#st-resume").hidden = !ov;
  const courses = allCourses();
  $("#st-courses").innerHTML = courses.length ? courses.map(c => { const ci = courseIndex(c);
    return `<div class="cc-row"><span class="cc-name" style="--cc:${courseColor(c)}">${esc(c)}</span><div class="sws" role="group" aria-label="Color for ${esc(c)}">${Array.from({length:COURSE_COLORS}, (_, k) => `<button type="button" class="sw" style="--sc:var(--c${k+1})" data-course="${esc(c)}" data-ci="${k}" aria-pressed="${k === ci}" aria-label="Color ${k+1}"></button>`).join("")}</div></div>`; }).join("")
    : `<p class="note">Courses show up here once you add school items.</p>`;
  const nc = Settings.get().notesColor || "blue";
  $("#st-ncolor").innerHTML = NOTE_COLORS.map(([k, n, l, d]) => `<button type="button" data-nc="${k}" aria-pressed="${k === nc}" style="--nc:${currentTheme() === "dark" ? d : l}"><i></i>${n}</button>`).join("");
  renderAISettings();
  renderCloud(); renderLinkSettings(); renderTypeSettings(); Facts.renderSettingsSec(); Rem.renderSettingsSec(); Files.renderSettingsSec();
}
$("#st-ncolor").addEventListener("click", e => { const b = e.target.closest("[data-nc]"); if (!b) return; Settings.update(st => { st.notesColor = b.dataset.nc; }); applyNotesColor(); renderSettings(); });
$("#btn-theme").onclick = toggleTheme;
$("#btn-settings").onclick = () => openSettings();
$("#st-mode").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; Settings.update(st => { st.theme.mode = b.dataset.mode; st.theme.override = null; }); applyTheme(); renderSettings(); });
[["#st-light","lightAt"],["#st-dark","darkAt"]].forEach(([id, k]) => $(id).addEventListener("change", e => {
  if (!e.target.value) return renderSettings();
  Settings.update(st => { st.theme[k] = e.target.value; st.theme.override = null; }); applyTheme(); renderSettings();
}));
$("#st-resume").onclick = () => { Settings.update(st => { st.theme.override = null; }); applyTheme(); renderSettings(); };
$("#st-courses").addEventListener("click", e => { const b = e.target.closest("[data-ci]"); if (!b) return; Settings.update(st => { st.courseColors[b.dataset.course] = +b.dataset.ci; }); renderSettings(); if (ready) renderAll(); });
 
function seed(){
  const t = todayS();
  const S = (title, course, type, d, time, x={}) => ({title, category:"School", course, type, date:addDays(t,d), time, sample:true, ...x});
  const P = (title, type, d, time, x={}) => ({title, category:"Personal", course:"", type, date:addDays(t,d), time, sample:true, ...x});
  return [
    S("Homework 9: Fourier series","ECE 30100","Homework",0,"23:59",{priority:"High", notes:"Part (c) uses the trigonometric form."}),
    S("Signals lecture","ECE 30100","Lecture",0,"10:30",{endTime:"11:20"}),
    S("Lab 6 report","ECE 32100","Lab",1,"17:00",{priority:"Medium"}),
    S("Quiz 5","MA 26600","Quiz",2,"09:30"),
    S("Read Ch. 7: transformers","ECE 32100","Reading",3,""),
    S("Problem set 8","ECE 30200","Homework",4,"23:59"),
    S("Midterm 2","ECE 32100","Exam",8,"20:00",{endTime:"22:00", priority:"High", flagged:true}),
    S("Design project check-in","ECE 30100","Project",11,"",{subtasks:[{text:"Block diagram",done:true},{text:"Parts list"},{text:"Slides"}]}),
    S("Homework 10","ECE 30100","Homework",15,"23:59"),
    S("Lab 5 report","ECE 32100","Lab",-3,"17:00",{completed:true}),
    P("Renew parking permit","Task",-1,"",{priority:"Medium"}),
    P("Laundry","Task",2,""),
    P("IEEE PES plant tour","Event",5,"13:00",{endTime:"16:00"}),
  ];
}
 
/* =====================================================================
   DERIVED VIEWS OF THE DATA
   ===================================================================== */
const isTodo = r => r.type !== "No Class" && (typeof r.todo === "boolean" ? r.todo : typeTodo(r.type));
const doneToday = r => r.completed && r.completedAt && ymd(new Date(r.completedAt)) === todayS();
const isActive = r => !r.completed || doneToday(r);          // checked items linger until midnight
const itemColor = r => { const c = catDef(r.category); return c.hasCourse ? courseColor(r.course) : (c.color || "var(--pers)"); };
const isOutline = r => catDef(r.category).look === "outline";
const catLabel = r => catDef(r.category).hasCourse ? (r.course || r.category) : r.category;
const listSort = (a,b) => a.date.localeCompare(b.date) || (a.time||"99").localeCompare(b.time||"99") || PRI_RANK[b.priority]-PRI_RANK[a.priority] || a.title.localeCompare(b.title);
const calSort = (a,b) => (b.type === "No Class") - (a.type === "No Class") || (a.time||"").localeCompare(b.time||"") || PRI_RANK[b.priority]-PRI_RANK[a.priority] || a.title.localeCompare(b.title);
const isScheduled = r => isSchedType(r.type);
const isNoClass = r => r.type === "No Class";
const timeRange = r => r.time ? (r.endTime ? `${fmtTime(r.time)} – ${fmtTime(r.endTime)}` : fmtTime(r.time)) : "";
const seriesItems = id => Store.all().filter(r => r.seriesId === id).sort(listSort);
function seriesDates(start, days, until){
  if (!until || until < start) return [start];
  const set = new Set(days), out = []; let d = start;
  while (d <= until && out.length < MAX_OCC){ if (d === start || set.has(parseYmd(d).getDay())) out.push(d); d = addDays(d, 1); }
  return out;
}
function createSeries(base, days, until){
  const seriesId = uid(), repeat = {days:[...days].sort(), until};
  return Store.createMany(seriesDates(base.date, days, until).map(date => ({...base, date, seriesId, repeat, completed:false,
    subtasks:(base.subtasks || []).map(x => ({...x, id:uid(), done:false}))})));
}
function allCourses(){ return [...new Set(Store.all().map(r => r.course).filter(Boolean))].sort(); }
function itemsByDate(cf = "both"){ const m = {}; for (const r of Store.all()){ const sc = catDef(r.category).hasCourse; if ((cf === "school" && !sc) || (cf === "personal" && sc)) continue; (m[r.date] ||= []).push(r); } for (const k in m) m[k].sort(calSort); return m; }
function relLabel(n){ if (n<0) return [`${-n} day${n===-1?"":"s"} late`,"over"]; if (n===0) return ["Today","today"]; if (n===1) return ["Tomorrow","soon"]; if (n<=3) return [`In ${n} days`,"soon"]; return [`In ${n} days`,""]; }
 
const IC = {
  today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/></svg>',
  week:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8 15h8"/></svg>',
  scheduled:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
  overdue:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
  flagged:'<svg viewBox="0 0 24 24"><path d="M6 21V4h10l-1.5 3.5L16 11H6" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  all:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  history:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  completed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
};
const FLAG = '<svg class="flag" viewBox="0 0 24 24" role="img" aria-label="Flagged"><path d="M6 21V4h10l-1.5 3.5L16 11H6" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
 
const recentDone = r => r.completed && r.completedAt && Date.now() - new Date(r.completedAt).getTime() < MS_DAY;   // checked off within the last 24 hours
const SMART = [
  {k:"all",       name:"All",       color:"var(--accent-2)", test:r => true, empty:"Nothing on your list.", group:true, catFilter:true},
  {k:"today",     name:"Today",     color:"var(--c1)",       test:r => r.date === todayS(), empty:"Nothing due today."},
  {k:"week",      name:"This Week", color:"var(--c3)",       test:r => { const ws = ymd(weekStart(new Date())); return r.date >= ws && r.date <= addDays(ws, 6); }, empty:"Nothing due this week.", group:true},
  {k:"overdue",   name:"Overdue",   color:"var(--bad)",      test:r => r.date < todayS(), empty:"You're all caught up.", group:true},
  {k:"completed", name:"Completed", color:"var(--ok)",       test:recentDone, empty:"Nothing checked off in the last 24 hours.", completedList:true,
    note:"Things you checked off in the last 24 hours. After that they move to Completion history."},
];
/* Older completions: a log, so something checked off by mistake can still be found and unchecked. */
const HISTORY = {k:"history", name:"Completion history", color:"var(--muted)", test:r => r.completed && !recentDone(r), empty:"Nothing here yet. Items show up here a day after you check them off.", completedList:true,
  note:"Everything checked off more than 24 hours ago, newest first. Uncheck anything that was marked done by mistake."};
const listDef = k => k === "history" ? HISTORY : (SMART.find(x => x.k === k) || SMART[0]);
function smartItems(k){
  const s = listDef(k);
  let list = Store.all().filter(isTodo).filter(s.test);
  if (s.catFilter && todoState.cat) list = list.filter(r => r.category === todoState.cat);
  if (k === "history" && todoState.q){ const q = todoState.q.toLowerCase(); list = list.filter(r => [r.title, r.course, r.type, r.category, r.notes, r.location].join(" ").toLowerCase().includes(q)); }
  if (s.completedList) return list.sort((a,b) => (b.completedAt||"").localeCompare(a.completedAt||""));
  return list.filter(isActive).sort(listSort);
}
const smartCount = k => { const s = listDef(k); const l = smartItems(k); return s.completedList ? l.length : l.filter(r => !r.completed).length; };