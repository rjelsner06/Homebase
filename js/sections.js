/* Homebase: SECTIONS: the pages in the top bar (and the ⋯ More menu), built-in and your own.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html.

   What a section is
   -----------------
   Every page you can go to is a "section": the built-in ones (Home, Notes, Grocery, To-do, All items,
   Deleted, Lifts) and sections you make yourself. Each one has a name, a symbol, a color, an order, and a
   place: "main" (in the top bar), "more" (in the ⋯ menu) or "hidden". Your own sections also hold a list of
   "blocks" (a notes folder, links, an embedded app, a widget, or some text).

   Saved as synced records of kind "section" (one record per section, like links), so the same setup shows
   on the laptop and the iPhone. A built-in section only gets a record once you change it; until then its
   defaults (BUILTIN below) are used.

   For later (left sidebar, Calorie tracker):
   - Sections.list() gives every section in order, ready to draw ({id, name, icon, color, place, href, ...}).
     Sections.iconHTML(s) draws its symbol, Sections.count(id) its badge, Sections.subscribe(fn) tells you when
     anything changes. The top bar is just one renderer of that list; a sidebar can be another.
   - To add a built-in section: add a line to BUILTIN, a <section data-pagebox="…"> in index.html and the
     page name to PAGES in js/home.js.
   - To add a kind of block: Sections.registerBlock(type, {...}) (see BLOCKS below for the shape).
   - To add a widget for sections: Sections.registerWidget(key, {name, desc, html()}). */
"use strict";

