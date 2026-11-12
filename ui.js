/* Homebase: Shared UI pieces (selection, bulk actions, toast, confirm), clock, weather, mail.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   SMALL SHARED UI PIECES
   ===================================================================== */
const priMark = r => PRI_RANK[r.priority] ? `<span class="pri" title="${r.priority} priority" aria-label="${r.priority} priority">${"!".repeat(PRI_RANK[r.priority])}</span>` : "";
const stProg = r => `${r.subtasks.filter(s=>s.done).length}/${r.subtasks.length} subtasks`;

/* Calendar-only items (lectures, events…) look checked off once they're over, and classes cancelled by a
   No Class item look crossed out. Neither changes the item itself. */
let calOff = new Set();
function itemEnded(r){ const end = r.endTime || r.time; return end ? new Date(`${r.date}T${end}:00`).getTime() < Date.now() : r.date < todayS(); }
const doneLook = r => r.completed || calOff.has(r.id) || (!isTodo(r) && !isNoClass(r) && itemEnded(r));
const CLASS_TYPES = new Set(["Lecture","Recitation","Lab","Review"]);
const isClassType = t => CLASS_TYPES.has(t) || (!!customType(t) && isSchedType(t));
/* No Class with no course = the whole day (breaks); with a course = only that course's classes. */
function ncInfo(list){ const nc = (list || []).filter(isNoClass); return {all:nc.some(r => !r.course), courses:new Set(nc.filter(r => r.course).map(r => r.course))}; }
function markCancelled(map){
  calOff = new Set();
  for (const list of Object.values(map)){
    const info = ncInfo(list); if (!info.all && !info.courses.size) continue;
    for (const r of list) if (!isNoClass(r) && isClassType(r.type) && (info.all ? catDef(r.category).hasCourse : info.courses.has(r.course))) calOff.add(r.id);
  }
}
function chipHTML(r, {time=false, tall=false} = {}){
  if (isNoClass(r)) return `<button type="button" class="ncband ${r.course ? "crs" : ""}" ${r.course ? `style="--cc:${itemColor(r)}"` : ""} data-open="${r.id}" title="${esc(r.title)}${r.course ? " · " + esc(r.course) + " only" : " · whole day"}">${esc(r.title)}${r.course ? ` · ${esc(r.course)}` : ""}</button>`;
  const cls = ["chip", isOutline(r)?"outline":"", doneLook(r)?"done":"", calOff.has(r.id)?"off":"", tall?"tall":""].join(" ");
  const ck = r.completed ? `<span class="ck" aria-hidden="true">✓</span>` : "";
  const pd = !r.completed && PRI_RANK[r.priority] >= 2 ? `<span class="pd" style="--pc:${r.priority === "High" ? "var(--bad)" : "var(--warn)"}" aria-label="${r.priority} priority"></span>` : "";
  const tm = time && r.time ? `<span class="tm">${tall && r.endTime ? fmtTime(r.time) + "–" + fmtTime(r.endTime) : (isScheduled(r) ? "" : "due ") + fmtTime(r.time)}</span>` : "";
  return `<button type="button" class="${cls}" style="--cc:${itemColor(r)}" data-open="${r.id}" title="${esc(r.title)} · ${r.type}${r.time ? " · " + timeRange(r) : ""}${r.location ? " · " + esc(r.location) : ""}${r.priority !== "None" ? " · " + r.priority + " priority" : ""}${r.completed ? " (completed)" : calOff.has(r.id) ? " (no class)" : ""}">${tm}<span class="t">${ck}${pd}${typeDot(r.type)}${r.completed ? '<span class="sr">Completed: </span>' : ""}${esc(r.title)}</span></button>`;
}

function todoRowHTML(r, compact){
  const [l, c] = relLabel(daysFromToday(r.date));
  const firstNote = r.notes.split("\n").find(x => x.trim()) || "";
  const when = r.time ? (isScheduled(r) ? " · " + timeRange(r) : " · due " + fmtTime(r.time)) : "";
  return `<li class="tr ${r.completed?"done":""} ${priClass(r)}" style="--cc:${itemColor(r)}" data-open="${r.id}" tabindex="0">
    <input type="checkbox" class="ckb" data-toggle="${r.id}" ${r.completed?"checked":""} aria-label="Mark ${esc(r.title)} ${r.completed?"not done":"done"}">
    <div><div class="tt">${esc(r.title)}</div>
      <div class="meta">${priBadge(r)}${typeBadge(r.type)}<span class="ct">${esc(catLabel(r))}</span><span>${fmtDate(r.date)}${when}</span>${r.location?`<span>${esc(r.location)}</span>`:""}${r.subtasks.length?`<span>☑ ${stProg(r)}</span>`:""}${r.seriesId?'<span title="Repeats weekly">↻ weekly</span>':""}</div>
      ${!compact && firstNote ? `<div class="np">${esc(firstNote)}</div>` : ""}
    </div>
    <div class="tr-r">${r.flagged?FLAG:""}<span class="pill ${r.completed?"donep":c}">${r.completed?"Done":l}</span></div>
  </li>`;
}

