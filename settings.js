/* Homebase: Settings → Links, Types, and the Settings dialog layout.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* ---------- Settings → Links ---------- */
/* ---------- Types: your own, colors, and which go on the to-do list ---------- */
const TYPE_SWATCHES = ["#2563EB","#0E7490","#0D9488","#16A34A","#65A30D","#CA8A04","#EA580C","#DC2626","#DB2777","#9333EA","#4F46E5","#64748B"];
const typeSlug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-");
function applyTypeColors(){
  let el = document.getElementById("type-color-css"); if (!el){ el = document.createElement("style"); el.id = "type-color-css"; document.head.appendChild(el); }
  const L = customTypes().filter(c => /^#[0-9a-f]{6}$/i.test(c.color || "") && !TYPES.includes(c.name));
  const light = L.map(c => `--t-${typeSlug(c.name)}:${c.color}`).join(";"), dark = L.map(c => `--t-${typeSlug(c.name)}:color-mix(in srgb,${c.color} 65%,#fff)`).join(";");
  el.textContent = L.length ? `:root{${light}}:root[data-theme="dark"]{${dark}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}` : "";
}
applyTypeColors();
Settings.onReplace(applyTypeColors);
let tyDone = null, tyColor = TYPE_SWATCHES[0];
function openTypeDialog(cb){
  tyDone = cb; tyColor = TYPE_SWATCHES.find(c => !customTypes().some(x => x.color === c)) || TYPE_SWATCHES[0];
  $("#ty-name").value = ""; $("#ty-sched").checked = true; $("#ty-todo").checked = false; $("#ty-err").hidden = true;
  drawTypeColors(); $("#dlg-type").showModal(); $("#ty-name").focus();
}
const drawTypeColors = () => { $("#ty-colors").innerHTML = TYPE_SWATCHES.map(c => `<button type="button" class="sw" style="--sc:${c}" data-tyc="${c}" aria-pressed="${c === tyColor}" aria-label="Color ${c}"></button>`).join(""); };
$("#ty-colors").addEventListener("click", e => { const b = e.target.closest("[data-tyc]"); if (b){ tyColor = b.dataset.tyc; drawTypeColors(); } });
$("#form-type").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#ty-name").value.trim().replace(/\s+/g, " "), err = t => { $("#ty-err").textContent = t; $("#ty-err").hidden = false; };
  if (!name) return err("Give the type a name.");
  if (name === "__new" || allTypes().some(t => t.toLowerCase() === name.toLowerCase())) return err(`There's already a type called “${name}”.`);
  Settings.update(s => { s.types.custom.push({name, color:tyColor, scheduled:$("#ty-sched").checked, todo:$("#ty-todo").checked}); });
  applyTypeColors(); $("#dlg-type").close();
  if (tyDone) tyDone(name); tyDone = null;
  if ($("#dlg-settings").open) renderTypeSettings();
  if (ready) renderAll();
  toast(`Added the type “${name}”`);
});
$("#dlg-type").addEventListener("close", () => { tyDone = null; });
/* Order and the main/additional split are saved in Settings (so they sync). Removing a built-in type only hides it from
   menus; its items keep their type. Removing one you added turns its items into Other. */
