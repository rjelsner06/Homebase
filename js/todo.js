/* Homebase: Home to-do tile, To-do page, All items, Recently Deleted, item detail panel.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";
 
/* =====================================================================
   HOME: compact to-do tile
   ===================================================================== */
function renderHomeTodo(){
  const ts = todayS(), lim = addDays(ts, 7);
  $("#home-smart").innerHTML = ["all","today","overdue"].map(k => { const s = SMART.find(x => x.k === k); return `<a href="#todo/${k}" style="--sc:${s.color}">${s.name} <b>${smartCount(k)}</b></a>`; }).join("");
  /* every open to-do, soonest due first; the widget shows as many as fit, then "See all" */
  const all = Store.all().filter(isTodo).filter(r => !r.completed).sort(listSort);   // checked items leave the home list right away
  const shown = all.slice(0, 40), items = all.filter(r => r.date <= lim);
  $("#home-todo").innerHTML = shown.length
    ? shown.map(r => todoRowHTML(r, true)).join("") + `<li class="fit-more" data-always="${all.length > shown.length ? 1 : ""}"><a class="more-link" href="#todo/all">See all<span data-more-n data-extra="${all.length - shown.length}"></span></a></li>`
    : `<li class="empty">Nothing to do. Nice.</li>`;
  const open = items.filter(r => !r.completed && r.date >= ts).length;
  fitSoon();
  $("#duecount").textContent = `${plural(open, "item")} due this week`;
}
 
/* =====================================================================
   TO-DO PAGE (Reminders-style)
   ===================================================================== */
const todoState = {list:"all", cat:"", q:""};
$("#todo-cat").innerHTML += CATEGORIES.map(c => `<option value="${esc(c.name)}">${esc(c.name)} only</option>`).join("");
function renderTodoPage(){
  $("#smart").innerHTML = SMART.map(s => `<a class="sl ${todoState.list===s.k?"on":""}" href="#todo/${s.k}" style="--slc:${s.color}" ${todoState.list===s.k?'aria-current="true"':""}><span class="ic">${IC[s.k]}</span><span class="nm">${s.name}</span><span class="ct">${smartCount(s.k)}</span></a>`).join("");
  const lg = $("#todo-log"); lg.classList.toggle("on", todoState.list === "history");
  lg.innerHTML = `${IC.history}<span>${HISTORY.name}</span><b>${smartCount("history")}</b><small>Checked off more than a day ago</small>`;
  const s = listDef(todoState.list);
  $("#todo-title").textContent = s.name; $("#todo-title").style.color = s.color;
  $("#todo-cat").hidden = !s.catFilter; $("#todo-cat").value = todoState.cat;
  $("#todo-q").hidden = s.k !== "history";
  $("#todo-note").hidden = !s.note; $("#todo-note").textContent = s.note || "";
  const list = smartItems(s.k);
  const open = list.filter(r => !r.completed).length;
  $("#todo-sub").textContent = s.completedList ? plural(list.length, "item") : `${open} open`;
  let html = "", lastKey = null;
  for (const r of list){
    if (s.group || s.completedList){
      const key = s.completedList ? ymd(new Date(r.completedAt)) : r.date;
      if (key !== lastKey){
        const n = daysFromToday(key), long = fmtDate(key, {weekday:"long",month:"short",day:"numeric"});
        const lbl = n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : long;
        html += `<li class="grp">${s.completedList ? "Checked off " + (n === 0 || n === -1 ? lbl.toLowerCase() : long) : lbl}</li>`;
        lastKey = key;
      }
    }
    html += todoRowHTML(r, false);
  }
  $("#todo-list").innerHTML = html || `<li class="empty">${s.k === "history" && todoState.q ? "Nothing in the history matches." : s.empty}</li>`;
}
$("#todo-q").addEventListener("input", e => { todoState.q = e.target.value.trim(); renderTodoPage(); });
$("#todo-cat").addEventListener("change", e => { todoState.cat = e.target.value; renderTodoPage(); $("#todo-scroll").scrollTop = 0; });
$("#todo-add").onclick = () => openDetail(null, {date: todayS(), category: todoState.cat || "Personal"});
/* Only the list scrolls on wide screens: size the page to the window below the header. */
function fitTodo(){ const el = page === "notes" ? $("#pg-notes .notes") : $("#pg-todo .todo-page"); if (!el || el.closest("[data-pagebox]").hidden) return; document.documentElement.style.setProperty("--todo-top", Math.max(0, el.getBoundingClientRect().top + window.scrollY) + "px"); }
window.addEventListener("resize", fitTodo);
 