const Sections = (() => {
  const SV = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  /* symbols you can pick (besides any emoji) */
  const ICONS = {
    home:'<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>',
    notes:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.5L22 7H6"/>',
    check:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    dumbbell:'<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
    folder:'<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    cap:'<path d="M12 4 2 9l10 5 10-5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
    bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    flask:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    star:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    heart:'<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
    apple:'<path d="M12 7c-1.5-1-5-1.2-6.5 1.5S5 16 7.5 19c1.2 1.4 2.6 1.6 4.5.8 1.9.8 3.3.6 4.5-.8 2.5-3 3.5-7.8 2-10.5S13.5 6 12 7z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
    code:'<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
    music:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    text:'<path d="M4 6h16M4 12h16M4 18h10"/>',
    widget:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10h18M10 10v11"/>',
    app:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  };
  const EMOJI = ["🏠","📝","🛒","✅","📋","🗑️","🏋️","📁","📚","🎓","⚡","🔋","🧮","🔬","💡","💼","💰","🍳","🍎","🏃","🎵","🎮","⭐","📈"];
  const COLORS = ["c1","c2","c3","c4","c5","c6","c7","c8","c9","c10"];   // the course colors (var(--c1)…), so they follow light/dark
  const PLACES = ["main","more","hidden"];
  const PLACE_NAME = {main:"Bar", more:"More", hidden:"Hidden"};

  /* Built-in sections. "lock": always in the bar (Home). Order here is the default order. */
  const BUILTIN = [
    {id:"home",    name:"Home",     icon:"i:home",     place:"main", lock:true},
    {id:"notes",   name:"Notes",    icon:"i:notes",    place:"main"},
    {id:"grocery", name:"Grocery",  icon:"i:cart",     place:"main"},
    {id:"todo",    name:"To-do",    icon:"i:check",    place:"more"},
    {id:"items",   name:"All items",icon:"i:list",     place:"more"},
    {id:"deleted", name:"Deleted",  icon:"i:trash",    place:"more"},
    {id:"lifts",   name:"Lifts",    icon:"i:dumbbell", place:"more"},
  ];
  const builtin = id => BUILTIN.find(b => b.id === id) || null;

  const SecStore = DocStore("homebase.sections.v1", "section", () => BUILTIN.map((b, i) => ({id:b.id, d:{builtin:true, place:b.place, order:i}, _m:0})));

  /* ---------- reading ---------- */
  function normBlocks(list){
    return (Array.isArray(list) ? list : []).filter(b => b && BLOCKS[b.type]).map(b => ({...b, id:String(b.id || uid())}));
  }
  function norm(id, d){
    if (!d) return null;
    const b = builtin(id);
    if (d.builtin && !b) return null;   // a built-in from a newer copy of Homebase: skip it here
    const place = b && b.lock ? "main" : PLACES.includes(d.place) ? d.place : (b ? b.place : "main");
    return {
      id, builtin:!!b, lock:!!(b && b.lock),
      name:String(d.name || "").trim() || (b ? b.name : "Section"),
      icon:String(d.icon || "") || (b ? b.icon : "i:folder"),
      color:COLORS.includes(d.color) ? d.color : "",
      place, order:Number.isFinite(+d.order) ? +d.order : 999,
      blocks:b ? [] : normBlocks(d.blocks),
      href:b ? "#" + id : "#s/" + encodeURIComponent(id),
    };
  }
  function list(){
    const out = SecStore.all().map(o => norm(o.id, o.d)).filter(Boolean);
    BUILTIN.forEach((b, i) => { if (!out.some(s => s.id === b.id)) out.push(norm(b.id, {builtin:true, place:b.place, order:100 + i})); });
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  const get = id => list().find(s => s.id === id) || null;
  /* the stored shape for a section (built-ins: only what you changed) */
  const raw = id => { const d = SecStore.get(id); if (d) return {...d}; const b = builtin(id); return b ? {builtin:true, place:b.place} : null; };

  const colorVar = c => COLORS.includes(c) ? `var(--${c})` : "";
  function secIcon(s, cls = ""){
    const ic = (s && s.icon) || "", st = s && s.color ? ` style="color:${colorVar(s.color)}"` : "";
    if (ic.startsWith("e:")) return `<span class="sx-ic ${cls}" aria-hidden="true">${esc(ic.slice(2))}</span>`;
    const p = ICONS[ic.slice(2)] || ICONS.folder;
    return `<span class="sx-ic ${cls}"${st} aria-hidden="true">${SV(p)}</span>`;
  }

  /* ---------- counts on the tabs ---------- */
  const NAVC = {};   // section id → {n, alert}
  function paintCounts(){
    $$("[data-cnt]").forEach(el => { const c = NAVC[el.dataset.cnt], n = c ? c.n : 0; el.textContent = n || ""; el.hidden = !n; el.classList.toggle("al", !!(c && c.alert)); });
    const more = list().filter(s => s.place === "more"), dot = more.reduce((t, s) => t + (NAVC[s.id] && NAVC[s.id].alert ? NAVC[s.id].n : 0), 0);
    const md = $("#more-dot"); if (md){ md.textContent = dot || ""; md.hidden = !dot; }
    const mb = $("#more-b");
    if (mb) mb.title = more.length ? more.map(s => s.name + (NAVC[s.id] && NAVC[s.id].n ? ` (${NAVC[s.id].n})` : "")).join(", ") : "More";
  }
  function setCount(id, n, alert){ NAVC[id] = {n:Math.max(0, +n || 0), alert:!!alert}; paintCounts(); }

  /* ---------- the top bar and the ⋯ menu ---------- */
  let cur = null;   // which section is open (set by route() in js/home.js)
  const pageFromHash = () => { const [p, sub] = location.hash.slice(1).split("/"); return p === "s" ? decodeURIComponent(sub || "") : (p || "home"); };
  const cnt = s => `<span class="cnt" data-cnt="${esc(s.id)}" hidden></span>`;
  function renderNav(){
    const nav = $("#nav-tabs"), menu = $("#more-m"); if (!nav || !menu) return;
    const L = list(), showIc = !!Settings.get().navIcons, now = cur ?? pageFromHash();
    nav.querySelectorAll("[data-sec]").forEach(a => a.remove());
    const tab = s => `<a href="${s.href}" data-sec="${esc(s.id)}"${s.id === now ? ' aria-current="page"' : ""}>${showIc ? secIcon(s, "nv-ic") : s.color ? `<i class="nv-dot" style="--sc:${colorVar(s.color)}" aria-hidden="true"></i>` : ""}<span>${esc(s.name)}</span>${cnt(s)}</a>`;
    $("#more-b").insertAdjacentHTML("beforebegin", L.filter(s => s.place === "main").map(tab).join(""));
    const more = L.filter(s => s.place === "more");
    menu.innerHTML = more.map(s => `<a href="${s.href}" data-sec="${esc(s.id)}" role="menuitem"${s.id === now ? ' aria-current="page"' : ""}><span class="mm-n">${secIcon(s, "mm-ic")}${esc(s.name)}</span>${cnt(s)}</a>`).join("")
      + `${more.length ? '<hr class="mm-sep">' : ""}<button type="button" class="mm-edit" role="menuitem" data-sx-edit>${SV('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>')}Edit sections…</button>`;
    markCurrent();
    paintCounts();
  }
  function markCurrent(p){
    if (p !== undefined) cur = p;
    const now = cur ?? pageFromHash();
    $$("#nav-tabs [data-sec], #more-m [data-sec]").forEach(a => a.dataset.sec === now ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    const s = get(now), mb = $("#more-b"); if (mb) mb.classList.toggle("on", !!(s && s.place === "more"));
  }
  document.addEventListener("click", e => {
    if (!e.target.closest("[data-sx-edit]")) return;
    if (typeof closeMore === "function") closeMore();
    openSettings("sections"); renderSettingsSec();
  });

  /* =====================================================================
     BLOCKS: what a section of your own can hold.
     A block type: {name, icon, wide (spans the full width), frame (holds an iframe: built once, not redrawn on
     every change), html(b) → inner HTML, mount(b, el) for frames, fields(b) → editor HTML, label(b)}.
     ===================================================================== */
  const BLOCKS = {};
  const WIDGETS = {};
  function registerBlock(type, def){ BLOCKS[type] = def; }
  function registerWidget(key, def){ WIDGETS[key] = def; }

  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;

  registerBlock("folder", {
    name:"Notes folder", icon:"folder", desc:"The notes in one of your folders",
    label:b => { const f = Notes.folder(b.folder); return f && !f.deletedAt ? Notes.path(f.id) : "Pick a folder"; },
    html(b){
      const f = Notes.folder(b.folder);
      if (!f || f.deletedAt) return `<h2><span>Notes folder</span></h2><p class="note">This folder isn't there anymore. Press Edit to pick another one.</p>`;
      const ids = new Set(Notes.descendants(f.id)), all = Notes.notes().filter(n => ids.has(n.folderId)).sort((a, x) => String(x.updatedAt).localeCompare(String(a.updatedAt)));
      const shown = all.slice(0, 12);
      return `<h2><span class="sx-bh">${SV(ICONS.folder)}${esc(f.name)}</span><span class="sx-ha"><button type="button" class="btn small" data-sxnew="${esc(f.id)}">+ Note</button><button type="button" class="btn small ghost" data-sxfolder="${esc(f.id)}">Open ›</button></span></h2>
        <ul class="sx-notes">${shown.map(n => `<li><button type="button" class="sx-note" data-sxnote="${esc(n.id)}" data-sxf="${esc(f.id)}">${n.file ? `<span class="ft-badge" data-ft="${esc(n.file.ext)}">${esc(String(n.file.ext).toUpperCase())}</span>` : `<span class="sx-nic">${SV(ICONS.notes)}</span>`}<span class="sx-nt">${esc(n.title || "Untitled")}</span><span class="sx-nd">${esc(cardDate(n.updatedAt))}</span></button></li>`).join("")
          || `<li class="empty">No notes in this folder yet.</li>`}${all.length > shown.length ? `<li><button type="button" class="linkb sx-all" data-sxfolder="${esc(f.id)}">See all ${all.length}</button></li>` : ""}</ul>`;
    },
    fields(b){
      return `<select data-bf="folder" aria-label="Folder">${opt("", "Pick a folder…", !b.folder)}${folderTree().map(({f, lvl}) => opt(f.id, "  ".repeat(lvl) + f.name, f.id === b.folder)).join("")}</select>`;
    },
  });

  registerBlock("links", {
    name:"Links", icon:"link", desc:"Buttons for some of your links",
    label:b => { const n = (b.links || []).filter(id => getLink(id)).length; return n ? plural(n, "link") : "Pick links"; },
    html(b){
      const L = (b.links || []).map(getLink).filter(Boolean);
      return `<h2><span>${esc(b.title || "Links")}</span></h2>${L.length ? `<div class="sx-links">${L.map(l => `<button type="button" class="lk" data-sxlink="${esc(l.id)}" title="${esc(linkName(l))}">${iconHTML(l) || iconHTML({...l, icon:"f:"})}<span class="lk-t">${esc(linkName(l))}</span>${opensTab(l) ? '<span class="lk-ext" aria-hidden="true">↗</span>' : ""}</button>`).join("")}</div>`
        : `<p class="note">No links picked. Press Edit to choose some (add new ones in Settings → Links).</p>`}`;
    },
    fields(b){
      const L = linksSorted(), on = new Set(b.links || []);
      return `<input data-bf="title" placeholder="Title (optional)" maxlength="40" value="${esc(b.title || "")}" aria-label="Title">
        <div class="sx-chks">${L.map(l => `<label class="sx-chk"><input type="checkbox" data-bf="links" value="${esc(l.id)}"${on.has(l.id) ? " checked" : ""}>${iconHTML(l)}<span>${esc(linkName(l))}</span></label>`).join("") || '<p class="note">No links yet. Add them in Settings → Links.</p>'}</div>`;
    },
  });

  const H = {m:"Medium", l:"Tall", full:"Fill the screen"};
  registerBlock("app", {
    name:"Embedded app", icon:"app", desc:"Lifts, an uploaded HTML app or a web page, right in the section", wide:true, frame:true,
    label:b => { const l = getLink(b.link); return l ? linkName(l) : "Pick an app"; },
    html(b){
      const l = getLink(b.link);
      return `<h2><span class="sx-bh">${l ? iconHTML(l) : ""}${esc(l ? linkName(l) : "App")}</span>${l ? `<span class="sx-ha"><button type="button" class="btn small ghost" data-sxlink="${esc(l.id)}" data-force="1">Pop out</button></span>` : ""}</h2>
        <div class="sx-frame" data-h="${esc(b.h || "m")}"></div>`;
    },
    mount(b, el){
      const box = el.querySelector(".sx-frame"), l = getLink(b.link);
      if (!l){ box.innerHTML = `<p class="note sx-pad">This app isn't there anymore. Press Edit to pick another one.</p>`; box.dataset.h = "auto"; return; }
      if (l.kind === "app"){
        if (l.app === "lifts" || l.id === "lifts") makeLiftFrame(box);
        else { box.innerHTML = `<p class="note sx-pad">This built-in app can't be shown here yet.</p>`; box.dataset.h = "auto"; }
        return;
      }
      if (l.kind === "html"){
        const f = document.createElement("iframe"); f.title = linkName(l); f.setAttribute("sandbox", SANDBOX); f.dataset.app = l.id;
        box.appendChild(f); appWins.set(f.contentWindow, l.id); f.srcdoc = appDoc(l); return;
      }
      if (l.newTab || /^http:/i.test(l.url || "") || likelyBlocks(l.url)){
        box.dataset.h = "auto";
        box.innerHTML = `<div class="sx-noframe"><p class="note">${esc(hostOf(l.url))} doesn't allow being shown inside another page, so it opens in a new tab.</p><button type="button" class="btn small" data-sxlink="${esc(l.id)}">Open ${esc(linkName(l))} ↗</button></div>`;
        return;
      }
      const f = document.createElement("iframe"); f.title = linkName(l); f.src = embedUrl(l.url);
      f.referrerPolicy = "strict-origin-when-cross-origin"; f.allow = "fullscreen; clipboard-write; autoplay"; box.appendChild(f);
    },
    fields(b){
      const L = linksSorted();
      return `<select data-bf="link" aria-label="App">${opt("", "Pick an app or link…", !b.link)}${L.map(l => opt(l.id, linkName(l) + (l.kind === "app" ? " (built in)" : l.kind === "html" ? " (HTML app)" : " · " + hostOf(l.url)), l.id === b.link)).join("")}</select>
        <div class="seg sx-hseg" role="group" aria-label="Height">${Object.entries(H).map(([k, n]) => `<button type="button" data-bh="${k}" aria-pressed="${(b.h || "m") === k}">${n}</button>`).join("")}</div>`;
    },
  });

  registerBlock("widget", {
    name:"Widget", icon:"widget", desc:"A small live view, like what's due soon",
    label:b => (WIDGETS[b.widget] || {}).name || "Pick a widget",
    html(b){ const w = WIDGETS[b.widget]; return w ? w.html(b) : `<h2><span>Widget</span></h2><p class="note">Press Edit to pick a widget.</p>`; },
    fields(b){ return `<select data-bf="widget" aria-label="Widget">${opt("", "Pick a widget…", !b.widget)}${Object.entries(WIDGETS).map(([k, w]) => opt(k, w.name + " · " + w.desc, k === b.widget)).join("")}</select>`; },
  });

  registerBlock("text", {
    name:"Text", icon:"text", desc:"A heading and a few lines of your own", wide:true,
    label:b => b.title || (b.text ? trunc(b.text, 30) : "Empty"),
    html(b){ return `${b.title ? `<h2><span>${esc(b.title)}</span></h2>` : ""}<div class="sx-text">${esc(b.text || "").replace(/\n/g, "<br>") || '<span class="note">Empty. Press Edit to write something.</span>'}</div>`; },
    fields(b){ return `<input data-bf="title" placeholder="Heading (optional)" maxlength="60" value="${esc(b.title || "")}" aria-label="Heading"><textarea data-bf="text" rows="3" maxlength="2000" placeholder="Anything you want to keep here" aria-label="Text">${esc(b.text || "")}</textarea>`; },
  });

  /* ---------- widgets you can put in a section ---------- */
  registerWidget("due", {name:"Due soon", desc:"your next open to-dos",
    html(){
      const L = Store.all().filter(isTodo).filter(r => !r.completed).sort(listSort), shown = L.slice(0, 8);
      return `<h2><span>Due soon</span><a class="nw-open" href="#todo/all">Open ›</a></h2><ul class="todo compact">${shown.map(r => todoRowHTML(r, true)).join("") || '<li class="empty">Nothing to do. Nice.</li>'}</ul>${L.length > shown.length ? `<a class="more-link" href="#todo/all">See all ${L.length}</a>` : ""}`;
    }});
  registerWidget("grocery", {name:"Grocery list", desc:"what's left to get",
    html(){
      const L = GrocItems.all().map(o => o.d || {}).filter(d => (d.list || "main") === "main" && !d.checked);
      return `<h2><span>Grocery</span><a class="nw-open" href="#grocery">Open ›</a></h2><p class="sx-big"><b>${L.length}</b> ${L.length === 1 ? "item" : "items"} to get</p>${L.length ? `<ul class="sx-gl">${L.slice(0, 10).map(d => `<li>${esc(d.name || "Item")}</li>`).join("")}${L.length > 10 ? `<li class="note">and ${L.length - 10} more</li>` : ""}</ul>` : ""}`;
    }});

  /* =====================================================================
     A SECTION'S PAGE (#s/<id>) and the Lifts page (#lifts)
     ===================================================================== */
  let pageSig = null;
  function dropFrames(root){
    root.querySelectorAll("iframe").forEach(f => { try { appWins.delete(f.contentWindow); } catch(e){} liftFrames.delete(f); f.remove(); });
  }
  function blockBox(b){ const T = BLOCKS[b.type]; return `<section class="tile sx-blk${T.wide ? " wide" : ""}" data-blk="${esc(b.id)}" data-type="${esc(b.type)}">${T.html(b)}</section>`; }
  function renderPage(){
    if (typeof page === "undefined") return;
    if (page === "lifts") return renderLifts();
    if (page !== "sec") return;
    const id = cur, s = get(id), box = $("#sx-blocks");
    const sig = s ? JSON.stringify([s.id, s.name, s.icon, s.color, s.blocks]) : "none:" + id;
    $("#sx-page").style.setProperty("--sxc", s && s.color ? colorVar(s.color) : "var(--accent)");
    if (sig !== pageSig){
      pageSig = sig; dropFrames(box);
      $("#sx-hic").innerHTML = s ? secIcon(s) : "";
      $("#sx-title").textContent = s ? s.name : "Section not found";
      $("#sx-edit").hidden = !s;
      document.title = (s ? s.name + " · " : "") + "Homebase";
      if (!s){ box.innerHTML = `<div class="tile"><p>This section isn't on this device${Sync.user() ? " (yet: it may still be syncing)" : ""}. It may have been deleted.</p><p><a class="btn small" href="#home">Go home</a></p></div>`; return; }
      box.innerHTML = s.blocks.map(blockBox).join("") || `<div class="tile sx-empty"><b>This section is empty</b><p class="note">Add a notes folder, links, an app, a widget or some text.</p><p><button type="button" class="btn primary" data-sx-editthis>Add something</button></p></div>`;
      s.blocks.forEach(b => { const T = BLOCKS[b.type]; if (T.mount) T.mount(b, box.querySelector(`[data-blk="${CSS.escape(b.id)}"]`)); });
      sizeFrames();
      return;
    }
    /* same layout: refresh the live blocks in place (frames are left alone so apps don't reload) */
    s.blocks.forEach(b => { const T = BLOCKS[b.type]; if (T.frame) return; const el = box.querySelector(`[data-blk="${CSS.escape(b.id)}"]`); if (el){ const h = T.html(b); if (el._h !== h){ el.innerHTML = h; el._h = h; } } });
  }
  function sizeFrames(){
    $$(".sx-frame[data-h='full'], #lifts-host").forEach(el => { if (el.offsetParent === null) return; const top = el.getBoundingClientRect().top + window.scrollY; el.style.height = Math.max(420, innerHeight - top - 16) + "px"; });
  }
  addEventListener("resize", sizeFrames);
  function renderLifts(){
    const host = $("#lifts-host"); if (!host) return;
    if (!host.querySelector("iframe")) makeLiftFrame(host);
    document.title = (get("lifts") || {name:"Lifts"}).name + " · Homebase";
    requestAnimationFrame(sizeFrames);
  }

  $("#sx-blocks").addEventListener("click", e => {
    const t = e.target;
    const nb = t.closest("[data-sxnote]"); if (nb) return goNote(nb.dataset.sxnote, nb.dataset.sxf);
    const fo = t.closest("[data-sxfolder]"); if (fo){ nt.folder = fo.dataset.sxfolder; nt.q = ""; $("#nt-q").value = ""; nt.note = null; nt.mobileEdit = false; location.hash = "#notes"; return; }
    const nw = t.closest("[data-sxnew]"); if (nw){ nt.folder = nw.dataset.sxnew; location.hash = "#notes"; setTimeout(newNote, 0); return; }
    const lk = t.closest("[data-sxlink]"); if (lk) return openLink(lk.dataset.sxlink, !!lk.dataset.force);
    if (t.closest("[data-sx-editthis]")) return openEditor(cur);
  });
  $("#sx-edit").onclick = () => openEditor(cur);
  function goNote(nid, fid){
    nt.folder = fid || "all"; nt.q = ""; $("#nt-q").value = "";
    location.hash = "#notes"; setTimeout(() => openNote(nid), 0);
  }

  /* =====================================================================
     SETTINGS → Sections: order, where each one shows, add your own
     ===================================================================== */
  const DRAG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  function renderSettingsSec(){
    const el = $("#sx-list"); if (!el) return;
    const L = list();
    $("#sx-navic").checked = !!Settings.get().navIcons;
    el.innerHTML = L.map((s, i) => `<li class="sx-li" data-sxid="${esc(s.id)}"><span class="lk-drag" aria-hidden="true" title="Drag to reorder">${DRAG}</span>${secIcon(s)}
      <span class="sx-m"><b>${esc(s.name)}</b><small>${s.builtin ? (s.lock ? "Built in · always in the bar" : "Built in") : `Your section · ${s.blocks.length ? plural(s.blocks.length, "part") : "empty"}`}</small></span>
      <span class="sx-b"><span class="seg sx-pl" role="group" aria-label="Where ${esc(s.name)} shows">${PLACES.map(p => `<button type="button" data-sxpl="${esc(s.id)},${p}" aria-pressed="${s.place === p}"${s.lock && p !== "main" ? " disabled" : ""}>${PLACE_NAME[p]}</button>`).join("")}</span>
      <button type="button" class="btn icon sm" data-sxmv="${esc(s.id)},-1" aria-label="Move ${esc(s.name)} up" ${i ? "" : "disabled"}>↑</button><button type="button" class="btn icon sm" data-sxmv="${esc(s.id)},1" aria-label="Move ${esc(s.name)} down" ${i < L.length - 1 ? "" : "disabled"}>↓</button><button type="button" class="btn small" data-sxed="${esc(s.id)}">Edit</button></span></li>`).join("");
  }
  function saveOrder(ids){
    SecStore.putMany(ids.map((id, k) => [id, {...raw(id), order:k}]));
  }
  $("#sx-list").addEventListener("click", e => {
    const pl = e.target.closest("[data-sxpl]");
    if (pl){ const [id, p] = pl.dataset.sxpl.split(","), s = get(id); if (!s || s.place === p) return; SecStore.put(id, {...raw(id), place:p, order:s.order}); return; }
    const mv = e.target.closest("[data-sxmv]");
    if (mv){
      const [id, dir] = mv.dataset.sxmv.split(","), L = list().map(s => s.id), i = L.indexOf(id), j = i + +dir;
      if (i < 0 || j < 0 || j >= L.length) return;
      [L[i], L[j]] = [L[j], L[i]]; saveOrder(L);
      setTimeout(() => { const b = $(`#sx-list [data-sxmv="${CSS.escape(id)},${dir}"]`); if (b && !b.disabled) b.focus(); }, 0);
      return;
    }
    const ed = e.target.closest("[data-sxed]"); if (ed) openEditor(ed.dataset.sxed);
  });
  $("#sx-add").onclick = () => openEditor(null);
  $("#sx-navic").addEventListener("change", e => { Settings.update(st => { st.navIcons = e.target.checked; }); renderNav(); });
  /* drag a section by its handle to a new spot (mouse or finger), same as Links */
  (() => {
    const L = $("#sx-list"); let drag = null;
    L.addEventListener("pointerdown", e => {
      const h = e.target.closest(".lk-drag"); if (!h) return;
      const li = h.closest("li"); e.preventDefault();
      drag = {li, pid:e.pointerId}; li.classList.add("dragging"); L.setPointerCapture(e.pointerId);
    });
    L.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.pid) return;
      const rows = [...L.querySelectorAll("li[data-sxid]")].filter(x => x !== drag.li);
      const after = rows.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      after ? L.insertBefore(drag.li, after) : L.appendChild(drag.li);
      const box = L.closest(".st-pane") || L.closest(".dlg-b"); if (box){ const r = box.getBoundingClientRect(); if (e.clientY < r.top + 40) box.scrollTop -= 12; else if (e.clientY > r.bottom - 40) box.scrollTop += 12; }
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.pid) return;
      drag.li.classList.remove("dragging"); drag = null;
      const order = [...L.querySelectorAll("li[data-sxid]")].map(x => x.dataset.sxid);
      if (order.join() === list().map(s => s.id).join()) return renderSettingsSec();
      saveOrder(order);
    };
    L.addEventListener("pointerup", end); L.addEventListener("pointercancel", end);
  })();

  /* ---------- the section editor (name, symbol, color, place, and what's in it) ---------- */
  let sx = null;   // the draft being edited
  function openEditor(id){
    const s = id ? get(id) : null;
    if (id && !s) return;
    sx = s ? {id:s.id, isNew:false, builtin:s.builtin, lock:s.lock, name:s.name, icon:s.icon, color:s.color, place:s.place, blocks:JSON.parse(JSON.stringify(s.blocks))}
           : {id:"c" + uid(), isNew:true, builtin:false, lock:false, name:"", icon:"e:📁", color:"", place:"main", blocks:[]};
    $("#sx-h").textContent = s ? `Edit “${s.name}”` : "New section";
    $("#sx-name").value = sx.name;
    $("#sx-emoji").value = sx.icon.startsWith("e:") && !EMOJI.includes(sx.icon.slice(2)) ? sx.icon.slice(2) : "";
    $("#sx-err").hidden = true;
    $("#sx-content").hidden = sx.builtin;
    $("#sx-bnote").hidden = !sx.builtin;
    $("#sx-del").hidden = sx.builtin || sx.isNew;
    drawEditor();
    const d = $("#dlg-sx"); if (!d.open) d.showModal();
    if (!s) $("#sx-name").focus();
  }
  function drawEditor(){
    $("#sx-icpick").innerHTML = Object.keys(ICONS).filter(k => !["text","widget","app"].includes(k)).map(k => `<button type="button" class="le-i" data-sxic="i:${k}" aria-pressed="${sx.icon === "i:" + k}" aria-label="${k} symbol">${secIcon({icon:"i:" + k})}</button>`).join("")
      + EMOJI.map(e => `<button type="button" class="le-i" data-sxic="e:${e}" aria-pressed="${sx.icon === "e:" + e}" aria-label="${e}">${e}</button>`).join("");
    $("#sx-colors").innerHTML = `<button type="button" class="sw sx-none" data-sxc="" aria-pressed="${!sx.color}" aria-label="No color" title="No color"></button>`
      + COLORS.map((c, k) => `<button type="button" class="sw" style="--sc:var(--${c})" data-sxc="${c}" aria-pressed="${sx.color === c}" aria-label="Color ${k + 1}"></button>`).join("");
    $$("#sx-place [data-pl]").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.pl === sx.place)); b.disabled = sx.lock && b.dataset.pl !== "main"; });
    drawBlocks();
  }
  function drawBlocks(){
    if (sx.builtin) return;
    $("#sx-blist").innerHTML = sx.blocks.map((b, i) => { const T = BLOCKS[b.type];
      return `<li class="sx-bi" data-bi="${i}"><div class="sx-bt">${secIcon({icon:"i:" + T.icon})}<b>${esc(T.name)}</b><span class="sp"></span>
        <button type="button" class="btn icon sm" data-bmv="${i},-1" aria-label="Move up" ${i ? "" : "disabled"}>↑</button><button type="button" class="btn icon sm" data-bmv="${i},1" aria-label="Move down" ${i < sx.blocks.length - 1 ? "" : "disabled"}>↓</button><button type="button" class="btn icon sm" data-bdel="${i}" aria-label="Remove ${esc(T.name)}">×</button></div>
        <div class="sx-bf">${T.fields(b)}</div></li>`; }).join("") || `<li class="note sx-bnone">Nothing in it yet. Add a part below.</li>`;
    $("#sx-addrow").innerHTML = Object.entries(BLOCKS).map(([k, T]) => `<button type="button" class="btn small" data-badd="${k}" title="${esc(T.desc || "")}">${secIcon({icon:"i:" + T.icon})}${esc(T.name)}</button>`).join("");
  }
  $("#sx-icpick").addEventListener("click", e => { const b = e.target.closest("[data-sxic]"); if (!b) return; sx.icon = b.dataset.sxic; $("#sx-emoji").value = ""; drawEditor(); });
  $("#sx-emoji").addEventListener("input", e => { const v = e.target.value.trim(); if (v){ sx.icon = "e:" + v; $$("#sx-icpick [data-sxic]").forEach(b => b.setAttribute("aria-pressed", "false")); } });
  $("#sx-colors").addEventListener("click", e => { const b = e.target.closest("[data-sxc]"); if (!b) return; sx.color = b.dataset.sxc; $$("#sx-colors [data-sxc]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); $$("#sx-icpick .sx-ic").forEach(i => i.style.color = sx.color ? colorVar(sx.color) : ""); });
  $("#sx-place").addEventListener("click", e => { const b = e.target.closest("[data-pl]"); if (!b || b.disabled) return; sx.place = b.dataset.pl; $$("#sx-place [data-pl]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
  $("#sx-addrow").addEventListener("click", e => {
    const b = e.target.closest("[data-badd]"); if (!b) return;
    const type = b.dataset.badd, nb = {id:uid(), type};
    if (type === "app"){ nb.h = "m"; if (getLink("lifts")) nb.link = "lifts"; }
    if (type === "links") nb.links = [];
    sx.blocks.push(nb); drawBlocks();
    const last = $("#sx-blist li:last-child select, #sx-blist li:last-child input, #sx-blist li:last-child textarea"); if (last) last.focus();
  });
  $("#sx-blist").addEventListener("click", e => {
    const mv = e.target.closest("[data-bmv]");
    if (mv){ const [i, d] = mv.dataset.bmv.split(",").map(Number), j = i + d; if (j < 0 || j >= sx.blocks.length) return; [sx.blocks[i], sx.blocks[j]] = [sx.blocks[j], sx.blocks[i]]; drawBlocks(); return; }
    const del = e.target.closest("[data-bdel]"); if (del){ sx.blocks.splice(+del.dataset.bdel, 1); drawBlocks(); return; }
    const h = e.target.closest("[data-bh]");
    if (h){ const b = sx.blocks[+h.closest("[data-bi]").dataset.bi]; b.h = h.dataset.bh; h.parentElement.querySelectorAll("[data-bh]").forEach(x => x.setAttribute("aria-pressed", String(x === h))); }
  });
  const readField = e => {
    const t = e.target.closest("[data-bf]"), li = t && t.closest("[data-bi]"); if (!li) return;
    const b = sx.blocks[+li.dataset.bi], k = t.dataset.bf;
    if (k === "links") b.links = [...li.querySelectorAll('[data-bf="links"]:checked')].map(x => x.value);
    else b[k] = t.value;
  };
  $("#sx-blist").addEventListener("input", readField);
  $("#sx-blist").addEventListener("change", readField);
  $("#form-sx").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#sx-name").value.trim(), err = $("#sx-err");
    if (!name){ err.textContent = "Give the section a name."; err.hidden = false; $("#sx-name").focus(); return; }
    const b = builtin(sx.id), L = list();
    const d = sx.builtin
      ? {...raw(sx.id), name:name === b.name ? "" : name, icon:sx.icon === b.icon ? "" : sx.icon, color:sx.color, place:sx.place}
      : {...(raw(sx.id) || {}), name, icon:sx.icon, color:sx.color, place:sx.place, blocks:sx.blocks.map(x => ({...x})), order:sx.isNew ? (L.length ? Math.max(...L.map(s => s.order)) + 1 : 0) : get(sx.id).order};
    if (sx.builtin) d.order = get(sx.id).order;
    const isNew = sx.isNew, id = sx.id, place = sx.place;
    SecStore.put(id, d); pageSig = null;
    $("#dlg-sx").close();
    if (isNew){
      toast(place === "hidden" ? `Made “${trunc(name, 24)}” (hidden)` : `Made “${trunc(name, 24)}”`);
      if ($("#dlg-settings").open) $("#dlg-settings").close();
      location.hash = "#s/" + encodeURIComponent(id);
    } else toast(`Saved “${trunc(name, 28)}”`);
  });
  $("#sx-del").onclick = async () => {
    const id = sx && sx.id, s = id && get(id); if (!s || s.builtin) return;
    if (!(await confirmBox({title:`Delete “${s.name}”?`, body:"The section is removed on all your devices. The notes, links and apps it showed are not deleted.", ok:"Delete"}))) return;
    const d = raw(id); SecStore.del(id); $("#dlg-sx").close();
    if (cur === id) location.hash = "#home";
    toast(`Deleted “${trunc(s.name, 28)}”`, () => SecStore.put(id, d));
  };
  $("#dlg-sx").addEventListener("close", () => { sx = null; });

  /* ---------- keep everything up to date ---------- */
  const listeners = new Set();
  const changed = () => { renderNav(); renderSettingsSec(); if (ready) renderPage(); listeners.forEach(f => { try { f(); } catch(e){ console.error(e); } }); };
  SecStore.subscribe(changed);
  Settings.onReplace(() => setTimeout(changed, 0));
  const live = () => { if (ready && typeof page !== "undefined" && page === "sec") renderPage(); };
  Notes.subscribe(live); LinkStore.subscribe(() => { pageSig = null; live(); }); GrocItems.subscribe(live);
  $("#dlg-settings .st-nav").addEventListener("click", e => { if (e.target.closest('[data-stcat="sections"]')) renderSettingsSec(); });
  renderNav();
  renderSettingsSec();

  return {
    list, get, iconHTML:secIcon, count:id => (NAVC[id] || {n:0}).n, setCount,
    subscribe(f){ listeners.add(f); return () => listeners.delete(f); },
    registerBlock, registerWidget, renderNav, markCurrent, renderPage, renderSettingsSec, openEditor,
    BUILTIN, ICONS,
  };
})();
/* Sets the little number on a section's tab (and the red dot on ⋯ for alerts). Used by To-do, Deleted, Grocery. */
function setNavCount(id, n, alert){ Sections.setCount(id, n, alert); }