/* typeOrder() and typeMainCount() live in js/core.js (they're needed while the page is still loading). */
const DRAG_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
function renderTypeSettings(){
  const L = typeOrder(), main = Math.min(typeMainCount(), L.length);
  const row = t => { const c = customType(t), nc = t === "No Class", other = t === "Other";
    return `<div class="ty-row" data-ty="${esc(t)}"><span class="lk-drag" title="Drag to reorder" aria-hidden="true">${DRAG_DOTS}</span><span class="tb" style="--tc:${TYPE_VAR(t)}">${typeIcon(t)}${esc(t)}</span>${c ? `<span class="note">yours · ${c.scheduled ? "start and end" : "due time"}</span>` : ""}<span class="sp"></span>
      ${nc ? '<span class="note">calendar only</span>' : `<label class="switch"><input type="checkbox" data-tytodo="${esc(t)}" ${typeTodo(t) ? "checked" : ""}><span>To-do</span></label>`}
      ${nc || other ? '<span class="ty-sp"></span>' : `<button type="button" class="btn small ghost danger" data-tydel="${esc(t)}" aria-label="Remove the type ${esc(t)}">Remove</button>`}</div>`; };
  $("#st-type-list").innerHTML = L.slice(0, main).map(row).join("") + `<div class="ty-div" data-tydiv><span>Additional</span></div>` + L.slice(main).map(row).join("");
  const hid = (Settings.get().types.hidden || []).filter(t => TYPES.includes(t));
  $("#st-type-hidden").innerHTML = hid.length ? `Removed: ${hid.map(esc).join(", ")} · <button type="button" class="linkb" id="st-type-restore">Bring them back</button>` : "";
}
$("#st-type-add").onclick = () => openTypeDialog(null);
$("#st-type-list").addEventListener("change", e => {
  const c = e.target.closest("[data-tytodo]"); if (!c) return; const t = c.dataset.tytodo;
  Settings.update(s => { const cu = s.types.custom.find(x => x.name === t); if (cu){ cu.todo = c.checked; delete s.types.todo[t]; } else if (c.checked === !CALENDAR_ONLY.has(t)) delete s.types.todo[t]; else s.types.todo[t] = c.checked; });
  if (ready) renderAll();
});
$("#st-type-list").addEventListener("click", async e => {
  const b = e.target.closest("[data-tydel]"); if (!b) return; const t = b.dataset.tydel, mine = !!customType(t);
  const items = Store.all().filter(r => r.type === t).concat(Store.deleted().filter(r => r.type === t));
  const body = mine ? (items.length ? `${plural(items.length, "item")} of this type will become Other.` : "No items use it.")
    : `It's taken off your type menus.${items.length ? ` Your ${plural(items.length, "item")} of this type keep it.` : ""} You can bring it back below the list.`;
  if (!(await confirmBox({title:`Remove the type “${t}”?`, body, ok:"Remove"}))) return;
  if (mine && items.length) Store.updateMany(items.map(r => r.id), () => ({type:"Other"}));
  Settings.update(s => {
    if (mine){ s.types.custom = s.types.custom.filter(x => x.name !== t); delete s.types.todo[t]; }
    else s.types.hidden = [...new Set([...(s.types.hidden || []), t])];
    const idx = typeOrder().indexOf(t); if (idx >= 0 && idx < typeMainCount()) s.types.main = Math.max(0, typeMainCount() - 1);
  });
  applyTypeColors(); renderTypeSettings(); if (ready) renderAll();
});
$("#st-type-hidden").addEventListener("click", e => { if (!e.target.closest("#st-type-restore")) return; Settings.update(s => { s.types.hidden = []; }); renderTypeSettings(); if (ready) renderAll(); });
/* Drag a type by its handle, across the "Additional" line too. */
(() => {
  const list = $("#st-type-list"); let drag = null;
  list.addEventListener("pointerdown", e => {
    const h = e.target.closest(".lk-drag"); if (!h) return;
    const row = h.closest(".ty-row"); e.preventDefault();
    drag = {row, pid:e.pointerId}; row.classList.add("dragging"); list.setPointerCapture(e.pointerId);
  });
  list.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const rows = [...list.children].filter(x => x !== drag.row);
    const after = rows.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    after ? list.insertBefore(drag.row, after) : list.appendChild(drag.row);
    const box = list.closest(".st-pane"); if (box){ const r = box.getBoundingClientRect(); if (e.clientY < r.top + 40) box.scrollTop -= 12; else if (e.clientY > r.bottom - 40) box.scrollTop += 12; }
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.row.classList.remove("dragging"); drag = null;
    const kids = [...list.children], div = kids.findIndex(x => x.hasAttribute("data-tydiv"));
    const order = kids.filter(x => x.dataset.ty).map(x => x.dataset.ty);
    Settings.update(s => { s.types.order = order; s.types.main = div; });
    renderTypeSettings();
  };
  list.addEventListener("pointerup", end); list.addEventListener("pointercancel", end);
})();

