/* Homebase: NOTES: folders, cards, editor, tables, toolbar.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";
 
/* =====================================================================
   NOTES: folders (nested) and documents. Saved in this browser (IndexedDB,
   through HBStore) under its own key; deleted notes and folders go to Recently Deleted.
   A note can also be an imported file (PDF, Word, PowerPoint): it then has a "file" part
   and an "annotations" place (see js/notefiles.js); it opens in the viewer (js/viewer.js).
   ===================================================================== */
const Notes = (() => {
  const KEY = "homebase.notes.v1";
  const now = () => new Date().toISOString();
  const seed = () => {
    const school = {id:uid(), name:"School", parentId:null, createdAt:now(), deletedAt:null};
    const personal = {id:uid(), name:"Personal", parentId:null, createdAt:now(), deletedAt:null};
    return {folders:[school, personal], notes:[{id:uid(), folderId:null, title:"Welcome to Notes", createdAt:now(), updatedAt:now(), deletedAt:null,
      html:"<p>Make folders on the left (and folders inside folders with the <b>+</b> next to a folder's name). Click <b>+ Note</b> to start a document.</p><ul><li>Use the toolbar for headings, <b>bold</b>, lists and checklists.</li><li>Everything saves as you type.</li><li>Deleted notes and folders go to Recently Deleted for 30 days.</li></ul><ul class=\"chk\"><li class=\"done\">Click the box to check things off</li><li>Delete this note when you're done with it</li></ul>"}]};
  };
  let d;
  try { d = HBStore.get(KEY, null) || seed(); d.folders ||= []; d.notes ||= []; } catch(e){ d = seed(); }
  const subs = new Set();
  const persist = () => { HBStore.set(KEY, d); };
  const save = () => { persist(); Sync.touch("note"); Sync.touch("folder"); };
  const emit = () => subs.forEach(f => { try { f(); } catch(e){ console.error(e); } });
  if (!HBStore.has(KEY)) persist();
  /* Files of notes deleted for good are removed from Supabase too. If that can't happen right now
     (signed out, offline), they wait in a small list and go the next time sync is connected. */
  const DROP = "homebase.filedrop.v1";
  function dropFiles(ids){ if (!ids.length) return; HBStore.set(DROP, [...new Set([...(HBStore.get(DROP, []) || []), ...ids])]); flushDrops(); }
  let dropping = false;
  async function flushDrops(){
    const q = HBStore.get(DROP, []) || [];
    if (dropping || !q.length || typeof Files === "undefined" || !Sync.live()) return;
    dropping = true; const left = [];
    for (const fid of q){ try { await Files.delete(fid); } catch(e){ left.push(fid); } }
    HBStore.set(DROP, left); dropping = false;
  }
  Sync.onReady(() => setTimeout(flushDrops, 3000));
  function descendants(id){ const out = [id]; for (let i = 0; i < out.length; i++) d.folders.filter(f => f.parentId === out[i] && !f.deletedAt).forEach(f => out.push(f.id)); return out; }
  const api = {
    subscribe(f){ subs.add(f); },
    folders: () => d.folders.filter(f => !f.deletedAt),
    notes: () => d.notes.filter(n => !n.deletedAt),
    folder: id => d.folders.find(f => f.id === id),
    note: id => d.notes.find(n => n.id === id),
    descendants,
    path(id){ const out = []; let f = api.folder(id); while (f && out.length < 20){ out.unshift(f.name); f = api.folder(f.parentId); } return out.join(" / "); },
    addFolder(name, parentId = null){ const f = {id:uid(), name, parentId, createdAt:now(), deletedAt:null}; d.folders.push(f); save(); emit(); return f; },
    renameFolder(id, name){ const f = api.folder(id); if (f && name){ f.name = name; save(); emit(); } },
    addNote(folderId = null){ const n = {id:uid(), folderId, title:"", html:"", createdAt:now(), updatedAt:now(), deletedAt:null}; d.notes.push(n); save(); emit(); return n; },
    /* an imported file: html stays empty, so anything that only knows text notes still works */
    addFile(folderId = null, {id, title, file}){ const n = {id:id || uid(), folderId, title:title || "", html:"", file, annotations:{}, createdAt:now(), updatedAt:now(), deletedAt:null}; d.notes.push(n); save(); emit(); return n; },
    updateNote(id, patch, quiet){ const n = api.note(id); if (!n) return; Object.assign(n, patch, {updatedAt:now()}); save(); if (!quiet) emit(); },
    removeNote(id){ const n = api.note(id); if (n){ n.deletedAt = now(); n.delBatch = null; save(); emit(); } },
    /* A folder goes to Recently Deleted with everything inside it, as one entry. */
    removeFolder(id){
      const t = now(), batch = uid(), ids = descendants(id);
      d.folders.forEach(f => { if (ids.includes(f.id)){ f.deletedAt = t; f.delBatch = batch; f.delRoot = f.id === id; } });
      d.notes.forEach(n => { if (!n.deletedAt && ids.includes(n.folderId)){ n.deletedAt = t; n.delBatch = batch; } });
      save(); emit();
    },
    deletedEntries(){
      const roots = d.folders.filter(f => f.deletedAt && f.delRoot), rb = new Set(roots.map(f => f.delBatch));
      return [
        ...roots.map(f => ({kind:"folder", id:f.id, title:f.name, deletedAt:f.deletedAt, count:d.notes.filter(n => n.delBatch === f.delBatch).length})),
        ...d.notes.filter(n => n.deletedAt && !rb.has(n.delBatch)).map(n => ({kind:"note", id:n.id, title:n.title || "Untitled", deletedAt:n.deletedAt, folder:n.folderId ? api.path(n.folderId) : "", fileExt:n.file ? n.file.ext : ""})),
      ];
    },
    restore(kind, id){
      if (kind === "folder"){
        const b = (api.folder(id) || {}).delBatch; if (!b) return;
        d.folders.forEach(f => { if (f.delBatch === b){ f.deletedAt = null; f.delBatch = null; f.delRoot = false; } });
        d.notes.forEach(n => { if (n.delBatch === b){ n.deletedAt = null; n.delBatch = null; } });
        const f = api.folder(id); if (f.parentId && (!api.folder(f.parentId) || api.folder(f.parentId).deletedAt)) f.parentId = null;
      } else {
        const n = api.note(id); if (!n) return; n.deletedAt = null; n.delBatch = null;
        if (n.folderId && (!api.folder(n.folderId) || api.folder(n.folderId).deletedAt)) n.folderId = null;
      }
      save(); emit();
    },
    purge(kind, id){
      let gone;
      if (kind === "folder"){ const b = (api.folder(id) || {}).delBatch; if (!b) return; gone = d.notes.filter(n => n.delBatch === b); d.folders = d.folders.filter(f => f.delBatch !== b); d.notes = d.notes.filter(n => n.delBatch !== b); }
      else { gone = d.notes.filter(n => n.id === id); d.notes = d.notes.filter(n => n.id !== id); }
      save(); emit();
      dropFiles(gone.filter(n => n.file).flatMap(n => [n.file.fileId, n.file.original && n.file.original.fileId]).filter(Boolean));
    },
    /* file notes that use a stored file (in Recently Deleted too) */
    usingFile: fid => d.notes.filter(n => n.file && (n.file.fileId === fid || (n.file.original && n.file.original.fileId === fid))),
    /* a stored file was deleted (Settings → Storage): a note keeps whatever file it still has, or goes */
    fileGone(fid){
      let ch = false;
      for (const n of [...d.notes]){
        if (!n.file) continue;
        if (n.file.original && n.file.original.fileId === fid){ n.file = {...n.file, original:null}; n.updatedAt = now(); ch = true; }
        else if (n.file.fileId === fid){
          if (n.file.original){ n.file = {...n.file, ...n.file.original, thumbHtml:"", original:null}; n.updatedAt = now(); }
          else d.notes = d.notes.filter(x => x !== n);
          ch = true;
        }
      }
      if (ch){ save(); emit(); }
    },
    purgeExpired(){
      const cutoff = Date.now() - PURGE_DAYS * MS_DAY;
      api.deletedEntries().filter(e => new Date(e.deletedAt).getTime() < cutoff).forEach(e => api.purge(e.kind, e.id));
    },
  };
  /* sync: notes and folders from another device (a note you're typing in is left alone) */
  const applyTo = arr => (u, dl) => {
    const ae = document.activeElement, typing = arr === "notes" && ae && (ae.id === "nt-body" || ae.id === "nt-title" || ae.id === "dv-title") ? nt.note : null;
    const ds = new Set(dl); if (typing) ds.delete(typing);
    for (const o of u){
      if (o.id === typing) continue;
      const i = d[arr].findIndex(x => x.id === o.id); if (i >= 0) d[arr][i] = {...o}; else d[arr].push({...o});
      if (arr === "notes" && nt.loaded === o.id) nt.loaded = null;
    }
    if (ds.size) d[arr] = d[arr].filter(x => !ds.has(x.id));
    persist(); emit();
  };
  const seedOnly = () => d.notes.length <= 1 && d.notes.every(n => n.title === "Welcome to Notes") && d.folders.every(f => ["School","Personal"].includes(f.name));
  Sync.register("note", {all:() => d.notes, m:o => +o._m || Date.parse(o.updatedAt) || 0, stamp:o => { o._m = Date.now(); }, persist, seedOnly, apply:applyTo("notes"),
    isSeed:n => n.title === "Welcome to Notes" && /Make folders on the left/.test(n.html || "")});
  Sync.register("folder", {all:() => d.folders, m:o => +o._m || Date.parse(o.createdAt) || 0, stamp:o => { o._m = Date.now(); }, persist, seedOnly, apply:applyTo("folders"),
    isSeed:(f, rows) => ["School","Personal"].includes(f.name) && !f.parentId && !d.notes.some(n => n.folderId === f.id && !(n.title === "Welcome to Notes"))
      && rows.some(r => r.kind === "folder" && !r.deleted && r.data && r.data.name === f.name && !r.data.parentId)});
  return api;
})();
 
