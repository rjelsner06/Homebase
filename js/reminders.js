
/* Homebase: REMINDERS through ntfy.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";
 
/* =====================================================================
   REMINDERS: push to your iPhone through ntfy. Homebase works out when
   each reminder is due and saves the list in Supabase; a scheduled job
   there (see supabase-setup.sql) sends each one at the right minute, so
   it works for reminders weeks out and with every Homebase page closed.
   ===================================================================== */
const REM_OPTS = [[0,"At the time"],[5,"5 min before"],[15,"15 min before"],[30,"30 min before"],[60,"1 hour before"],[120,"2 hours before"],[180,"3 hours before"],[720,"12 hours before"],[1440,"1 day before"],[2880,"2 days before"],[10080,"1 week before"]];
const remLabel = x => x.at ? new Date(x.at).toLocaleString(undefined, {weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) : ((REM_OPTS.find(o => o[0] === x.off) || [0, `${x.off} min before`])[1]);
const Rem = (() => {
  let t = 0, lastCount = null, lastErr = "";
  const cfg = () => Settings.get().remind;
  const listFor = r => Array.isArray(r.reminders) ? r.reminders : (cfg().defaults[r.type] || []).map(off => ({id:"d" + off, off}));
  const base = r => new Date(`${r.date}T${r.time || cfg().dayTime || "09:00"}:00`);
  const fireAt = (r, x) => x.at ? new Date(x.at + ":00") : new Date(base(r).getTime() - x.off * 60000);
  function want(){
    const out = new Map(), now = Date.now();
    if (!cfg().topic) return out;
    for (const r of Store.all()){
      if (r.completed) continue;
      for (const x of listFor(r)){
        const at = fireAt(r, x), ms = at.getTime();
        if (!isFinite(ms) || ms < now - 60000 || ms > now + 400 * MS_DAY) continue;
        const when = r.time ? `${isScheduled(r) ? "Starts" : "Due"} ${fmtDate(r.date, {weekday:"short", month:"short", day:"numeric"})}, ${fmtTime(r.time)}` : `${isScheduled(r) ? "On" : "Due"} ${fmtDate(r.date, {weekday:"short", month:"short", day:"numeric"})}`;
        out.set(`${r.id}:${x.id}`, {id:`${r.id}:${x.id}`, item_id:r.id, fire_at:at.toISOString(), title:r.title.slice(0, 200),
          body:[[r.type, r.course].filter(Boolean).join(" · "), when, r.location].filter(Boolean).join("\n").slice(0, 400),
          click:siteBase() + "#item/" + r.id, priority:r.priority === "High" || r.type === "Exam" ? 4 : 3});
      }
    }
    return out;
  }
  async function push(){
    const sb = Sync.client(), u = Sync.user(); if (!sb || !u) return;
    const W = want(), {data, error} = await sb.from("hb_reminders").select("id,fire_at,title,body,click,priority,sent_at");
    if (error) throw error;
    const have = new Map(data.map(h => [h.id, h])), ups = [], dels = [];
    for (const [id, w] of W){
      const h = have.get(id), same = h && Date.parse(h.fire_at) === Date.parse(w.fire_at);
      if (!h || !same || h.title !== w.title || h.body !== w.body || h.click !== w.click || h.priority !== w.priority) ups.push({...w, user_id:u.id, sent_at:same ? h.sent_at : null});
    }
    for (const h of data) if (!W.has(h.id) && (!h.sent_at || Date.parse(h.fire_at) < Date.now() - 30 * MS_DAY)) dels.push(h.id);
    for (let i = 0; i < ups.length; i += 200){ const {error:e} = await sb.from("hb_reminders").upsert(ups.slice(i, i + 200), {onConflict:"user_id,id"}); if (e) throw e; }
    for (let i = 0; i < dels.length; i += 100){ const {error:e} = await sb.from("hb_reminders").delete().in("id", dels.slice(i, i + 100)); if (e) throw e; }
    lastCount = W.size;
  }
  async function pushConfig(){
    const sb = Sync.client(), u = Sync.user(); if (!sb || !u) return;
    const c = cfg();
    const {error} = c.topic ? await sb.from("hb_push").upsert({user_id:u.id, topic:c.topic, server:c.server || "https://ntfy.sh"}, {onConflict:"user_id"})
      : await sb.from("hb_push").delete().eq("user_id", u.id);
    if (error) throw error;
  }
  function schedule(ms = 2500){
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!Sync.live()) return;
      try { await push(); lastErr = ""; } catch(e){ lastErr = e.message || String(e); }
      if ($("#dlg-settings").open) renderSettingsSec();
    }, ms);
  }
  function newTopic(){
    const b = crypto.getRandomValues(new Uint8Array(20)), a = "abcdefghijklmnopqrstuvwxyz234567";
    let s = "hb-"; for (const x of b) s += a[x & 31]; for (let i = 0; i < 12; i++) s += a[b[i] >> 3];
    return s;
  }
  async function test(){
    const c = cfg(); if (!c.topic){ $("#rm-st").textContent = "Create your topic first."; return; }
    try {
      const r = await fetch(String(c.server || "https://ntfy.sh").replace(/\/+$/, "") + "/", {method:"POST", body:JSON.stringify({topic:c.topic, title:"Homebase", message:"Test notification. Reminders will look like this.", tags:["bell"], click:siteBase()})});
      $("#rm-st").textContent = r.ok ? "Sent. It should show up on your phone in a few seconds." : `ntfy said ${r.status}.`;
    } catch(e){ $("#rm-st").textContent = "Couldn't reach the ntfy server."; }
  }
  function renderSettingsSec(){
    const c = cfg();
    $("#rm-topic-box").innerHTML = c.topic
      ? `<div class="rm-topic"><span class="note">Your topic</span><code id="rm-topic">${esc(c.topic)}</code><button type="button" class="btn small" data-rm="copy">Copy</button><button type="button" class="btn small ghost" data-rm="new">New topic</button><button type="button" class="btn small ghost" data-rm="off">Turn off</button></div>`
      : `<div class="rm-topic"><button type="button" class="btn small primary" data-rm="new">Create my notification topic</button><span class="note">A long random name only you know.</span></div>`;
    $("#rm-server").value = c.server || "https://ntfy.sh"; $("#rm-daytime").value = c.dayTime || "09:00";
    $("#rm-defs").innerHTML = typeOrder().filter(x => x !== "No Class").map(ty => { const v = (c.defaults[ty] || [])[0];
      return `<label class="rm-def"><span class="tb" style="--tc:${TYPE_VAR(ty)}">${typeIcon(ty)}${ty}</span><select data-rmdef="${ty}"><option value="">None</option>${REM_OPTS.map(([m, n]) => `<option value="${m}" ${v === m ? "selected" : ""}>${n}</option>`).join("")}</select></label>`; }).join("");
    const n = want().size;
    $("#rm-st").textContent = lastErr ? `Couldn't update reminders: ${lastErr}` : !c.topic ? "" : !Sync.live() ? `${plural(n, "upcoming reminder")}. Sign in to sync (top of Settings) so Supabase can send them.` : `${plural(lastCount ?? n, "upcoming reminder")} scheduled in Supabase.`;
  }
  $("#rm-topic-box").addEventListener("click", async e => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    if (b.dataset.rm === "copy"){ try { await navigator.clipboard.writeText(cfg().topic); toast("Topic copied"); } catch(_){ toast("Select the topic and copy it"); } return; }
    if (b.dataset.rm === "new" && cfg().topic && !(await confirmBox({title:"Make a new topic?", body:"Your phone stops getting reminders until you subscribe to the new topic in the ntfy app.", ok:"Make new topic"}))) return;
    if (b.dataset.rm === "off" && !(await confirmBox({title:"Turn off phone reminders?", body:"Scheduled reminders are removed. You can create a topic again any time.", ok:"Turn off"}))) return;
    Settings.update(s => { s.remind.topic = b.dataset.rm === "off" ? "" : newTopic(); });
    renderSettingsSec(); try { await pushConfig(); } catch(err){ lastErr = err.message; } schedule(200);
  });
  $("#rm-server").addEventListener("change", async e => { const v = e.target.value.trim() || "https://ntfy.sh"; Settings.update(s => { s.remind.server = v.replace(/\/+$/, ""); }); try { await pushConfig(); } catch(_){} });
  $("#rm-daytime").addEventListener("change", e => { if (e.target.value) Settings.update(s => { s.remind.dayTime = e.target.value; }); });
  $("#rm-defs").addEventListener("change", e => { const s2 = e.target.closest("[data-rmdef]"); if (!s2) return; Settings.update(s => { s.remind.defaults[s2.dataset.rmdef] = s2.value === "" ? [] : [+s2.value]; }); renderSettingsSec(); if ($("#dlg-item").open) renderItemReminders(); });
  $("#rm-test").onclick = test;
  Sync.onLocal(k => { if (k === "item" || k === "settings") schedule(); });
  Sync.onReady(async () => { try { await pushConfig(); } catch(_){} schedule(500); });
  return {schedule, renderSettingsSec, listFor, fireAt};
})();
 
