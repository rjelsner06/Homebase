/* Homebase: THIS WEEK widget for the home screen: tasks due this week (by day, overdue on top) and weekly goals.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";
 
/* =====================================================================
   WEEKLY GOALS: one synced record per goal (Sync kind "weekgoal").
     {week:"YYYY-MM-DD" (the Sunday that starts the week), text, done, doneAt,
      order, from (week it was carried over from), carried (moved on to the next week), created}
   ===================================================================== */
const WeekGoalStore = DocStore("homebase.weekgoals.v1", "weekgoal");
 
/* =====================================================================
   THIS WEEK: Sunday → Saturday. Part A lists to-dos due that week by day
   (checking one off is the same as on the To-do page). Part B is the
   week's goals: add, check, drag ⋮⋮ (or arrow keys) to reorder, delete,
   and carry unfinished ones to the next week.
   ===================================================================== */
const ThisWeek = (() => {
  const st = {off:0, pane:"tasks"};   // which week is shown (0 = this week) and, on narrow tiles, which half
  const grid = $("#home-grid");
  const keyOf = off => addDays(ymd(weekStart(new Date())), off * 7);
  const curKey = () => keyOf(st.off);
  const short = s => fmtDate(s, {month:"short", day:"numeric"});
  const norm = o => { const d = o.d || {};
    return {id:o.id, week:String(d.week || ""), text:String(d.text || ""), done:!!d.done, order:Number.isFinite(+d.order) ? +d.order : 0, from:d.from || null, carried:!!d.carried, created:+d.created || 0}; };
  const goalsFor = wk => WeekGoalStore.all().map(norm).filter(g => g.week === wk).sort((a, b) => a.order - b.order || a.created - b.created || a.id.localeCompare(b.id));
  const unfinished = g => !g.done && !g.carried;
  const patch = (id, p) => { const d = WeekGoalStore.get(id); if (d) WeekGoalStore.put(id, {...d, ...p}); };
  function rangeLabel(k){
    const a = parseYmd(k), b = parseYmd(addDays(k, 6));
    return `${short(k)} – ${a.getMonth() === b.getMonth() ? b.getDate() : short(addDays(k, 6))}`;
  }
  const titleOf = (off, k) => off === 0 ? "This week" : off === 1 ? "Next week" : off === -1 ? "Last week" : `Week of ${short(k)}`;
 
  /* ---------- Part A: tasks ---------- */
  function taskRow(r, ts){
    const late = !r.completed && r.date < ts, tm = late ? relLabel(daysFromToday(r.date))[0] : r.time ? fmtTime(r.time) : "";
    return `<li class="twk-t ${r.completed ? "done" : ""} ${late ? "late" : ""}" style="--cc:${itemColor(r)}" data-open="${r.id}" tabindex="0">
      <input type="checkbox" class="ckb" data-toggle="${r.id}" ${r.completed ? "checked" : ""} aria-label="Mark ${esc(r.title)} ${r.completed ? "not done" : "done"}">
      <span class="twk-tt">${r.completed ? "" : priMark(r)}${typeDot(r.type)}${esc(r.title)}</span>
      <span class="twk-tm">${r.flagged ? FLAG : ""}${tm}</span>
      <span class="twk-m">${esc(catLabel(r))}${r.subtasks.length ? ` · ${stProg(r)}` : ""}</span></li>`;
  }
  function tasks(k){
    const ts = todayS(), end = addDays(k, 6), cur = k === keyOf(0);
    const late = r => !r.completed && r.date < ts;
    const all = Store.all().filter(isTodo);
    const over = cur ? all.filter(late).sort(listSort) : [];            // everything still open from before today, at the top
    const week = all.filter(r => r.date >= k && r.date <= end && !(cur && late(r))).sort(listSort);
    const done = week.filter(r => r.completed).length, left = week.length - done + over.length;
    let h = "";
    if (!week.length && !over.length) h = `<p class="twk-empty">Nothing due ${cur ? "this week" : "that week"}.</p>`;
    else {
      if (over.length) h += `<li class="twk-dg over"><div class="twk-dh"><span>Overdue</span><span class="twk-dc">${over.length}</span></div><ul class="twk-ts">${over.map(r => taskRow(r, ts)).join("")}</ul></li>`;
      for (let i = 0; i < 7; i++){
        const d = addDays(k, i), L = week.filter(r => r.date === d), open = L.filter(r => !r.completed).length;
        const cls = ["twk-dg", d === ts ? "today" : "", d < ts ? "past" : "", L.length ? "" : "empty"].filter(Boolean).join(" ");
        h += `<li class="${cls}"><div class="twk-dh"><span>${fmtDate(d, {weekday:"short"})} <b>${parseYmd(d).getDate()}</b></span>${d === ts ? "<em>Today</em>" : ""}<span class="twk-dc">${!L.length ? "Nothing due" : open ? `${open} left` : "All done ✓"}</span></div>${L.length ? `<ul class="twk-ts">${L.map(r => taskRow(r, ts)).join("")}</ul>` : ""}</li>`;
      }
      h = `<ul class="twk-days">${h}</ul>`;
    }
    return {h, done, total:week.length, left};
  }
 
  /* ---------- Part B: goals ---------- */
  const goalRow = g => `<li class="twk-g ${g.done ? "done" : ""} ${g.carried ? "carried" : ""}" data-gid="${g.id}">
      <button type="button" class="twk-h" data-gdrag="${g.id}" data-nolp aria-label="Move “${esc(g.text)}”. Drag, or use the up and down arrow keys" title="Drag to reorder">⠿</button>
      <input type="checkbox" class="ckb" data-gdone="${g.id}" ${g.done ? "checked" : ""} ${g.carried ? "disabled" : ""} aria-label="Mark “${esc(g.text)}” ${g.done ? "not done" : "done"}">
      <input type="text" class="twk-gt" data-gtext="${g.id}" data-nolp value="${esc(g.text)}" maxlength="140" autocomplete="off" enterkeyhint="done" aria-label="Goal">
      ${g.carried ? `<span class="twk-tag" title="Carried over to the next week">→ next wk</span>` : g.from ? `<span class="twk-tag" title="Carried over from the week of ${esc(short(g.from))}">↻</span>` : ""}
      <button type="button" class="x" data-gdel="${g.id}" aria-label="Delete goal “${esc(g.text)}”">×</button></li>`;
  function goals(k, off){
    const gs = goalsFor(k), live = gs.filter(g => !g.carried), done = live.filter(g => g.done).length, todo = gs.filter(unfinished).length;
    const fromLast = off === 0 ? goalsFor(addDays(k, -7)).filter(unfinished).length : 0;
    let h = fromLast ? `<div class="twk-banner"><span>${plural(fromLast, "unfinished goal")} from last week</span><button type="button" class="btn small" data-twk="bring">Bring over</button></div>` : "";
    h += gs.length ? `<ul class="twk-gl">${gs.map(goalRow).join("")}</ul>` : `<p class="twk-empty">No goals for ${esc(titleOf(off, k).replace(/^\w/, c => c.toLowerCase()))} yet.</p>`;
    h += `<div class="twk-addr"><input type="text" class="twk-add" data-nolp maxlength="140" autocomplete="off" enterkeyhint="done" placeholder="Add a goal" aria-label="Add a goal for ${esc(titleOf(off, k).toLowerCase())}"><button type="button" class="btn small" data-twk="add" aria-label="Add goal">+</button></div>`;
    if (todo) h += `<button type="button" class="btn small ghost twk-carry" data-twk="carry">Carry ${todo} unfinished to next week →</button>`;
    return {h, done, total:live.length};
  }
 
  /* ---------- the widget ---------- */
  function widget(){
    const k = curKey(), T = tasks(k), G = goals(k, st.off);
    return `<section class="tile tinted mw twk-w" data-pane="${st.pane}" aria-label="${esc(titleOf(st.off, k))}, ${esc(rangeLabel(k))}">
      <h2><span>${esc(titleOf(st.off, k))}</span><span class="twk-nav"><button class="btn small ghost" type="button" data-twk="prev" aria-label="Previous week" title="Previous week">‹</button>${st.off ? `<button class="btn small" type="button" data-twk="today">This week</button>` : ""}<button class="btn small ghost" type="button" data-twk="next" aria-label="Next week" title="Next week">›</button></span></h2>
      <div class="twk-sub" data-drop="1"><span>${esc(rangeLabel(k))}</span>${T.total ? `<span><b>${T.done}</b> of ${plural(T.total, "task")} done</span>` : ""}${G.total ? `<span><b>${G.done}</b> of ${plural(G.total, "goal")}</span>` : ""}</div>
      <div class="seg twk-seg" role="group" aria-label="Show"><button type="button" data-twk="pane" data-p="tasks" aria-pressed="${st.pane === "tasks"}">Tasks${T.left ? `<b>${T.left}</b>` : ""}</button><button type="button" data-twk="pane" data-p="goals" aria-pressed="${st.pane === "goals"}">Goals${G.total ? `<b>${G.done}/${G.total}</b>` : ""}</button></div>
      <div class="twk-cols">
        <div class="twk-pane twk-tasks" data-keepscroll><div class="twk-ph"><span>Tasks due</span>${T.left ? `<span>${T.left} left</span>` : ""}</div>${T.h}</div>
        <div class="twk-pane twk-goals" data-keepscroll><div class="twk-ph"><span>Weekly goals</span>${G.total ? `<span>${G.done}/${G.total}</span>` : ""}</div>${G.h}</div>
      </div></section>`;
  }
 
  /* ---------- actions ---------- */
  const hwOf = el => { const w = el.closest(".hw"); return w ? w.dataset.id : null; };
  const inHw = (id, sel) => id && grid.querySelector(`.hw[data-id="${id}"] ${sel}`);
  function nav(off){ st.off = off; Home.refresh(true); grid.querySelectorAll(".twk-pane").forEach(p => p.scrollTop = 0); }
  function add(input){
    const text = input.value.trim(); if (!text) return false;
    const k = curKey(), gs = goalsFor(k);
    input.value = "";
    WeekGoalStore.put(uid(), {week:k, text, done:false, doneAt:null, order:gs.length ? Math.max(...gs.map(g => g.order)) + 1 : 0, from:null, carried:false, created:Date.now()});
    return true;
  }
  function afterAdd(hw, refocus){
    Home.refresh(true);
    const pane = inHw(hw, ".twk-goals"); if (pane) pane.scrollTop = pane.scrollHeight;
    const ni = inHw(hw, ".twk-add"); if (refocus && ni) ni.focus();
  }
  function del(id){
    const d = WeekGoalStore.get(id); if (!d) return;
    WeekGoalStore.del(id);
    toast(`Deleted goal "${trunc(d.text, 30)}"`, () => WeekGoalStore.put(id, d));
  }
  /* ids in their new order; only goals whose position changed are saved */
  function reorder(ids){
    const list = ids.map((id, i) => [id, WeekGoalStore.get(id), i]).filter(([, d, i]) => d && +d.order !== i).map(([id, d, i]) => [id, {...d, order:i}]);
    if (list.length) WeekGoalStore.putMany(list);
  }
  function move(id, dir, hw){
    const d = WeekGoalStore.get(id); if (!d) return;
    const ids = goalsFor(d.week).map(g => g.id), i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(ids); Home.refresh(true);
    const h = inHw(hw, `[data-gdrag="${id}"]`); if (h) h.focus();
  }
  /* Copies every unfinished goal of week `from` into week `to` and marks the originals "carried". */
  function carry(from, to){
    const src = goalsFor(from).filter(unfinished); if (!src.length) return;
    const dest = goalsFor(to), base = dest.length ? Math.max(...dest.map(g => g.order)) + 1 : 0, now = Date.now(), made = [], puts = [];
    src.forEach((g, i) => {
      const id = uid(); made.push(id);
      puts.push([id, {week:to, text:g.text, done:false, doneAt:null, order:base + i, from, carried:false, created:now + i}]);
      puts.push([g.id, {...WeekGoalStore.get(g.id), carried:true}]);
    });
    WeekGoalStore.putMany(puts);
    toast(`Carried ${plural(src.length, "goal")} to the week of ${short(to)}`, () => {
      WeekGoalStore.delMany(made);
      const back = src.filter(g => WeekGoalStore.get(g.id)).map(g => [g.id, {...WeekGoalStore.get(g.id), carried:false}]);
      if (back.length) WeekGoalStore.putMany(back);
    });
  }
 
  /* ---------- events (delegated: the widget is redrawn often) ---------- */
  grid.addEventListener("click", e => {
    const b = e.target.closest("[data-twk],[data-gdel]"); if (!b || !b.closest(".twk-w")) return;
    if (b.dataset.gdel) return del(b.dataset.gdel);
    switch (b.dataset.twk){
      case "prev": return nav(st.off - 1);
      case "next": return nav(st.off + 1);
      case "today": return nav(0);
      case "pane":
        st.pane = b.dataset.p;
        grid.querySelectorAll(".twk-w").forEach(w => { w.dataset.pane = st.pane; w.querySelectorAll('[data-twk="pane"]').forEach(x => x.setAttribute("aria-pressed", String(x.dataset.p === st.pane))); });
        return fitSoon();
      case "add": { const hw = hwOf(b), inp = b.closest(".twk-addr").querySelector(".twk-add"); if (add(inp)) afterAdd(hw, false); else inp.focus(); return; }
      case "carry": return carry(curKey(), addDays(curKey(), 7));
      case "bring": return carry(addDays(keyOf(0), -7), keyOf(0));
    }
  });
  grid.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.gdone) return patch(t.dataset.gdone, {done:t.checked, doneAt:t.checked ? new Date().toISOString() : null});
    if (t.dataset.gtext){
      const v = t.value.trim(), d = WeekGoalStore.get(t.dataset.gtext); if (!d) return;
      if (!v){ t.value = d.text; return; }   // an empty goal keeps its old text; use × to delete
      if (v !== d.text) patch(t.dataset.gtext, {text:v});
    }
  });
  grid.addEventListener("keydown", e => {
    const t = e.target;
    if (t.classList.contains("twk-add") && e.key === "Enter"){ e.preventDefault(); const hw = hwOf(t); if (add(t)) afterAdd(hw, true); return; }
    if (t.dataset.gtext && (e.key === "Enter" || e.key === "Escape")){
      e.preventDefault();
      if (e.key === "Escape") t.value = (WeekGoalStore.get(t.dataset.gtext) || {}).text || t.value;
      t.blur(); return;
    }
    if (t.dataset.gdrag && (e.key === "ArrowUp" || e.key === "ArrowDown")){ e.preventDefault(); move(t.dataset.gdrag, e.key === "ArrowUp" ? -1 : 1, hwOf(t)); }
  });
  /* While a goal box has focus the widget isn't redrawn (so typing isn't lost); catch up once focus leaves it.
     The short wait lets a tap on a button in the widget land first. */
  grid.addEventListener("focusout", e => {
    if (!e.target.closest || !e.target.closest(".twk-w") || e.target.type === "checkbox") return;
    setTimeout(() => { const a = document.activeElement; if (!(a && a.closest && a.closest(".twk-w") && a.matches("input[type=text]"))) Home.refresh(); }, 250);
  });
 
  /* ---------- drag ⋮⋮ to reorder (mouse, touch and pen) ---------- */
  let drag = null;
  grid.addEventListener("pointerdown", e => {
    const h = e.target.closest("[data-gdrag]"); if (!h || !h.closest(".twk-w") || (e.pointerType === "mouse" && e.button !== 0)) return;
    const li = h.closest(".twk-g"), ul = li && li.parentElement; if (!ul) return;
    e.preventDefault();
    try { h.setPointerCapture(e.pointerId); } catch(_){}
    drag = {h, li, ul, pid:e.pointerId, moved:false};
    ul.dataset.busy = "1"; li.classList.add("dragging");
  });
  grid.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.pid) return;
    e.preventDefault();
    const {li, ul} = drag; let before = null;
    for (const s of ul.children){ if (s === li) continue; const r = s.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2){ before = s; break; } }
    if (before ? li.nextElementSibling !== before : ul.lastElementChild !== li){ ul.insertBefore(li, before); drag.moved = true; }
    const pane = ul.closest(".twk-pane"), pr = pane.getBoundingClientRect();
    if (e.clientY < pr.top + 28) pane.scrollTop -= 10; else if (e.clientY > pr.bottom - 28) pane.scrollTop += 10;
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    d.li.classList.remove("dragging"); delete d.ul.dataset.busy;
    try { d.h.releasePointerCapture(e.pointerId); } catch(_){}
    if (d.moved) reorder([...d.ul.children].map(x => x.dataset.gid).filter(Boolean));
    else d.h.focus();
  };
  grid.addEventListener("pointerup", endDrag);
  grid.addEventListener("pointercancel", endDrag);
 
  WeekGoalStore.subscribe(() => { if (ready) Home.refresh(); });
  return {widget};
})();
 
/* Put This Week on every saved home screen once (Settings flag "weekWidgetAdded"). Runs again when
   settings arrive from another device that never had it; removing the widget afterwards keeps it removed. */
Home.ensureWidget("weekWidgetAdded", "week", {laptop:[4,3], phone:[4,4]});
Settings.onReplace(() => setTimeout(() => Home.ensureWidget("weekWidgetAdded", "week", {laptop:[4,3], phone:[4,4]}), 0));
 