/* =====================================================================
   ALL ITEMS PAGE (filters, search, selection, bulk)
   ===================================================================== */
const itemsState = {q:"", cat:"", course:"", type:"", from:"", to:"", status:""};
const itSel = new RowSelection(); let itOrder = [];
$("#it-cat").innerHTML = `<option value="">All categories</option>` + CATEGORIES.map(c => `<option>${esc(c.name)}</option>`).join("");
const fillItType = () => { const v = $("#it-type").value; $("#it-type").innerHTML = `<option value="">All types</option>` + typeOrder().map(t => `<option>${esc(t)}</option>`).join(""); $("#it-type").value = typeOrder().includes(v) ? v : ""; };
fillItType();
const itBulk = makeBulk($("#it-bulk"), {apply(k, v){
  const ids = [...itSel.ids]; if (!ids.length) return;
  if (k === "delete"){ itSel.clear(); softDelete(ids); return; }
  const before = ids.map(id => JSON.parse(JSON.stringify(Store.get(id))));
  Store.updateMany(ids, r => bulkPatch(r, k, v));
  toast(`Updated ${plural(ids.length, "item")}`, () => Store.put(before));
}});
itBulk.onClear(() => { itSel.clear(); syncItemsSel(); });
function filteredItems(){
  const f = itemsState, q = f.q.toLowerCase();
  return Store.all().filter(r =>
    (!f.cat || r.category === f.cat) && (!f.course || r.course === f.course) && (!f.type || r.type === f.type) &&
    (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) &&
    (!f.status || (f.status === "done") === r.completed) &&
    (!q || [r.title, r.course, r.notes, r.type, r.category, r.location, r.reading, ...r.subtasks.map(s => s.text)].join(" ").toLowerCase().includes(q))
  ).sort(listSort);
}
function itemRowHTML(r){
  const [l, c] = relLabel(daysFromToday(r.date)), on = itSel.ids.has(r.id);
  const when = r.time ? " · " + (isScheduled(r) ? timeRange(r) : "due " + fmtTime(r.time)) : "";
  return `<li class="it-row ${r.completed?"done":""} ${on?"sel":""} ${priClass(r)}" style="--cc:${itemColor(r)}" data-open="${r.id}" tabindex="0">
    <input type="checkbox" data-sel="${r.id}" ${on?"checked":""} aria-label="Select ${esc(r.title)}">
    <span class="bar ${isOutline(r)?"outline":""}"></span>
    <div><div class="ttl">${esc(r.title)}</div>
      <div class="sub">${typeBadge(r.type)}<span>${esc(catLabel(r))}</span><span>${fmtDate(r.date)}${when}</span>${r.location?`<span>${esc(r.location)}</span>`:""}${r.reading?`<span>${esc(r.reading)}</span>`:""}${r.seriesId?'<span title="Repeats weekly">↻ weekly</span>':""}${r.subtasks.length?`<span>${stProg(r)}</span>`:""}${r.notes.trim()?"<span>has notes</span>":""}${r.sample?"<span>sample</span>":""}</div></div>
    <div class="it-r">${priBadge(r)}${r.flagged?FLAG:""}<span class="pill ${r.completed?"donep":(isTodo(r)?c:"")}">${r.completed?"Done":(isTodo(r)?l:fmtDate(r.date,{month:"short",day:"numeric"}))}</span></div>
  </li>`;
}
function renderItems(){
  fillItType();
  const cs = $("#it-course"), courses = allCourses();
  cs.innerHTML = `<option value="">All courses</option>` + courses.map(c => `<option>${esc(c)}</option>`).join("");
  if (!courses.includes(itemsState.course)) itemsState.course = "";
  cs.value = itemsState.course;
  const list = filteredItems(); itOrder = list.map(r => r.id); itSel.prune(itOrder);
  $("#it-list").innerHTML = list.length ? list.map(itemRowHTML).join("") : `<li class="empty" style="padding:14px 10px">No items match these filters.</li>`;
  $("#it-count").textContent = `${list.length} of ${plural(Store.all().length, "item")}`;
  syncItemsSel();
}
function syncItemsSel(){
  $$("#it-list [data-sel]").forEach(c => { const on = itSel.ids.has(c.dataset.sel); c.checked = on; c.closest("li").classList.toggle("sel", on); });
  setAllBox($("#it-all"), itSel.state(itOrder));
  const n = itSel.ids.size; itBulk.show(n);
  $("#it-selnote").textContent = n ? `${n} selected` : "Select all shown";
}
/* The checkbox, and anywhere on the row to the left of the color bar, selects instead of opening the item. */
$("#it-list").addEventListener("click", e => {
  const row = e.target.closest(".it-row"); if (!row) return;
  const c = e.target.closest("[data-sel]"), bar = row.querySelector(".bar");
  const left = c || (bar && e.clientX <= bar.getBoundingClientRect().right + 4);
  if (!left) return;
  e.stopPropagation(); if (!c) e.preventDefault();
  const id = c ? c.dataset.sel : row.querySelector("[data-sel]").dataset.sel;
  itSel.click(id, e.shiftKey, itOrder); syncItemsSel();
});
$("#it-all").addEventListener("change", e => { itSel.setAll(itOrder, e.target.checked); syncItemsSel(); });
[["#it-q","q"],["#it-cat","cat"],["#it-course","course"],["#it-type","type"],["#it-from","from"],["#it-to","to"],["#it-status","status"]].forEach(([s,k]) =>
  $(s).addEventListener(s === "#it-q" ? "input" : "change", e => { itemsState[k] = e.target.value; renderItems(); }));