/* ---------- reminders in the item panel ---------- */
function renderItemReminders(){
  const r = cur(); if (!r) return;
  const explicit = Array.isArray(r.reminders), list = Rem.listFor(r);
  const when = x => { const d = Rem.fireAt(r, x); return isFinite(d) ? d.toLocaleString(undefined, {weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) : ""; };
  $("#d-rem-list").innerHTML = list.map(x => `<button type="button" data-rmx="${esc(x.id)}" title="Sends ${esc(when(x))}. Click to remove." aria-label="Remove reminder: ${esc(remLabel(x))}">${esc(remLabel(x))} <small>×</small></button>`).join("") || `<span class="note">No reminders.</span>`;
  $("#d-rem-n").innerHTML = (explicit ? `<button type="button" class="linkb" id="d-rem-def">Use my default for ${esc(r.type)}</button>` : `Default for ${esc(r.type)}`)
    + (Settings.get().remind.topic ? "" : ` · <button type="button" class="linkb" id="d-rem-setup">Set up phone notifications</button>`);
  $("#d-rem-add").innerHTML = `<option value="">+ Add a reminder</option>${REM_OPTS.map(([m, n]) => `<option value="${m}">${n}</option>`).join("")}<option value="at">Pick a date and time…</option>`;
}
function setItemReminders(list){ commit({reminders:list}); renderItemReminders(); }
$("#d-rem-list").addEventListener("click", e => { const b = e.target.closest("[data-rmx]"); if (!b) return; const r = cur(); setItemReminders(Rem.listFor(r).filter(x => x.id !== b.dataset.rmx).map(x => x.at ? {id:x.id, at:x.at} : {id:x.id, off:x.off})); });
$("#d-rem-add").addEventListener("change", e => {
  const v = e.target.value; e.target.value = ""; if (v === "") return;
  if (v === "at"){ const r = cur(); $("#d-rem-at").value = `${r.date}T${r.time || Settings.get().remind.dayTime || "09:00"}`; $("#d-rem-at").hidden = $("#d-rem-ok").hidden = false; $("#d-rem-at").focus(); return; }
  const r = cur(), list = Rem.listFor(r).map(x => x.at ? {id:x.id, at:x.at} : {id:x.id, off:x.off});
  if (!list.some(x => x.off === +v)) list.push({id:uid(), off:+v});
  setItemReminders(list.sort((a, b) => (b.off ?? -1) - (a.off ?? -1)));
});
$("#d-rem-ok").onclick = () => {
  const v = $("#d-rem-at").value; if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return;
  const r = cur(), list = Rem.listFor(r).map(x => x.at ? {id:x.id, at:x.at} : {id:x.id, off:x.off});
  list.push({id:uid(), at:v.slice(0, 16)}); $("#d-rem-at").hidden = $("#d-rem-ok").hidden = true; setItemReminders(list);
};
$("#d-rem-n").addEventListener("click", e => {
  if (e.target.closest("#d-rem-def")){ commit({reminders:null}); renderItemReminders(); }
  if (e.target.closest("#d-rem-setup")){ $("#dlg-item").close(); openSettings("remind"); }
});
