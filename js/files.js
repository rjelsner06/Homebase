Claude
Files · JS
/* Homebase: FILES (Supabase Storage) and Settings → Storage.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html.
 
   Each file lives in your private Supabase bucket "hb-files", in a folder named after your user id:
     hb-files/<your user id>/<fileId>/<file name>
   Its details (name, type, size, path…) are a normal synced record of kind "file", so every device
   knows about every file. Files you open are also kept in this browser (IndexedDB) for offline viewing.
 
   Files.upload(file, extra?)  → {fileId, path, size, type, name}   (extra: anything else to store with it, e.g. {folderId})
   Files.getUrl(fileId, opts?) → a signed link that works for an hour (opts: {expiresIn: seconds, download: true})
   Files.open(fileId)          → {blob, meta, cached}   (from this device if saved here, else downloaded and saved)
   Files.delete(fileId)        → removes the file from Supabase, its record, and this device's copy
   Files.list() / Files.get(fileId) → file records */
"use strict";
 
const FileMeta = DocStore("homebase.files.v1", "file");
const Files = (() => {
  const BUCKET = "hb-files", MB = 1024 * 1024, MAX_FILE = 50 * MB;
  const LIMIT = {db:500 * MB, files:1024 * MB, ls:5 * MB}, WARN_AT = 0.8;
  const TYPES = {pdf:"application/pdf", docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation", xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc:"application/msword", ppt:"application/vnd.ms-powerpoint", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp",
    txt:"text/plain", csv:"text/csv", md:"text/markdown", html:"text/html", json:"application/json", zip:"application/zip"};
 
  const fmtBytes = n => { n = +n || 0; if (n < 1024) return n + " B"; if (n < MB) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    if (n < 1024 * MB) return (n / MB).toFixed(n < 10 * MB ? 1 : 0) + " MB"; return (n / 1024 / MB).toFixed(2) + " GB"; };
  const guessType = name => TYPES[(String(name).split(".").pop() || "").toLowerCase()] || "application/octet-stream";
  /* Supabase only allows plain characters in file paths; the real name is kept in the record. */
  const safeName = n => { const s = String(n || "file").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, ""); return (s || "file").slice(-120); };
  const get = id => { const d = FileMeta.get(id); return d && d.path ? {fileId:id, ...d} : null; };
  const list = () => FileMeta.all().filter(o => o.d && o.d.path).map(o => ({fileId:o.id, ...o.d})).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  function need(){
    const sb = Sync.client(), u = Sync.user();
    if (!sb || !u) throw new Error("Sign in to sync first (Settings → Account & sync). Files are kept in your Supabase project.");
    return {sb, u};
  }
  function friendly(e){
    const m = String((e && (e.message || e.error || e.statusText)) || e || "");
    if (/bucket not found/i.test(m)) return new Error("The hb-files bucket doesn't exist yet. Do step 1 of the Supabase storage setup.");
    if (/row-level security|row level security|violates|Unauthorized|permission/i.test(m)) return new Error("Supabase refused this. Check step 2 (bucket policies) of the Supabase storage setup.");
    if (/exceeded the maximum|too large|payload/i.test(m)) return new Error("That file is too big for Supabase. The limit is 50 MB per file.");
    if (/already exists|duplicate/i.test(m)) return new Error("A file is already stored at that spot. Try again.");
    if (/failed to fetch|networkerror|network|load failed/i.test(m)) return new Error("Couldn't reach Supabase. Check your connection.");
    return new Error(m || "Something went wrong with the file.");
  }
 
  /* ---------- the helper ---------- */
  async function upload(file, extra = {}){
    const {sb, u} = need();
    if (!file || typeof file.size !== "number") throw new Error("Pick a file first.");
    const name = file.name || "file";
    if (file.size > MAX_FILE) throw new Error(`“${name}” is ${fmtBytes(file.size)}. The limit is 50 MB per file.`);
    const used = numbers().files.used;
    if (used + file.size > LIMIT.files) throw new Error(`Not enough file storage left for “${name}”: ${fmtBytes(Math.max(0, LIMIT.files - used))} free of 1 GB.`);
    const fileId = "f" + uid(), type = file.type || guessType(name), path = `${u.id}/${fileId}/${safeName(name)}`;
    const {error} = await sb.storage.from(BUCKET).upload(path, file, {contentType:type, upsert:false, cacheControl:"3600"});
    if (error) throw friendly(error);
    FileMeta.put(fileId, {...extra, name, type, size:file.size, path, bucket:BUCKET, createdAt:new Date().toISOString()});
    await HBStore.filePut(fileId, file, {name, type});   // you already have it, so keep it here for offline viewing (never throws)
    U.at = 0;
    return {fileId, path, size:file.size, type, name};
  }
  const urls = new Map();
  async function getUrl(fileId, opts = {}){
    const m = get(fileId); if (!m) throw new Error("That file isn't in Homebase anymore.");
    const {sb} = need(), exp = Math.max(60, opts.expiresIn || 3600), key = fileId + (opts.download ? ":d" : "") + ":" + exp;
    const c = urls.get(key); if (c && c.until > Date.now() + 60000) return c.url;
    const {data, error} = await sb.storage.from(m.bucket || BUCKET).createSignedUrl(m.path, exp, opts.download ? {download:m.name} : undefined);
    if (error) throw friendly(error);
    urls.set(key, {url:data.signedUrl, until:Date.now() + exp * 1000});
    return data.signedUrl;
  }
  async function open(fileId){
    const m = get(fileId); if (!m) throw new Error("That file isn't in Homebase anymore.");
    const hit = await HBStore.fileGet(fileId);
    if (hit) return {blob:hit.blob, meta:m, cached:true};
    if (!Sync.client() || !Sync.user()) throw new Error(navigator.onLine === false ? "You're offline, and this file isn't saved on this device yet." : "Sign in to sync to open this file.");
    const {data, error} = await Sync.client().storage.from(m.bucket || BUCKET).download(m.path);
    if (error) throw friendly(error);
    const blob = data.type && data.type !== "application/octet-stream" ? data : new Blob([data], {type:m.type || guessType(m.name)});
    await HBStore.filePut(fileId, blob, {name:m.name, type:m.type});
    return {blob, meta:m, cached:false};
  }
  async function remove(fileId){
    const m = get(fileId); if (!m) return;
    const {sb} = need();
    const {error} = await sb.storage.from(m.bucket || BUCKET).remove([m.path]);
    if (error && !/not found/i.test(error.message || "")) throw friendly(error);
    FileMeta.del(fileId); await HBStore.fileDel(fileId);
    for (const k of [...urls.keys()]) if (k.startsWith(fileId + ":")) urls.delete(k);
    U.at = 0;
  }
  /* a file deleted on another device: drop this device's saved copy too */
  function pruneCache(){ const idx = HBStore.fileIndex(); for (const id of Object.keys(idx)) if (!FileMeta.get(id)) HBStore.fileDel(id); }
 
  /* ---------- usage ---------- */
  const U = {at:0, busy:null, cloud:null, cloudErr:"", est:null, persisted:null};
  /* Asks the browser how much space this site uses, and Supabase how big the project is (needs hb_usage(), step 3 of the setup). */
  function measure(){
    if (U.busy) return U.busy;
    U.busy = (async () => {
      try { U.est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch(_){ U.est = null; }
      try { U.persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch(_){}
      if (Sync.live()){
        try {
          const {data, error} = await Sync.client().rpc("hb_usage");
          if (error) throw error;
          U.cloud = typeof data === "string" ? JSON.parse(data) : data; U.cloudErr = "";
        } catch(e){ U.cloud = null; const m = (e && (e.message || e.code)) || String(e); U.cloudErr = /hb_usage|PGRST202|could not find|does not exist/i.test(m) ? "missing" : m; }
      } else { U.cloud = null; U.cloudErr = "signedout"; }
      U.at = Date.now();
    })().finally(() => { U.busy = null; if ($("#dlg-settings").open) renderSettingsSec(true); });
    return U.busy;
  }
  const NOT_RECORDS = new Set(["homebase.sync.outbox.v1", "homebase.sync.meta.v1", "homebase.filecache.v1", "homebase.usagewarn.v1", "homebase.events.v1"]);
  function numbers(){
    const b = HBStore.bytes(), records = Object.entries(b.by).filter(([k]) => !NOT_RECORDS.has(k)).reduce((n, [, v]) => n + v, 0);
    const idx = HBStore.fileIndex(), cachedN = Object.keys(idx).length, cached = Object.values(idx).reduce((n, x) => n + (+x.size || 0), 0);
    const mine = list().reduce((n, f) => n + (+f.size || 0), 0), c = U.cloud;
    const db = c ? {used:+c.db_bytes || 0, exact:true, mineBytes:+c.my_docs_bytes || 0, rows:+c.my_docs_rows || 0} : {used:records, exact:false};
    const files = {used:c ? +c.files_bytes || 0 : mine, exact:!!c, count:list().length};
    const mode = HBStore.mode;
    const local = mode === "local" ? {used:b.total, cap:LIMIT.ls, records:b.total, cached:0, cachedN:0}
      : {used:U.est && U.est.usage ? U.est.usage : b.total + cached, cap:U.est && U.est.quota ? U.est.quota : 0, records:b.total, cached, cachedN};
    return {db, files, local};
  }
  function overLimit(n = numbers()){
    const hit = [];
    if (n.db.used / LIMIT.db >= WARN_AT) hit.push("database");
    if (n.files.used / LIMIT.files >= WARN_AT) hit.push("file storage");
    if (n.local.cap && n.local.used / n.local.cap >= WARN_AT) hit.push("this browser's cache");
    return hit;
  }
  /* once in a while after sign-in: a heads-up when anything passes 80% */
  async function check(){
    await measure();
    const hit = overLimit(); if (!hit.length) return;
    if (Date.now() - (+HBStore.get("homebase.usagewarn.v1", 0) || 0) < 12 * 3600e3) return;
    HBStore.set("homebase.usagewarn.v1", Date.now());
    toast(`Storage is over 80% full (${hit.join(", ")}). See Settings → Storage.`);
  }
 
  /* ---------- Settings → Storage ---------- */
  let stMsg = "", busy = false;
  const day = t => new Date(t).toLocaleDateString(undefined, {month:"short", day:"numeric"});
  function meter(label, used, cap, capLabel, note){
    const p = cap ? Math.min(1, used / cap) : 0, cls = p >= .95 ? "full" : p >= WARN_AT ? "warn" : "";
    return `<div class="sg-row ${cls}"><div class="sg-top"><b>${esc(label)}</b><span class="mono">${fmtBytes(used)}${cap ? ` of ${capLabel || fmtBytes(cap)} · ${p < .01 && used ? "<1" : Math.round(p * 100)}%` : ""}</span></div>`
      + (cap ? `<div class="sg-bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="--p:${(p * 100).toFixed(2)}%"></i></div>` : "")
      + (note ? `<p class="note">${note}</p>` : "") + `</div>`;
  }
  function renderSettingsSec(noFetch){
    const box = $("#sg-box"); if (!box) return;
    if (!noFetch && Date.now() - U.at > 60000) measure();
    const n = numbers(), mode = HBStore.mode, inf = HBStore.info(), checking = !U.at && !!U.busy;
    const dbNote = n.db.exact ? `The whole Supabase project, measured by Supabase. Your Homebase records are ${fmtBytes(n.db.mineBytes)} of it (${n.db.rows} rows).`
      : checking ? "Checking…"
      : U.cloudErr === "missing" ? "About how big your records are, from this browser's copy. Run step 3 of the Supabase storage setup to see the real number."
      : U.cloudErr === "signedout" ? "About how big your records are, from this browser's copy. Sign in to sync for the real number."
      : `About how big your records are, from this browser's copy. (Couldn't ask Supabase: ${esc(U.cloudErr)})`;
    const filesNote = n.files.exact ? `All files in the Supabase project. ${plural(n.files.count, "file")} added from Homebase.` : `${plural(n.files.count, "file")} added from Homebase.`;
    const where = esc(location.origin.replace(/^https?:\/\//, ""));
    const localNote = mode === "idb"
      ? `IndexedDB for ${where}: your records ${fmtBytes(n.local.records)}, ${plural(n.local.cachedN, "saved file")} ${fmtBytes(n.local.cached)}. ${U.persisted ? "The browser has agreed to keep it." : "The browser could clear it if the device runs low on space; Supabase still has everything."}`
      : mode === "local" ? `localStorage for ${where}, which holds only about 5 MB. ${inf.migrateError ? "Moving to IndexedDB didn't work this time; Homebase tries again next time it opens." : "IndexedDB isn't available here."}`
      : `Nothing is being saved in this browser right now (IndexedDB couldn't open: ${esc(inf.openError || "unknown reason")}). Your data comes from Supabase. Reload to try again.`;
    const hit = overLimit(n);
    let h = (hit.length ? `<div class="sg-warn"><b>Over 80% full:</b> ${esc(hit.join(", "))}. ${hit.includes("this browser's cache") ? "Clear saved files below to free space here. " : ""}${hit.includes("file storage") ? "Delete files you no longer need. " : ""}${hit.includes("database") ? "Empty Recently Deleted and remove old data you don't need. " : ""}</div>` : "")
      + meter("Supabase database", n.db.used, LIMIT.db, "500 MB", dbNote)
      + meter("Supabase file storage", n.files.used, LIMIT.files, "1 GB", filesNote)
      + meter("This browser's cache", n.local.used, n.local.cap, n.local.cap ? "" : "", localNote);
 
    /* files */
    const fl = list(), idx = HBStore.fileIndex();
    h += `<div class="sg-row"><div class="sg-top"><b>Files</b><span class="mono">${fl.length}</span></div>`
      + (fl.length ? `<ul class="sg-files">${fl.map(f => `<li><span class="sg-fn"><b title="${esc(f.name)}">${esc(f.name)}</b><small>${fmtBytes(f.size)} · ${day(f.createdAt)}${idx[f.fileId] ? " · on this device" : ""}</small></span><span class="sg-fb"><button type="button" class="btn small" data-sg="open" data-id="${esc(f.fileId)}">Open</button><button type="button" class="btn small danger" data-sg="del" data-id="${esc(f.fileId)}">Delete</button></span></li>`).join("")}</ul>` : `<p class="note">No files yet.</p>`)
      + `<div class="rv-tools"><button type="button" class="btn small primary" data-sg="upload" ${busy ? "disabled" : ""}>Upload a file</button><span class="note" id="sg-st">${esc(stMsg)}</span></div>`
      + `<p class="note">Up to 50 MB each, kept in your private hb-files bucket in Supabase (only your account can read it). Files you open are also kept on this device, up to ${fmtBytes(HBStore.FILE_CACHE_MAX)}, so they open offline.</p></div>`;
 
    /* the old localStorage copy */
    const bk = HBStore.backupInfo(), f = bk.flag;
    if (mode === "idb" && f && f.verifiedAt && bk.keys.length && !f.backupRemovedAt)
      h += `<div class="sg-row"><div class="sg-top"><b>Old copy in localStorage</b><span class="mono">${fmtBytes(bk.bytes)}</span></div><p class="note">Your data moved to IndexedDB on ${day(f.migratedAt)}. The old copy stays as a backup until Homebase has reloaded fine from the new cache${bk.until ? `, around ${day(bk.until)}` : ""}.</p>`
        + `<div class="rv-tools"><button type="button" class="btn small" data-sg="bkdl">Download old copy</button><button type="button" class="btn small ghost danger" data-sg="bkrm">Remove it now</button></div></div>`;
 
    h += `<div class="rv-tools"><button type="button" class="btn small" data-sg="refresh">Check again</button><button type="button" class="btn small ghost" data-sg="clear" ${n.local.cachedN ? "" : "disabled"}>Remove saved files from this device</button></div>`
      + `<p class="note">Live Server (127.0.0.1:5500) and GitHub Pages count as different sites, so each keeps its own cache. Both fill themselves from Supabase after you sign in.</p>`;
    box.innerHTML = h;
  }
  const say = t => { stMsg = t; const el = $("#sg-st"); if (el) el.textContent = t; };
  $("#sg-box").addEventListener("click", async e => {
    const b = e.target.closest("[data-sg]"); if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.sg){
      case "upload": $("#sg-file").click(); return;
      case "open": {
        /* open the new tab right away (a phone blocks tabs opened after waiting), then fill it in */
        const w = window.open("", "_blank");
        try { if (w) w.document.body.innerHTML = '<p style="font:15px -apple-system,system-ui,sans-serif;padding:24px">Opening…</p>'; } catch(_){}
        try {
          const {blob} = await open(id), url = URL.createObjectURL(blob);
          if (w) w.location.href = url; else { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
          setTimeout(() => URL.revokeObjectURL(url), 10 * 60000);
          renderSettingsSec(true);
        } catch(err){ try { if (w) w.close(); } catch(_){} say(err.message); }
        return;
      }
      case "del": {
        const f = get(id); if (!f) return;
        if (!(await confirmBox({title:`Delete “${trunc(f.name, 40)}”?`, body:"It's removed from Supabase and from all your devices. This can't be undone.", ok:"Delete"}))) return;
        try { await remove(id); say(""); toast(`Deleted “${trunc(f.name, 30)}”`); renderSettingsSec(); } catch(err){ say(err.message); }
        return;
      }
      case "refresh": U.at = 0; say(""); await measure(); return;
      case "clear": await HBStore.fileClear(); U.at = 0; renderSettingsSec(); toast("Saved files removed from this device"); return;
      case "bkdl": downloadText(`homebase-localstorage-backup-${todayS()}.json`, JSON.stringify(HBStore.backupData(), null, 1), "application/json"); return;
      case "bkrm":
        if (!(await confirmBox({title:"Remove the old copy?", body:"Your data is already in IndexedDB on this browser and in Supabase. This frees the old localStorage space.", ok:"Remove"}))) return;
        HBStore.removeBackup(); renderSettingsSec(); toast("Old copy removed"); return;
    }
  });
  $("#sg-file").addEventListener("change", async e => {
    const fs = [...e.target.files]; e.target.value = ""; if (!fs.length) return;
    busy = true; const bad = [];
    for (let i = 0; i < fs.length; i++){
      say(fs.length > 1 ? `Uploading ${i + 1} of ${fs.length}: ${fs[i].name}…` : `Uploading ${fs[i].name}…`);
      try { await upload(fs[i]); } catch(err){ bad.push(`${fs[i].name}: ${err.message}`); }
    }
    busy = false;
    const ok = fs.length - bad.length;
    say(bad.length ? (ok ? `Uploaded ${plural(ok, "file")}. ` : "") + bad.join(" ") : `Uploaded ${plural(ok, "file")}.`);
    if (ok) toast(`Uploaded ${plural(ok, "file")}`);
    U.at = 0; renderSettingsSec();
  });
 
  /* ---------- wiring ---------- */
  FileMeta.subscribe(() => { pruneCache(); if ($("#dlg-settings").open) renderSettingsSec(true); });
  let warned = false;
  HBStore.onError(e => {
    if (warned) return; warned = true;
    const full = /quota|full|space/i.test(`${e && e.name} ${e && e.message}`);
    setTimeout(() => toast(full ? "This browser's storage is full. Free space in Settings → Storage, or on this device." : "Couldn't save to this browser's storage. Your changes still sync to Supabase."), 0);
  });
  Sync.onReady(() => setTimeout(check, 4000));
  if (!Sync.configured()) setTimeout(check, 6000);
  {
    const inf = HBStore.info();
    if (inf.migratedNow) setTimeout(() => toast("Homebase now keeps its local copy in IndexedDB, which holds much more. Your data was moved over."), 1500);
    else if (inf.migrateError) setTimeout(() => toast("Couldn't move your data to IndexedDB this time. Still using localStorage; see Settings → Storage."), 1500);
  }
 
  return {upload, getUrl, open, delete:remove, remove, list, get, measure, usage:numbers, renderSettingsSec, BUCKET, MAX_FILE, fmtBytes};
})();
 
Claude finished the response
