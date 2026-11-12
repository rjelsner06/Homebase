/* Homebase: CALENDAR: Day / Week / Month / Year.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   CALENDAR: Day / Week / Month / Year
   ===================================================================== */
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const cal = {view:"week", cursor:startOfDay(new Date()), selected:todayS()};

function evRowHTML(r){
  const todo = isTodo(r);
  const tcol = r.time ? (isScheduled(r) ? `${fmtTime(r.time)}${r.endTime ? `<span class="te">${fmtTime(r.endTime)}</span>` : ""}` : `<span class="te">due</span>${fmtTime(r.time)}`) : "All day";
  return `<div class="ev ${doneLook(r)?"done":""} ${isOutline(r)?"outline":""} ${isNoClass(r)?(r.course?"nc crs":"nc"):""}" style="--cc:${itemColor(r)}" data-open="${r.id}" tabindex="0">
    ${todo ? `<input type="checkbox" class="ckb" data-toggle="${r.id}" ${r.completed?"checked":""} aria-label="Mark ${esc(r.title)} ${r.completed?"not done":"done"}">` : `<span class="ckb-sp" aria-hidden="true"></span>`}
    <span class="time">${tcol}</span>
    <div><div class="ttl">${esc(r.title)}</div><div class="sub">${priBadge(r)}${typeBadge(r.type)}<span>${esc(catLabel(r))}</span>${r.location?`<span>${esc(r.location)}</span>`:""}${r.reading?`<span>${esc(r.reading)}</span>`:""}${r.subtasks.length?`<span>${stProg(r)}</span>`:""}${r.seriesId?'<span title="Repeats weekly">↻ weekly</span>':""}${r.completed?"<span>completed</span>":calOff.has(r.id)?"<span>no class</span>":isNoClass(r)?`<span>${r.course?"this course only":"whole day"}</span>`:""}${r.sample?"<span>sample</span>":""}</div></div>
    ${r.flagged ? FLAG : ""}
  </div>`;
}
function dayListHTML(s, map, solo){
  const list = map[s] || [];
  const label = solo ? plural(list.length, "item") : fmtDate(s, {weekday:"long",month:"long",day:"numeric"});
  return `<h3><span>${label}</span><button class="btn small" type="button" data-add="${s}">+ Add</button></h3>` +
    (list.length ? list.map(evRowHTML).join("") : `<div class="empty">Nothing scheduled.</div>`);
}
function weekHTML(ws, map){
  const ts = todayS(); let h = '<div class="wk">';
  for (let i = 0; i < 7; i++){
    const d = new Date(ws); d.setDate(ws.getDate() + i); const s = ymd(d), list = map[s] || [];
    h += `<div class="wk-col ${s===ts?"today":""} ${ncInfo(list).all?"nocls":""}">
      <button type="button" class="wk-h" data-goday="${s}" aria-label="Open ${d.toDateString()}, ${plural(list.length,"item")}"><span class="dw">${DOW[i]}</span><span class="dn">${d.getDate()}</span></button>
      <div class="wk-items">${list.map(r => chipHTML(r, {time:true, tall:true})).join("")}</div>
      <button type="button" class="wk-add" data-add="${s}" aria-label="Add on ${d.toDateString()}">+</button>
    </div>`;
  }
  return h + "</div>";
}
function monthHTML(map){
  const ts = todayS(), v = cal.cursor, first = new Date(v.getFullYear(), v.getMonth(), 1), start = new Date(first);
  start.setDate(1 - first.getDay());
  let html = DOW.map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++){
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i === 35 && d.getMonth() !== first.getMonth()) break;
    const s = ymd(d), list = map[s] || [];
    const cls = ["day", d.getMonth()!==first.getMonth()?"out":"", s===ts?"today":"", s===cal.selected?"sel":"", ncInfo(list).all?"nocls":""].join(" ");
    const chips = list.slice(0,3).map(r => chipHTML(r)).join("");
    const more = list.length > 3 ? `<span class="more">+${list.length-3} more</span>` : "";
    const dots = list.length ? `<span class="dots">${list.map(r => `<span class="${isOutline(r)?"outline":""} ${doneLook(r)?"done":""}" style="--cc:${itemColor(r)}"></span>`).join("")}</span>` : "";
    html += `<div class="${cls}" data-day="${s}"><button type="button" class="n" data-goday="${s}" aria-label="Open ${d.toDateString()}, ${plural(list.length,"item")}">${d.getDate()}</button>${chips}${more}${dots}</div>`;
  }
  return `<div class="cal">${html}</div><div class="dayview">${dayListHTML(cal.selected, map, false)}</div>`;
}
function yearHTML(map){
  const y = cal.cursor.getFullYear(), ts = todayS(); let h = '<div class="yr">';
  for (let m = 0; m < 12; m++){
    const first = new Date(y, m, 1), dim = new Date(y, m+1, 0).getDate();
    h += `<div class="mini"><button type="button" class="mini-h" data-month="${y}-${pad(m+1)}">${first.toLocaleDateString(undefined,{month:"long"})}</button><div class="mg">${"SMTWTFS".split("").map(d => `<span class="mdow">${d}</span>`).join("")}`;
    for (let i = 0; i < first.getDay(); i++) h += "<span></span>";
    for (let d = 1; d <= dim; d++){
      const s = `${y}-${pad(m+1)}-${pad(d)}`, all = map[s] || [], list = all.filter(r => !isNoClass(r)), open = list.filter(r => !r.completed);
      const cc = list.length ? itemColor(open[0] || list[0]) : "";
      h += `<button type="button" class="md ${s===ts?"today":""} ${ncInfo(all).all?"nocls":""} ${list.length?"has":""} ${list.length&&!open.length?"alldone":""}" ${cc?`style="--cc:${cc}"`:""} data-goday="${s}" aria-label="${fmtDate(s,{month:"long",day:"numeric"})}, ${plural(list.length,"item")}">${d}</button>`;
    }
    h += "</div></div>";
  }
  return h + "</div>";
}
function rangeLabel(a, b){
  const y = {year:"numeric"};
  if (a.getFullYear() !== b.getFullYear()) return `${a.toLocaleDateString(undefined,{month:"short",day:"numeric",...y})} – ${b.toLocaleDateString(undefined,{month:"short",day:"numeric",...y})}`;
  if (a.getMonth() !== b.getMonth()) return `${a.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${b.toLocaleDateString(undefined,{month:"short",day:"numeric"})}, ${b.getFullYear()}`;
  return `${a.toLocaleDateString(undefined,{month:"short"})} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`;
}
function legendHTML(){
  const school = Store.all().filter(r => catDef(r.category).hasCourse);
  const courses = [...new Set(school.map(r => r.course).filter(Boolean))].sort();
  let h = courses.map(c => `<span class="lg"><i style="--cc:${courseColor(c)}"></i>${esc(c)}</span>`).join("");
  if (school.some(r => !r.course)) h += `<span class="lg"><i style="--cc:${courseColor("")}"></i>School, no course</span>`;
  h += CATEGORIES.filter(c => !c.hasCourse).map(c => `<span class="lg"><i class="outline" style="--cc:${c.color}"></i>${esc(c.name)}</span>`).join("");
  if (Store.all().some(isNoClass)) h += `<span class="lg"><i class="nc-sw"></i>No class</span>`;
  return h + `<span class="lg"><i class="done-sw">✓</i>Completed</span>`;
}
function renderCal(){
  const cf = Settings.get().calFilter || "both", map = itemsByDate(cf), c = cal.cursor; let title, body;
  markCancelled(cf === "both" ? map : itemsByDate("both"));
  $$("#cal-filter [data-cf]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cf === cf)));
  if (cal.view === "day"){ title = c.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"}); body = `<div class="dayview solo">${dayListHTML(ymd(c), map, true)}</div>`; }
  else if (cal.view === "week"){ const ws = weekStart(c), we = new Date(ws); we.setDate(ws.getDate()+6); title = rangeLabel(ws, we); body = weekHTML(ws, map); }
  else if (cal.view === "month"){ title = c.toLocaleDateString(undefined,{month:"long",year:"numeric"}); body = monthHTML(map); }
  else { title = String(c.getFullYear()); body = yearHTML(map); }
  $("#cal-title").textContent = title;
  $("#cal-body").innerHTML = body;
  $$("#cal-views [data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === cal.view)));
  $("#legend").innerHTML = legendHTML();
  fitSoon();
}
function setView(v){
  if (v === "day" && cal.view === "month") cal.cursor = parseYmd(cal.selected);
  if (v === "month"){
    const s = cal.view === "day" ? ymd(cal.cursor) : cal.selected, sd = parseYmd(s);
    cal.selected = (sd.getMonth() === cal.cursor.getMonth() && sd.getFullYear() === cal.cursor.getFullYear()) ? s : ymd(new Date(cal.cursor.getFullYear(), cal.cursor.getMonth(), 1));
  }
  cal.view = v; renderCal();
}
function stepCal(dir){
  const c = cal.cursor;
  if (cal.view === "day") cal.cursor = new Date(c.getFullYear(), c.getMonth(), c.getDate() + dir);
  else if (cal.view === "week") cal.cursor = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7*dir);
  else if (cal.view === "month"){
    cal.cursor = new Date(c.getFullYear(), c.getMonth() + dir, 1);
    const t = new Date(); cal.selected = (t.getMonth() === cal.cursor.getMonth() && t.getFullYear() === cal.cursor.getFullYear()) ? todayS() : ymd(cal.cursor);
  } else cal.cursor = new Date(c.getFullYear() + dir, c.getMonth(), 1);
  renderCal();
}
function goDay(s){ cal.view = "day"; cal.cursor = parseYmd(s); cal.selected = s; renderCal(); }
$("#cal-filter").addEventListener("click", e => { const b = e.target.closest("[data-cf]"); if (!b) return; Settings.update(st => { st.calFilter = b.dataset.cf; }); renderCal(); });
$("#cal-views").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });
$("#prev").onclick = () => stepCal(-1);
$("#next").onclick = () => stepCal(1);
/* Small calendar widgets get a button that opens the calendar full size in a pop-up. */
$("#cal-x").onclick = () => {
  const d = $("#dlg-calx"), t = $("#t-cal");
  if (d.open){ d.close(); return; }
  calHome = t.parentElement; d.appendChild(t); d.showModal();
  $("#cal-x").setAttribute("aria-label", "Close"); $("#cal-x").title = "Close (Esc)"; calXIcon = $("#cal-x").innerHTML;
  $("#cal-x").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  t.querySelectorAll(".fit-off").forEach(e => e.classList.remove("fit-off"));
};
let calHome = null, calXIcon = "";
$("#dlg-calx").addEventListener("close", () => {
  const t = $("#t-cal"); if (calHome && calHome.isConnected) calHome.appendChild(t); else $("#w-park").appendChild(t);
  calHome = null; if (calXIcon) $("#cal-x").innerHTML = calXIcon; $("#cal-x").setAttribute("aria-label", "Open the calendar larger"); $("#cal-x").title = "Open larger"; fitSoon();
});
$("#dlg-calx").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });   // click outside closes
$("#today").onclick = () => { cal.cursor = startOfDay(new Date()); cal.selected = todayS(); renderCal(); };
$("#cal-body").addEventListener("click", e => {
  if (e.target.closest("[data-open]") || e.target.closest("input")) return;
  const add = e.target.closest("[data-add]"); if (add){ openDetail(null, {date: add.dataset.add}); return; }
  const g = e.target.closest("[data-goday]"); if (g){ goDay(g.dataset.goday); return; }
  const mo = e.target.closest("[data-month]"); if (mo){ const [y,m] = mo.dataset.month.split("-").map(Number); cal.cursor = new Date(y, m-1, 1); const t = new Date(); cal.selected = (t.getFullYear()===y && t.getMonth()===m-1) ? todayS() : ymd(cal.cursor); cal.view = "month"; renderCal(); return; }
  const day = e.target.closest("[data-day]");
  if (day){ cal.selected = day.dataset.day; const d = parseYmd(cal.selected); if (d.getMonth() !== cal.cursor.getMonth() || d.getFullYear() !== cal.cursor.getFullYear()) cal.cursor = new Date(d.getFullYear(), d.getMonth(), 1); renderCal(); }
});
function defaultAddDate(){
  if (page !== "home") return todayS();
  if (cal.view === "day") return ymd(cal.cursor);
  if (cal.view === "month") return cal.selected;
  if (cal.view === "week"){ const ws = ymd(weekStart(cal.cursor)), t = todayS(); return (t >= ws && t <= addDays(ws,6)) ? t : ws; }
  return todayS();
}