/* Only safe formatting survives a save or a paste: no scripts, event attributes or unknown styles.
   Styles are rebuilt from a short list (alignment, spacing, size, font, colors, table sizes). */
const NOTE_TAGS = new Set(["B","STRONG","I","EM","U","S","STRIKE","H1","H2","H3","H4","P","DIV","BR","UL","OL","LI","A","BLOCKQUOTE","CODE","PRE","SPAN","TABLE","COLGROUP","COL","THEAD","TBODY","TR","TD","TH"]);
const NOTE_FONTS = [["","Default"],["Arial","Arial"],["Verdana","Verdana"],["Trebuchet MS","Trebuchet MS"],["Bricolage Grotesque","Bricolage"],["Georgia","Georgia"],["Times New Roman","Times New Roman"],["IBM Plex Mono","IBM Plex Mono"],["Courier New","Courier New"]];
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d.,%]+\)|[a-z]{3,20})$/i;
const plainInk = c => /^(rgb\(0,0,0\)|#000(000)?|black|windowtext|inherit|initial|currentcolor)$/i.test(c);
const blankBg = c => /^(transparent|rgba\(\d+,\d+,\d+,0\)|rgb\(255,255,255\)|#fff(fff)?|white|inherit|initial)$/i.test(c);
function cleanStyle(el, tag){
  const s = el.style, out = [], ns = v => String(v || "").replace(/\s+/g, "");
  const al = s.textAlign || ({left:"left", center:"center", right:"right", justify:"justify"})[(el.getAttribute("align") || "").toLowerCase()];
  if (/^(left|center|right|justify)$/.test(al || "")) out.push(`text-align:${al}`);
  if (/^\d(\.\d+)?$/.test(s.lineHeight) && +s.lineHeight >= .8 && +s.lineHeight <= 3) out.push(`line-height:${s.lineHeight}`);
  if (/^\d+(\.\d+)?(pt|px)$/.test(s.fontSize)) out.push(`font-size:${s.fontSize}`);
  if (s.fontFamily && s.fontFamily.length < 120 && /^[\w\s,"'-]+$/.test(s.fontFamily) && !/hbx-/.test(s.fontFamily)) out.push(`font-family:${s.fontFamily}`);
  if (/^(bold|[6-9]00)$/.test(s.fontWeight)) out.push("font-weight:700");
  if (s.fontStyle === "italic") out.push("font-style:italic");
  const td = `${s.textDecorationLine || ""} ${s.textDecoration || ""}`;
  if (/underline|line-through/.test(td)) out.push(`text-decoration:${[/underline/.test(td) && "underline", /line-through/.test(td) && "line-through"].filter(Boolean).join(" ")}`);
  const c = ns(s.color); if (c && SAFE_COLOR.test(c) && !plainInk(c) && c !== "rgb(1,2,3)") out.push(`color:${s.color}`);
  const bg = ns(s.backgroundColor); if (bg && SAFE_COLOR.test(bg) && !blankBg(bg) && bg !== "rgb(1,2,3)") out.push(`background-color:${s.backgroundColor}`);
  if (/^(COL|TABLE|TD|TH)$/.test(tag) && /^\d+(\.\d+)?(px|%)$/.test(s.width)) out.push(`width:${s.width}`);
  if (/^(TR|TD|TH)$/.test(tag) && /^\d+(\.\d+)?px$/.test(s.height)) out.push(`height:${s.height}`);
  return out.join(";");
}
function cleanHTML(html){
  const doc = new DOMParser().parseFromString(`<body>${html || ""}<\/body>`, "text/html");
  const walk = el => {
    for (let c of [...el.children]){
      if (c.tagName === "FONT"){   // <font> from the browser's editing commands becomes a styled <span>
        const s = doc.createElement("span");
        if (c.getAttribute("style")) s.setAttribute("style", c.getAttribute("style"));
        const face = c.getAttribute("face"); if (face && !/hbx-/.test(face)) s.style.fontFamily = face;
        const col = c.getAttribute("color"); if (col && !/^#010203$/i.test(col)) s.style.color = col;
        s.append(...c.childNodes); c.replaceWith(s); c = s;
      }
      if (!NOTE_TAGS.has(c.tagName)){
        if (["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","LINK","META","TITLE","IMG","SVG","VIDEO","AUDIO","FORM","INPUT","BUTTON","TEXTAREA","SELECT"].includes(c.tagName)){ c.remove(); continue; }
        walk(c); c.replaceWith(...c.childNodes); continue;
      }
      const st = c.hasAttribute("style") || c.hasAttribute("align") ? cleanStyle(c, c.tagName) : "";
      for (const a of [...c.attributes]){
        const n = a.name.toLowerCase(), v = a.value.trim();
        const keep = (c.tagName === "A" && n === "href" && /^(https?:|mailto:)/i.test(v)) || (n === "class" && /^(chk|done|sub)$/.test(v));
        if (!keep) c.removeAttribute(a.name);
      }
      if (st) c.setAttribute("style", st);
      if (c.tagName === "A"){ c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener"); }
      walk(c);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
const noteText = html => { const d = new DOMParser().parseFromString(`<body>${html || ""}<\/body>`, "text/html"); d.querySelectorAll("li,p,div,h1,h2,h3,h4,td,th,br").forEach(e => e.append(" ")); return d.body.textContent.replace(/\s+/g, " ").trim(); };
 
/* ---------- Notes page: folders, cards grouped by recency, editor ---------- */
const NT_UI = "homebase.notesui.v1";
const nt = {folder:"all", note:null, loaded:null, q:"", renaming:null, mobileEdit:false, side:true, full:false, range:null, size:12, color:"#E03131", hl:"#FFD43B80"};
try { const u = JSON.parse(localStorage.getItem(NT_UI) || "{}"); nt.side = u.side !== false; } catch(e){}
const saveNtUI = () => { try { localStorage.setItem(NT_UI, JSON.stringify({side:nt.side})); } catch(e){} };
const FOLDER_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>';
const ntBody = $("#nt-body");
function noteCount(fid){
  if (fid === "all") return Notes.notes().length;
  if (fid === "unfiled") return Notes.notes().filter(n => !n.folderId).length;
  const ids = new Set(Notes.descendants(fid)); return Notes.notes().filter(n => ids.has(n.folderId)).length;
}
function folderTree(parentId = null, lvl = 0){
  return Notes.folders().filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name)).flatMap(f => [{f, lvl}, ...folderTree(f.id, lvl + 1)]);
}
const folderName = id => id === "all" ? "All notes" : id === "unfiled" ? "Not in a folder" : ((Notes.folder(id) || {}).name || "Notes");
function notesInView(){
  let list = Notes.notes();
  const q = nt.q.toLowerCase();
  if (q) list = list.filter(n => (n.title + " " + (n.file ? n.file.name + " " + (n.file.text || "") : noteText(n.html))).toLowerCase().includes(q));
  else if (nt.folder === "unfiled") list = list.filter(n => !n.folderId);
  else if (nt.folder !== "all"){ const ids = new Set(Notes.descendants(nt.folder)); list = list.filter(n => ids.has(n.folderId)); }
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/* Most recently edited first, in groups: This week, Last week, Previous 30 days, then months, then years. Empty groups don't show. */
function noteGroups(list){
  const now = new Date(), sow = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const slw = new Date(sow.getFullYear(), sow.getMonth(), sow.getDate() - 7), d30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const out = [], add = (k, n) => { let g = out.find(x => x.k === k); if (!g) out.push(g = {k, notes:[]}); g.notes.push(n); };
  for (const n of list){
    const t = new Date(n.updatedAt);
    add(t >= sow ? "This week" : t >= slw ? "Last week" : t >= d30 ? "Previous 30 days"
      : t.getFullYear() === now.getFullYear() ? t.toLocaleDateString(undefined, {month:"long"}) : String(t.getFullYear()), n);
  }
  return out;
}
const cardDate = iso => { const d = new Date(iso); return ymd(d) === ymd(new Date()) ? d.toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"}) : `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`; };
/* the picture on a file's card: its first page, with a type badge and the page count */
function fileThumb(f){
  const ext = String(f.ext || "").toLowerCase(), img = /^data:image\/(jpeg|png);base64,/.test(f.thumb || "") ? f.thumb : "";
  const inner = img ? `<img class="nc-img" src="${img}" alt="" loading="lazy" decoding="async">`
    : f.thumbHtml ? `<span class="nt-body nc-mini" aria-hidden="true">${cleanHTML(f.thumbHtml)}</span>`
    : `<span class="nc-ph"><span class="ft-badge big" data-ft="${esc(ext)}">${esc(ext.toUpperCase())}</span></span>`;
  return `<span class="nc-th nc-file">${inner}${img || f.thumbHtml ? `<span class="ft-badge nc-b" data-ft="${esc(ext)}">${esc(ext.toUpperCase())}</span>` : ""}${f.pages ? `<span class="nc-pp">${f.pages} ${ext === "pptx" ? "sl." : "pp."}</span>` : ""}</span>`;
}
function renderGallery(){
  const list = notesInView();
  $("#ng-name").textContent = nt.q ? "Search" : folderName(nt.folder);
  $("#ng-count").textContent = nt.q ? plural(list.length, "result") : plural(list.length, "note");
  const card = n => {
    const f = n.folderId && n.folderId !== nt.folder ? Notes.path(n.folderId) : "";
    return `<div class="nc" role="button" tabindex="0" data-note="${n.id}" aria-label="${esc(n.title || "Untitled")}${n.file ? ", " + esc(n.file.ext.toUpperCase()) + " file" : ""}">${n.file ? fileThumb(n.file) : `<span class="nc-th"><span class="nt-body nc-mini" aria-hidden="true">${cleanHTML(n.html)}</span></span>`}<span class="nc-t">${esc(n.title || "Untitled")}</span><span class="nc-d">${cardDate(n.updatedAt)}</span>${f ? `<span class="nc-f">${esc(f)}</span>` : ""}</div>`;
  };
  $("#nt-cards").innerHTML = list.length ? noteGroups(list).map(g => `<h3 class="ng-g">${esc(g.k)}</h3><div class="ng-grid">${g.notes.map(card).join("")}</div>`).join("")
    : `<p class="ng-empty">${nt.q ? "No notes match." : "No notes here yet. Press <b>+ Note</b> to start one."}</p>`;
}
function renderNotes(){
  if (nt.folder !== "all" && nt.folder !== "unfiled" && !(Notes.folder(nt.folder) && !Notes.folder(nt.folder).deletedAt)) nt.folder = "all";
  if (nt.note && !(Notes.note(nt.note) && !Notes.note(nt.note).deletedAt)) nt.note = null;
  /* folders */
  const tree = folderTree();
  const fRow = (id, name, lvl, special) => {
    const on = nt.folder === id && !nt.q;
    const nameHTML = nt.renaming === id ? `<input class="nf-in" data-ren="${id}" value="${esc(name)}" aria-label="Folder name">` : `<span class="nf-t">${esc(name)}</span>`;
    const tag = nt.renaming === id ? "div" : "button";   // an input can't live inside a button
    return `<div class="nf ${on ? "on" : ""}" style="--lvl:${lvl}" data-nf="${id}"><${tag} ${tag === "button" ? 'type="button"' : ""} class="nf-b" data-nfgo="${id}" aria-current="${on}">${special || FOLDER_IC}${nameHTML}<b>${noteCount(id) || ""}</b></${tag}>${special ? "" : `<span class="nf-act"><button type="button" data-nfadd="${id}" title="New folder inside" aria-label="New folder inside ${esc(name)}">+</button><button type="button" data-nfren="${id}" title="Rename" aria-label="Rename ${esc(name)}">✎</button><button type="button" data-nfdel="${id}" title="Delete folder" aria-label="Delete ${esc(name)}">×</button></span>`}</div>`;
  };
  $("#nt-folders").innerHTML = fRow("all", "All notes", 0, IC.all) + fRow("unfiled", "Not in a folder", 0, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/></svg>')
    + (tree.length ? `<h5>Folders</h5>` : "") + tree.map(({f, lvl}) => fRow(f.id, f.name, lvl)).join("");
  const ren = $("#nt-folders .nf-in"); if (ren && document.activeElement !== ren){ ren.focus(); ren.select(); }
  const opts = [["all","All notes"],["unfiled","Not in a folder"], ...tree.map(({f, lvl}) => [f.id, "  ".repeat(lvl) + f.name])];
  $("#nt-fsel").innerHTML = opts.map(([v, t]) => `<option value="${v}" ${v === nt.folder ? "selected" : ""}>${esc(t)}</option>`).join("");
  /* layout */
  const n = nt.note && Notes.note(nt.note);
  if (nt.full && (!n || page !== "notes")) setNoteFull(false);
  $("#notes").classList.toggle("side-off", !nt.side);
  $("#notes").classList.toggle("editing", !!n);
  $$(".nt-showside").forEach(b => b.hidden = nt.side);
  $("#nt-gal").hidden = !!n; $("#nt-ed").hidden = !n || !!n.file; $("#nt-view").hidden = !(n && n.file);
  if (!(n && n.file) && typeof DocView !== "undefined" && DocView.openId) DocView.hide();
  if (!n){ nt.loaded = null; closePop(); renderGallery(); return; }
  if (n.file){ nt.loaded = null; closePop(); if (typeof DocView !== "undefined") DocView.show(n); return; }
  /* editor */
  $("#nt-back").textContent = "‹ " + folderName(nt.folder);
  $("#nt-move").innerHTML = `<option value="">Not in a folder</option>` + tree.map(({f, lvl}) => `<option value="${f.id}">${"  ".repeat(lvl)}${esc(f.name)}</option>`).join("");
  $("#nt-move").value = n.folderId || "";
  if (nt.loaded !== n.id){
    nt.loaded = n.id; nt.range = null;
    $("#nt-title").value = n.title; ntBody.innerHTML = cleanHTML(n.html);
    $("#nt-saved").textContent = `Edited ${fmtDT(n.updatedAt)}`;
    $("#nt-canvas").scrollTop = 0; syncTB();
  }
}
function openNote(id, focusTitle){
  nt.note = id; nt.mobileEdit = true; renderNotes();
  if (focusTitle) $("#nt-title").focus();
}
function closeNote(){ nt.note = null; nt.mobileEdit = false; renderNotes(); }
function newNote(){
  const fid = nt.folder === "all" || nt.folder === "unfiled" ? null : nt.folder;
  nt.q = ""; $("#nt-q").value = "";
  const n = Notes.addNote(fid); openNote(n.id, true);
}
let ntTimer;
function saveBody(){
  clearTimeout(ntTimer);
  ntTimer = setTimeout(() => { if (!nt.loaded) return; Notes.updateNote(nt.loaded, {html:cleanHTML(ntBody.innerHTML)}, true); $("#nt-saved").textContent = "Saved"; renderNoteList(); }, 350);
}
const renderNoteList = () => renderNotes();   // the open note isn't reloaded, so typing is never interrupted
 
/* folders hidden / shown, and full screen */
function setSide(on){ nt.side = on; saveNtUI(); renderNotes(); }
const FULL_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const UNFULL_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
function setNoteFull(on){
  nt.full = on;
  $("#notes").classList.toggle("full", on); document.documentElement.classList.toggle("nt-full-on", on);
  const b = $("#nt-full"); b.innerHTML = on ? UNFULL_IC : FULL_IC; b.title = on ? "Exit full screen (Esc)" : "Full screen"; b.setAttribute("aria-label", b.title); b.classList.toggle("on", on);
  if (typeof DocView !== "undefined" && DocView.openId){ const vn = Notes.note(DocView.openId); if (vn && vn.file) DocView.show(vn); }
  try {
    if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch(e){}
  closePop();
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && nt.full) setNoteFull(false); });
 
$("#nt-new").onclick = newNote;
$("#nt-hide").onclick = () => setSide(false);
$$(".nt-showside").forEach(b => b.onclick = () => setSide(true));
$("#nt-full").onclick = () => setNoteFull(!nt.full);
$("#nt-newfolder").onclick = () => { const f = Notes.addFolder("New folder", null); nt.folder = f.id; nt.renaming = f.id; nt.note = null; renderNotes(); };
$("#nt-folders").addEventListener("click", e => {
  const add = e.target.closest("[data-nfadd]"); if (add){ const f = Notes.addFolder("New folder", add.dataset.nfadd); nt.folder = f.id; nt.renaming = f.id; nt.note = null; renderNotes(); return; }
  const ren = e.target.closest("[data-nfren]"); if (ren){ nt.renaming = ren.dataset.nfren; renderNotes(); return; }
  const del = e.target.closest("[data-nfdel]"); if (del){
    const id = del.dataset.nfdel, f = Notes.folder(id), n = noteCount(id);
    Notes.removeFolder(id); if (nt.folder === id) nt.folder = "all";
    toast(`Deleted folder "${trunc(f.name, 24)}"${n ? ` and ${plural(n, "note")}` : ""}`, () => Notes.restore("folder", id)); return;
  }
  if (e.target.closest(".nf-in")) return;
  const go = e.target.closest("[data-nfgo]"); if (go){ nt.folder = go.dataset.nfgo; nt.q = ""; $("#nt-q").value = ""; nt.note = null; nt.mobileEdit = false; renderNotes(); }
});
const finishRename = (inp, cancel) => { const id = inp.dataset.ren, v = inp.value.trim(); nt.renaming = null; if (!cancel && v) Notes.renameFolder(id, v); else renderNotes(); };
$("#nt-folders").addEventListener("keydown", e => { const inp = e.target.closest(".nf-in"); if (!inp) return; if (e.key === "Enter"){ e.preventDefault(); finishRename(inp); } if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); finishRename(inp, true); } });
$("#nt-folders").addEventListener("focusout", e => { const inp = e.target.closest(".nf-in"); if (inp && nt.renaming) finishRename(inp); });
$("#nt-fsel").addEventListener("change", e => { nt.folder = e.target.value; nt.q = ""; $("#nt-q").value = ""; renderNotes(); });
$("#nt-q").addEventListener("input", e => { nt.q = e.target.value.trim(); renderNotes(); });
$("#nt-cards").addEventListener("click", e => { const c = e.target.closest("[data-note]"); if (c) openNote(c.dataset.note); });
$("#nt-cards").addEventListener("keydown", e => { const c = e.target.closest("[data-note]"); if (c && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); openNote(c.dataset.note); } });
$("#nt-title").addEventListener("input", e => { if (!nt.loaded) return; Notes.updateNote(nt.loaded, {title:e.target.value}, true); $("#nt-saved").textContent = "Saved"; renderNoteList(); });
$("#nt-title").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); ntBody.focus(); } });
$("#nt-move").addEventListener("change", e => { if (nt.loaded) Notes.updateNote(nt.loaded, {folderId:e.target.value || null}); });
$("#nt-del").onclick = () => { const id = nt.loaded; if (!id) return; const n = Notes.note(id); if (nt.full) setNoteFull(false); Notes.removeNote(id); nt.note = null; nt.mobileEdit = false; toast(`Deleted "${trunc(n.title || "Untitled", 28)}"`, () => { Notes.restore("note", id); }); };
$("#nt-back").onclick = closeNote;
document.addEventListener("keydown", e => { if (e.key === "Escape" && nt.full && $("#nt-pop").hidden && !document.querySelector("dialog[open]")) setNoteFull(false); });
 
/* ---------- editing ---------- */
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch(e){}
const BLK = "p,div,h1,h2,h3,h4,li,blockquote,td,th,pre";
document.addEventListener("selectionchange", () => {
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); if (!ntBody.contains(r.commonAncestorContainer)) return;
  nt.range = r.cloneRange(); syncTBSoon();
});
function restoreSel(){
  const s = getSelection();
  if (document.activeElement === ntBody && s.rangeCount && ntBody.contains(s.getRangeAt(0).commonAncestorContainer)){ nt.range = s.getRangeAt(0).cloneRange(); return; }   // the live selection wins
  ntBody.focus({preventScroll:true});
  if (nt.range && ntBody.contains(nt.range.commonAncestorContainer)){ s.removeAllRanges(); s.addRange(nt.range); }
  else if (!s.rangeCount || !ntBody.contains(s.getRangeAt(0).commonAncestorContainer)){ const r = document.createRange(); r.selectNodeContents(ntBody); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
}
function exec(cmd, val, css){ try { document.execCommand("styleWithCSS", false, !!css); } catch(e){} document.execCommand(cmd, false, val); }
const selEl = () => { const s = getSelection(); if (!s.rangeCount) return ntBody; let n = s.getRangeAt(0).startContainer; n = n.nodeType === 3 ? n.parentElement : n; return ntBody.contains(n) ? n : ntBody; };
const inList = () => { const l = selEl().closest("ul,ol"); return l && ntBody.contains(l) ? l : null; };
const inBlock = tag => { const b = selEl().closest(tag); return !!(b && ntBody.contains(b)); };
function blocksInSel(){
  const s = getSelection(); if (!s.rangeCount) return [];
  const r = s.getRangeAt(0);
  let out = [...ntBody.querySelectorAll(BLK)].filter(el => r.intersectsNode(el) && !el.querySelector(BLK));
  if (!out.length){ const c = selEl().closest(BLK); if (c && ntBody.contains(c)) out = [c]; }
  return out;
}
/* The browser's size, "no color" and "default font" commands leave markers; turn them into real styles.
   Only attributes change, so the selection stays where it is. */
function fixMarks(){
  ntBody.querySelectorAll('font[size="7"]').forEach(f => { f.removeAttribute("size"); f.style.fontSize = nt.size + "pt"; });
  ntBody.querySelectorAll("font[color]").forEach(f => { if (/^#010203$/i.test(f.getAttribute("color"))) f.removeAttribute("color"); });
  ntBody.querySelectorAll("font[face]").forEach(f => { if (/hbx-/.test(f.getAttribute("face"))) f.removeAttribute("face"); });
  ntBody.querySelectorAll("[style]").forEach(el => {
    const st = el.style;
    if (st.fontSize === "xxx-large") st.fontSize = nt.size + "pt";
    if (/hbx-/.test(st.fontFamily)) st.fontFamily = "";
    if (st.color.replace(/\s/g, "") === "rgb(1,2,3)") st.color = "";
    if (st.backgroundColor.replace(/\s/g, "") === "rgb(1,2,3)") st.backgroundColor = "";
    if (!el.getAttribute("style").trim()) el.removeAttribute("style");
  });
}
const curPt = () => Math.round(parseFloat(getComputedStyle(selEl()).fontSize) * 0.75 * 2) / 2;
const SIZES = [6,7,8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72,96];
function setSize(pt){
  pt = Math.max(6, Math.min(96, Math.round(+pt * 2) / 2)); if (!pt) return;
  nt.size = pt; restoreSel(); exec("fontSize", "7", false); fixMarks(); saveBody(); syncTB();
}
function setStyle(v){
  restoreSel();
  exec("formatBlock", `<${v === "sub" ? "p" : v}>`);
  blocksInSel().forEach(b => { if (v === "sub" && b.tagName === "P") b.classList.add("sub"); else b.classList.remove("sub"); if (!b.classList.length) b.removeAttribute("class"); });
  saveBody(); syncTB();
}
function setFont(f){ restoreSel(); exec("fontName", f || "hbx-def", true); fixMarks(); saveBody(); syncTB(); }
function setColor(kind, c){
  restoreSel();
  exec(kind === "hl" ? "hiliteColor" : "foreColor", c || "#010203", true); fixMarks();
  if (c){ nt[kind === "hl" ? "hl" : "color"] = c; $(kind === "hl" ? "#nt-hbar" : "#nt-cbar").style.setProperty("--cb", c); }
  saveBody();
}
function setSpacing(v){
  restoreSel();
  let bl = blocksInSel(); if (!bl.length){ exec("formatBlock", "<p>"); bl = blocksInSel(); }
  bl.forEach(b => { b.style.lineHeight = v; });
  saveBody(); syncTB();
}
 
/* toolbar state follows the cursor */
$("#nt-font").innerHTML = NOTE_FONTS.map(([v, t]) => `<option value="${esc(v)}" style="font-family:${v ? `'${v}'` : "inherit"}">${esc(t)}</option>`).join("");
let tbRaf = 0;
const syncTBSoon = () => { cancelAnimationFrame(tbRaf); tbRaf = requestAnimationFrame(syncTB); };
function syncTB(){
  if (!nt.loaded) return;
  const live = (() => { const s = getSelection(); return s.rangeCount && ntBody.contains(s.getRangeAt(0).commonAncestorContainer); })();
  const el = selEl(), q = c => { if (!live) return false; try { return document.queryCommandState(c); } catch(e){ return false; } };
  $$("#nt-tb [data-cmd]").forEach(b => {
    const c = b.dataset.cmd;
    const on = c === "chk" ? !!(inList() && inList().classList.contains("chk")) : c === "blockquote" ? inBlock("blockquote")
      : c === "insertUnorderedList" ? q(c) && !(inList() && inList().classList.contains("chk"))
      : ["bold","italic","underline","strikeThrough","insertOrderedList","justifyLeft","justifyCenter","justifyRight"].includes(c) ? q(c) : false;
    b.classList.toggle("on", !!on);
  });
  const blk = el.closest("h1,h2,h3,h4,p,div,li,td,th");
  $("#nt-style").value = blk && ntBody.contains(blk) ? (/^H[1-4]$/.test(blk.tagName) ? blk.tagName.toLowerCase() : blk.classList.contains("sub") ? "sub" : "p") : "p";
  const fam = getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
  const hit = NOTE_FONTS.find(([v]) => v && v.toLowerCase() === fam);
  $("#nt-font").value = hit ? hit[0] : "";
  if (document.activeElement !== $("#nt-size")) $("#nt-size").value = curPt();
}
 
$("#nt-tb").addEventListener("mousedown", e => { if (e.target.closest("button")) e.preventDefault(); });   // keep the text selection
$("#nt-tb").addEventListener("click", e => {
  const p = e.target.closest("[data-pop]"); if (p){ openPop(p.dataset.pop, p); return; }
  const b = e.target.closest("[data-cmd]"); if (!b) return;
  const c = b.dataset.cmd; restoreSel();
  if (c === "size+" || c === "size-"){ const cur = curPt(); setSize(c === "size+" ? (SIZES.find(s => s > cur) || 96) : ([...SIZES].reverse().find(s => s < cur) || 6)); return; }
  if (c === "blockquote") exec("formatBlock", inBlock("blockquote") ? "<div>" : "<blockquote>");
  else if (c === "chk"){
    let l = inList();
    if (!l || l.nodeName !== "UL"){ exec("insertUnorderedList"); l = inList(); }
    if (l){
      l.classList.toggle("chk");
      const li = selEl().closest("li");   // put the cursor at the end of the line
      if (li){ const r = document.createRange(); r.selectNodeContents(li); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    }
  }
  else if (c === "link"){ const url = window.prompt("Link address (https://…)", "https://"); restoreSel(); if (url && /^(https?:|mailto:)/i.test(url.trim())) exec("createLink", url.trim()); }
  else if (/^justify/.test(c)) exec(c, null, true);
  else if (c === "removeFormat"){ exec("removeFormat"); blocksInSel().forEach(bl => { bl.style.lineHeight = ""; bl.style.textAlign = ""; if (!bl.getAttribute("style")) bl.removeAttribute("style"); }); }
  else exec(c);
  fixMarks(); saveBody(); syncTB();
});
$("#nt-style").addEventListener("change", e => setStyle(e.target.value));
$("#nt-font").addEventListener("change", e => setFont(e.target.value));
$("#nt-size").addEventListener("change", e => setSize(e.target.value));
$("#nt-size").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); e.target.blur(); }   /* blurring fires "change", which applies the size */ if (e.key === "Escape"){ e.target.value = curPt(); restoreSel(); } });
 
ntBody.addEventListener("input", () => { fixMarks(); saveBody(); });
ntBody.addEventListener("paste", e => {
  const html = e.clipboardData.getData("text/html"), text = e.clipboardData.getData("text/plain");
  e.preventDefault();
  if (html) document.execCommand("insertHTML", false, cleanHTML(html));
  else document.execCommand("insertText", false, text);
});
ntBody.addEventListener("click", e => {
  const a = e.target.closest("a"); if (a && (e.ctrlKey || e.metaKey)){ window.open(a.href, "_blank", "noopener"); return; }
  const li = e.target.closest("ul.chk > li");
  if (li && e.clientX - li.getBoundingClientRect().left < 24){ li.classList.toggle("done"); saveBody(); }
});
 
/* ---------- tables ---------- */
function tblCtx(){
  const cell = selEl().closest("td,th"); if (!cell || !ntBody.contains(cell)) return null;
  return {cell, tr:cell.parentElement, table:cell.closest("table"), ci:cell.cellIndex};
}
function caretIn(cell, all){ const r = document.createRange(); r.selectNodeContents(cell); if (!all) r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); nt.range = r.cloneRange(); }
function insertTable(rows, cols){
  restoreSel();
  const tr = `<tr>${"<td><br></td>".repeat(cols)}</tr>`;
  exec("insertHTML", `<table style="width:100%"><colgroup>${`<col style="width:${(100 / cols).toFixed(3)}%">`.repeat(cols)}</colgroup><tbody>${tr.repeat(rows)}</tbody></table><p><br></p>`);
  const t = [...ntBody.querySelectorAll("table")].find(x => x.contains(getSelection().anchorNode)) || [...ntBody.querySelectorAll("table")].find(x => x.nextElementSibling && x.nextElementSibling.contains(getSelection().anchorNode));
  if (t) caretIn(t.querySelector("td"));
  saveBody();
}
function colsOf(table){
  let cg = table.querySelector("colgroup"); const n = table.rows[0] ? table.rows[0].cells.length : 0;
  if (!cg || cg.children.length !== n){
    if (cg) cg.remove();
    cg = document.createElement("colgroup");
    [...(table.rows[0] || {cells:[]}).cells].forEach(c => { const col = document.createElement("col"); col.style.width = Math.round(c.getBoundingClientRect().width) + "px"; cg.append(col); });
    table.prepend(cg);
  }
  return [...cg.children];
}
/* Columns and rows covered by the selection (start cell to end cell). */
function tblSel(){
  const t = tblCtx(), s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null;
  let n = r ? r.endContainer : null; n = n && n.nodeType === 3 ? n.parentElement : n;
  const e = n && n.closest ? n.closest("td,th") : null, end = e && t.table.contains(e) ? e : t.cell;
  const a = [t.cell.cellIndex, end.cellIndex], b = [t.tr.rowIndex, end.parentElement.rowIndex];
  return {table:t.table, c0:Math.min(...a), c1:Math.max(...a), r0:Math.min(...b), r1:Math.max(...b)};
}
/* Current column widths in pixels. */
function colPx(table){
  const cols = colsOf(table), px = /px$/.test(table.style.width);
  return [...table.rows[0].cells].map((c, i) => px && /px$/.test(cols[i].style.width) ? parseFloat(cols[i].style.width) : c.getBoundingClientRect().width);
}
function setColPx(table, w){
  const cols = colsOf(table); w = w.map(x => Math.max(20, Math.round(x)));
  cols.forEach((c, i) => c.style.width = w[i] + "px"); table.style.width = w.reduce((a, b) => a + b, 0) + "px";
}
function tblSet(kind){
  const ts = nt.tsel; if (!ts || !ntBody.contains(ts.table)) return;
  const w = colPx(ts.table);
  if (kind === "col"){ const v = Math.max(20, Math.min(2000, +$("#tw-c").value || 0)); for (let i = ts.c0; i <= ts.c1; i++) w[i] = v; setColPx(ts.table, w); }
  else if (kind === "even"){
    const [a, b] = ts.c0 === ts.c1 ? [0, w.length - 1] : [ts.c0, ts.c1], avg = w.slice(a, b + 1).reduce((x, y) => x + y, 0) / (b - a + 1);
    for (let i = a; i <= b; i++) w[i] = avg; setColPx(ts.table, w);
  }
  else if (kind === "row"){ const v = Math.max(20, Math.min(1000, +$("#tw-r").value || 0)); for (let i = ts.r0; i <= ts.r1; i++) ts.table.rows[i].style.height = v + "px"; }
  saveBody();
}
function tblOp(op){
  const t = tblCtx(); if (!t) return;
  const {table, tr, ci} = t, rows = [...table.rows];
  const blankRow = () => { const r = tr.cloneNode(true); r.removeAttribute("style"); [...r.cells].forEach(c => { c.innerHTML = "<br>"; c.removeAttribute("style"); }); return r; };
  if (op === "rowAbove" || op === "rowBelow"){ const r = blankRow(); op === "rowAbove" ? tr.before(r) : tr.after(r); caretIn(r.cells[ci]); }
  else if (op === "colLeft" || op === "colRight"){
    const cols = colsOf(table), px = /px$/.test(table.style.width);
    rows.forEach(r => { const c = r.cells[ci]; if (!c) return; const nc = document.createElement(c.tagName); nc.innerHTML = "<br>"; op === "colLeft" ? c.before(nc) : c.after(nc); });
    const col = document.createElement("col"); op === "colLeft" ? cols[ci].before(col) : cols[ci].after(col);
    if (px){ const all = colsOf(table), k = (all.length - 1) / all.length, tw = parseFloat(table.style.width);   /* the table keeps its width; columns make room */
      all.forEach(c => { c.style.width = c === col ? Math.round(tw / all.length) + "px" : Math.round(parseFloat(c.style.width) * k) + "px"; }); }
    else { const all = colsOf(table); all.forEach(c => c.style.width = (100 / all.length).toFixed(3) + "%"); table.style.width = "100%"; }
    caretIn(tr.cells[op === "colLeft" ? ci : ci + 1]);
  }
  else if (op === "delRow"){ if (rows.length < 2) return tblOp("delTable"); const next = tr.nextElementSibling || tr.previousElementSibling; tr.remove(); caretIn(next.cells[Math.min(ci, next.cells.length - 1)]); }
  else if (op === "delCol"){
    if (tr.cells.length < 2) return tblOp("delTable");
    const cols = colsOf(table), w = cols[ci].style.width;
    if (/px$/.test(table.style.width) && /px$/.test(w)) table.style.width = Math.max(60, parseFloat(table.style.width) - parseFloat(w)) + "px";
    cols[ci].remove(); rows.forEach(r => r.cells[ci] && r.cells[ci].remove());
    if (!/px$/.test(table.style.width)){ const all = colsOf(table); all.forEach(c => c.style.width = (100 / all.length).toFixed(3) + "%"); }
    caretIn(tr.cells[Math.min(ci, tr.cells.length - 1)]);
  }
  else if (op === "delTable"){ const p = document.createElement("p"); p.innerHTML = "<br>"; table.replaceWith(p); caretIn(p); }
  saveBody();
}
ntBody.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const t = tblCtx(); if (!t) return;
  e.preventDefault();
  let cells = [...t.table.querySelectorAll("td,th")], i = cells.indexOf(t.cell) + (e.shiftKey ? -1 : 1);
  if (i < 0) return;
  if (i >= cells.length){ caretIn(t.table.rows[t.table.rows.length - 1].cells[0]); tblOp("rowBelow"); cells = [...t.table.querySelectorAll("td,th")]; }
  caretIn(cells[i], true);
});
/* Drag a cell's right edge to change the column width, or its bottom edge to change the row height. */
let rz = null;
function rzHit(e){
  const cell = e.target.closest && e.target.closest("td,th"); if (!cell || !ntBody.contains(cell)) return null;
  const r = cell.getBoundingClientRect(), tol = e.pointerType === "touch" ? 12 : 6;
  if (Math.abs(r.right - e.clientX) <= tol) return {kind:"c", cell};
  if (Math.abs(r.bottom - e.clientY) <= tol) return {kind:"r", cell};
  return null;
}
ntBody.addEventListener("pointermove", e => {
  if (rz) return;
  ntBody.querySelectorAll(".rz-c,.rz-r").forEach(x => { x.classList.remove("rz-c", "rz-r"); if (!x.className) x.removeAttribute("class"); });
  const h = rzHit(e); if (h) h.cell.classList.add("rz-" + h.kind);
});
ntBody.addEventListener("pointerdown", e => {
  const h = rzHit(e); if (!h) return;
  e.preventDefault();
  const table = h.cell.closest("table");
  if (h.kind === "c"){
    const cols = colsOf(table), w = [...table.rows[0].cells].map(c => c.getBoundingClientRect().width);
    cols.forEach((c, i) => c.style.width = Math.round(w[i]) + "px");
    const tw = Math.round(w.reduce((a, b) => a + b, 0)); table.style.width = tw + "px";
    const i = h.cell.cellIndex;
    rz = {kind:"c", table, cols, i, x:e.clientX, w0:w[i], n0:i < w.length - 1 ? w[i + 1] : null, t0:tw};
  } else rz = {kind:"r", tr:h.cell.parentElement, y:e.clientY, h0:h.cell.parentElement.getBoundingClientRect().height};
  document.body.classList.add("nt-rz", rz.kind);
});
ntBody.addEventListener("touchstart", e => { if (rz) e.preventDefault(); }, {passive:false});
window.addEventListener("pointermove", e => {
  if (!rz) return;
  if (rz.kind === "c"){
    const dx = e.clientX - rz.x;
    if (rz.n0 != null){ const w = Math.max(30, Math.min(rz.w0 + rz.n0 - 30, rz.w0 + dx)); rz.cols[rz.i].style.width = Math.round(w) + "px"; rz.cols[rz.i + 1].style.width = Math.round(rz.w0 + rz.n0 - w) + "px"; }
    else { const w = Math.max(30, rz.w0 + dx); rz.cols[rz.i].style.width = Math.round(w) + "px"; rz.table.style.width = Math.round(rz.t0 - rz.w0 + w) + "px"; }
  } else rz.tr.style.height = Math.round(Math.max(24, rz.h0 + e.clientY - rz.y)) + "px";
});
const endRz = () => { if (!rz) return; rz = null; document.body.classList.remove("nt-rz", "c", "r"); saveBody(); };
window.addEventListener("pointerup", endRz); window.addEventListener("pointercancel", endRz);
 