/* ---------- Type menu in the item panel: your main types, then "Additional ›" with the rest ---------- */
const tp = {open:false};
/* syncTypeBtn() lives in js/todo.js, next to the item panel that uses it while loading. */
function openTypeMenu(){
  const L = typeOrder(), main = Math.min(typeMainCount(), L.length), cur = $("#d-type").value;
  const item = t => `<button type="button" role="menuitemradio" aria-checked="${t === cur}" data-tpick="${esc(t)}"><span class="tb" style="--tc:${TYPE_VAR(t)}">${typeIcon(t)}${esc(t)}</span>${t === cur ? '<span class="tp-ck">✓</span>' : ""}</button>`;
  const rest = L.slice(main), menu = $("#tp-menu");
  menu.innerHTML = L.slice(0, main).map(item).join("")
    + (rest.length ? `<div class="tp-add" role="none"><button type="button" class="tp-more" aria-haspopup="menu" aria-expanded="false">Additional<span class="tp-n">${rest.length}</span><svg class="tp-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button><div class="tp-sub" role="menu">${rest.map(item).join("")}</div></div>` : "")
    + `<div class="tp-sep"></div><button type="button" data-tpick="__new" class="tp-new">+ New type…</button>`;
  if (rest.includes(cur)) menu.querySelector(".tp-add").classList.add("open");
  menu.hidden = false; tp.open = true;
  const r = $("#d-type-btn").getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = innerHeight;
  menu.style.minWidth = Math.max(200, r.width) + "px";
  menu.style.left = Math.min(r.left, vw - menu.offsetWidth - 12) + "px";
  const below = vh - r.bottom - 12;
  menu.style.top = (below >= Math.min(menu.offsetHeight, 320) ? r.bottom + 6 : Math.max(12, r.top - 6 - menu.offsetHeight)) + "px";
  const on = menu.querySelector('[aria-checked="true"]'); (on && on.offsetParent ? on : menu.querySelector("button")).focus();
  placeSub();
}
function closeTypeMenu(){ $("#tp-menu").hidden = true; tp.open = false; }
$("#d-type-btn").addEventListener("click", e => { e.stopPropagation(); tp.open ? closeTypeMenu() : openTypeMenu(); });
$("#tp-menu").addEventListener("click", e => {
  e.stopPropagation();
  const more = e.target.closest(".tp-more");
  if (more){ const a = more.parentElement; if (e.pointerType === "mouse" || !a.classList.contains("open")) a.classList.add("open"); else a.classList.remove("open"); more.setAttribute("aria-expanded", String(a.classList.contains("open"))); placeSub(); return; }
  const b = e.target.closest("[data-tpick]"); if (!b) return;
  const sel = $("#d-type"), v = b.dataset.tpick;
  if (![...sel.options].some(o => o.value === v)) sel.insertAdjacentHTML("beforeend", `<option>${esc(v)}</option>`);
  closeTypeMenu(); sel.value = v; sel.dispatchEvent(new Event("change", {bubbles:true})); syncTypeBtn(); $("#d-type-btn").focus();
});
/* Hover opens "Additional" on a mouse; a tap toggles it. */
$("#tp-menu").addEventListener("pointerover", e => { if (e.pointerType !== "mouse") return; const a = e.target.closest(".tp-add"); $$("#tp-menu .tp-add").forEach(x => x.classList.toggle("open", x === a || x.contains(e.target))); placeSub(); });
/* Opens "Additional" to the left instead when there's no room on the right. */
function placeSub(){ const s = $("#tp-menu .tp-sub"); if (!s) return; s.classList.remove("left"); if (s.offsetParent && s.getBoundingClientRect().right > document.documentElement.clientWidth - 8) s.classList.add("left"); }
$("#tp-menu").addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !$("#tp-menu .tp-sub [aria-checked=true]")) $$("#tp-menu .tp-add").forEach(x => x.classList.remove("open")); });
$("#tp-menu").addEventListener("keydown", e => {
  if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); closeTypeMenu(); $("#d-type-btn").focus(); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); const bs = [...$("#tp-menu").querySelectorAll("button")].filter(b => b.offsetParent); const i = bs.indexOf(document.activeElement); bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length].focus(); }
  if (e.key === "ArrowRight" && document.activeElement.classList.contains("tp-more")){ const a = document.activeElement.parentElement; a.classList.add("open"); a.querySelector(".tp-sub button").focus(); }
  if (e.key === "ArrowLeft" && document.activeElement.closest(".tp-sub")){ document.activeElement.closest(".tp-add").querySelector(".tp-more").focus(); }
});
document.addEventListener("click", e => { if (tp.open && !e.target.closest("#tp-menu")) closeTypeMenu(); });
$("#dlg-item").addEventListener("cancel", e => { if (tp.open){ e.preventDefault(); closeTypeMenu(); } });
$("#dlg-item").addEventListener("close", closeTypeMenu);
$("#d-type").addEventListener("change", syncTypeBtn);
$("#form-item").appendChild($("#tp-menu"));

