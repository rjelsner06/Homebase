/* Homebase: HOME SCREENS: tile grid and widget fitting, plus the ⋯ menu, page routing (#home, #notes…) and global events.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";
 
/* =====================================================================
   FIT: home widgets never scroll. Each tile drops its extras in order
   (data-drop="1" goes first) and lists show as many rows as fit, with a
   "See all" row for the rest. Runs after any widget changes size or content.
   ===================================================================== */
function fitTile(t){
  if (!t || !t.isConnected || !t.closest(".hw") || !t.offsetParent) return;
  t.querySelectorAll(".fit-off").forEach(e => e.classList.remove("fit-off"));
  const body = t.dataset.fitbody ? t.querySelector(t.dataset.fitbody) : null, ratio = +t.dataset.fitratio || .5;
  const tight = () => t.scrollHeight > t.clientHeight + 1 || (body && body.clientHeight < t.clientHeight * ratio);
  /* rows that show only what fits on one line (e.g. hourly weather) need a minimum count */
  t.querySelectorAll("[data-rowmin]").forEach(r => { const k = [...r.children].filter(c => c.offsetHeight > 0 && c.offsetTop === r.firstElementChild.offsetTop).length; if (r.children.length && k < +r.dataset.rowmin) r.classList.add("fit-off"); });
  const phone = innerWidth < 700;   // on a phone some lists scroll instead of trimming
  const lists = [...t.querySelectorAll("[data-fitlist]")].filter(l => !(phone && l.hasAttribute("data-phonescroll"))).map(l => {
    const items = [...l.querySelectorAll(":scope > li:not(.fit-more):not(.empty)")], more = l.querySelector(":scope > .fit-more");
    const o = {l, items, more, n:items.length, min:l.dataset.min != null ? +l.dataset.min : 2};
    o.sync = () => { if (!more) return; const hid = o.items.length - o.n, nEl = more.querySelector("[data-more-n]"), extra = nEl ? +nEl.dataset.extra || 0 : 0;
      more.classList.toggle("fit-off", hid + extra === 0); if (nEl) nEl.textContent = hid + extra ? ` · ${hid + extra} more` : ""; };
    o.sync(); return o;
  });
  for (const o of lists){ while (tight() && o.n > o.min){ o.n--; o.items[o.n].classList.add("fit-off"); o.sync(); } }
  const parts = [...t.querySelectorAll("[data-drop]")].sort((a, b) => a.dataset.drop - b.dataset.drop);
  for (const p of parts){ if (!tight()) break; if (p.closest(".fit-off") || p.offsetParent === null) continue; p.classList.add("fit-off"); }
  for (const o of lists){ while (tight() && o.n > 0){ o.n--; o.items[o.n].classList.add("fit-off"); o.sync(); } }
  if (t.classList.contains("note-w")) noteEditable(t);
}
let fitRaf = 0;
function fitSoon(){ cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => document.querySelectorAll(".hs .hw > .tile").forEach(fitTile)); }
const fitRO = typeof ResizeObserver === "function" ? new ResizeObserver(fitSoon) : null;
addEventListener("resize", fitSoon);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);
/* A note widget can be edited in place when it's big enough and the whole note fits. */
function noteEditable(t){
  const b = t.querySelector(".nw-body"); if (!b) return;
  if (document.activeElement === b) return;   // never switch while someone is typing
  const editingHome = !!t.closest("#egrid");
  const fits = !editingHome && t.clientWidth >= 180 && t.clientHeight >= 140 && b.scrollHeight <= b.clientHeight + 2;
  b.contentEditable = fits ? "true" : "false";
  b.classList.toggle("editable", fits); b.classList.toggle("clipped", !fits && b.scrollHeight > b.clientHeight + 2);
  b.title = fits ? "" : "Open in Notes to edit";
}
 
/* =====================================================================
   HOME SCREENS: the home page is a grid of tiles. Widgets take any
   whole number of tiles wide and tall. Up to 3 named home screens are
   saved in Settings (so they can sync later); each keeps a laptop and
   a phone layout. Calendar, to-do, clock, weather and import reuse the
   original tiles (moved into place, so all their wiring keeps working);
   inbox and note widgets can be added more than once.
   ===================================================================== */