/* ---------- toolbar pop-ups: colors, highlight, line spacing, table ---------- */
const TEXT_COLORS = ["#E03131","#F76707","#F08C00","#2F9E44","#0C8599","#1C7ED6","#4C6EF5","#7048E8","#D6336C","#AE3EC9","#A0522D","#868E96","#FF8787","#69DB7C","#74C0FC","#B197FC"];
const HL_COLORS = ["#FFD43B80","#FFA94D80","#FF878780","#FAA2C180","#B197FC80","#74C0FC80","#8CE99A80","#ADB5BD66"];
const pop = $("#nt-pop");
function closePop(){ pop.hidden = true; pop.innerHTML = ""; }
function openPop(kind, btn){
  if (!pop.hidden && pop.dataset.kind === kind){ closePop(); return; }
  pop.dataset.kind = kind;
  const sw = (c, attr) => `<button type="button" class="csw" style="--s:${c}" ${attr}="${c}" aria-label="${c}" title="${c}"></button>`;
  if (kind === "color") pop.innerHTML = `<span class="wp-l">Text color</span><button type="button" class="mi" data-color="">Automatic</button><div class="pal-sw">${TEXT_COLORS.map(c => sw(c, "data-color")).join("")}</div><div class="row"><span class="note">Custom</span><input type="color" data-custom="color" value="${nt.color.slice(0, 7)}" aria-label="Custom text color"></div>`;
  else if (kind === "hl") pop.innerHTML = `<span class="wp-l">Highlight</span><button type="button" class="mi" data-hl="">None</button><div class="pal-sw">${HL_COLORS.map(c => sw(c, "data-hl")).join("")}</div><div class="row"><span class="note">Custom</span><input type="color" data-custom="hl" value="#ffd43b" aria-label="Custom highlight color"></div>`;
  else if (kind === "spacing"){
    const cur = (blocksInSel()[0] || {style:{}}).style.lineHeight || "";
    pop.innerHTML = `<span class="wp-l">Line spacing</span>` + [["1","Single"],["1.15","1.15"],["1.5","1.5"],["2","Double"],["","Default"]].map(([v, t]) => `<button type="button" class="mi ${cur === v ? "on" : ""}" data-lh="${v}">${t}</button>`).join("");
  }
  else if (kind === "table"){
    if (tblCtx()){ const ts = nt.tsel = tblSel(), cw = Math.round(colPx(ts.table)[ts.c0]), rh = Math.round(ts.table.rows[ts.r0].getBoundingClientRect().height);
      const cl = ts.c0 === ts.c1 ? `column ${ts.c0 + 1}` : `columns ${ts.c0 + 1}–${ts.c1 + 1}`, rl = ts.r0 === ts.r1 ? `row ${ts.r0 + 1}` : `rows ${ts.r0 + 1}–${ts.r1 + 1}`;
      pop.innerHTML = `<div class="tw"><span class="wp-l">Column width · ${cl}</span><div class="row"><input type="number" id="tw-c" min="20" max="2000" step="1" value="${cw}" aria-label="Column width in pixels"><span class="note">px</span><button type="button" class="btn small" data-tset="col">Set</button></div>
        <button type="button" class="mi" data-tset="even">${ts.c0 === ts.c1 ? "Make all columns the same width" : "Make these columns the same width"}</button>
        <span class="wp-l">Row height · ${rl}</span><div class="row"><input type="number" id="tw-r" min="20" max="1000" step="1" value="${rh}" aria-label="Row height in pixels"><span class="note">px</span><button type="button" class="btn small" data-tset="row">Set</button></div>
        <span class="note">Select across cells to size several columns or rows at once.</span></div>` + [["rowAbove","Insert row above"],["rowBelow","Insert row below"],["colLeft","Insert column left"],["colRight","Insert column right"],["delRow","Delete row","dz"],["delCol","Delete column","dz"],["delTable","Delete table","dz"]].map(([v, t, c]) => `<button type="button" class="mi ${c || ""}" data-tbl="${v}">${t}</button>`).join("") + `<span class="note">Or drag a cell's right or bottom edge to resize.</span>`; }
    else { let g = ""; for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) g += `<i data-tr="${r}" data-tc="${c}"></i>`; pop.innerHTML = `<span class="wp-l">Insert table</span><div class="tg">${g}</div><span class="note" id="tg-n">Pick a size</span>`; }
  }
  pop.hidden = false;
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
  pop.style.left = Math.round(Math.max(12, Math.min(r.left, innerWidth - w - 12))) + "px";
  const below = r.bottom + 6, h = pop.offsetHeight;
  pop.style.top = Math.round(below + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : below) + "px";
  requestAnimationFrame(() => { const pr = pop.getBoundingClientRect(), vw = document.documentElement.clientWidth; if (pr.right > vw - 12) pop.style.left = Math.max(12, vw - pr.width - 12) + "px"; });
}
pop.addEventListener("mousedown", e => { if (!e.target.closest("input")) e.preventDefault(); });
pop.addEventListener("mouseover", e => { const i = e.target.closest("[data-tr]"); if (!i) return; const R = +i.dataset.tr, C = +i.dataset.tc; pop.querySelectorAll("[data-tr]").forEach(x => x.classList.toggle("hl", +x.dataset.tr <= R && +x.dataset.tc <= C)); $("#tg-n").textContent = `${R} × ${C}`; });
pop.addEventListener("click", e => {
  const t = e.target;
  const c = t.closest("[data-color]"); if (c){ setColor("color", c.dataset.color); closePop(); return; }
  const h = t.closest("[data-hl]"); if (h){ setColor("hl", h.dataset.hl); closePop(); return; }
  const l = t.closest("[data-lh]"); if (l){ setSpacing(l.dataset.lh); closePop(); return; }
  const g = t.closest("[data-tr]"); if (g){ closePop(); insertTable(+g.dataset.tr, +g.dataset.tc); return; }
  const o = t.closest("[data-tbl]"); if (o){ closePop(); restoreSel(); tblOp(o.dataset.tbl); return; }
  const ts = t.closest("[data-tset]"); if (ts){ tblSet(ts.dataset.tset); closePop(); restoreSel(); }
});
pop.addEventListener("keydown", e => { if (e.key === "Enter" && (e.target.id === "tw-c" || e.target.id === "tw-r")){ e.preventDefault(); tblSet(e.target.id === "tw-c" ? "col" : "row"); closePop(); restoreSel(); } });
pop.addEventListener("change", e => { const i = e.target.closest("[data-custom]"); if (!i) return; setColor(i.dataset.custom, i.dataset.custom === "hl" ? i.value + "80" : i.value); closePop(); });
document.addEventListener("mousedown", e => { if (!pop.hidden && !e.target.closest("#nt-pop,[data-pop]")) closePop(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden){ e.stopPropagation(); closePop(); restoreSel(); } }, true);
$("#nt-tb").addEventListener("scroll", closePop);
$("#nt-canvas").addEventListener("scroll", closePop);
addEventListener("resize", closePop);
Notes.subscribe(() => { if (ready){ renderNotes(); renderDeleted(); updateDelCount(); Home.refresh(); } });