function setAllBox(el, state){ el.checked = state === "all"; el.indeterminate = state === "some"; }

/* Gmail-style selection: click toggles, shift-click applies the new state to the whole range. */
class RowSelection {
  constructor(){ this.ids = new Set(); this.anchor = null; }
  click(id, shift, order){
    const on = !this.ids.has(id);
    if (shift && this.anchor != null && order.includes(this.anchor) && this.anchor !== id){
      let a = order.indexOf(this.anchor), b = order.indexOf(id); if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) on ? this.ids.add(order[i]) : this.ids.delete(order[i]);
    } else on ? this.ids.add(id) : this.ids.delete(id);
    this.anchor = id;
  }
  setAll(order, on){ order.forEach(id => on ? this.ids.add(id) : this.ids.delete(id)); }
  prune(order){ const s = new Set(order); for (const id of [...this.ids]) if (!s.has(id)) this.ids.delete(id); }
  clear(){ this.ids.clear(); this.anchor = null; }
  state(order){ const n = order.filter(id => this.ids.has(id)).length; return n === 0 ? "none" : n === order.length ? "all" : "some"; }
}

/* ---------- bulk actions (shared by All items and import review) ---------- */
const BULK = [
  {k:"type",       label:"Set type",           input:"select", options:() => typeOrder()},
  {k:"category",   label:"Set category",       input:"select", options:() => CATEGORIES.map(c => c.name)},
  {k:"course",     label:"Set course",         input:"course"},
  {k:"priority",   label:"Set priority",       input:"select", options:() => PRIORITIES},
  {k:"flag",       label:"Flag"},
  {k:"unflag",     label:"Remove flag"},
  {k:"time",       label:"Set start / due time", input:"time"},
  {k:"endTime",    label:"Set end time",       input:"time"},
  {k:"location",   label:"Set location",       input:"text", ph:"Room, e.g. BHEE 129"},
  {k:"note",       label:"Add a note",         input:"text"},
  {k:"shift",      label:"Shift dates",        input:"number"},
  {k:"complete",   label:"Mark complete"},
  {k:"incomplete", label:"Mark incomplete"},
];
function bulkPatch(r, k, v){
  switch(k){
    case "type": return {type:v};
    case "category": return {category:v, course: catDef(v).hasCourse ? r.course : ""};
    case "course": return v && !catDef(r.category).hasCourse ? {course:v, category:(CATEGORIES.find(c=>c.hasCourse)||{}).name || r.category} : {course:v};
    case "priority": return {priority:v};
    case "flag": return {flagged:true};
    case "unflag": return {flagged:false};
    case "time": return {time:v || ""};
    case "endTime": return {endTime:v || ""};
    case "location": return {location:v};
    case "note": return {notes: r.notes && r.notes.trim() ? r.notes.replace(/\s+$/,"") + "\n" + v : v};
    case "shift": return {date: addDays(r.date, v)};
    case "complete": return {completed:true};
    case "incomplete": return {completed:false};
  }
  return {};
}
function bulkValueHTML(k){
  const a = BULK.find(x => x.k === k); if (!a || !a.input) return "";
  if (a.input === "select") return `<select data-bv aria-label="${a.label}">${a.options().map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
  if (a.input === "course") return `<input data-bv list="courses" placeholder="ECE 30100" aria-label="Course">`;
  if (a.input === "text") return `<input data-bv placeholder="${esc(a.ph || "Note to add")}" aria-label="${esc(a.label)}" style="width:220px">`;
  if (a.input === "time") return `<input data-bv type="time" aria-label="Time"><span class="note">Leave empty to clear</span>`;
  if (a.input === "number") return `<input data-bv type="number" value="7" step="1" style="width:76px" aria-label="Days"><span class="note">days (negative = earlier)</span>`;
  return "";
}
function makeBulk(container, {deleteLabel = "Delete", apply}){
  container.innerHTML = `<div class="bulk" hidden>
    <strong class="bn" data-bn></strong>
    <select data-bact aria-label="Bulk action"><option value="">Change…</option>${BULK.map(a => `<option value="${a.k}">${a.label}</option>`).join("")}</select>
    <span class="bv" data-bval></span>
    <button type="button" class="btn small primary" data-bgo disabled>Apply</button>
    <span class="bsep"></span>
    <button type="button" class="btn small" data-bquick="complete">✓ Complete</button>
    <button type="button" class="btn small danger" data-bquick="delete">${deleteLabel}</button>
    <button type="button" class="btn small ghost" data-bclear>Clear selection</button>
  </div>`;
  const root = container.firstElementChild, act = root.querySelector("[data-bact]"), val = root.querySelector("[data-bval]"), go = root.querySelector("[data-bgo]");
  const reset = () => { act.value = ""; val.innerHTML = ""; go.disabled = true; };
  act.addEventListener("change", () => {
    const a = BULK.find(x => x.k === act.value);
    val.innerHTML = bulkValueHTML(act.value); go.disabled = !act.value;
    const i = val.querySelector("[data-bv]"); if (i) i.focus(); else if (a) { apply(a.k, null); reset(); }   // no value needed → apply right away
  });
  go.addEventListener("click", () => {
    const k = act.value; if (!k) return;
    const i = val.querySelector("[data-bv]"); let v = i ? i.value : null;
    if (k === "shift"){ v = parseInt(v, 10); if (!Number.isFinite(v) || v === 0){ i.focus(); return; } }
    if (k === "note" && !String(v).trim()){ i.focus(); return; }
    if (typeof v === "string") v = v.trim();
    apply(k, v); reset();
  });
  val.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); go.click(); } });
  root.querySelectorAll("[data-bquick]").forEach(b => b.addEventListener("click", () => { apply(b.dataset.bquick, null); reset(); }));
  return {
    root,
    show(n){ root.hidden = !n; root.querySelector("[data-bn]").textContent = `${n} selected`; if (!n) reset(); },
    onClear(f){ root.querySelector("[data-bclear]").addEventListener("click", f); },
  };
}

/* ---------- toast with undo ---------- */
let toastTimer;
function toast(msg, undo){
  const t = $("#toast"), b = $("#toast-undo");
  $("#toast-msg").textContent = msg; b.hidden = !undo;
  b.onclick = () => { if (undo) undo(); hideToast(); };
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, undo ? 8000 : 3500);
}
function hideToast(){ $("#toast").hidden = true; }

/* ---------- in-page confirm ---------- */
function confirmBox({title, body, ok = "Delete"}){
  return new Promise(res => {
    const d = $("#dlg-confirm");
    $("#cf-title").textContent = title; $("#cf-body").textContent = body; $("#cf-ok").textContent = ok;
    d.returnValue = ""; d.addEventListener("close", () => res(d.returnValue === "ok"), {once:true});
    d.showModal(); $("#cf-ok").focus();
  });
}

function softDelete(ids){
  ids = ids.filter(id => { const r = Store.get(id); return r && !r.deletedAt; });
  if (!ids.length) return;
  const first = Store.get(ids[0]);
  Store.remove(ids);
  toast(ids.length === 1 ? `Deleted "${trunc(first.title, 32)}"` : `Deleted ${ids.length} items`, () => Store.restore(ids));
}

/* =====================================================================
   CLOCK
   ===================================================================== */
const SEM_START = new Date(2026,7,24); // Fall 2026 first day of classes, adjust as needed
const SEM_END = new Date(2026,11,12);  // end of the semester: default "until" date for weekly repeats, adjust as needed
let lastDay = "", lastMin = -1, ready = false;
function tick(){
  const n = new Date(), h = n.getHours();
  $("#time").innerHTML = `${(h%12)||12}:${pad(n.getMinutes())}<small>${h<12?"AM":"PM"}</small>`;
  $("#sec").textContent = pad(n.getSeconds());
  $("#date").innerHTML = `<span class="dl">${n.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</span><span class="ds">${n.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</span>`;
  $("#greet").innerHTML = `<span class="g1">${h<5?"Up late":h<12?"Good morning":h<17?"Good afternoon":"Good evening"}</span><span class="g2">, Ryan</span>`;
  const wk = Math.floor((startOfDay(n) - SEM_START)/MS_DAY/7) + 1;
  $("#wk").textContent = wk >= 1 && wk <= 18 ? `Week ${wk} of the semester` : "";
  const mk = n.getHours()*60 + n.getMinutes(); if (mk !== lastMin){ lastMin = mk; applyTheme(); fitSoon(); if (ready && mk % 5 === 0) renderCal(); }   // past events get struck through
  if (ymd(n) !== lastDay){ lastDay = ymd(n); if (ready){ Store.purgeExpired(); Notes.purgeExpired(); renderAll(); } }
}

/* =====================================================================
   WEATHER (unchanged)
   ===================================================================== */
const ICONS = {
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  part:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v1.5M3.5 9H5M4.8 5.8l1 1M12 7a4 4 0 0 0-7.4 2.3"/><path d="M7 19h10a4 4 0 0 0 .5-8A5 5 0 0 0 8 12.5 3.3 3.3 0 0 0 7 19z"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6.5 19h11a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.6 11 4 4 0 0 0 6.5 19z"/></svg>',
  fog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h16M3 13h18M5 17h14"/></svg>',
  rain:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 15h11a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.6 7 4 4 0 0 0 6.5 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
  snow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 15h11a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.6 7 4 4 0 0 0 6.5 15z"/><path d="M8 19h.01M12 21h.01M16 19h.01M10 18h.01M14 18h.01"/></svg>',
  storm:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 15h11a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.6 7 4 4 0 0 0 6.5 15z"/><path d="M12 15l-2 4h4l-2 4"/></svg>'
};
function wmo(c){
  if (c===0) return ["Clear","sun"]; if (c<=2) return ["Partly cloudy","part"]; if (c===3) return ["Overcast","cloud"];
  if (c<=48) return ["Fog","fog"]; if (c<=57) return ["Drizzle","rain"]; if (c<=67) return ["Rain","rain"];
  if (c<=77) return ["Snow","snow"]; if (c<=82) return ["Showers","rain"]; if (c<=86) return ["Snow showers","snow"]; return ["Thunderstorms","storm"];
}
function renderWeather(d, sample){
  const [desc, ic] = wmo(d.current.weather_code);
  $("#wx-icon").innerHTML = ICONS[ic];
  $("#wx-temp").textContent = Math.round(d.current.temperature_2m) + "°";
  $("#wx-desc").textContent = desc;
  $("#wx-meta").innerHTML = `Feels ${Math.round(d.current.apparent_temperature)}°<span class="wxw"> · Wind ${Math.round(d.current.wind_speed_10m)} mph</span>`;
  /* the next 12 hours (as many as fit are shown, and only when at least 5 fit) */
  const hr = d.hourly; let hrs = "";
  if (hr && hr.time){
    const now = new Date(), i0 = Math.max(0, hr.time.findIndex(t => new Date(t) > now));
    hrs = hr.time.slice(i0, i0 + 12).map((t, k) => { const dt = new Date(t), h = dt.getHours();
      return `<div class="wx-hour"><span class="hh">${k === 0 && false ? "Now" : `${(h % 12) || 12} ${h < 12 ? "AM" : "PM"}`}</span>${ICONS[wmo(hr.weather_code[i0 + k])[1]]}<b>${Math.round(hr.temperature_2m[i0 + k])}°</b></div>`; }).join("");
  }
  $("#wx-hours").innerHTML = hrs;
  const dd = d.daily;
  $("#wx-days").innerHTML = dd.time.slice(0,4).map((t,i) => {
    const lbl = i===0 ? "Today" : parseYmd(t).toLocaleDateString(undefined,{weekday:"short"});
    return `<div class="wx-day"><span>${lbl}</span>${ICONS[wmo(dd.weather_code[i])[1]]}<span class="hi mono">${Math.round(dd.temperature_2m_max[i])}°</span><span class="lo mono">${Math.round(dd.temperature_2m_min[i])}°</span><span class="lo">${dd.precipitation_probability_max[i]}%</span></div>`;
  }).join("");
  $("#wx-tag").hidden = !sample; $("#wx-note").hidden = !sample;
  fitSoon();
}
async function loadWeather(){
  const url = "https://api.open-meteo.com/v1/forecast?latitude=40.4259&longitude=-86.9081&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FIndiana%2FIndianapolis&forecast_days=4";
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(url, {signal:ctl.signal}); if (!r.ok) throw 0;
    renderWeather(await r.json(), false);
  } catch(e){
    const t = startOfDay(new Date());
    renderWeather({current:{temperature_2m:44,apparent_temperature:39,weather_code:2,wind_speed_10m:11},
      hourly:(() => { const h0 = new Date(); h0.setMinutes(0, 0, 0); const time = [], temperature_2m = [], weather_code = [];
        for (let i = 0; i < 24; i++){ const x = new Date(h0.getTime() + i * 3600000); time.push(x.toISOString()); temperature_2m.push(44 + Math.round(5 * Math.sin((x.getHours() - 9) / 24 * 2 * Math.PI))); weather_code.push(i < 6 ? 2 : i < 14 ? 3 : 61); }
        return {time, temperature_2m, weather_code}; })(),
      daily:{time:[0,1,2,3].map(i=>ymd(new Date(t.getTime()+i*MS_DAY))),weather_code:[2,61,3,0],temperature_2m_max:[51,47,43,49],temperature_2m_min:[36,38,31,29],precipitation_probability_max:[10,70,20,0]}}, true);
  }
  setTimeout(loadWeather, 15*60*1000);
}

/* =====================================================================
   MAIL: Gmail (personal) and Outlook (school), sample data for now.
   The UI only talks to `Mail`. To connect real mail later, swap
   SampleMail for adapters with the same five methods (async is fine):
     folders(acct)           -> [{id, name, icon, group, color}]
     categories(acct)        -> [{id, name}]     (Gmail tabs / Outlook Focused-Other)
     list(acct, folder, cat) -> messages {id, from, addr, subject, snippet, body, at, unread, starred}
     modify(acct, id, patch) -> {unread?, starred?, folder?}
     unread(acct, folder)    -> number
   Gmail: Gmail API + Google Identity Services, scope gmail.modify.
   Outlook: Microsoft Graph (/me/mailFolders, /me/messages) + MSAL.js, Mail.ReadWrite.
   ===================================================================== */
const MAIL_ACCOUNTS = [
  {id:"gmail",   name:"Gmail",   role:"Personal"},
  {id:"outlook", name:"Outlook", role:"School"},
];
const MI = {
  inbox:'<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  star:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  snooze:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3L2 6M19 3l3 3"/>',
  important:'<path d="M4 6h12l4 6-4 6H4l4-6z"/>',
  sent:'<path d="M3 11l18-8-8 18-2-8z"/>',
  sched:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/><path d="M17 3l3 3"/>',
  draft:'<path d="M5 3h10l4 4v14H5z"/><path d="M9 13h6M9 17h4"/>',
  all:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  spam:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  archive:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
  label:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  folder:'<path d="M3 6h7l2 2h9v11H3z"/>',
};
const mIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MI[k] || MI.folder}</svg>`;

const SampleMail = (() => {
  const FOLDERS = {
    gmail:[
      {id:"inbox", name:"Inbox", icon:"inbox"}, {id:"starred", name:"Starred", icon:"star"}, {id:"snoozed", name:"Snoozed", icon:"snooze"},
      {id:"important", name:"Important", icon:"important"}, {id:"sent", name:"Sent", icon:"sent"}, {id:"scheduled", name:"Scheduled", icon:"sched"},
      {id:"drafts", name:"Drafts", icon:"draft"}, {id:"all", name:"All Mail", icon:"all"}, {id:"spam", name:"Spam", icon:"spam"}, {id:"trash", name:"Trash", icon:"trash"},
      {id:"L:Purdue", name:"Purdue", icon:"label", group:"Labels", color:"#B7791F"}, {id:"L:Receipts", name:"Receipts", icon:"label", group:"Labels", color:"#059669"},
      {id:"L:Lifting", name:"Lifting", icon:"label", group:"Labels", color:"#DC2626"},
    ],
    outlook:[
      {id:"inbox", name:"Inbox", icon:"inbox"}, {id:"drafts", name:"Drafts", icon:"draft"}, {id:"sent", name:"Sent Items", icon:"sent"},
      {id:"archive", name:"Archive", icon:"archive"}, {id:"trash", name:"Deleted Items", icon:"trash"}, {id:"spam", name:"Junk Email", icon:"spam"},
      {id:"history", name:"Conversation History", icon:"history"},
      {id:"F:ECE", name:"ECE courses", icon:"folder", group:"Folders"}, {id:"F:Advising", name:"Advising", icon:"folder", group:"Folders"},
    ],
  };
  const CATS = {gmail:[{id:"primary", name:"Primary"},{id:"promotions", name:"Promotions"},{id:"social", name:"Social"},{id:"updates", name:"Updates"}],
                outlook:[{id:"focused", name:"Focused"},{id:"other", name:"Other"}]};
  const ago = m => new Date(Date.now() - m * 60000).toISOString();
  let n = 0;
  const M = (acct, folder, cat, from, addr, subject, body, mins, x = {}) => ({id:"m" + (++n), acct, folder, cat, from, addr, subject, body, snippet:body.replace(/\s+/g, " ").slice(0, 110), at:ago(mins), unread:false, starred:false, important:false, labels:[], ...x});
  const msgs = [
    M("gmail","inbox","primary","Purdue IEEE PES","pes@purdue.edu","Plant tour sign-ups close Friday","Hi all,\n\nSign-ups for the substation and plant tour close this Friday at 5 PM. Spots are limited to 20, and transportation leaves from the EE building lobby.\n\nSee you there,\nIEEE PES officers", 95, {unread:true, important:true, labels:["Purdue"]}),
    M("gmail","inbox","primary","Mom","","Thanksgiving plans","Are you driving home Tuesday night or Wednesday morning? Let me know so I can plan dinner.\n\nLove, Mom", 240, {unread:true, starred:true}),
    M("gmail","inbox","primary","GitHub","noreply@github.com","[homebase] Your GitHub Pages site was published","Your site is live. Changes pushed to main are deployed automatically within a minute or two.", 1500, {labels:[]}),
    M("gmail","inbox","primary","Jake","","gym tomorrow?","Leg day at the Co-Rec, 7am? I'll bring the lift log.", 2900, {labels:["Lifting"]}),
    M("gmail","inbox","promotions","Spotify","no-reply@spotify.com","Your Wrapped is almost here","Get ready: your year in music is coming soon.", 600),
    M("gmail","inbox","promotions","Best Buy","bestbuy@email.bestbuy.com","Early Black Friday: laptops and monitors","Deals on monitors, SSDs and more for a limited time.", 1800),
    M("gmail","inbox","social","LinkedIn","messages-noreply@linkedin.com","You appeared in 9 searches this week","See who's looking at your profile.", 3000),
    M("gmail","inbox","updates","Amazon","shipment-tracking@amazon.com","Your order has shipped","Your package with a USB-C dock is on its way. Arriving Thursday.", 420, {unread:true, labels:["Receipts"]}),
    M("gmail","inbox","updates","Google","no-reply@accounts.google.com","Security alert: new sign-in","A new sign-in on a Windows device was detected. If this was you, no action is needed.", 5200),
    M("gmail","sent",null,"To: Jake","","Re: gym tomorrow?","I'm in. 7 works.", 2880),
    M("gmail","drafts",null,"Draft","","Summer internship question","Hi, I'm a sophomore in EE (power and energy systems) and wanted to ask about...", 4000),
    M("gmail","snoozed",null,"Purdue Bursar","bursar@purdue.edu","Spring tuition statement available","Your spring statement is available in MyPurdue.", 9000, {labels:["Purdue"]}),
    M("gmail","spam",null,"Prize Center","win@prizes.example","You've been selected!!!","Claim your reward now.", 700),
    M("gmail","archive",null,"Amazon","auto-confirm@amazon.com","Your Amazon.com order of USB-C dock","Thanks for your order. We'll send a confirmation when it ships.", 8000, {labels:["Receipts"]}),

    M("outlook","inbox","focused","ECE 30100 Course Staff","ece301@purdue.edu","HW 9 clarification: part (c) uses the trigonometric form","Students,\n\nFor HW 9 part (c), use the trigonometric form of the Fourier series, not the exponential form. The due date is unchanged.\n\nCourse staff", 300, {unread:true}),
    M("outlook","inbox","focused","Brightspace","noreply@brightspace.purdue.edu","Grades posted: Lab 5 report","A grade has been posted for Lab 5 report in ECE 32100.", 1600),
    M("outlook","inbox","focused","Academic Advisor","advising@purdue.edu","Spring registration time ticket","Your registration time ticket for spring opens Monday at 7:00 AM. Please meet with your advisor before then to clear your hold.", 2200, {unread:true, starred:true}),
    M("outlook","inbox","focused","ECE 20002 Instructor","","Exam 3 room assignments","Exam 3 is Tuesday 12/1, 8:00–9:00 PM in BHEE 129. Bring a calculator and one page of notes.", 3100),
    M("outlook","inbox","other","Career Center","careers@purdue.edu","Spring internship fair, employer list is live","More than 300 employers will attend, including utilities and grid operators.", 6000),
    M("outlook","inbox","other","Purdue Today","purduetoday@purdue.edu","Purdue Today for Monday","Campus news, events and announcements.", 800),
    M("outlook","sent",null,"To: ECE 30100 Course Staff","","Question on HW 9 part (b)","Is the period T = 2 or T = 4 in part (b)? Thanks.", 1300),
    M("outlook","drafts",null,"Draft","","Lab partner availability","I can meet Tuesday or Thursday afternoon...", 500),
    M("outlook","archive",null,"Housing","housing@purdue.edu","Winter break housing reminder","Submit your winter break housing form by December 1.", 20000),
    M("outlook","spam",null,"IT Notice","it-help@purdue-support.example","Your mailbox is full, verify now","Click here to verify your account.", 1000),
    M("outlook","F:ECE",null,"ECE 32100 TA","","Lab 6 prelab posted","The prelab for Lab 6 is posted on Brightspace.", 4500),
    M("outlook","F:Advising",null,"Academic Advisor","advising@purdue.edu","Plan of study check","Your plan of study looks on track for Spring 2028.", 30000),
  ];
  const hidden = m => m.folder === "trash" || m.folder === "spam";
  function inFolder(m, acct, f){
    if (m.acct !== acct) return false;
    if (f === "starred") return m.starred && !hidden(m);
    if (f === "important") return m.important && !hidden(m);
    if (f === "all") return !hidden(m) && m.folder !== "drafts";
    if (f.startsWith("L:")) return m.labels.includes(f.slice(2)) && !hidden(m);
    return m.folder === f;
  }
  return {
    folders: acct => FOLDERS[acct],
    categories: acct => CATS[acct],
    list(acct, folder, cat, q){
      q = (q || "").toLowerCase();
      return msgs.filter(m => q ? (m.acct === acct && [m.from, m.addr, m.subject, m.body].join(" ").toLowerCase().includes(q) && (folder === "all" || inFolder(m, acct, folder)))
                                : inFolder(m, acct, folder) && (folder !== "inbox" || !cat || m.cat === cat))
        .sort((a, b) => b.at.localeCompare(a.at));
    },
    unread(acct, folder, cat){ return msgs.filter(m => m.unread && inFolder(m, acct, folder) && (!cat || m.cat === cat)).length; },
    get: id => msgs.find(m => m.id === id),
    modify(acct, id, patch){ const m = msgs.find(x => x.id === id); if (m) Object.assign(m, patch); return m; },
  };
})();
const Mail = SampleMail;

const mailState = {folder:"inbox", cat:null, open:null, q:""};
const curAcct = () => Settings.get().mail.account;
const acctOf = id => MAIL_ACCOUNTS.find(a => a.id === id) || MAIL_ACCOUNTS[0];
function mailWhen(iso){
  const d = new Date(iso), n = new Date();
  if (ymd(d) === ymd(n)) return d.toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"});
  if (daysFromToday(ymd(d)) === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, daysFromToday(ymd(d)) > -7 ? {weekday:"short"} : {month:"short", day:"numeric"});
}
function acctSegHTML(){
  return MAIL_ACCOUNTS.map(a => { const u = Mail.unread(a.id, "inbox", Mail.categories(a.id)[0].id);
    return `<button type="button" data-acct="${a.id}" aria-pressed="${a.id === curAcct()}">${a.name}<small>${a.role}</small>${u ? `<span class="badge">${u}</span>` : ""}</button>`; }).join("");
}
function setAcct(id){ Settings.update(s => { s.mail.account = id; }); mailState.folder = "inbox"; mailState.cat = Mail.categories(id)[0].id; mailState.open = null; renderMailTile(); if ($("#dlg-mail").open) renderMailX(); }
function renderMailTile(){ if (ready) Home.refresh(); }   // inbox widgets live on the home screen
function renderMailX(){
  const a = curAcct(), cats = Mail.categories(a);
  if (!mailState.cat || !cats.some(c => c.id === mailState.cat)) mailState.cat = cats[0].id;
  $("#mx-acct").innerHTML = acctSegHTML();
  const fs = Mail.folders(a); let lastGroup = "", fh = `<button type="button" class="btn primary compose" disabled title="Sending works once ${acctOf(a).name} is connected">✎ Compose</button>`;
  for (const f of fs){
    if (f.group && f.group !== lastGroup){ fh += `<h5>${esc(f.group)}</h5>`; lastGroup = f.group; }
    const u = Mail.unread(a, f.id, f.id === "inbox" ? null : null);
    fh += `<button type="button" class="mx-f" data-folder="${esc(f.id)}" aria-current="${f.id === mailState.folder}">${f.color ? `<span class="lbl-dot" style="--lc:${f.color}"></span>` : mIcon(f.icon)}<span>${esc(f.name)}</span>${u && !["sent","drafts","trash","all"].includes(f.id) ? `<b>${u}</b>` : ""}</button>`;
  }
  $("#mx-folders").innerHTML = fh;
  $("#mx-folder-sel").innerHTML = fs.map(f => `<option value="${esc(f.id)}" ${f.id === mailState.folder ? "selected" : ""}>${esc(f.name)}</option>`).join("");
  const showCats = mailState.folder === "inbox" && !mailState.q;
  $("#mx-cats").hidden = !showCats;
  $("#mx-cats").innerHTML = cats.map(c => { const u = Mail.unread(a, "inbox", c.id); return `<button type="button" data-cat="${c.id}" aria-pressed="${c.id === mailState.cat}">${c.name}${u ? `<b>${u}</b>` : ""}</button>`; }).join("");
  const list = Mail.list(a, mailState.q ? "all" : mailState.folder, showCats ? mailState.cat : null, mailState.q);
  const STAR = mIcon("star").replace('fill="none"', 'fill="currentColor"');
  $("#mx-msgs").innerHTML = list.map(m => `<li class="mx-m ${m.unread ? "unread" : ""} ${m.id === mailState.open ? "on" : ""}" data-mail="${m.id}" tabindex="0"><span class="dot"></span><span class="fr">${esc(m.from)}</span><span class="wh">${m.starred ? STAR : ""}${mailWhen(m.at)}</span><span class="sj">${esc(m.subject)}</span><span class="sn">${esc(m.snippet)}</span></li>`).join("")
    || `<li class="empty" style="padding:20px 14px">${mailState.q ? "No messages match." : "Nothing in this folder."}</li>`;
  renderMailRead();
}
function renderMailRead(){
  const m = mailState.open && Mail.get(mailState.open), box = $("#mx-read");
  $("#mx").classList.toggle("reading", !!m);
  if (!m){ box.innerHTML = `<p class="mx-empty">Pick a message to read it here.<br><br>This is sample mail. Once Gmail and Outlook are connected, these folders and actions work on your real mailboxes.</p>`; return; }
  const gm = m.acct === "gmail";
  box.innerHTML = `<div class="mx-act">
      <button type="button" class="btn small mx-back" data-mx="back">‹ Back</button>
      <button type="button" class="btn small" data-mx="archive">Archive</button>
      <button type="button" class="btn small danger" data-mx="trash">Delete</button>
      <button type="button" class="btn small" data-mx="unread">Mark unread</button>
      <button type="button" class="btn small" data-mx="star">${m.starred ? (gm ? "Unstar" : "Unflag") : (gm ? "Star" : "Flag")}</button>
      ${m.folder === "trash" || m.folder === "spam" || m.folder === "archive" ? `<button type="button" class="btn small" data-mx="inbox">Move to Inbox</button>` : ""}
      <button type="button" class="btn small" disabled title="Replies work once connected">Reply</button>
    </div>
    <h3>${esc(m.subject)}</h3>
    <div class="mx-from"><span class="mx-av">${esc((m.from.replace(/^(To|Draft):\s*/, "")[0] || "?").toUpperCase())}</span><span class="who">${esc(m.from)}</span><span class="dt">${new Date(m.at).toLocaleString(undefined, {weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})}</span><span class="addr">${esc(m.addr || "")}${m.labels.length ? " · " + m.labels.map(esc).join(", ") : ""}</span></div>
    <div class="mx-text">${esc(m.body)}</div>`;
}
function openMail(id){
  const a = curAcct(); mailState.q = ""; $("#mx-q").value = "";
  if (id){ const m = Mail.get(id); mailState.folder = m.folder; if (m.cat) mailState.cat = m.cat; mailState.open = id; Mail.modify(a, id, {unread:false}); }
  else mailState.open = null;
  renderMailX(); renderMailTile();
  if (!$("#dlg-mail").open) $("#dlg-mail").showModal();
}
[$("#mx-acct")].forEach(el => el.addEventListener("click", e => { const b = e.target.closest("[data-acct]"); if (b) setAcct(b.dataset.acct); }));
$("#mx-folders").addEventListener("click", e => { const b = e.target.closest("[data-folder]"); if (!b) return; mailState.folder = b.dataset.folder; mailState.open = null; mailState.q = ""; $("#mx-q").value = ""; renderMailX(); });
$("#mx-folder-sel").addEventListener("change", e => { mailState.folder = e.target.value; mailState.open = null; renderMailX(); });
$("#mx-cats").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; mailState.cat = b.dataset.cat; mailState.open = null; renderMailX(); });
$("#mx-q").addEventListener("input", e => { mailState.q = e.target.value.trim(); renderMailX(); });
$("#mx-msgs").addEventListener("click", e => { const li = e.target.closest("[data-mail]"); if (!li) return; mailState.open = li.dataset.mail; Mail.modify(curAcct(), li.dataset.mail, {unread:false}); renderMailX(); renderMailTile(); });
$("#mx-msgs").addEventListener("keydown", e => { if (e.key === "Enter"){ const li = e.target.closest("[data-mail]"); if (li) li.click(); } });
$("#mx-read").addEventListener("click", e => {
  const b = e.target.closest("[data-mx]"); if (!b) return;
  const id = mailState.open, m = Mail.get(id), a = curAcct(), act = b.dataset.mx;
  if (act === "back"){ mailState.open = null; renderMailX(); return; }
  if (act === "unread"){ Mail.modify(a, id, {unread:true}); mailState.open = null; }
  if (act === "star") Mail.modify(a, id, {starred:!m.starred});
  if (act === "archive"){ Mail.modify(a, id, {folder:"archive"}); mailState.open = null; toast(`Archived "${trunc(m.subject, 30)}"`, () => { Mail.modify(a, id, {folder:"inbox"}); renderMailX(); renderMailTile(); }); }
  if (act === "trash"){ const prev = m.folder; Mail.modify(a, id, {folder:"trash"}); mailState.open = null; toast(`Moved to ${a === "gmail" ? "Trash" : "Deleted Items"}`, () => { Mail.modify(a, id, {folder:prev}); renderMailX(); renderMailTile(); }); }
  if (act === "inbox") Mail.modify(a, id, {folder:"inbox"});
  renderMailX(); renderMailTile();
});
mailState.cat = Mail.categories(curAcct())[0].id;