$("#it-reset").onclick = () => { Object.keys(itemsState).forEach(k => itemsState[k] = ""); ["#it-q","#it-cat","#it-type","#it-from","#it-to","#it-status"].forEach(s => $(s).value = ""); renderItems(); };
 
/* =====================================================================
   RECENTLY DELETED: calendar items, notes and note folders, with
   multi-select, select all, and select-all-of-a-type.
   ===================================================================== */
const delSel = new RowSelection(); let delOrder = []; const delState = {type:""};
function delEntries(){
  const items = Store.deleted().map(r => ({key:"i:" + r.id, kind:"item", id:r.id, title:r.title, type:r.type, color:itemColor(r),
    sub:`${catLabel(r)} · ${r.type} · ${fmtDate(r.date)}`, deletedAt:r.deletedAt}));
  const notes = Notes.deletedEntries().map(e => ({key:(e.kind === "folder" ? "f:" : "n:") + e.id, kind:e.kind, id:e.id, title:e.title,
    type:e.kind === "folder" ? "Notes folder" : e.fileExt ? "File in Notes" : "Note", color:"var(--h-notes)",
    sub:e.kind === "folder" ? `Notes folder · ${plural(e.count, "note")} inside` : `${e.fileExt ? e.fileExt.toUpperCase() + " file" : "Note"}${e.folder ? " · " + e.folder : ""}`, deletedAt:e.deletedAt}));
  return [...items, ...notes].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
const delTotal = () => Store.deleted().length + Notes.deletedEntries().length;
function updateDelCount(){ const n = delTotal(); $("#nav-del").textContent = n || ""; $("#nav-del").hidden = !n; }
function restoreKeys(keys){ for (const k of keys){ const [t, id] = [k[0], k.slice(2)]; if (t === "i") Store.restore([id]); else Notes.restore(t === "f" ? "folder" : "note", id); } }
function purgeKeys(keys){ const items = keys.filter(k => k[0] === "i").map(k => k.slice(2)); if (items.length) Store.purge(items); keys.filter(k => k[0] !== "i").forEach(k => Notes.purge(k[0] === "f" ? "folder" : "note", k.slice(2))); }
function renderDeleted(){
  const all = delEntries(), counts = {};
  all.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
  if (delState.type && !counts[delState.type]) delState.type = "";
  $("#del-type").innerHTML = `<option value="">All types (${all.length})</option>` + Object.keys(counts).sort().map(t => `<option value="${esc(t)}">${esc(t)} (${counts[t]})</option>`).join("");
  $("#del-type").value = delState.type;
  const list = delState.type ? all.filter(e => e.type === delState.type) : all;
  delOrder = list.map(e => e.key); delSel.prune(all.map(e => e.key));
  $("#del-restore-all").disabled = $("#del-empty").disabled = !all.length;
  $("#del-tools").hidden = !all.length;
  $("#del-list").innerHTML = list.length ? list.map(e => {
    const ago = Math.floor((Date.now() - new Date(e.deletedAt)) / MS_DAY), left = Math.max(0, PURGE_DAYS - ago), on = delSel.ids.has(e.key);
    return `<li class="dl-row ${on ? "sel" : ""}" style="--cc:${e.color}" data-dkey="${e.key}">
      <input type="checkbox" data-dsel="${e.key}" ${on ? "checked" : ""} aria-label="Select ${esc(e.title)}"><span class="bar"></span>
      <div><div class="ttl">${esc(e.title)}</div><div class="sub">${esc(e.sub)} · Deleted ${ago === 0 ? "today" : ago === 1 ? "yesterday" : ago + " days ago"} · ${left ? `removed in ${plural(left, "day")}` : "removed within a day"}</div></div>
      <div class="dl-act"><button class="btn small" type="button" data-restore="${e.key}">Restore</button><button class="btn small danger" type="button" data-purge="${e.key}">Delete now</button></div></li>`;
  }).join("") : `<li class="empty" style="padding:14px 10px">Nothing here. Deleted items, notes and folders show up here for 30 days.</li>`;
  syncDelSel();
}
function syncDelSel(){
  $$("#del-list [data-dsel]").forEach(c => { const on = delSel.ids.has(c.dataset.dsel); c.checked = on; c.closest("li").classList.toggle("sel", on); });
  setAllBox($("#del-all"), delSel.state(delOrder));
  const n = delSel.ids.size, shown = delOrder.length;
  $("#del-all-l").textContent = delState.type ? `Select all ${shown} ${delState.type === "No Class" ? "no-class days" : delState.type.toLowerCase() + (shown === 1 || /s$/i.test(delState.type) ? "" : "s")}` : `Select everything (${shown})`;
  $("#del-bulk").hidden = !n;
  $("#del-bn").textContent = `${n} selected`;
}
$("#del-type").addEventListener("change", e => { delState.type = e.target.value; renderDeleted(); });
$("#del-all").addEventListener("change", e => { delSel.setAll(delOrder, e.target.checked); syncDelSel(); });
$("#del-clear").onclick = () => { delSel.clear(); syncDelSel(); };
$("#del-bulk-restore").onclick = () => { const keys = [...delSel.ids]; delSel.clear(); restoreKeys(keys); toast(`Restored ${plural(keys.length, "item")}`); renderAll(); };
$("#del-bulk-purge").onclick = async () => {
  const keys = [...delSel.ids]; if (!keys.length) return;
  if (await confirmBox({title:`Delete ${plural(keys.length, "item")} permanently?`, body:"The selected items will be gone for good. This can't be undone.", ok:"Delete permanently"})){ delSel.clear(); purgeKeys(keys); renderAll(); }
};
$("#del-list").addEventListener("click", async e => {
  const c = e.target.closest("[data-dsel]"); if (c){ delSel.click(c.dataset.dsel, e.shiftKey, delOrder); syncDelSel(); return; }
  const rs = e.target.closest("[data-restore]");
  if (rs){ const k = rs.dataset.restore, ent = delEntries().find(x => x.key === k); restoreKeys([k]); toast(`Restored "${trunc(ent ? ent.title : "item", 32)}"`); renderAll(); return; }
  const pg = e.target.closest("[data-purge]");
  if (pg){ const k = pg.dataset.purge, ent = delEntries().find(x => x.key === k);
    if (await confirmBox({title:"Delete permanently?", body:`"${ent ? ent.title : "This item"}" will be gone for good. This can't be undone.`, ok:"Delete permanently"})){ purgeKeys([k]); renderAll(); } return; }
  const row = e.target.closest("[data-dkey]");
  if (row && !e.target.closest("button")){ delSel.click(row.dataset.dkey, e.shiftKey, delOrder); syncDelSel(); }
});
$("#del-restore-all").onclick = () => { const keys = delEntries().map(e => e.key); if (!keys.length) return; restoreKeys(keys); delSel.clear(); toast(`Restored ${plural(keys.length, "item")}`); renderAll(); };
$("#del-empty").onclick = async () => {
  const keys = delEntries().map(e => e.key); if (!keys.length) return;
  if (await confirmBox({title:`Delete ${plural(keys.length, "item")} permanently?`, body:"Everything in Recently Deleted will be gone for good. This can't be undone.", ok:"Delete all"})){ delSel.clear(); purgeKeys(keys); renderAll(); }
};
 
/* =====================================================================
   ITEM DETAIL PANEL (view / edit / create)
   ===================================================================== */
const detail = {id:null, draft:null, applyAll:false};
const rep = {on:false, days:new Set(), until:""};
const defaultUntil = s => { const e = ymd(SEM_END); return s < e ? e : addDays(s, 70); };
$("#d-cat").innerHTML = CATEGORIES.map(c => `<option>${esc(c.name)}</option>`).join("");
/* The type button in the item panel (its menu is in js/settings.js). */
function syncTypeBtn(){
  const t = $("#d-type").value;
  $("#d-type-btn").innerHTML = `<span class="tb" style="--tc:${TYPE_VAR(t)}">${typeIcon(t)}${esc(t)}</span><svg class="tp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
}
const fillTypeSelect = sel => { $("#d-type").innerHTML = typeOptions(sel) + `<option value="__new">+ New type…</option>`; $("#d-type").value = sel; if (typeof syncTypeBtn === "function") syncTypeBtn(); };
fillTypeSelect("Homework");
$("#d-pri").innerHTML = PRIORITIES.map(p => `<option>${p}</option>`).join("");
const cur = () => detail.draft || Store.get(detail.id);
function commit(patch){
  if (detail.draft){ Object.assign(detail.draft, patch); return; }
  if (!detail.id) return;
  const r = Store.get(detail.id);
  if (detail.applyAll && r && r.seriesId){
    const shared = {}, own = {};
    for (const k in patch) (SERIES_FIELDS.includes(k) ? shared : own)[k] = patch[k];
    if (Object.keys(shared).length) Store.updateMany(seriesItems(r.seriesId).map(x => x.id), () => shared);
    if (Object.keys(own).length) Store.update(detail.id, own);
  } else Store.update(detail.id, patch);
}
 
function openDetail(id, preset = {}){
  if (id){ const r = Store.get(id); if (!r || r.deletedAt) return; detail.id = id; detail.draft = null; }
  else {
    const category = preset.category || "School";
    detail.id = null;
    detail.draft = {title:"", category, course:preset.course || "", type:preset.type || (catDef(category).hasCourse ? "Homework" : "Task"), date:preset.date || todayS(), time:"", endTime:"", location:"", reading:"", lectureNumber:null, priority:"None", flagged:false, notes:"", subtasks:[], completed:false};
  }
  detail.applyAll = false;
  const base = cur(); rep.on = false; rep.days = new Set([parseYmd(base.date).getDay()]); rep.until = defaultUntil(base.date);
  fillDetail();
  const d = $("#dlg-item"); if (!d.open) d.showModal();
  if (!id) $("#d-title").focus(); else $("#d-title").blur();
}
function fillDetail(){
  const r = cur(); if (!r) return;
  $("#d-head-t").textContent = detail.draft ? "New item" : (r.completed ? "Completed item" : "Item");
  $("#d-title").value = r.title; $("#d-cat").value = r.category; $("#d-course").value = r.course;
  fillTypeSelect(r.type); $("#d-type").value = r.type; $("#d-pri").value = r.priority; $("#d-date").value = r.date; $("#d-time").value = r.time;
  $("#d-flag").checked = r.flagged; $("#d-notes").value = r.notes;
  $("#d-loc").value = r.location || ""; $("#d-read").value = r.reading || ""; $("#d-lec").value = r.lectureNumber ?? "";
  syncDetailDynamic();
}
function syncDetailDynamic(){
  const r = cur(); if (!r) return;
  const dot = $("#d-dot"); dot.style.setProperty("--cc", itemColor(r)); dot.classList.toggle("outline", isOutline(r));
  $("#d-course-f").hidden = !catDef(r.category).hasCourse;
  const sched = isSchedType(r.type);
  $("#d-todo").checked = isTodo(r); $("#d-todo-l").hidden = isNoClass(r);
  $("#d-nc-note").hidden = !isNoClass(r);
  $("#d-time-l").textContent = sched ? "Starts" : "Due time";
  $("#d-end-f").hidden = !sched; $("#d-end").value = r.endTime || "";
  $("#d-lec-f").hidden = r.type !== "Lecture" && r.lectureNumber == null;
  renderSubtasks(); renderRepeat(); renderItemReminders();
  $("#d-meta").textContent = detail.draft ? "" : [r.completed ? `Completed ${fmtDT(r.completedAt)}` : "", `Created ${fmtDT(r.createdAt)}`, r.sample ? "Sample item" : ""].filter(Boolean).join(" · ");
  const series = !detail.draft && r.seriesId;
  $("#d-foot").innerHTML = detail.draft
    ? `<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" id="d-create">Add</button>`
    : `<button class="btn danger" type="button" id="d-del">Delete</button>${series ? `<button class="btn danger" type="button" id="d-del-series">Delete series</button>` : ""}<span class="sp"></span><button class="btn" type="button" id="d-comp">${r.completed ? "Mark incomplete" : "✓ Mark complete"}</button><button class="btn primary" type="button" data-close>Done</button>`;
}
function renderRepeat(){
  const r = cur(); if (!r) return;
  const series = !detail.draft && r.seriesId ? seriesItems(r.seriesId) : null;
  $("#d-rep-series").hidden = !series; $("#d-rep-new").hidden = !!series;
  if (series){
    const idx = series.findIndex(x => x.id === r.id) + 1, days = ((r.repeat && r.repeat.days) || []).map(d => DOW[d]).join(", ");
    $("#d-rep-info").textContent = `Repeats weekly${days ? " on " + days : ""}${r.repeat && r.repeat.until ? " until " + fmtDate(r.repeat.until, {month:"short", day:"numeric"}) : ""} · session ${idx} of ${series.length}`;
    $("#d-rep-all").checked = detail.applyAll;
    return;
  }
  $("#d-rep-on").checked = rep.on; $("#d-rep-opts").hidden = !rep.on;
  $("#d-rep-days").innerHTML = DOW.map((d, i) => `<button type="button" data-wd="${i}" aria-pressed="${rep.days.has(i)}" aria-label="${d}">${d.slice(0,2)}</button>`).join("");
  $("#d-rep-until").value = rep.until;
  const n = rep.on ? seriesDates(r.date, [...rep.days], rep.until).length : 0;
  $("#d-rep-count").textContent = rep.on ? (detail.draft ? `Creates ${plural(n, "session")}.` : `Adds ${plural(Math.max(0, n - 1), "more session")} after this one.`) : "";
  $("#d-rep-make").parentElement.hidden = !!detail.draft || !rep.on;
}
function renderSubtasks(){
  const r = cur(), st = r.subtasks;
  $("#d-st-count").textContent = st.length ? `(${st.filter(s=>s.done).length}/${st.length})` : "";
  $("#d-st").innerHTML = st.map(s => `<li class="${s.done?"done":""}"><input type="checkbox" data-st-done="${s.id}" ${s.done?"checked":""} aria-label="Subtask done"><input type="text" data-st-text="${s.id}" value="${esc(s.text)}" aria-label="Subtask"><button class="x" type="button" data-st-del="${s.id}" aria-label="Remove subtask">×</button></li>`).join("");
}
function readDetailForm(){
  return {title:$("#d-title").value.trim(), category:$("#d-cat").value, course:$("#d-course").value.trim(), type:$("#d-type").value,
    priority:$("#d-pri").value, date:$("#d-date").value, time:$("#d-time").value, endTime:$("#d-end").value, flagged:$("#d-flag").checked, notes:$("#d-notes").value,
    location:$("#d-loc").value.trim(), reading:$("#d-read").value.trim(), lectureNumber:$("#d-lec").value ? +$("#d-lec").value : null};
}
function createFromDraft(){
  const f = readDetailForm();
  if (!f.title){ $("#d-title").focus(); $("#d-title").placeholder = "Give it a title first"; return; }
  if (!f.date){ $("#d-date").focus(); return; }
  const base = {...detail.draft, ...f};
  const made = rep.on ? createSeries(base, [...rep.days], rep.until) : [Store.create(base)];
  const r = made[0];
  detail.draft = null; $("#dlg-item").close();
  if (page === "home"){ const d = parseYmd(r.date); if (cal.view === "month"){ cal.cursor = new Date(d.getFullYear(), d.getMonth(), 1); cal.selected = r.date; } else cal.cursor = d; renderCal(); }
  toast(made.length > 1 ? `Added "${trunc(r.title, 28)}" × ${made.length} sessions` : `Added "${trunc(r.title, 32)}"`, made.length > 1 ? () => Store.purge(made.map(x => x.id)) : null);
}
$("#form-item").addEventListener("submit", e => { e.preventDefault(); if (detail.draft) createFromDraft(); });
$("#form-item").addEventListener("change", e => {
  const t = e.target, r = cur(); if (!r) return;
  if (t.dataset.stDone){ commit({subtasks: r.subtasks.map(s => s.id === t.dataset.stDone ? {...s, done:t.checked} : s)}); renderSubtasks(); return; }
  if (t.dataset.stText){ commit({subtasks: r.subtasks.map(s => s.id === t.dataset.stText ? {...s, text:t.value} : s)}); return; }
  switch (t.id){
    case "d-title": { const v = t.value.trim(); if (!v && !detail.draft){ t.value = r.title; return; } commit({title:v}); break; }
    case "d-cat": commit({category:t.value, course: catDef(t.value).hasCourse ? $("#d-course").value.trim() : ""}); syncDetailDynamic(); break;
    case "d-course": commit({course:t.value.trim()}); syncDetailDynamic(); break;
    case "d-type":
      if (t.value === "__new"){ t.value = r.type; openTypeDialog(name => { commit({type:name}); fillTypeSelect(name); syncDetailDynamic(); }); break; }
      commit({type:t.value}); syncDetailDynamic(); break;
    case "d-todo": commit({todo: t.checked === typeTodo(r.type) ? null : t.checked}); break;
    case "d-pri": commit({priority:t.value}); break;
    case "d-date": if (!t.value){ t.value = r.date; return; } commit({date:t.value}); renderRepeat(); break;
    case "d-time": commit({time:t.value}); syncDetailDynamic(); break;
    case "d-end": commit({endTime:t.value}); syncDetailDynamic(); break;
    case "d-flag": commit({flagged:t.checked}); break;
    case "d-notes": commit({notes:t.value}); break;
    case "d-loc": commit({location:t.value.trim()}); break;
    case "d-read": commit({reading:t.value.trim()}); break;
    case "d-lec": commit({lectureNumber:t.value ? +t.value : null}); break;
  }
});
$("#d-st-new").addEventListener("keydown", e => {
  if (e.key !== "Enter") return; e.preventDefault();
  const text = e.target.value.trim(); if (!text) return;
  commit({subtasks: [...cur().subtasks, {id:uid(), text, done:false}]}); e.target.value = ""; renderSubtasks();
});
$("#d-st").addEventListener("click", e => { const b = e.target.closest("[data-st-del]"); if (!b) return; commit({subtasks: cur().subtasks.filter(s => s.id !== b.dataset.stDel)}); renderSubtasks(); });
$("#d-foot").addEventListener("click", e => {
  if (e.target.closest("#d-create")) return createFromDraft();
  if (e.target.closest("#d-comp")){ const r = cur(); Store.update(r.id, {completed: !r.completed}); syncDetailDynamic(); $("#d-head-t").textContent = cur().completed ? "Completed item" : "Item"; return; }
  if (e.target.closest("#d-del-series")){ const ids = seriesItems(cur().seriesId).map(x => x.id); $("#dlg-item").close(); softDelete(ids); return; }
  if (e.target.closest("#d-del")){ const id = detail.id; $("#dlg-item").close(); softDelete([id]); }
});
$("#d-rep-on").addEventListener("change", e => { rep.on = e.target.checked; if (rep.on && !rep.days.size) rep.days.add(parseYmd(cur().date).getDay()); renderRepeat(); });
$("#d-rep-days").addEventListener("click", e => { const b = e.target.closest("[data-wd]"); if (!b) return; const d = +b.dataset.wd; rep.days.has(d) ? rep.days.delete(d) : rep.days.add(d); renderRepeat(); });
$("#d-rep-until").addEventListener("change", e => { rep.until = e.target.value; renderRepeat(); });
$("#d-rep-all").addEventListener("change", e => { detail.applyAll = e.target.checked; });
$("#d-rep-make").addEventListener("click", () => {
  const r = cur(); if (!r || detail.draft) return;
  const dates = seriesDates(r.date, [...rep.days], rep.until).filter(d => d !== r.date);
  if (!dates.length){ $("#d-rep-until").focus(); return; }
  const seriesId = uid(), repeat = {days:[...rep.days].sort(), until:rep.until};
  Store.update(r.id, {seriesId, repeat});
  const {id, createdAt, updatedAt, ...rest} = Store.get(r.id);
  const made = Store.createMany(dates.map(date => ({...rest, date, completed:false, subtasks:rest.subtasks.map(x => ({...x, id:uid(), done:false}))})));
  rep.on = false; syncDetailDynamic();
  toast(`Added ${plural(made.length, "more session")}`, () => { Store.purge(made.map(x => x.id)); Store.update(id, {seriesId:null, repeat:null}); });
});
$("#dlg-item").addEventListener("close", () => {
  if (!detail.draft && detail.id){         // save anything typed but not yet committed
    const r = Store.get(detail.id);
    if (r && !r.deletedAt){
      const t = $("#d-title").value.trim(), n = $("#d-notes").value, p = {};
      if (t && t !== r.title) p.title = t; if (n !== r.notes) p.notes = n;
      if (Object.keys(p).length) commit(p);
    }
  }
  detail.id = null; detail.draft = null; detail.applyAll = false;
});