const Home = (() => {
  const COLS = {laptop:8, phone:4}, PHONE_MAX = 700, MAX = 3;
  const SINGLE = {clock:"t-clock", weather:"t-weather", calendar:"t-cal", todo:"t-due", import:"t-import"};
  const KINDS = [
    {k:"clock",    type:"clock",    name:"Clock",           desc:"Time, date and semester week", def:[2,1]},
    {k:"weather",  type:"weather",  name:"Weather",         desc:"Now and the next few days",    def:[2,2]},
    {k:"calendar", type:"calendar", name:"Calendar",        desc:"Day, week, month or year",     def:[4,4]},
    {k:"todo",     type:"todo",     name:"To-do",           desc:"Due soon. Tap it to open the list", def:[2,3]},
    {k:"gmail",    type:"inbox", acct:"gmail",   name:"Gmail",        desc:"Personal inbox",          def:[2,2]},
    {k:"outlook",  type:"inbox", acct:"outlook", name:"Outlook",      desc:"School inbox",            def:[2,2]},
    {k:"inbox",    type:"inbox", acct:"split",   name:"Inbox (both)", desc:"Switch between Gmail and Outlook", def:[2,3]},
    {k:"note",     type:"note",     name:"Note",            desc:"Any of your notes, live",      def:[2,2]},
    {k:"facts",    type:"facts",    name:"Daily facts",     desc:"A few facts a day from your topics", def:[2,2]},
    {k:"week",     type:"week",     name:"This Week",       desc:"Tasks due this week by day, plus weekly goals", def:[4,3]},
    {k:"import",   type:"import",   name:"Import schedule", desc:"Drop a PDF, CSV or .ics",      def:[2,2]},
  ];
  const kindOf = it => it.type === "inbox" ? KINDS.find(k => k.acct === (it.acct || "split")) : KINDS.find(k => k.type === it.type);
  const SIZES = [["Small",1,1],["Wide",2,1],["Tall",1,2],["Square",2,2],["Portrait",2,3],["Long",4,1],["Big",3,3],["Large",4,3],["Full width",0,2]];   // 0 = every column
  const PALETTE = [
    ["Red",    ["#FEE2E2","#FECACA","#FCA5A5","#F87171","#EF4444","#DC2626","#B91C1C","#991B1B","#7F1D1D"]],
    ["Orange", ["#FFEDD5","#FED7AA","#FDBA74","#FB923C","#F97316","#EA580C","#C2410C","#9A3412","#7C2D12"]],
    ["Amber",  ["#FEF3C7","#FDE68A","#FCD34D","#FBBF24","#F59E0B","#D97706","#B45309","#92400E","#78350F"]],
    ["Yellow", ["#FEF9C3","#FEF08A","#FDE047","#FACC15","#EAB308","#CA8A04","#A16207","#854D0E","#713F12"]],
    ["Green",  ["#DCFCE7","#BBF7D0","#86EFAC","#4ADE80","#22C55E","#16A34A","#15803D","#166534","#14532D"]],
    ["Teal",   ["#CCFBF1","#99F6E4","#5EEAD4","#2DD4BF","#14B8A6","#0D9488","#0F766E","#115E59","#134E4A"]],
    ["Sky",    ["#E0F2FE","#BAE6FD","#7DD3FC","#38BDF8","#0EA5E9","#0284C7","#0369A1","#075985","#0C4A6E"]],
    ["Blue",   ["#DBEAFE","#BFDBFE","#93C5FD","#60A5FA","#3B82F6","#2563EB","#1D4ED8","#1E40AF","#1E3A8A"]],
    ["Indigo", ["#E0E7FF","#C7D2FE","#A5B4FC","#818CF8","#6366F1","#4F46E5","#4338CA","#3730A3","#312E81"]],
    ["Purple", ["#EDE9FE","#DDD6FE","#C4B5FD","#A78BFA","#8B5CF6","#7C3AED","#6D28D9","#5B21B6","#4C1D95"]],
    ["Pink",   ["#FCE7F3","#FBCFE8","#F9A8D4","#F472B6","#EC4899","#DB2777","#BE185D","#9D174D","#831843"]],
    ["Brown",  ["#F5EBE0","#E3D5CA","#D5BDAF","#B08968","#9C6644","#7F5539","#6F4518","#5C3D2E","#3E2723"]],
    ["Gray",   ["#FFFFFF","#F1F5F9","#CBD5E1","#94A3B8","#64748B","#475569","#334155","#1E293B","#000000"]],
  ];
  const GRADS = [
    ["Warm",          [["#F97316","#DB2777"],["#F59E0B","#EF4444"],["#FB7185","#FDBA74"],["#FDE047","#F97316"],["#EF4444","#7C2D12"],["#FCD34D","#F472B6","#A78BFA"]]],
    ["Cool",          [["#0F9AA5","#3B5BDB"],["#06B6D4","#3B82F6"],["#22D3EE","#A78BFA"],["#60A5FA","#1E3A8A"],["#38BDF8","#6366F1"],["#0EA5E9","#14B8A6"]]],
    ["Green",         [["#16A34A","#0891B2"],["#84CC16","#10B981"],["#4ADE80","#2DD4BF"],["#065F46","#14B8A6"],["#BEF264","#22C55E"],["#A7F3D0","#93C5FD"]]],
    ["Purple, pink",  [["#7C3AED","#2563EB"],["#EC4899","#8B5CF6"],["#F43F5E","#7C3AED"],["#1E3A8A","#9333EA"],["#C084FC","#F472B6"],["#6D28D9","#DB2777","#F97316"]]],
    ["Pastel",        [["#FDE68A","#F9A8D4"],["#BAE6FD","#DDD6FE"],["#BBF7D0","#FEF08A"],["#FBCFE8","#C7D2FE"],["#FED7AA","#FECACA"],["#CCFBF1","#E0E7FF"]]],
    ["Dark",          [["#0F172A","#334155"],["#111827","#1E3A8A"],["#1F2937","#B7791F"],["#18181B","#7C2D12"],["#020617","#312E81","#0F766E"],["#3F3F46","#71717A"]]],
  ];
  const RESIZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 10v10H10M20 20L9 9"/></svg>';
  const EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const W = (type, x, y, w, h, extra = {}) => ({id:uid(), type, x, y, w, h, color:{k:"default"}, ...extra});
 
  /* ---------- storage (inside Settings) ---------- */
  function seedScreens(){
    const laptop = [W("clock",0,0,2,1), W("weather",2,0,2,1), W("inbox",4,0,2,2,{acct:"split", view:"gmail"}), W("todo",6,0,2,5),
      W("calendar",0,1,4,4), W("import",4,2,2,2)];
    const phone = [W("clock",0,0,2,1), W("weather",2,0,2,1), W("todo",0,1,4,3), W("calendar",0,4,4,5), W("inbox",0,9,4,3,{acct:"split", view:"gmail"}), W("import",0,12,4,2)];
    const id = uid();
    return {list:[{id, name:"Main", layouts:{laptop, phone}, updatedAt:new Date().toISOString()}], activeId:id};
  }
  function store(){
    const s = Settings.get();
    if (!s.screens || !Array.isArray(s.screens.list)) Settings.update(st => { st.screens = seedScreens(); });
    if (!Array.isArray(Settings.get().myColors)) Settings.update(st => { st.myColors = []; });
    return Settings.get().screens;
  }
  const saveStore = fn => Settings.update(st => fn(st.screens));
  const active = () => { const S = store(); return S.list.find(s => s.id === S.activeId) || null; };
  const bp = () => innerWidth < PHONE_MAX ? "phone" : "laptop";
 
  /* ---------- colors ---------- */
  const rgb = h => { h = String(h).replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return [0,2,4].map(i => parseInt(h.slice(i, i+2), 16) || 0); };
  const mixc = (a, b, t) => a.map((v, i) => Math.round(v*t + b[i]*(1-t)));
  const css = c => `rgb(${c.join(",")})`;
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v/12.92 : ((v+.055)/1.055)**2.4; }; return .2126*f(c[0]) + .7152*f(c[1]) + .0722*f(c[2]); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  const DARK_INK = [20,27,43], LIGHT_INK = [255,255,255];
  const HEX = /^#[0-9a-f]{6}$/i;
  function normColor(c){
    if (!c || !c.k) return {k:"default"};
    if (c.k === "grad" && !Array.isArray(c.stops)) return {k:"grad", stops:[c.c1 || "#0F9AA5", c.c2 || "#3B5BDB"], a:c.a ?? 135, g:"linear", t:c.t ?? 100};
    return c;
  }
  const colorKey = c => { c = normColor(c); return c.k === "solid" ? "s" + c.c.toUpperCase() : c.k === "grad" ? "g" + c.stops.join("").toUpperCase() + (c.g || "linear") + (c.g === "radial" ? "" : (c.a ?? 135)) : c.k; };
  function gradCSS(stops, a, g){ return g === "radial" ? `radial-gradient(circle at 30% 20%,${stops.join(",")})` : `linear-gradient(${a ?? 135}deg,${stops.join(",")})`; }
  function swatchBg(c){ c = normColor(c); return c.k === "solid" ? c.c : c.k === "grad" ? gradCSS(c.stops, c.a, c.g) : "var(--tile)"; }
  /* Returns the inline styles for a colored widget, or {glass:true}, or null for the default look. */
  function paint(color){
    const c = normColor(color);
    if (c.k === "glass") return {glass:true};
    if (c.k !== "solid" && c.k !== "grad") return null;
    const tile = currentTheme() === "dark" ? [19,26,43] : [255,255,255], t = (c.t ?? 100) / 100;
    const stops = (c.k === "solid" ? [c.c] : c.stops).map(s => mixc(rgb(s), tile, t));
    const score = ink => Math.min(...stops.map(s => contrast(s, ink)));
    const ink = score(DARK_INK) >= score(LIGHT_INK) ? DARK_INK : LIGHT_INK;
    const a = v => `rgba(${ink.join(",")},${v})`, light = ink === LIGHT_INK;
    return {vars:{background: stops.length === 1 ? css(stops[0]) : gradCSS(stops.map(css), c.a, c.g), color:css(ink),
      "--ink":css(ink), "--muted":a(light ? .8 : .68), "--line":a(.22), "--hue":css(ink), "--tile-2":a(.1), "--cal-cell":a(.08), "--cal-bg":"transparent"}};
  }
  function applyPaint(el, color){
    if (!el) return;
    (el._pv || []).forEach(k => el.style.removeProperty(k)); el._pv = [];
    el.classList.remove("glass");
    const p = paint(color); if (!p) return;
    if (p.glass){ el.classList.add("glass"); return; }
    for (const [k, v] of Object.entries(p.vars)){ el.style.setProperty(k, v); el._pv.push(k); }
  }
 
  /* ---------- grid ---------- */
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  function fits(items, r, cols, ignore){ if (r.x < 0 || r.y < 0 || r.w < 1 || r.h < 1 || r.x + r.w > cols) return false; return !items.some(i => i.id !== ignore && overlaps(i, r)); }
  function firstFree(items, w, h, cols){ w = Math.min(w, cols); for (let y = 0; y < 400; y++) for (let x = 0; x <= cols - w; x++) if (fits(items, {x, y, w, h}, cols)) return {x, y, w, h}; return null; }
  function pack(src, cols){ const out = []; [...src].sort((a, b) => a.y - b.y || a.x - b.x).forEach(it => { const r = firstFree(out, Math.min(it.w, cols), it.h, cols); if (r) out.push({...clone(it), id:uid(), ...r}); }); return out; }
  function sizeGrid(el, cols){
    const gap = cols > 4 ? 14 : 10, colW = (el.clientWidth - gap * (cols - 1)) / cols;
    const row = Math.max(56, Math.min(colW, cols > 4 ? 150 : 110));
    el.style.setProperty("--cols", cols); el.style.setProperty("--gap", gap + "px"); el.style.setProperty("--row", row + "px");
    el.dataset.row = row; el.dataset.gap = gap; el.dataset.cols = cols;
  }
  function cellAt(el, cx, cy){
    const r = el.getBoundingClientRect(), cols = +el.dataset.cols, gap = +el.dataset.gap, row = +el.dataset.row;
    const colW = (r.width - gap * (cols - 1)) / cols;
    return {x:clamp(Math.floor((cx - r.left) / (colW + gap)), 0, cols - 1), y:Math.max(0, Math.floor((cy - r.top) / (row + gap)))};
  }
  const park = () => $("#w-park");
  function parkAll(){ for (const id of Object.values(SINGLE)){ const n = document.getElementById(id); if (n && n.parentElement !== park()) park().appendChild(n); } }
 
  /* ---------- multi-instance widgets ---------- */
  const picked = {};
  function inboxHTML(it){
    const split = (it.acct || "split") === "split", acct = split ? (it.view || "gmail") : it.acct;
    const cat = Mail.categories(acct)[0], list = Mail.list(acct, "inbox", cat.id).slice(0, 10);
    const lab = a => ((it.labels || {})[a] || "").trim();   // optional labels (e.g. Personal / School), set in the widget's options
    const seg = split ? `<div class="seg acct" role="group" aria-label="Mail account">${MAIL_ACCOUNTS.map(a => { const u = Mail.unread(a.id, "inbox", Mail.categories(a.id)[0].id);
      return `<button type="button" data-wacct="${a.id}" aria-pressed="${a.id === acct}">${a.name}${lab(a.id) ? `<small>${esc(lab(a.id))}</small>` : ""}${u ? `<span class="badge">${u}</span>` : ""}</button>`; }).join("")}</div>` : "";
    const all = Mail.list(acct, "inbox", cat.id), list2 = all.slice(0, 25);
    return `<section class="tile tinted mw inbox-w" aria-label="${acctOf(acct).name} inbox"><h2><span>${split ? "Inbox" : acctOf(acct).name + (lab(acct) ? ` <small class="hw-role">${esc(lab(acct))}</small>` : "")}</span><span class="mail-tools"><span class="tag">Sample</span><button class="btn icon sm" type="button" data-wmx="${acct}" aria-label="Open full ${acctOf(acct).name} inbox" title="Open full inbox">${EXPAND}</button></span></h2>${seg}
      <ul class="mail" data-fitlist data-min="2">${list2.map(m => `<li class="${m.unread ? "" : "read"}" data-wmail="${m.id}" tabindex="0"><span class="dot"></span><span class="from">${esc(m.from)}</span><span class="when">${mailWhen(m.at)}</span><span class="subj">${esc(m.subject)}</span></li>`).join("") || `<li class="empty">Inbox is empty.</li>`}${list2.length ? `<li class="fit-more"><button type="button" class="more-link" data-wmx="${acct}">See all<span data-more-n data-extra="${all.length - list2.length}"></span></button></li>` : ""}</ul></section>`;
  }
  function pickItems(n){
    const d = new DOMParser().parseFromString(`<body>${n.html || ""}<\/body>`, "text/html");
    return [...d.querySelectorAll("li")].filter(x => !x.classList.contains("done") && !x.querySelector("li")).map(x => x.textContent.trim()).filter(Boolean);
  }
  function noteHTML(it){
    const n = it.note && Notes.note(it.note);
    if (!n || n.deletedAt) return `<section class="tile tinted mw note-w"><h2><span>Note</span></h2><p class="note">This note was deleted. Choose another one in Edit home screen.</p></section>`;
    if (n.file) return `<section class="tile tinted mw note-w nw-filew" data-onote="${n.id}" aria-label="File: ${esc(n.title || "Untitled")}"><h2><span>${esc(n.title || "Untitled")}</span><span class="nw-open" role="link" tabindex="0">Open ›</span></h2>
      <div class="nw-file">${fileThumb(n.file)}</div></section>`;
    const can = it.pickOn === true && pickItems(n).length >= 2;
    return `<section class="tile tinted mw note-w" data-onote="${n.id}" aria-label="Note: ${esc(n.title || "Untitled")}"><h2><span>${esc(n.title || "Untitled")}</span><span class="nw-open" role="link" tabindex="0">Open ›</span></h2>
      <div class="nt-body nw-body" data-nwid="${n.id}" spellcheck="true">${cleanHTML(n.html)}</div>
      ${can ? `<div class="nw-pick"><button type="button" class="btn small" data-wpick="${it.id}">${picked[it.id] ? "Pick again" : "Pick one for me"}</button><output>${esc(picked[it.id] || "")}</output></div>` : ""}</section>`;
  }
  function multiHTML(it){ return it.type === "inbox" ? inboxHTML(it) : it.type === "note" ? noteHTML(it) : it.type === "facts" ? Facts.widget(it) : it.type === "week" ? ThisWeek.widget(it) : `<section class="tile mw"><p class="note">Unknown widget.</p></section>`; }
 
  /* ---------- building a grid (home or editor) ---------- */
  function build(grid, items, cols, editing){
    parkAll();
    sizeGrid(grid, cols);
    let h = "";
    if (editing){
      const rows = Math.max(cols > 4 ? 6 : 9, ...items.map(i => i.y + i.h)) + 2;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) h += `<div class="cell" data-x="${x}" data-y="${y}" style="grid-column:${x+1};grid-row:${y+1}"></div>`;
    }
    h += items.map(it => `<div class="hw ${editing && ed.sel === it.id ? "sel" : ""}" data-id="${it.id}" data-type="${it.type}" style="grid-column:${it.x+1}/span ${it.w};grid-row:${it.y+1}/span ${it.h}">${editing ? `<span class="hw-tag">${it.w}×${it.h}</span><span class="hw-handle" aria-hidden="true">${RESIZE}</span>` : ""}</div>`).join("");
    if (editing) h += `<div class="hs-ghost" id="ghost" hidden></div>`;
    grid.innerHTML = h;
    const used = new Set();
    for (const it of items){
      const w = grid.querySelector(`.hw[data-id="${it.id}"]`), sid = SINGLE[it.type];
      if (sid && !used.has(sid)){ const n = document.getElementById(sid); used.add(sid); w.appendChild(n); applyPaint(n, it.color); }
      else if (sid) w.insertAdjacentHTML("beforeend", `<section class="tile mw"><p class="note">${esc(kindOf(it).name)} is already on this screen.</p></section>`);
      else { w.insertAdjacentHTML("beforeend", multiHTML(it)); applyPaint(w.querySelector(".tile"), it.color); }
      if (fitRO) fitRO.observe(w);
    }
    fitSoon();
  }
 
  /* ---------- home (normal view) ---------- */
  let homeSig = null;
  function render(force){
    if (!ready || ed.on) return;
    if (page !== "home"){ homeSig = null; return; }
    const s = active(), b = bp(), grid = $("#home-grid"), items = s ? (s.layouts[b] || []) : [];
    $("#home-empty").hidden = !!(s && items.length);
    $("#home-empty-t").textContent = s ? `“${s.name}” has no ${b} layout yet.` : "You don't have a home screen yet.";
    grid.hidden = !(s && items.length);
    const sig = JSON.stringify([s && s.id, b, items, currentTheme(), grid.clientWidth]);
    if (!force && sig === homeSig){ refresh(); return; }
    homeSig = sig;
    build(grid, items, COLS[b], false);
  }
  /* Re-draws inbox and note widgets in place (calendar, to-do etc. update themselves). */
  /* force: redraw even a widget someone is typing in (used right after that widget saved what was typed). */
  function refresh(force){
    if (!ready || ed.on) return;
    const grid = $("#home-grid"), s = active(); if (!s) return;
    for (const it of s.layouts[bp()] || []){
      if (SINGLE[it.type]) continue;
      const w = grid.querySelector(`.hw[data-id="${it.id}"]`); if (!w) continue;
      const ae = document.activeElement;
      if (!force && w.contains(ae) && (ae.isContentEditable || ae.matches("input:not([type=checkbox]),textarea,select"))) continue;   // don't interrupt typing
      if (w.querySelector("[data-busy]")) continue;   // mid-drag
      const keep = w.querySelector(".mail") ? w.querySelector(".tile").scrollTop : 0, keeps = [...w.querySelectorAll("[data-keepscroll]")].map(e => e.scrollTop);
      w.innerHTML = multiHTML(it); applyPaint(w.querySelector(".tile"), it.color);
      if (keep) w.querySelector(".tile").scrollTop = keep;
      w.querySelectorAll("[data-keepscroll]").forEach((e, i) => { if (keeps[i]) e.scrollTop = keeps[i]; });
    }
    fitSoon();
  }
  const findHomeItem = id => { const s = active(); return s && (s.layouts[bp()] || []).find(i => i.id === id); };
  function openAcct(acct){ Settings.update(st => { st.mail.account = acct; }); mailState.folder = "inbox"; mailState.cat = Mail.categories(acct)[0].id; }
  let suppressClick = 0;
  $("#home-grid").addEventListener("click", e => {
    if (Date.now() < suppressClick){ e.preventDefault(); e.stopPropagation(); return; }
    const t = e.target, hw = t.closest(".hw"); if (!hw) return;
    const sa = t.closest("[data-wacct]");
    if (sa){ const it = findHomeItem(hw.dataset.id); saveStore(() => { it.view = sa.dataset.wacct; }); refresh(); return; }
    const mx = t.closest("[data-wmx]"); if (mx){ openAcct(mx.dataset.wmx); openMail(null); return; }
    const ml = t.closest("[data-wmail]"); if (ml){ const m = Mail.get(ml.dataset.wmail); openAcct(m.acct); openMail(m.id); return; }
    const pk = t.closest("[data-wpick]");
    if (pk){
      const it = findHomeItem(pk.dataset.wpick), n = Notes.note(it.note), all = pickItems(n), pool = all.filter(x => x !== picked[it.id]);
      const from = pool.length ? pool : all; picked[it.id] = from[Math.floor(Math.random() * from.length)]; refresh(); return;
    }
    const nw = t.closest(".note-w[data-onote]");
    if (nw){
      const li = t.closest(".nw-body ul.chk > li");
      if (li && e.clientX - li.getBoundingClientRect().left < 26){
        li.classList.toggle("done");
        const id = nw.dataset.onote; Notes.updateNote(id, {html:cleanHTML(nw.querySelector(".nw-body").innerHTML)});
        if (nt.loaded === id) nt.loaded = null;   // the Notes editor reloads it next time
        return;
      }
      if (t.closest("a")) return;
      if (t.closest(".nw-body.editable") && !t.closest(".nw-open")) return;   // editing in place
      nt.note = nw.dataset.onote; nt.mobileEdit = true; nt.loaded = null; location.hash = "#notes"; return;
    }
    if (t.closest(".facts-w")){ Facts.openDialog(); return; }
    if (hw.dataset.type === "todo" && !t.closest("input,a,button,[data-open],label")) location.hash = "#todo";
  }, true);
  /* typing in a note widget saves to the note */
  let nwTimer;
  /* Scrolling the page with the mouse over a widget. A widget part that can still scroll (a long list) scrolls
     first, as before; once it's at its end, or if nothing under the mouse scrolls, the page scrolls instead of stopping. */
  $("#home-grid").addEventListener("wheel", e => {
    if (e.ctrlKey || e.defaultPrevented) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1, dy = e.deltaY * k;
    if (!dy || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    let trapped = false;
    for (let el = e.target; el && el !== e.currentTarget; el = el.parentElement){
      if (el.nodeType !== 1) continue;
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return;   // this part scrolls itself
      if (/contain|none/.test(cs.overscrollBehaviorY)) trapped = true;
    }
    if (!trapped) return;                                    // the browser passes the scroll to the page by itself
    e.preventDefault(); scrollBy(0, dy);
  }, {passive:false});
  $("#home-grid").addEventListener("input", e => {
    const b = e.target.closest(".nw-body.editable"); if (!b) return;
    clearTimeout(nwTimer);
    nwTimer = setTimeout(() => { const id = b.dataset.nwid; Notes.updateNote(id, {html:cleanHTML(b.innerHTML)}, true); if (nt.loaded === id) nt.loaded = null; }, 400);
  });
  $("#home-grid").addEventListener("paste", e => {
    if (!e.target.closest(".nw-body.editable")) return;
    e.preventDefault(); const html = e.clipboardData.getData("text/html");
    if (html) document.execCommand("insertHTML", false, cleanHTML(html)); else document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
  $("#home-grid").addEventListener("focusout", e => { if (e.target.closest(".nw-body.editable")){ clearTimeout(nwTimer); const b = e.target; Notes.updateNote(b.dataset.nwid, {html:cleanHTML(b.innerHTML)}, true); if (nt.loaded === b.dataset.nwid) nt.loaded = null; fitSoon(); } });
  $("#home-grid").addEventListener("keydown", e => {
    const op = e.target.closest(".nw-open"); if (op && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); op.click(); return; }
    const ml = e.target.closest("[data-wmail]"); if (ml && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); ml.click(); }
  });
  /* Long-press on the home screen (phone) opens the editor. */
  let lp = null;
  $("#home-grid").addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" || e.target.closest("[data-nolp]")) return;   // drag handles and text boxes keep their own long-press
    const sx = e.clientX, sy = e.clientY;
    lp = {sx, sy, t:setTimeout(() => { lp = null; suppressClick = Date.now() + 500; try { navigator.vibrate && navigator.vibrate(12); } catch(_){} enter(store().activeId, "edit"); }, 600)};
  });
  const lpCancel = () => { if (lp){ clearTimeout(lp.t); lp = null; } };
  $("#home-grid").addEventListener("pointermove", e => { if (lp && Math.hypot(e.clientX - lp.sx, e.clientY - lp.sy) > 10) lpCancel(); });
  ["pointerup","pointercancel","pointerleave"].forEach(ev => $("#home-grid").addEventListener(ev, lpCancel));
  addEventListener("scroll", lpCancel, {passive:true});
  $("#home-empty-go").onclick = () => { const s = active(); s ? enter(s.id, "edit") : enter(null, "blank"); };
 
  /* =====================================================================
     EDITOR
     ===================================================================== */
  const ed = {on:false, screenId:null, name:"", layouts:null, orig:"", bp:"laptop", sel:null, placing:null, moving:null, tab:"size", manage:false, cust:null};
  const egrid = $("#egrid");
  const edCols = () => COLS[ed.bp], edItems = () => ed.layouts[ed.bp], selItem = () => edItems().find(i => i.id === ed.sel);
  const dirty = () => JSON.stringify(ed.layouts) !== ed.orig;
 
  function enter(id, mode){
    const S = store(), src = S.list.find(s => s.id === id);
    if (mode !== "edit" && S.list.length >= MAX){ toast(`You can save ${MAX} home screens. Delete one to make room.`); return; }
    ed.screenId = mode === "edit" && src ? src.id : null;
    ed.name = mode === "edit" && src ? src.name : "";
    ed.layouts = mode === "blank" || !src ? {laptop:[], phone:[]} : clone(src.layouts);
    for (const k of ["laptop","phone"]) (ed.layouts[k] ||= []).forEach(i => { if (mode === "copy") i.id = uid(); i.color = normColor(i.color); });
    ed.orig = JSON.stringify(ed.layouts); ed.bp = bp(); ed.sel = ed.placing = ed.moving = null; ed.tab = "size"; ed.on = true;
    if (page !== "home") location.hash = "#home";
    document.documentElement.classList.add("hs-editing");
    $("#home-grid").hidden = true; $("#home-empty").hidden = true; $("#hs-editor").hidden = false;
    renderEditor(); scrollTo(0, 0);
  }
  function exit(){
    ed.on = false; document.documentElement.classList.remove("hs-editing");
    hidePop(); parkAll(); egrid.innerHTML = "";
    $("#hs-editor").hidden = true; homeSig = null; render(true);
  }
  function renderEditor(){
    const items = edItems();
    egrid.classList.toggle("narrow", ed.bp === "phone" && innerWidth >= PHONE_MAX);
    build(egrid, items, edCols(), true);
    $("#ed-title").textContent = ed.screenId ? `Editing “${ed.name}”` : "New home screen";
    $$("#ed-bp [data-bp]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.bp === ed.bp)));
    const other = ed.bp === "laptop" ? "phone" : "laptop";
    $("#ed-copy").textContent = innerWidth < 560 ? `Copy ${other}` : `Copy ${other} layout`; $("#ed-copy").disabled = !ed.layouts[other].length;
    $("#ed-clear").disabled = !items.length;
    const hint = $("#ed-hint");
    if (ed.placing || ed.moving){
      const what = ed.placing ? `${ed.placing.name} (${Math.min(ed.placing.w, edCols())}×${ed.placing.h})` : kindOf(selItem()).name;
      hint.hidden = false;
      hint.innerHTML = `<span>Tap an empty tile for the top-left corner of <b>${esc(what)}</b>.</span><span class="ed-hint-b">${ed.placing ? `<button class="btn small" type="button" data-eh="auto">First open spot</button>` : ""}<button class="btn small" type="button" data-eh="cancel">Cancel</button></span>`;
    } else if (!items.length){ hint.hidden = false; hint.innerHTML = `<span>This ${ed.bp} layout is empty. Press <b>+ Add widget</b> to start${ed.layouts[other].length ? `, or copy the ${other} layout` : ""}.</span>`; }
    else hint.hidden = true;
    tick(); renderPop();
  }
  $("#ed-hint").addEventListener("click", e => {
    const b = e.target.closest("[data-eh]"); if (!b) return;
    if (b.dataset.eh === "cancel"){ ed.placing = ed.moving = null; return renderEditor(); }
    const p = ed.placing; addItem(p, firstFree(edItems(), p.w, p.h, edCols()));
  });
  function select(id){
    ed.sel = id; ed.moving = null; ed.manage = false;
    const it = selItem(); if (!it) return renderEditor();
    if (!["size","color","opts"].includes(ed.tab) || (ed.tab === "opts" && !hasOpts(it))) ed.tab = "size";
    ed.cust = custFrom(it.color, null);
    renderEditor();
    const w = egrid.querySelector(`.hw[data-id="${id}"]`); if (!w) return;
    const r = w.getBoundingClientRect(), top = $("#etop").getBoundingClientRect().bottom + 12;
    if (innerWidth < PHONE_MAX && r.height < innerHeight * .45 && Math.abs(r.top - top) > 4) scrollBy({top:r.top - top, behavior:"smooth"});
    else if (r.bottom > innerHeight || r.top < top) scrollBy({top:r.top - top, behavior:"smooth"});
  }
 
  /* ---------- the widget panel, placed beside whatever is selected ---------- */
  const pop = $("#wpop");
  const hasOpts = it => it.type === "inbox" || it.type === "note";
  function hidePop(){ pop.hidden = true; }
  function sizeTab(it){
    const cols = edCols();
    return `<div><p class="wp-l">Preset sizes</p><div class="chips">${SIZES.map(([n, w, h]) => { w = w || cols; return w > cols || tooSmall(it.type, w, h) ? "" : `<button type="button" data-size="${w},${h}" aria-pressed="${it.w === w && it.h === h}">${n}<small>${w}×${h}</small></button>`; }).join("")}</div></div>
      <div><p class="wp-l">Exact size</p><div class="wp-steps"><span class="step"><button type="button" data-dim="w,-1" aria-label="Narrower">−</button><b>${it.w} wide</b><button type="button" data-dim="w,1" aria-label="Wider">+</button></span>
      <span class="step"><button type="button" data-dim="h,-1" aria-label="Shorter">−</button><b>${it.h} tall</b><button type="button" data-dim="h,1" aria-label="Taller">+</button></span></div>
      <p class="note" style="margin-top:8px">Or drag the round handle in the widget's corner.</p></div>`;
  }
  const sw = (col, cur, label, extra = "") => `<button type="button" class="csw ${extra}" style="--s:${swatchBg(col)}" data-col='${JSON.stringify(col)}' aria-pressed="${colorKey(col) === colorKey(cur)}" aria-label="${esc(label)}" title="${esc(label)}"></button>`;
  function colorTab(it){
    const c = normColor(it.color), t = c.t ?? 100, tintable = c.k === "solid" || c.k === "grad", mine = Settings.get().myColors || [], q = ed.cust;
    return `<div class="cp-top"><button type="button" class="csw def" data-col='{"k":"default"}' aria-pressed="${c.k === "default"}" title="Default look">Aa</button><span class="note">Default</span>
        <button type="button" class="csw gl" data-col='{"k":"glass"}' aria-pressed="${c.k === "glass"}" title="Glass (see-through)"></button><span class="note">Glass</span></div>
      <div class="cp-tint"><label class="wp-l" for="wp-tint">Tint strength <span class="mono" id="wp-tint-v">${tintable ? t + "%" : "–"}</span></label><input type="range" id="wp-tint" min="10" max="100" step="5" value="${t}" ${tintable ? "" : "disabled"}><span class="note">${tintable ? "Lower is softer" : "Pick a color first"}</span></div>
      <div><div class="wp-lr"><p class="wp-l">My colors</p>${mine.length ? `<button type="button" class="linkb" data-wp="manage">${ed.manage ? "Done" : "Remove some"}</button>` : ""}</div>
        ${mine.length ? `<div class="csws">${mine.map((m, i) => `<span class="swm">${sw(m, c, "My color " + (i + 1))}${ed.manage ? `<button type="button" class="swx" data-wp="unsave" data-i="${i}" aria-label="Remove this saved color">×</button>` : ""}</span>`).join("")}</div>` : `<p class="note">Colors you make below can be saved here.</p>`}</div>
      <div><p class="wp-l">Solid colors</p><div class="pal">${PALETTE.map(([name, row]) => `<span class="pal-n">${name}</span><div class="csws">${row.map(hx => sw({k:"solid", c:hx}, c, `${name} ${hx}`)).join("")}</div>`).join("")}</div></div>
      <div><p class="wp-l">Gradients</p><div class="pal">${GRADS.map(([name, row]) => `<span class="pal-n">${name}</span><div class="csws">${row.map(st => sw({k:"grad", stops:st, a:135, g:"linear"}, c, `${name} gradient`)).join("")}</div>`).join("")}</div></div>
      <div class="cp-box"><p class="wp-l">Custom color</p>
        <div class="cp-row"><input type="color" id="cs-c" value="${q.solid}" aria-label="Pick a color"><input class="hexin mono" id="cs-hex" value="${q.solid.toUpperCase()}" maxlength="7" aria-label="Hex code" spellcheck="false"><span class="cp-prev" id="cs-prev" style="--s:${q.solid}"></span></div>
        <div class="cp-row"><button type="button" class="btn small primary" data-wp="cs-use">Use this color</button><button type="button" class="btn small" data-wp="cs-save">Save to my colors</button></div>
        <p class="err" id="cs-err" hidden>Enter a hex code like #1F4FD1.</p></div>
      <div class="cp-box"><p class="wp-l">Custom gradient</p>
        <div class="gstops">${q.stops.map((s, i) => `<span class="gstop"><input type="color" data-stop="${i}" value="${s}" aria-label="Color ${i + 1}">${q.stops.length > 2 ? `<button type="button" class="swx in" data-wp="stop-del" data-i="${i}" aria-label="Remove color ${i + 1}">×</button>` : ""}</span>`).join("")}${q.stops.length < 5 ? `<button type="button" class="btn small" data-wp="stop-add">+ Color</button>` : ""}</div>
        <div class="cp-row"><div class="seg" role="group" aria-label="Gradient style"><button type="button" data-wp="g-lin" aria-pressed="${q.g !== "radial"}">Straight</button><button type="button" data-wp="g-rad" aria-pressed="${q.g === "radial"}">Round</button></div>
          ${q.g === "radial" ? "" : `<label class="note cp-ang">Angle <input type="range" id="cg-a" min="0" max="360" step="5" value="${q.a}"><span class="mono" id="cg-av">${q.a}°</span></label>`}</div>
        <div class="gprev" id="cg-prev" style="background:${gradCSS(q.stops, q.a, q.g)}"></div>
        <div class="cp-row"><button type="button" class="btn small primary" data-wp="cg-use">Use this gradient</button><button type="button" class="btn small" data-wp="cg-save">Save to my colors</button></div></div>`;
  }
  function optsTab(it){
    if (it.type === "inbox"){
      const a = it.acct || "split";
      const L = it.labels || {}, show = a === "split" ? ["gmail","outlook"] : [a];
      return `<div><p class="wp-l">Account</p><div class="seg" role="group" aria-label="Account">${[["gmail","Gmail"],["outlook","Outlook"],["split","Both (switchable)"]].map(([k, n]) => `<button type="button" data-wacct-opt="${k}" aria-pressed="${a === k}">${n}</button>`).join("")}</div>
        <p class="note" style="margin-top:8px">"Both" adds Gmail / Outlook buttons on the widget so you can switch views.</p></div>
      <div><p class="wp-l">Labels (optional)</p>${show.map(k => `<div class="cp-row" style="margin-bottom:6px"><label class="note" for="wp-lab-${k}" style="width:56px">${k === "gmail" ? "Gmail" : "Outlook"}</label><input class="wp-sel" style="flex:1;width:auto" id="wp-lab-${k}" data-lab="${k}" maxlength="20" value="${esc(L[k] || "")}" placeholder="${k === "gmail" ? "e.g. Personal" : "e.g. School"}"></div>`).join("")}
        <p class="note">Shown small next to the name. Leave blank for none. Hidden when the widget is narrow.</p></div>`;
    }
    const notes = Notes.notes().slice().sort((x, y) => (x.title || "").localeCompare(y.title || ""));
    const n = Notes.note(it.note), items = n ? pickItems(n).length : 0;
    return `<div><label class="wp-l" for="wp-note">Note</label><select class="wp-sel" id="wp-note">${notes.map(x => `<option value="${x.id}" ${x.id === it.note ? "selected" : ""}>${esc(x.title || "Untitled")}${x.folderId ? " · " + esc(Notes.path(x.folderId)) : ""}</option>`).join("")}</select></div>
      <label class="switch"><input type="checkbox" id="wp-pick" ${it.pickOn === true ? "checked" : ""}><span>Show a “Pick one for me” button</span></label>
      <p class="note">Off by default. Useful for list notes like dinner ideas: it picks a random unchecked item. ${items >= 2 ? `This note has ${items} list items.` : "It only shows when the note has a list with at least 2 items."}</p>`;
  }
  function renderPop(){
    const it = selItem();
    if (!it || ed.placing || ed.moving){ hidePop(); return; }
    const prevBody = pop.querySelector(".wp-body"), keep = prevBody && pop.dataset.for === it.id + ed.tab ? prevBody.scrollTop : 0;
    const single = !!SINGLE[it.type];
    pop.innerHTML = `<div class="wp-head"><div class="wp-t"><b>${esc(kindOf(it).name)}</b><span class="mono note">${it.w}×${it.h}</span><span class="sp"></span><button type="button" class="x" data-wp="close" aria-label="Done editing this widget">×</button></div>
        <div class="wp-act"><button type="button" class="btn small" data-wp="move">Move</button>${single ? "" : `<button type="button" class="btn small" data-wp="dup">Duplicate</button>`}<button type="button" class="btn small danger" data-wp="remove">Remove</button></div>
        <div class="seg wp-tabs" role="tablist"><button type="button" role="tab" data-tab="size" aria-pressed="${ed.tab === "size"}">Size</button><button type="button" role="tab" data-tab="color" aria-pressed="${ed.tab === "color"}">Color</button>${hasOpts(it) ? `<button type="button" role="tab" data-tab="opts" aria-pressed="${ed.tab === "opts"}">${it.type === "note" ? "Note" : "Account"}</button>` : ""}</div></div>
      <div class="wp-body">${ed.tab === "color" ? colorTab(it) : ed.tab === "opts" ? optsTab(it) : sizeTab(it)}</div>`;
    pop.dataset.for = it.id + ed.tab;
    pop.hidden = false;
    placePop();
    pop.querySelector(".wp-body").scrollTop = keep;   // after placing: sizing the panel resets its scroll
  }
  /* Beside the widget when there's room (right, then left); otherwise below or above it.
     Always at least 16px from the screen edges and below the editor toolbar. */
  function placePop(){
    if (pop.hidden) return;
    const w = egrid.querySelector(`.hw[data-id="${ed.sel}"]`); if (!w){ hidePop(); return; }
    const bodyEl = pop.querySelector(".wp-body"), st0 = bodyEl ? bodyEl.scrollTop : 0;
    const r = w.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = innerHeight, M = 16;
    const top0 = Math.max(M, $("#etop").getBoundingClientRect().bottom + 12);
    const pw = Math.min(400, vw - 2 * M);
    pop.style.width = pw + "px"; pop.style.maxHeight = "none";
    const natural = pop.scrollHeight, room = vh - M - top0;
    let left, top, maxH;
    if (r.right + M + pw <= vw - M || r.left - M - pw >= M){
      left = r.right + M + pw <= vw - M ? r.right + M : r.left - M - pw;
      maxH = room; const h = Math.min(natural, maxH);
      top = clamp(r.top, top0, vh - M - h);
    } else {
      left = clamp(r.left + r.width / 2 - pw / 2, M, vw - M - pw);
      const below = vh - M - (r.bottom + M), above = r.top - M - top0, want = Math.min(natural, 300);
      if (below >= want || (below >= above && below >= 180)){ maxH = below; top = r.bottom + M; }
      else if (above >= 180){ maxH = above; top = r.top - M - Math.min(natural, above); }
      else { maxH = Math.min(natural, room * .6); top = vh - M - maxH; }   // the widget fills the screen: float over its lower part
    }
    pop.style.left = Math.round(left) + "px"; pop.style.top = Math.round(top) + "px"; pop.style.maxHeight = Math.max(160, Math.round(maxH)) + "px";
    if (bodyEl) bodyEl.scrollTop = st0;
  }
  let rafP = 0;
  const schedulePlace = () => { if (!ed.on || pop.hidden) return; cancelAnimationFrame(rafP); rafP = requestAnimationFrame(placePop); };
  addEventListener("scroll", schedulePlace, {passive:true});
 
  function setColor(it, col){
    const t = normColor(it.color).t;
    it.color = clone(col);
    if (col.k === "solid" || col.k === "grad") it.color.t = t ?? 100; else delete it.color.t;
    ed.cust = custFrom(it.color, ed.cust);   // the custom boxes now start from this color, ready to tweak
    renderEditor();
  }
  /* Custom color and custom gradient start from the widget's current color: a solid color gives a gradient
     from it to a deeper shade; a gradient gives its first color as the solid. Default/glass keep the last values. */
  function custFrom(color, prev){
    const c = normColor(color), hex = x => "#" + x.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    prev = prev || {solid:"#0F8F99", stops:["#0F9AA5","#7C3AED"], a:135, g:"linear"};
    if (c.k === "solid") return {solid:c.c.toUpperCase(), stops:[c.c.toUpperCase(), hex(mixc(rgb(c.c), [15,23,42], .6))], a:prev.a ?? 135, g:prev.g || "linear"};
    if (c.k === "grad") return {solid:c.stops[0].toUpperCase(), stops:[...c.stops], a:c.a ?? 135, g:c.g || "linear"};
    return {...prev, stops:[...prev.stops]};
  }
  function saveMine(col){
    const c = clone(col); delete c.t;
    const mine = Settings.get().myColors || [];
    if (mine.some(m => colorKey(m) === colorKey(c))){ toast("That one is already in My colors"); return; }
    Settings.update(st => { st.myColors = [c, ...(st.myColors || [])].slice(0, 30); });
    toast("Saved to My colors"); renderPop();
  }
  const tooSmall = (type, w, h) => (type === "calendar" && w === 1 && h === 1) || (type === "week" && (w < 2 || h < 2));   // the calendar needs at least 2 tiles, This Week 2×2
  const tooSmallMsg = type => type === "week" ? "This Week needs at least 2×2 tiles." : "The calendar needs at least 2 tiles.";
  function resizeTo(it, w, h){
    const cols = edCols(); w = clamp(w, 1, cols); h = clamp(h, 1, 16);
    if (tooSmall(it.type, w, h)){ toast(tooSmallMsg(it.type)); return; }
    const r = {x:Math.min(it.x, cols - w), y:it.y, w, h};
    if (!fits(edItems(), r, cols, it.id)){ toast("Not enough room there. Move it or make room first."); return; }
    Object.assign(it, r); renderEditor();
  }
  pop.addEventListener("click", e => {
    const it = selItem(); if (!it) return;
    const t = e.target;
    const tab = t.closest("[data-tab]"); if (tab){ ed.tab = tab.dataset.tab; return renderPop(); }
    const sz = t.closest("[data-size]"); if (sz){ const [w, h] = sz.dataset.size.split(",").map(Number); return resizeTo(it, w, h); }
    const dm = t.closest("[data-dim]"); if (dm){ const [k, d] = dm.dataset.dim.split(","); return resizeTo(it, it.w + (k === "w" ? +d : 0), it.h + (k === "h" ? +d : 0)); }
    const col = t.closest("[data-col]"); if (col && !ed.manage) return setColor(it, JSON.parse(col.dataset.col));
    const ao = t.closest("[data-wacct-opt]"); if (ao){ it.acct = ao.dataset.wacctOpt; if (it.acct === "split") it.view ||= "gmail"; return renderEditor(); }
    const b = t.closest("[data-wp]"); if (!b) return;
    const q = ed.cust;
    switch (b.dataset.wp){
      case "close": ed.sel = null; return renderEditor();
      case "move": ed.moving = it.id; return renderEditor();
      case "remove": ed.layouts[ed.bp] = edItems().filter(i => i.id !== it.id); ed.sel = null; toast(`Removed ${kindOf(it).name}`); return renderEditor();
      case "dup": { const r = firstFree(edItems(), it.w, it.h, edCols()); if (!r) return toast("No open spot for a copy."); const n = {...clone(it), id:uid(), ...r}; edItems().push(n); return select(n.id); }
      case "manage": ed.manage = !ed.manage; return renderPop();
      case "unsave": Settings.update(st => { st.myColors.splice(+b.dataset.i, 1); }); return renderPop();
      case "cs-use": case "cs-save": {
        const hx = $("#cs-hex").value.trim(), v = hx.startsWith("#") ? hx : "#" + hx;
        if (!HEX.test(v)){ $("#cs-err").hidden = false; $("#cs-hex").focus(); return; }
        q.solid = v.toUpperCase(); const c = {k:"solid", c:q.solid};
        return b.dataset.wp === "cs-use" ? setColor(it, c) : saveMine(c);
      }
      case "stop-add": q.stops.push(q.stops[q.stops.length - 1]); return renderPop();
      case "stop-del": q.stops.splice(+b.dataset.i, 1); return renderPop();
      case "g-lin": q.g = "linear"; return renderPop();
      case "g-rad": q.g = "radial"; return renderPop();
      case "cg-use": return setColor(it, {k:"grad", stops:[...q.stops].map(s => s.toUpperCase()), a:q.a, g:q.g});
      case "cg-save": return saveMine({k:"grad", stops:[...q.stops].map(s => s.toUpperCase()), a:q.a, g:q.g});
    }
  });
  pop.addEventListener("input", e => {
    const it = selItem(), t = e.target, q = ed.cust; if (!it) return;
    if (t.id === "wp-tint"){
      it.color.t = +t.value; $("#wp-tint-v").textContent = t.value + "%";
      const n = egrid.querySelector(`.hw[data-id="${it.id}"] > .tile`); applyPaint(n, it.color);
    }
    if (t.id === "cs-c"){ q.solid = t.value.toUpperCase(); $("#cs-hex").value = q.solid; $("#cs-prev").style.setProperty("--s", q.solid); $("#cs-err").hidden = true; }
    if (t.id === "cs-hex"){ const v = t.value.trim().startsWith("#") ? t.value.trim() : "#" + t.value.trim(); $("#cs-err").hidden = true; if (HEX.test(v)){ q.solid = v.toUpperCase(); $("#cs-c").value = v.toLowerCase(); $("#cs-prev").style.setProperty("--s", v); } }
    if (t.dataset.stop != null){ q.stops[+t.dataset.stop] = t.value.toUpperCase(); $("#cg-prev").style.background = gradCSS(q.stops, q.a, q.g); }
    if (t.id === "cg-a"){ q.a = +t.value; $("#cg-av").textContent = t.value + "°"; $("#cg-prev").style.background = gradCSS(q.stops, q.a, q.g); }
  });
  pop.addEventListener("change", e => {
    const it = selItem(); if (!it) return;
    if (e.target.id === "wp-note"){ it.note = e.target.value; delete picked[it.id]; renderEditor(); }
    if (e.target.id === "wp-pick"){ it.pickOn = e.target.checked; renderEditor(); }
    if (e.target.dataset.lab){ it.labels = {...(it.labels || {}), [e.target.dataset.lab]: e.target.value.trim()}; renderEditor(); }
  });
  pop.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "cs-hex"){ e.preventDefault(); pop.querySelector('[data-wp="cs-use"]').click(); } });
 
  /* ---------- placing and moving by tapping a tile ---------- */
  function addItem(p, r){
    if (!r){ toast("No open spot. Remove or shrink something first."); return; }
    const it = {id:uid(), type:p.type, ...r, color:{k:"default"}};
    if (p.type === "inbox"){ it.acct = p.acct; if (p.acct === "split") it.view = "gmail"; }
    if (p.type === "note"){ it.note = p.note; }
    edItems().push(it); ed.placing = null; ed.tab = "size"; select(it.id);
  }
  egrid.addEventListener("click", e => {
    const c = e.target.closest(".cell"); if (!c) return;
    const x = +c.dataset.x, y = +c.dataset.y, cols = edCols();
    if (ed.placing){
      const w = Math.min(ed.placing.w, cols), r = {x:Math.min(x, cols - w), y, w, h:ed.placing.h};
      if (!fits(edItems(), r, cols)) return toast("That spot is taken. Try another tile.");
      return addItem(ed.placing, r);
    }
    if (ed.moving){
      const it = selItem(), r = {x:Math.min(x, cols - it.w), y, w:it.w, h:it.h};
      if (!fits(edItems(), r, cols, it.id)) return toast("Doesn't fit there. Try another tile.");
      Object.assign(it, r); ed.moving = null; return renderEditor();
    }
    if (ed.sel){ ed.sel = null; renderEditor(); }
  });
 
  /* ---------- drag to move, drag the corner to resize ---------- */
  let drag = null;
  const ghost = () => $("#ghost");
  function showGhost(r, ok){ const g = ghost(); if (!g) return; g.hidden = false; g.classList.toggle("bad", !ok); g.style.gridColumn = `${r.x+1}/span ${r.w}`; g.style.gridRow = `${r.y+1}/span ${r.h}`; }
  const hideGhost = () => { const g = ghost(); if (g) g.hidden = true; };
  egrid.addEventListener("pointerdown", e => {
    if (ed.placing || ed.moving) return;
    const w = e.target.closest(".hw"); if (!w) return;
    const it = edItems().find(i => i.id === w.dataset.id); if (!it) return;
    if (e.target.closest(".hw-handle")){
      e.preventDefault(); egrid.setPointerCapture(e.pointerId); hidePop();
      drag = {mode:"resize", it, pid:e.pointerId, moved:true, r:{x:it.x, y:it.y, w:it.w, h:it.h}, ok:true}; showGhost(drag.r, true); return;
    }
    const c = cellAt(egrid, e.clientX, e.clientY), canDrag = e.pointerType === "mouse" || ed.sel === it.id;
    drag = {mode:"move", it, el:w, pid:e.pointerId, sx:e.clientX, sy:e.clientY, dx:c.x - it.x, dy:c.y - it.y, moved:false, canDrag, r:null, ok:true};
    if (canDrag){ egrid.setPointerCapture(e.pointerId); if (e.pointerType !== "mouse") e.preventDefault(); }
  });
  egrid.addEventListener("pointermove", e => {
    if (!drag){
      if (ed.placing && e.pointerType === "mouse"){ const c = cellAt(egrid, e.clientX, e.clientY), cols = edCols(), w = Math.min(ed.placing.w, cols), r = {x:Math.min(c.x, cols - w), y:c.y, w, h:ed.placing.h}; showGhost(r, fits(edItems(), r, cols)); }
      return;
    }
    if (e.pointerId !== drag.pid) return;
    const cols = edCols(), it = drag.it, c = cellAt(egrid, e.clientX, e.clientY);
    if (drag.mode === "move"){
      if (!drag.moved){ if (!drag.canDrag || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return; drag.moved = true; drag.el.classList.add("dragging"); hidePop(); }
      drag.r = {x:clamp(c.x - drag.dx, 0, cols - it.w), y:Math.max(0, c.y - drag.dy), w:it.w, h:it.h};
    } else drag.r = {x:it.x, y:it.y, w:clamp(c.x - it.x + 1, 1, cols - it.x), h:clamp(c.y - it.y + 1, 1, 16)};
    drag.ok = fits(edItems(), drag.r, cols, it.id) && !tooSmall(it.type, drag.r.w, drag.r.h); showGhost(drag.r, drag.ok);
    if (e.clientY < 90) scrollBy(0, -14); else if (e.clientY > innerHeight - 60) scrollBy(0, 14);
    e.preventDefault();
  });
  const endDrag = (e, cancel) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null; hideGhost();
    if (!cancel && d.mode === "move" && !d.moved){ if (ed.sel !== d.it.id) return select(d.it.id); return renderEditor(); }
    if (!cancel && d.r && d.ok) Object.assign(d.it, d.r);
    else if (!cancel && d.r && !d.ok) toast(tooSmall(d.it.type, d.r.w, d.r.h) ? tooSmallMsg(d.it.type) : "That overlaps another widget.");
    renderEditor();
  };
  egrid.addEventListener("pointerup", e => endDrag(e, false));
  egrid.addEventListener("pointercancel", e => endDrag(e, true));
 
  /* ---------- toolbar ---------- */
  $("#ed-bp").addEventListener("click", e => { const b = e.target.closest("[data-bp]"); if (!b) return; ed.bp = b.dataset.bp; ed.sel = ed.placing = ed.moving = null; renderEditor(); });
  $("#ed-add").onclick = () => openGallery();
  $("#ed-copy").onclick = async () => {
    const other = ed.bp === "laptop" ? "phone" : "laptop";
    if (edItems().length && !(await confirmBox({title:`Replace the ${ed.bp} layout?`, body:`It's replaced with a copy of the ${other} layout, rearranged to fit ${edCols()} columns.`, ok:"Replace"}))) return;
    ed.layouts[ed.bp] = pack(ed.layouts[other], edCols()); ed.sel = null; renderEditor();
  };
  $("#ed-clear").onclick = async () => { if (await confirmBox({title:`Clear the ${ed.bp} layout?`, body:"Every widget on this layout is removed. Nothing is saved until you press Save.", ok:"Clear"})){ ed.layouts[ed.bp] = []; ed.sel = null; renderEditor(); } };
  $("#ed-cancel").onclick = async () => { if (!dirty() || await confirmBox({title:"Discard your changes?", body:"Your edits to this home screen won't be saved.", ok:"Discard"})) exit(); };
  $("#ed-save").onclick = () => {
    if (!ed.layouts.laptop.length && !ed.layouts.phone.length){ toast("Add at least one widget before saving."); return; }
    const S = store(), n = ed.screenId ? S.list.find(s => s.id === ed.screenId) : null;
    $("#sv-name").value = ed.name || ""; $("#sv-err").hidden = true;
    $("#sv-copy").hidden = !n || S.list.length >= MAX;
    const otherEmpty = !ed.layouts[ed.bp === "laptop" ? "phone" : "laptop"].length;
    $("#sv-note").textContent = (n ? `Saving replaces “${n.name}”.` : `${S.list.length} of ${MAX} home screens saved.`) + (otherEmpty ? ` The ${ed.bp === "laptop" ? "phone" : "laptop"} layout is empty; it will be filled from this one automatically.` : "");
    hidePop(); $("#dlg-save").showModal(); $("#sv-name").focus(); $("#sv-name").select();
  };
  function doSave(asNew){
    const name = $("#sv-name").value.trim();
    if (!name){ $("#sv-err").textContent = "Give this home screen a name."; $("#sv-err").hidden = false; $("#sv-name").focus(); return; }
    const S = store();
    if ((asNew || !ed.screenId) && S.list.length >= MAX){ $("#sv-err").textContent = `You already have ${MAX} saved. Delete one first.`; $("#sv-err").hidden = false; return; }
    for (const [k, o] of [["laptop","phone"],["phone","laptop"]]) if (!ed.layouts[k].length && ed.layouts[o].length) ed.layouts[k] = pack(ed.layouts[o], COLS[k]);
    let id = !asNew && ed.screenId;
    saveStore(st => {
      let s = id && st.list.find(x => x.id === id);
      if (!s){ s = {id:uid()}; st.list.push(s); }
      Object.assign(s, {name, layouts:clone(ed.layouts), updatedAt:new Date().toISOString()});
      st.activeId = s.id;
    });
    $("#dlg-save").close(); exit(); toast(`Saved “${name}”`);
  }
  $("#form-save").addEventListener("submit", e => { e.preventDefault(); doSave(false); });
  $("#sv-copy").onclick = () => doSave(true);
  $("#sv-name").addEventListener("input", () => $("#sv-err").hidden = true);
  $("#dlg-save").addEventListener("close", () => { if (ed.on) renderPop(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && ed.on && !document.querySelector("dialog[open]") && (ed.sel || ed.placing || ed.moving)){ ed.sel = ed.placing = ed.moving = null; renderEditor(); } });
 
  /* ---------- widget gallery ---------- */
  const gal = {k:"clock", w:2, h:1, note:null};
  function openGallery(){
    ed.placing = ed.moving = null; ed.sel = null; renderEditor();
    const taken = new Set(edItems().filter(i => SINGLE[i.type]).map(i => i.type));
    if (taken.has(KINDS.find(k => k.k === gal.k).type)) gal.k = (KINDS.find(k => !SINGLE[k.type] || !taken.has(k.type)) || KINDS[0]).k;
    const k = KINDS.find(x => x.k === gal.k); [gal.w, gal.h] = k.def;
    if (!gal.note || !Notes.note(gal.note)) gal.note = (Notes.notes()[0] || {}).id || null;
    renderGallery(); $("#dlg-gallery").showModal();
  }
  function renderGallery(){
    const cols = edCols(), taken = new Set(edItems().filter(i => SINGLE[i.type]).map(i => i.type));
    $("#ga-types").innerHTML = KINDS.map(k => { const off = SINGLE[k.type] && taken.has(k.type);
      return `<button type="button" data-kind="${k.k}" aria-pressed="${k.k === gal.k}" ${off ? "disabled" : ""}><b>${k.name}</b><span>${off ? "Already on this layout" : k.desc}</span></button>`; }).join("");
    $("#ga-note-f").hidden = gal.k !== "note";
    const notes = Notes.notes().slice().sort((x, y) => (x.title || "").localeCompare(y.title || ""));
    $("#ga-note").innerHTML = notes.length ? notes.map(n => `<option value="${n.id}" ${n.id === gal.note ? "selected" : ""}>${esc(n.title || "Untitled")}</option>`).join("") : `<option value="">No notes yet. Make one on the Notes page</option>`;
    const gtype = KINDS.find(k => k.k === gal.k).type;
    $("#ga-sizes").innerHTML = SIZES.map(([n, w, h]) => { w = w || cols; return w > cols || tooSmall(gtype, w, h) ? "" : `<button type="button" data-gs="${w},${h}" aria-pressed="${gal.w === w && gal.h === h}">${n}<small>${w}×${h}</small></button>`; }).join("");
    const noNote = gal.k === "note" && !notes.length;
    $("#ga-place").disabled = $("#ga-auto").disabled = noNote;
  }
  $("#ga-types").addEventListener("click", e => { const b = e.target.closest("[data-kind]"); if (!b || b.disabled) return; gal.k = b.dataset.kind; [gal.w, gal.h] = KINDS.find(k => k.k === gal.k).def; renderGallery(); });
  $("#ga-sizes").addEventListener("click", e => { const b = e.target.closest("[data-gs]"); if (!b) return; [gal.w, gal.h] = b.dataset.gs.split(",").map(Number); renderGallery(); });
  $("#ga-note").addEventListener("change", e => gal.note = e.target.value);
  const galPick = () => { const k = KINDS.find(x => x.k === gal.k); return {type:k.type, acct:k.acct, name:k.name, w:Math.min(gal.w, edCols()), h:gal.h, note:gal.note}; };
  $("#ga-place").onclick = () => { ed.placing = galPick(); $("#dlg-gallery").close(); renderEditor(); };
  $("#ga-auto").onclick = () => { const p = galPick(); $("#dlg-gallery").close(); addItem(p, firstFree(edItems(), p.w, p.h, edCols())); };
 
  /* ---------- Settings → Change home screen ---------- */
  function thumb(layout, cols){
    const rows = Math.max(3, ...layout.map(i => i.y + i.h));
    return `<div class="hs-thumb" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},8px)">${layout.map(i => { const c = normColor(i.color);
      return `<i style="grid-column:${i.x+1}/span ${i.w};grid-row:${i.y+1}/span ${i.h};${c.k === "solid" || c.k === "grad" ? `background:${swatchBg(c)}` : ""}" class="${c.k === "glass" ? "gl" : ""}"></i>`; }).join("")}</div>`;
  }
  let newChoice = false;
  function renderScreens(){
    const S = store(), b = bp(), full = S.list.length >= MAX;
    $("#sc-list").innerHTML = (S.list.length ? S.list.map(s => `<div class="scr ${s.id === S.activeId ? "on" : ""}">${thumb(s.layouts[b] || [], COLS[b])}
        <div><h4>${esc(s.name)}${s.id === S.activeId ? '<span class="scr-badge">In use</span>' : ""}</h4><p class="note">Edited ${new Date(s.updatedAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})} · ${s.layouts.laptop.length} laptop and ${s.layouts.phone.length} phone widgets</p>
        <div class="scr-b">${s.id !== S.activeId ? `<button class="btn small primary" type="button" data-use="${s.id}">Use</button>` : ""}<button class="btn small" type="button" data-ed="${s.id}">Edit</button><button class="btn small danger" type="button" data-del="${s.id}">Delete</button></div></div></div>`).join("")
      : `<p class="note">No saved home screens.</p>`) + `<p class="note">${S.list.length} of ${MAX} saved. The preview shows your ${b} layout.</p>`;
    $("#sc-foot").innerHTML = newChoice && !full
      ? `<span class="note" style="align-self:center">Start from</span><span class="sp"></span><button class="btn" type="button" data-new="blank">Blank</button>${active() ? `<button class="btn primary" type="button" data-new="copy">Copy of “${esc(active().name)}”</button>` : ""}`
      : `${full ? `<span class="note" style="align-self:center">Delete one to make a new screen.</span>` : ""}<span class="sp"></span><button class="btn" type="button" data-close>Close</button><button class="btn primary" type="button" id="sc-new" ${full ? "disabled" : ""}>+ New home screen</button>`;
  }
  function openScreens(){ newChoice = false; renderScreens(); if (!$("#dlg-screens").open) $("#dlg-screens").showModal(); }
  $("#dlg-screens").addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("#sc-new")){ newChoice = true; return renderScreens(); }
    const nw = t.closest("[data-new]"); if (nw){ $("#dlg-screens").close(); $("#dlg-settings").close(); return enter(store().activeId, nw.dataset.new); }
    const u = t.closest("[data-use]"); if (u){ saveStore(st => { st.activeId = u.dataset.use; }); renderScreens(); homeSig = null; render(true); renderSettings(); return toast(`Switched to “${active().name}”`); }
    const d = t.closest("[data-ed]"); if (d){ $("#dlg-screens").close(); $("#dlg-settings").close(); return enter(d.dataset.ed, "edit"); }
    const x = t.closest("[data-del]");
    if (x){
      const s = store().list.find(v => v.id === x.dataset.del);
      if (!(await confirmBox({title:`Delete “${s.name}”?`, body:"Its laptop and phone layouts are both deleted. This can't be undone.", ok:"Delete"}))) return;
      saveStore(st => { st.list = st.list.filter(v => v.id !== s.id); if (st.activeId === s.id) st.activeId = st.list[0] ? st.list[0].id : null; });
      renderScreens(); homeSig = null; render(true); renderSettings();
    }
  });
  $("#st-hs-change").onclick = openScreens;
  $("#btn-edit-home").onclick = () => { const s = active(); s ? enter(s.id, "edit") : enter(null, "blank"); };
 
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (ed.on) renderEditor(); else render(); }, 120); });
  addEventListener("beforeunload", e => { if (ed.on && dirty()){ e.preventDefault(); e.returnValue = ""; } });
 
  /* Puts a new kind of widget on every saved home screen once (first open spot, laptop and phone).
     The flag lives in Settings, so it syncs and a widget you remove later doesn't come back. */
  function ensureWidget(flag, type, size){
    store();
    if (Settings.get()[flag]) return;
    Settings.update(st => {
      st[flag] = true;
      for (const scr of (st.screens && st.screens.list) || []){
        for (const k of ["laptop","phone"]){
          const L = (scr.layouts ||= {})[k] ||= [];
          if (L.some(i => i.type === type)) continue;
          const [w, h] = size[k], r = firstFree(L, Math.min(w, COLS[k]), h, COLS[k]);
          if (r) L.push(W(type, r.x, r.y, r.w, r.h));
        }
        scr.updatedAt = new Date().toISOString();
      }
    });
    homeSig = null; if (ready) render(true);
  }
 
  return {render, refresh, openScreens, ensureWidget, activeName:() => (active() || {}).name || "none", get editing(){ return ed.on; }};
})();
 
 
/* =====================================================================
   GLOBAL EVENT WIRING
   ===================================================================== */