/* =====================================================================
   SETTINGS LAYOUT: categories on the left (a list you tap into on a phone).
   ===================================================================== */
const ST_CATS = [
  {k:"sync",   name:"Account & sync",     ids:["st-sync"],   icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'},
  {k:"home",   name:"Home screen",        ids:["st-home"],   icon:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'},
  {k:"links",  name:"Links",              ids:["st-links-sec"], icon:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'},
  {k:"appear", name:"Appearance",         ids:["st-appear","st-ncol","st-ccol"], icon:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'},
  {k:"types",  name:"Types",              ids:["st-types"],  icon:'<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8.5" cy="8.5" r="1.5"/>'},
  {k:"remind", name:"Reminders",          ids:["st-remind"], icon:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>'},
  {k:"facts",  name:"Daily facts",        ids:["st-facts"],  icon:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'},
  {k:"ai",     name:"AI-assisted import", ids:["st-ai"],     icon:'<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'},
];
const stv = {cat:"sync", picked:false};
(() => {
  const b = $("#dlg-settings .dlg-b");
  b.classList.add("st-wrap");
  const nav = document.createElement("nav"); nav.className = "st-nav"; nav.setAttribute("aria-label", "Settings sections");
  nav.innerHTML = ST_CATS.map(c => `<button type="button" data-stcat="${c.k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${c.icon}</svg><span>${c.name}</span><svg class="st-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`).join("");
  const pane = document.createElement("div"); pane.className = "st-pane";
  pane.innerHTML = `<h3 class="st-ptitle" id="st-ptitle"></h3>`;
  [...b.querySelectorAll(":scope > .st-sec")].forEach(s => pane.appendChild(s));
  b.append(nav, pane);
  const h = $("#dlg-settings .dlg-h");
  h.insertAdjacentHTML("afterbegin", `<button type="button" class="btn small ghost st-back" id="st-back" aria-label="All settings">‹</button>`);
})();
function showSettingsCat(k){
  const c = ST_CATS.find(x => x.k === k) || ST_CATS[0]; stv.cat = c.k;
  $$("#dlg-settings .st-nav [data-stcat]").forEach(b => b.setAttribute("aria-current", String(b.dataset.stcat === c.k)));
  $$("#dlg-settings .st-pane > .st-sec").forEach(s => { s.hidden = !c.ids.includes(s.id); s.classList.toggle("solo", c.ids.length === 1); });
  $("#st-ptitle").textContent = c.name;
  $("#dlg-settings .st-pane").scrollTop = 0;
  $("#dlg-settings").classList.add("cat-open");
}
function openSettings(cat){
  renderSettings();
  const phone = innerWidth < 700;
  if (cat || !phone) showSettingsCat(cat || stv.cat); else $("#dlg-settings").classList.remove("cat-open");
  if (!$("#dlg-settings").open) $("#dlg-settings").showModal();
}
$("#dlg-settings .st-nav").addEventListener("click", e => { const b = e.target.closest("[data-stcat]"); if (b) showSettingsCat(b.dataset.stcat); });
$("#st-back").onclick = () => $("#dlg-settings").classList.remove("cat-open");

function renderLinkSettings(){
  const L = linksSorted();
  $("#st-links").innerHTML = L.map((l, i) => `<li class="lk-li" data-lid="${esc(l.id)}"><span class="lk-drag" aria-hidden="true" title="Drag to reorder"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>${iconHTML(l) || '<span class="lk-ic"></span>'}<span class="lk-m"><b>${esc(l.title || linkName(l))}${l.title ? "" : ' <span class="note">(symbol only)</span>'}</b><small>${l.kind === "app" ? "Built in · your workouts sync with Homebase" : l.kind === "html" ? esc(l.fileName || "HTML file") + " · sandboxed" : esc(hostOf(l.url))}${opensTab(l) ? " · new tab" : ""}</small></span>
    <span class="lk-b"><button type="button" class="btn icon sm" data-lmv="${esc(l.id)},-1" aria-label="Move ${esc(linkName(l))} up" ${i ? "" : "disabled"}>↑</button><button type="button" class="btn icon sm" data-lmv="${esc(l.id)},1" aria-label="Move ${esc(linkName(l))} down" ${i < L.length - 1 ? "" : "disabled"}>↓</button><button type="button" class="btn small" data-led="${esc(l.id)}">Edit</button>${l.kind === "app" ? "" : `<button type="button" class="btn small danger" data-ldel="${esc(l.id)}">Delete</button>`}</span></li>`).join("") || `<li class="note">No links yet.</li>`;
}
$("#st-links").addEventListener("click", async e => {
  const mv = e.target.closest("[data-lmv]");
  if (mv){
    const [id, dir] = mv.dataset.lmv.split(","), L = linksSorted(), i = L.findIndex(l => l.id === id), j = i + +dir;
    if (i < 0 || j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]];
    LinkStore.putMany(L.map((l, k) => { const {id:lid, ...d} = l; return [lid, {...d, order:k}]; }));
    return;
  }
  const ed = e.target.closest("[data-led]"); if (ed) return openLinkEditor(ed.dataset.led);
  const del = e.target.closest("[data-ldel]");
  if (del){
    const l = getLink(del.dataset.ldel); if (!l) return;
    if (!(await confirmBox({title:`Delete “${linkName(l)}”?`, body:l.kind === "html" ? "The link, the uploaded file and anything it saved are deleted on all your devices." : "The link is removed from the row on all your devices.", ok:"Delete"}))) return;
    LinkStore.del(l.id); AppData.del(l.id); toast(`Deleted “${trunc(linkName(l), 28)}”`);
  }
});
$("#st-link-add").onclick = () => openLinkEditor(null);
/* Drag a link by its handle to a new spot (mouse or finger). */
(() => {
  const list = $("#st-links"); let drag = null;
  list.addEventListener("pointerdown", e => {
    const h = e.target.closest(".lk-drag"); if (!h) return;
    const li = h.closest("li"); e.preventDefault();
    drag = {li, id:li.dataset.lid, pid:e.pointerId}; li.classList.add("dragging"); list.setPointerCapture(e.pointerId);
  });
  list.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const rows = [...list.querySelectorAll("li[data-lid]")].filter(x => x !== drag.li);
    const after = rows.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    after ? list.insertBefore(drag.li, after) : list.appendChild(drag.li);
    const box = list.closest(".dlg-b"); if (box){ const r = box.getBoundingClientRect(); if (e.clientY < r.top + 40) box.scrollTop -= 12; else if (e.clientY > r.bottom - 40) box.scrollTop += 12; }
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.li.classList.remove("dragging"); drag = null;
    const order = [...list.querySelectorAll("li[data-lid]")].map(x => x.dataset.lid), cur = linksSorted().map(l => l.id);
    if (order.join() === cur.join()) return renderLinkSettings();
    LinkStore.putMany(order.map((id, k) => { const {id:_, ...d} = getLink(id); return [id, {...d, order:k}]; }));
  };
  list.addEventListener("pointerup", end); list.addEventListener("pointercancel", end);
})();

const le = {id:null, kind:"url", icon:"", html:null, fileName:""};
function openLinkEditor(id){
  const l = id ? getLink(id) : null;
  Object.assign(le, {id, kind:l ? l.kind : "url", icon:l ? (l.icon || "") : "", html:null, fileName:l ? (l.fileName || "") : ""});
  $("#le-h").textContent = l ? `Edit “${l.title}”` : "Add a link";
  $("#le-url").value = l && l.url || ""; $("#le-title").value = l ? l.title : ""; $("#le-tab").checked = !!(l && l.newTab);
  $("#le-file").value = ""; $("#le-err").hidden = true;
  $("#le-emoji").value = le.icon.startsWith("e:") && !LEMOJI.includes(le.icon.slice(2)) ? le.icon.slice(2) : "";
  renderLinkEditor(); $("#dlg-le").showModal(); if (!l) $("#le-url").focus();
}
function renderLinkEditor(){
  const k = le.kind, app = k === "app";
  $("#le-kind").hidden = !!le.id;
  $$("#le-kind [data-k]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
  $("#le-url-f").hidden = k !== "url"; $("#le-file-f").hidden = k !== "html"; $("#le-tab-row").hidden = app;
  $("#le-file-n").textContent = k === "html" ? (le.html != null ? `Ready: ${le.fileName} (${Math.round(le.html.length / 1024)} KB)` : le.fileName ? `Current file: ${le.fileName}. Choose another to replace it.` : "Its scripts run in a sandbox with no access to Homebase. What it saves in localStorage is kept and synced.") : "";
  const url = $("#le-url").value.trim();
  $("#le-title").placeholder = k === "url" ? "Optional. Leave blank to show just the symbol" : (le.fileName.replace(/\.html?$/i, "") || "Title");
  $("#le-tab-n").textContent = k === "url" && url && likelyBlocks(/^[a-z]+:/i.test(url) ? url : "https://" + url) ? "This site usually blocks being shown inside other pages, so a new tab works best." : k === "url" && /^http:/i.test(url) ? "Plain http:// pages can't be shown inside an https page, so this opens in a new tab." : "";
  const opt = (v, inner, label) => `<button type="button" class="le-i${v === "" || v === "f:" ? " wide" : ""}" data-icon="${esc(v)}" aria-pressed="${le.icon === v}" title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`;
  $("#le-icons").innerHTML = opt("", '<span class="note">None</span>', "No symbol")
    + (k === "url" ? opt("f:", '<span class="note">Site</span>', "The site's own icon") : "")
    + (le.icon.startsWith("img:") ? opt(le.icon, iconHTML({icon:le.icon}), "Your image") : "")
    + LEMOJI.map(x => opt("e:" + x, x, x)).join("")
    + Object.keys(LICONS).map(x => opt("i:" + x, iconHTML({icon:"i:" + x}), x)).join("");
}
$("#le-kind").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return; le.kind = b.dataset.k; if (le.kind !== "url" && le.icon === "f:") le.icon = ""; renderLinkEditor(); });
$("#le-icons").addEventListener("click", e => { const b = e.target.closest("[data-icon]"); if (!b) return; le.icon = b.dataset.icon; $("#le-emoji").value = ""; renderLinkEditor(); });
/* Your own picture as the symbol: cropped to a square and shrunk to 96 px so it stays small enough to sync. */
$("#le-img").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  if (!/^image\//.test(f.type)){ $("#le-err").textContent = "That isn't an image file."; $("#le-err").hidden = false; return; }
  try {
    const url = URL.createObjectURL(f), img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const N = 96, cv = document.createElement("canvas"); cv.width = cv.height = N;
    const s = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
    cv.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, N, N); URL.revokeObjectURL(url);
    let data = cv.toDataURL("image/webp", .85); if (!/^data:image\/webp/.test(data)) data = cv.toDataURL("image/png");
    le.icon = "img:" + data; $("#le-emoji").value = ""; $("#le-err").hidden = true; renderLinkEditor();
  } catch(_){ $("#le-err").textContent = "Couldn't read that image. Try a PNG or JPG."; $("#le-err").hidden = false; }
});
$("#le-emoji").addEventListener("input", e => { const v = [...e.target.value.trim()].slice(0, 4).join(""); le.icon = v ? "e:" + v : ""; renderLinkEditor(); });
$("#le-url").addEventListener("input", () => {
  const u = $("#le-url").value.trim(), full = /^[a-z]+:/i.test(u) ? u : "https://" + u;
  if (!le.id && (likelyBlocks(full) || /^http:/i.test(u))) $("#le-tab").checked = true;
  renderLinkEditor();
});
$("#le-file").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 1.5 * 1024 * 1024){ $("#le-err").textContent = "That file is over 1.5 MB. Browsers only keep about 5 MB per site, so pick a smaller file."; $("#le-err").hidden = false; e.target.value = ""; return; }
  le.html = await f.text(); le.fileName = f.name; $("#le-err").hidden = true; renderLinkEditor();
});
$("#form-le").addEventListener("submit", e => {
  e.preventDefault();
  const err = t => { $("#le-err").textContent = t; $("#le-err").hidden = false; };
  const cur = le.id ? LinkStore.get(le.id) : null;
  const d = cur ? {...cur} : {kind:le.kind, order:Math.max(-1, ...linksSorted().map(l => l.order ?? 0)) + 1};
  if (le.kind === "url"){
    let u = $("#le-url").value.trim(); if (!u) return err("Enter a web address.");
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
    try { const x = new URL(u); if (!/^https?:$/.test(x.protocol) || !x.hostname.includes(".")) throw 0; } catch(_){ return err("That doesn't look like a web address. Try something like https://example.com"); }
    if (cur && cur.url !== u) delete d.embedOk;
    d.url = u; d.newTab = $("#le-tab").checked;
  } else if (le.kind === "html"){
    if (le.html != null){ d.html = le.html; d.fileName = le.fileName; }
    if (!d.html) return err("Choose an HTML file.");
    d.newTab = $("#le-tab").checked;
  }
  /* A web link with no title shows just its symbol (the site's own icon if you didn't pick one). */
  const typed = $("#le-title").value.trim();
  d.title = typed || (le.kind === "url" ? "" : (le.kind === "html" ? (d.fileName || "").replace(/\.html?$/i, "") : cur && cur.title) || "Link");
  d.icon = le.icon || (le.kind === "url" && !d.title ? "f:" : "");
  LinkStore.put(le.id || uid(), d);
  const nm = linkName(d); $("#dlg-le").close(); toast(cur ? `Saved “${trunc(nm, 28)}”` : `Added “${trunc(nm, 28)}” to your links`);
});
LinkStore.subscribe(() => { renderLinkRow(); if ($("#dlg-settings").open) renderLinkSettings(); });

