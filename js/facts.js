/* Homebase: DAILY FACTS (Ollama).
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   DAILY FACTS: a month of facts at a time from your local Ollama model,
   stored with your synced data (one record per day).
   ===================================================================== */
const FactDays = DocStore("homebase.facts.v1", "factday");
const Facts = (() => {
  let run = null, view = null;
  const stockedThrough = () => FactDays.all().map(o => o.id).filter(d => d >= todayS()).sort().pop() || null;
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 70);
  function status(t){ const el = $("#fx-st"); if (el) el.textContent = t; }
  async function ask(prompt, signal){
    const ai = Settings.get().ai, fs = Settings.get().facts;
    const url = String(ai.localUrl || "http://localhost:11434").replace(/\/+$/, "") + "/api/chat";
    let r;
    try {
      r = await fetch(url, {method:"POST", signal, headers:{"content-type":"application/json"}, body:JSON.stringify({model:fs.model || ai.localModel || "llama3.1", stream:false, format:"json",
        options:{temperature:0.85}, messages:[{role:"user", content:prompt}]})});
    } catch(e){ if (e.name === "AbortError") throw e; throw new Error(`Couldn't reach Ollama at ${url}. Run this on the laptop with Ollama open, and set OLLAMA_ORIGINS (see AI-assisted import below).`); }
    if (!r.ok) throw new Error(`Ollama error ${r.status}: ${(await r.text()).slice(0, 140)}`);
    const j = await r.json(), txt = (j.message && j.message.content) || j.response || "";
    let o; try { o = JSON.parse(txt); } catch(e){ const m = txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/); o = m ? JSON.parse(m[0]) : null; }
    const arr = Array.isArray(o) ? o : o && (o.facts || o.items || Object.values(o).find(Array.isArray)) || [];
    return arr.map(x => typeof x === "string" ? {text:x} : x).filter(x => x && typeof x.text === "string");
  }
  async function refill(){
    if (run) return;
    const fs = Settings.get().facts, topics = (fs.topics || []).filter(Boolean);
    if (!topics.length){ status("Add at least one topic first."); return; }
    const per = Math.min(5, Math.max(1, +fs.perDay || 3)), DAYS = 30, need = DAYS * per;
    const last = stockedThrough(), start = last ? addDays(last, 1) : todayS();
    const used = new Set(FactDays.all().flatMap(o => (o.d.facts || []).map(f => norm(f.text))));
    const avoid = FactDays.all().sort((a, b) => b.id.localeCompare(a.id)).flatMap(o => (o.d.facts || []).map(f => f.text)).slice(0, 40);
    const got = [], ctl = new AbortController(); run = ctl;
    $("#fx-refill").disabled = true; $("#fx-cancel").hidden = false;
    try {
      for (let tries = 0; got.length < need && tries < Math.ceil(need / 15) * 2 + 2; tries++){
        status(`Asking your local model… ${got.length} of ${need} facts`);
        const n = Math.min(15, need - got.length + 3);
        const prompt = `Write ${n} interesting, surprising and accurate facts. Spread them evenly across these topics: ${topics.map(t => `"${t}"`).join(", ")}.
Rules: each fact is one or two plain sentences, under 220 characters, self-contained, specific (names, numbers, places), and true. No opinions, no "Did you know", no numbering.
${avoid.length || got.length ? `Do not repeat any of these:\n${[...avoid, ...got.map(g => g.text)].slice(-50).map(t => "- " + t).join("\n")}\n` : ""}Reply with JSON only, exactly in this form: {"facts":[{"topic":"<one of the topics>","text":"<the fact>"}]}`;
        const list = await ask(prompt, ctl.signal);
        for (const f of list){
          const text = String(f.text).replace(/\s+/g, " ").trim(); if (text.length < 25 || text.length > 400) continue;
          const k = norm(text); if (used.has(k)) continue; used.add(k);
          const t = topics.find(x => x.toLowerCase() === String(f.topic || "").toLowerCase().trim()) || topics.find(x => String(f.topic || "").toLowerCase().includes(x.toLowerCase())) || topics[got.length % topics.length];
          got.push({topic:t, text});
        }
      }
      if (!got.length) throw new Error("The model didn't return any usable facts. Try again, or try a different model.");
      /* Spread topics across each day. */
      const q = new Map(topics.map(t => [t, got.filter(g => g.topic === t)]));
      const days = Math.min(DAYS, Math.floor(got.length / per)) || 1, out = [];
      for (let i = 0; i < days; i++){
        const facts = [];
        for (let k = 0; facts.length < per && k < topics.length * 3; k++){ const list = q.get(topics[(i + k) % topics.length]); if (list && list.length) facts.push(list.shift()); }
        if (!facts.length) break;
        out.push([addDays(start, i), {date:addDays(start, i), facts}]);
      }
      FactDays.putMany(out);
      FactDays.delMany(FactDays.all().map(o => o.id).filter(d => d < addDays(todayS(), -14)));
      status(`Added ${plural(out.length, "day")} of facts. Stocked through ${fmtDate(stockedThrough(), {month:"short", day:"numeric"})}.`);
    } catch(e){ status(e.name === "AbortError" ? "Stopped. Nothing was saved." : e.message); }
    finally { run = null; $("#fx-refill").disabled = false; $("#fx-cancel").hidden = true; }
  }
  function widget(it){
    const day = FactDays.get(todayS()), facts = day ? day.facts || [] : [], thru = stockedThrough();
    return `<section class="tile tinted mw facts-w" aria-label="Daily facts"><h2><span>Daily facts</span><span class="fx-when mono" data-drop="2">${fmtDate(todayS(), {month:"short", day:"numeric"})}</span></h2>
      ${facts.length ? `<ul class="fx-list" data-fitlist data-min="1">${facts.map(f => `<li><span class="fx-tp">${esc(f.topic || "")}</span><span class="fx-tx">${esc(f.text)}</span></li>`).join("")}<li class="fit-more"><span class="more-link">See all<span data-more-n></span></span></li></ul>`
        : `<p class="note">No facts for today yet. On your laptop, open Settings → Daily facts and press Refill.</p>`}
      ${thru ? `<p class="note fx-foot" data-drop="1">Stocked through ${fmtDate(thru, {month:"short", day:"numeric"})}</p>` : ""}</section>`;
  }
  function openDialog(day){
    view = day || todayS(); drawDialog(); const d = $("#dlg-facts"); if (!d.open) d.showModal();
  }
  function drawDialog(){
    const day = FactDays.get(view), facts = day ? day.facts || [] : [];
    const ids = FactDays.all().map(o => o.id).sort();
    $("#fx-day").textContent = view === todayS() ? "Today" : fmtDate(view, {weekday:"long", month:"short", day:"numeric"});
    $("#fx-full").innerHTML = facts.length ? facts.map(f => `<li><span class="fx-tp">${esc(f.topic || "")}</span><p>${esc(f.text)}</p></li>`).join("") : `<li class="note">No facts saved for this day.</li>`;
    $("#fx-prev").disabled = !ids.some(d => d < view); $("#fx-next").disabled = !ids.some(d => d > view);
  }
  $("#fx-prev").onclick = () => { const p = FactDays.all().map(o => o.id).filter(d => d < view).sort().pop(); if (p){ view = p; drawDialog(); } };
  $("#fx-next").onclick = () => { const n = FactDays.all().map(o => o.id).filter(d => d > view).sort()[0]; if (n){ view = n; drawDialog(); } };
  $("#fx-settings").onclick = () => { $("#dlg-facts").close(); openSettings("facts"); };
  function renderSettingsSec(){
    const fs = Settings.get().facts;
    $("#fx-topics").innerHTML = (fs.topics || []).map((t, i) => `<button type="button" data-fxdel="${i}" aria-label="Remove topic ${esc(t)}" title="Remove">${esc(t)} <small>×</small></button>`).join("") || `<span class="note">No topics yet.</span>`;
    $("#fx-per").value = String(fs.perDay || 3); $("#fx-model").value = fs.model || ""; $("#fx-model").placeholder = Settings.get().ai.localModel || "llama3.1";
    if (!run){ const t = stockedThrough(); status(t ? `Stocked through ${fmtDate(t, {month:"short", day:"numeric"})}.` : "Nothing stocked yet."); }
  }
  const addTopic = () => { const v = $("#fx-topic-in").value.trim(); if (!v) return; Settings.update(s => { if (!s.facts.topics.some(t => t.toLowerCase() === v.toLowerCase())) s.facts.topics.push(v); }); $("#fx-topic-in").value = ""; renderSettingsSec(); };
  $("#fx-topic-add").onclick = addTopic;
  $("#fx-topic-in").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); addTopic(); } });
  $("#fx-topics").addEventListener("click", e => { const b = e.target.closest("[data-fxdel]"); if (!b) return; Settings.update(s => { s.facts.topics.splice(+b.dataset.fxdel, 1); }); renderSettingsSec(); });
  $("#fx-per").addEventListener("change", e => Settings.update(s => { s.facts.perDay = +e.target.value; }));
  $("#fx-model").addEventListener("change", e => Settings.update(s => { s.facts.model = e.target.value.trim(); }));
  $("#fx-refill").onclick = refill;
  $("#fx-cancel").onclick = () => { if (run) run.abort(); };
  FactDays.subscribe(() => { if (ready) Home.refresh(); if ($("#dlg-facts").open) drawDialog(); });
  return {widget, openDialog, renderSettingsSec};
})();