document.addEventListener("click", e => {
  const c = e.target.closest("[data-close]"); if (c){ c.closest("dialog").close(); return; }
  if (e.target.closest("input,select,textarea,label,a")) return;
  const o = e.target.closest("[data-open]"); if (o && !o.closest("dialog")) openDetail(o.dataset.open);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-open]:not(button)")){ e.preventDefault(); openDetail(e.target.dataset.open); }
});
document.addEventListener("change", e => {
  const t = e.target.closest?.("[data-toggle]"); if (!t) return;
  const fromHome = !!t.closest("#home-todo, .twk-w"), id = t.dataset.toggle, r = Store.update(id, {completed: t.checked});
  if (t.checked && fromHome) toast(`Done: "${trunc(r.title, 30)}"`, () => Store.update(id, {completed:false}));
});
$("#btn-add").onclick = () => openDetail(null, {date: defaultAddDate(), category: page === "todo" ? (todoState.cat || "Personal") : "School"});
$("#clear-samples").onclick = () => softDelete(Store.all().filter(r => r.sample).map(r => r.id));
 
/* ---------- ⋯ menu: To-do, All items, Deleted ---------- */
const moreB = $("#more-b"), moreM = $("#more-m");
function closeMore(){ moreM.hidden = true; moreB.setAttribute("aria-expanded", "false"); }
moreB.addEventListener("click", e => {
  e.stopPropagation();
  if (!moreM.hidden) return closeMore();
  moreM.hidden = false; moreB.setAttribute("aria-expanded", "true");
  const r = moreB.getBoundingClientRect();
  moreM.style.top = Math.round(r.bottom + 8) + "px";
  moreM.style.left = Math.round(Math.max(12, Math.min(r.left, document.documentElement.clientWidth - moreM.offsetWidth - 12))) + "px";
  moreM.querySelector("a").focus();
});
document.addEventListener("click", e => { if (!moreM.hidden && !e.target.closest("#more-m")) closeMore(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !moreM.hidden){ closeMore(); moreB.focus(); } });
addEventListener("resize", closeMore);
 
/* ---------- pages (hash routing) ---------- */
const PAGES = ["home","todo","notes","items","deleted"];
let page = "home";
function route(){
  const [p, sub] = location.hash.slice(1).split("/");
  if (ready && checkSetupLink()) return;
  if (p === "link" && sub && ready) setTimeout(() => openLink(decodeURIComponent(sub), true), 0);
  if (p === "item" && sub && ready){ history.replaceState(null, "", "#home"); setTimeout(() => openDetail(decodeURIComponent(sub)), 0); }
  page = PAGES.includes(p) ? p : "home";
  if (page === "todo" && sub) todoState.list = (sub === "history" || SMART.some(s => s.k === sub)) ? sub : "all";
  document.body.className = "pg-" + page;
  $$("[data-pagebox]").forEach(el => el.hidden = el.dataset.pagebox !== page);
  $$(".tabs a, #more-m a").forEach(a => a.dataset.page === page ? a.setAttribute("aria-current","page") : a.removeAttribute("aria-current"));
  $("#more-b").classList.toggle("on", ["todo","items","deleted"].includes(page)); closeMore();
  if (ready) renderAll();
  if (page === "todo" || page === "notes") requestAnimationFrame(fitTodo);
}
window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); const sc = $("#todo-scroll"); if (sc) sc.scrollTop = 0; });
 
function renderAll(){
  renderCal(); renderHomeTodo(); renderTodoPage(); renderNotes(); renderItems(); renderDeleted();
  $("#courses").innerHTML = allCourses().map(c => `<option value="${esc(c)}">`).join("");
  $("#clear-samples").hidden = !Store.all().some(r => r.sample);
  const urgent = smartCount("today") + smartCount("overdue");
  $("#nav-todo").textContent = urgent || ""; $("#nav-todo").hidden = !urgent;
  $("#more-dot").textContent = urgent || ""; $("#more-dot").hidden = !urgent;
  $("#more-b").title = urgent ? `To-do (${urgent} due today or overdue), All items, Deleted` : "To-do, All items, Deleted";
  Home.render();
  updateDelCount();
  $("#store-note").textContent = Store.persistent ? Sync.statusText() : "This browser is blocking storage, so changes last until you close the page.";
}