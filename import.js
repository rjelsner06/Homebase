/* Homebase: AI ASSIST + IMPORT: PDF tables, CSV, .ics, paste/screenshot, review.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   AI ASSIST (optional). One module, one adapter per option. To add a
   provider, add an adapter with complete(prompt, cfg) → Promise<string>
   and a button in Settings. Keys stay in this browser's localStorage.
   ===================================================================== */
const AI = (() => {
  const KEY = "homebase.ai.claudeKey";
  const getKey = () => { try { return localStorage.getItem(KEY) || ""; } catch(e){ return ""; } };
  const setKey = k => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch(e){} };
  const adapters = {
    local: {
      label: "Local model",
      async complete(prompt, cfg, opts = {}){
        const url = String(cfg.localUrl || "http://localhost:11434").replace(/\/+$/, "") + "/api/chat";
        let r;
        try {
          r = await fetch(url, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({
            model:cfg.localModel || "llama3.1", stream:false, format:"json", options:{temperature:0}, messages:[{role:"user", content:prompt, ...(opts.images && opts.images.length ? {images:opts.images.map(i => i.data)} : {})}]})});
        } catch(e){ throw new Error(`Couldn't reach ${url}. Is the model running on this computer, and is OLLAMA_ORIGINS set so browsers may call it?`); }
        if (!r.ok) throw new Error(`Local model error ${r.status}: ${(await r.text()).slice(0, 160)}`);
        const j = await r.json(); return (j.message && j.message.content) || j.response || "";
      },
    },
    claude: {
      label: "Claude API",
      async complete(prompt, cfg, opts = {}){
        const key = getKey(); if (!key) throw new Error("Add your Claude API key in Settings first.");
        let r;
        try {
          r = await fetch("https://api.anthropic.com/v1/messages", {method:"POST", headers:{"content-type":"application/json", "x-api-key":key,
            "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true"},
            body:JSON.stringify({model:cfg.claudeModel || "claude-sonnet-5-5", max_tokens:16000, messages:[{role:"user", content: opts.images && opts.images.length
              ? [...opts.images.map(i => ({type:"image", source:{type:"base64", media_type:i.mediaType, data:i.data}})), {type:"text", text:prompt}] : prompt}]})});
        } catch(e){ throw new Error("Couldn't reach the Claude API. Check your connection."); }
        if (!r.ok){ let m = ""; try { m = (await r.json()).error.message; } catch(e){} throw new Error(`Claude API error ${r.status}${m ? ": " + m : ""}`); }
        const j = await r.json(); return (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      },
    },
  };
  return {
    adapters, getKey, setKey,
    mode: () => Settings.get().ai.mode,
    enabled: () => !!adapters[Settings.get().ai.mode],
    label: () => (adapters[Settings.get().ai.mode] || {}).label || "Off",
    complete(prompt, opts){ const cfg = Settings.get().ai, a = adapters[cfg.mode]; if (!a) throw new Error("AI is off. Turn it on in Settings."); return a.complete(prompt, cfg, opts || {}); },
  };
})();

function renderAISettings(){
  const ai = Settings.get().ai;
  $$("#st-ai-mode [data-ai]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ai === ai.mode)));
  $("#st-ai-local").hidden = ai.mode !== "local"; $("#st-ai-claude").hidden = ai.mode !== "claude"; $("#st-ai-test-row").hidden = ai.mode === "off";
  $("#st-ai-url").value = ai.localUrl; $("#st-ai-model").value = ai.localModel; $("#st-ai-cmodel").value = ai.claudeModel;
  const has = !!AI.getKey();
  $("#st-ai-key").value = ""; $("#st-ai-key").placeholder = has ? "Saved in this browser (hidden)" : "sk-ant-…";
  $("#st-ai-forget").hidden = !has;
}
$("#st-ai-mode").addEventListener("click", e => { const b = e.target.closest("[data-ai]"); if (!b) return; Settings.update(s => { s.ai.mode = b.dataset.ai; }); $("#st-ai-st").textContent = ""; renderAISettings(); });
[["#st-ai-url","localUrl"],["#st-ai-model","localModel"],["#st-ai-cmodel","claudeModel"]].forEach(([id, k]) => $(id).addEventListener("change", e => { const v = e.target.value.trim(); if (v) Settings.update(s => { s.ai[k] = v; }); renderAISettings(); }));
$("#st-ai-key").addEventListener("change", e => { const v = e.target.value.trim(); if (v){ AI.setKey(v); toast("API key saved in this browser"); } renderAISettings(); });
$("#st-ai-forget").onclick = () => { AI.setKey(""); renderAISettings(); toast("API key removed from this browser"); };
$("#st-ai-test").onclick = async () => {
  const st = $("#st-ai-st"); st.textContent = `Testing ${AI.label()}…`;
  try { const out = await AI.complete('Reply with exactly this JSON and nothing else: {"ok":true}'); st.textContent = /ok/i.test(out) ? "Connected." : "Connected, but the reply looked odd: " + trunc(out, 60); }
  catch(e){ st.textContent = e.message; }
};

/* =====================================================================
   IMPORT: PDF tables, CSV, .ics, with an optional AI pass.
   Nothing is added until you press Add on the review screen.
   ===================================================================== */
const IMP = ImportCore;
const guessType = IMP.guessType;
const status = (msg, err) => { $("#status").textContent = msg; $("#status").className = "status" + (err?" err":""); };
$("#btn-import-top").onclick = () => $("#file").click();
$("#file").addEventListener("change", e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; });
const drop = $("#drop");
["dragenter","dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

/* ---------- conversion prompt ---------- */
function openPrompt(){ $("#pr-text").value = IMP.conversionPrompt(); $("#pr-st").textContent = ""; $("#dlg-prompt").showModal(); }
$("#btn-prompt").onclick = openPrompt;
$("#rv-prompt").onclick = openPrompt;
$("#pr-copy").onclick = async () => {
  const ta = $("#pr-text");
  try { await navigator.clipboard.writeText(ta.value); }
  catch(e){ ta.focus(); ta.select(); try { document.execCommand("copy"); } catch(_){} }
  $("#pr-st").textContent = "Copied. Paste it into a Claude chat with your PDF attached.";
};

/* ---------- readers ---------- */
async function pdfPages(file){
  if (!window.pdfjsLib) throw new Error("The PDF reader didn't load. Check your connection and try again.");
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch(e){}
  const pdf = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++){
    const pg = await pdf.getPage(p), vp = pg.getViewport({scale:1}), tc = await pg.getTextContent();
    pages.push({page:p, height:vp.height, items:tc.items.map(i => ({str:i.str, x:i.transform[4], y:i.transform[5], w:i.width, h:i.height || Math.abs(i.transform[3])}))});
  }
  return pages;
}
function parseICS(text){
  const lines = text.replace(/\r?\n[ \t]/g,"").split(/\r?\n/); const out = []; let cur = null;
  const un = s => s.replace(/\\n/gi," ").replace(/\\([,;\\])/g,"$1").trim();
  const dt = v => { const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/); if (!m) return null;
    return {d: m[4] ? (m[7] ? new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5])) : new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5])) : new Date(+m[1],+m[2]-1,+m[3]), timed:!!m[4]}; };
  for (const l of lines){
    if (l === "BEGIN:VEVENT") cur = {};
    else if (l === "END:VEVENT"){ if (cur && cur.date) out.push(cur); cur = null; }
    else if (cur){
      const v = l.slice(l.indexOf(":")+1);
      if (/^SUMMARY[;:]/.test(l)) cur.title = un(v);
      else if (/^LOCATION[;:]/.test(l)) cur.location = un(v);
      else if (/^DTSTART[;:]/.test(l)){ const x = dt(v); if (x){ cur.date = ymd(x.d); cur.time = x.timed ? `${pad(x.d.getHours())}:${pad(x.d.getMinutes())}` : ""; } }
      else if (/^DTEND[;:]/.test(l)){ const x = dt(v); if (x && x.timed) cur.endTime = `${pad(x.d.getHours())}:${pad(x.d.getMinutes())}`; }
    }
  }
  return out.map(e => { const title = e.title || "Untitled event";
    return {date:e.date, time:e.time, endTime:e.endTime || "", location:e.location || "", title:title.length>90?title.slice(0,87)+"…":title, type:guessType(title), src:"From calendar file"}; })
    .sort((a,b)=>a.date.localeCompare(b.date));
}

/* ---------- per-course import setup (columns + class time), remembered ---------- */
const courseKey = c => IMP.normLabel(c);
const profileFor = c => (c && Settings.get().importProfiles[courseKey(c)]) || null;
function saveProfile(course, patch){
  if (!course) return;
  Settings.update(s => { const k = courseKey(course); s.importProfiles[k] = {...(s.importProfiles[k] || {}), ...patch}; });
}

/* ---------- import state ---------- */
const imp = {tab:"all", kind:"", fileName:"", lines:null, csv:null, hIdx:-1, cols:[], year:null, text:"", mode:"", rulesPending:null, dupMode:"skip", profileNote:""};
const ct = {days:new Set(), start:"", end:""};   // class meeting time for lectures/reviews
let pending = [];
const rvSel = new RowSelection();
let rvOrder = [];
const RV_GROUPS = ["Lecture","Recitation","Exam","Quiz","Review","No Class","Homework","Lab","Project","Reading","Event","Task","Other"];
const RV_PLURAL = {Recitation:"Recitations", Lecture:"Lectures", Exam:"Exams", Quiz:"Quizzes", Review:"Reviews", "No Class":"No Class", Homework:"Homework", Lab:"Labs", Project:"Projects", Reading:"Readings", Event:"Events", Task:"Tasks", Other:"Other"};
const CT_DAYS = [[1,"M"],[2,"T"],[3,"W"],[4,"R"],[5,"F"],[6,"S"],[0,"U"]];
const CT_TYPES = new Set(["Lecture","Review"]);
/* A No Class row with a course only cancels that course; breaks and holidays cancel the whole day. */
const RX_BREAK = /\b(break|holiday|recess|thanksgiving|labor day|memorial day|independence|mlk|martin luther|reading day|vacation|campus closed|university closed|no classes)\b/i;
const ncAllOf = p => typeof p.ncAll === "boolean" ? p.ncAll : RX_BREAK.test(p.title || "");
const toPending = x => ({id:uid(), category:"School", course:"", priority:"None", flagged:false, completed:false, notes:"", location:"", reading:"", lectureNumber:null, time:"", endTime:"", ...x, needsDate:!x.date});

const rvBulk = makeBulk($("#rv-bulk"), {deleteLabel:"Remove from import", apply(k, v){
  if (k === "delete"){ pending = pending.filter(p => !rvSel.ids.has(p.id)); rvSel.clear(); }
  else pending.forEach(p => { if (rvSel.ids.has(p.id)){ Object.assign(p, bulkPatch(p, k, v)); p.needsDate = !p.date; } });
  renderReview();
}});
rvBulk.onClear(() => { rvSel.clear(); syncReviewSel(); });

function colsFromHeader(){
  const prof = profileFor($("#rv-course").value.trim()), saved = prof && prof.roles || {};
  if (imp.kind === "pdf"){ const l = imp.lines[imp.hIdx]; imp.cols = l ? IMP.headerCols(l) : []; }
  else if (imp.kind === "csv"){ const r = imp.csv[imp.hIdx] || []; imp.cols = r.map(label => ({label, role:IMP.roleOf(label) || "ignore"})); }
  imp.cols.forEach(c => { const s = saved[IMP.normLabel(c.label)]; if (s && IMP.ROLES.includes(s)) c.role = s; });
}
function applyProfile(course){
  const prof = profileFor(course); imp.profileNote = "";
  if (!prof) return false;
  if (prof.classTime){ ct.days = new Set(prof.classTime.days || []); ct.start = prof.classTime.start || ""; ct.end = prof.classTime.end || ""; }
  if (prof.header && (imp.kind === "pdf" || imp.kind === "csv")){
    const k = IMP.normLabel(prof.header);
    const idx = imp.kind === "pdf" ? imp.lines.findIndex(l => IMP.normLabel(l.text) === k) : imp.csv.findIndex(r => IMP.normLabel(r.join(" ")) === k);
    if (idx >= 0) imp.hIdx = idx;
  }
  imp.profileNote = `Using your saved setup for ${course}.`;
  return true;
}

/* Re-reads the file with the current header row and column roles. */
function runImport(){
  const resolve = IMP.dateResolver(imp.year, new Date());
  let items = [];
  if (imp.kind === "pdf"){
    if (imp.hIdx >= 0 && imp.cols.some(c => c.role === "date")){
      imp.mode = "table";
      items = IMP.tableRows(imp.lines, imp.hIdx, imp.cols).rows.flatMap(r => IMP.classifyRow(r.cells, {resolve}));
    } else { imp.mode = "lines"; items = IMP.looseLines(imp.lines, resolve); }
  } else if (imp.kind === "text"){
    imp.mode = "text";
    items = IMP.textRows(imp.lines).rows.flatMap(r => IMP.classifyRow(r.cells, {resolve}));
    if (!items.length){ imp.mode = "lines"; items = IMP.looseLines(imp.lines, resolve); }
  } else if (imp.kind === "csv"){
    imp.mode = "table";
    items = IMP.csvRows(imp.csv, imp.hIdx, imp.cols).flatMap(r => IMP.classifyRow(r.cells, {resolve}));
  }
  setPending(items);
}
function setPending(items){
  pending = items.map(toPending); imp.tab = "all";
  rvSel.clear(); pending.forEach(p => rvSel.ids.add(p.id));
  renderReview();
}

function resetImport(name){
  Object.assign(imp, {kind:"", fileName:name, lines:null, csv:null, hIdx:-1, cols:[], year:null, text:"", mode:"", rulesPending:null, dupMode:"skip", profileNote:"", image:null, columnar:false});
  ct.days = new Set(); ct.start = ""; ct.end = ""; $("#rv-readtodo").checked = false; $("#rv-ai-st").textContent = "";
}
async function handleFile(f){
  const name = f.name.toLowerCase();
  if ((f.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)){ openPaste(f); return; }   // screenshots go through text recognition
  resetImport(f.name);
  let course = "";
  const fileCourse = () => { const g = f.name.match(/\b([A-Z]{2,5})[\s_-]?(\d{3,5})\b/i); return g ? `${g[1].toUpperCase()} ${g[2]}` : ""; };
  try {
    if (name.endsWith(".ics") || f.type === "text/calendar"){
      status("Reading calendar file…");
      const found = parseICS(await f.text());
      imp.kind = "ics"; imp.mode = "ics"; imp.text = found.map(x => `${x.date} ${x.time} ${x.title} ${x.location}`).join("\n");
      course = fileCourse(); $("#rv-course").value = course; applyProfile(course);
      if (!found.length){ status(`No events found in ${f.name}.`, true); return; }
      setPending(found);
    } else if (name.endsWith(".csv") || name.endsWith(".tsv") || f.type === "text/csv"){
      status("Reading CSV…");
      const text = await f.text(); imp.kind = "csv"; imp.csv = IMP.parseCSV(text); imp.text = text;
      if (imp.csv.length < 2){ status(`${f.name} has no rows to import.`, true); return; }
      imp.year = IMP.docYear(text).year; imp.hIdx = IMP.csvHeaderIndex(imp.csv);
      course = fileCourse(); $("#rv-course").value = course; applyProfile(course);
      colsFromHeader(); runImport();
    } else if (name.endsWith(".pdf") || f.type === "application/pdf"){
      status("Reading PDF…");
      imp.kind = "pdf"; imp.lines = IMP.buildLines(await pdfPages(f));
      if (!imp.lines.length){ status("This PDF has no text to read. If it's a scanned image, try the conversion prompt or AI instead.", true); return; }
      imp.text = imp.lines.map(l => (l.i && l.page !== imp.lines[l.i - 1].page ? `\n[page ${l.page}]\n` : "") + l.text).join("\n");
      imp.year = IMP.docYear(imp.lines.map(l => l.text).join("\n")).year;
      imp.hIdx = IMP.findHeader(imp.lines);
      course = IMP.guessCourse(imp.lines, imp.hIdx, f.name); $("#rv-course").value = course; applyProfile(course);
      colsFromHeader(); runImport();
    } else { status("That file type isn't supported. Use a PDF, a CSV, or an .ics calendar file.", true); return; }
  } catch(err){ console.error(err); status(err.message || "Couldn't read that file.", true); return; }
  status("");
  if (!pending.length && imp.kind !== "pdf"){ status(`Nothing to import from ${f.name}. You can add items by hand instead.`, true); return; }
  $("#rv-cols").open = imp.kind === "pdf" && imp.mode !== "table";
  $("#dlg-review").showModal();
}

/* ---------- paste text or a screenshot ---------- */
const pz = {image:null, busy:false};
let tessLoad;
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the text-recognition tool. Check your internet connection.")); document.head.appendChild(s); }); }
/* Free, in-browser text recognition (Tesseract). Small screenshots are enlarged first, which helps accuracy a lot. */
async function ocrImage(blob, onProgress){
  if (!window.Tesseract) await (tessLoad ||= loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"));
  const bmp = await createImageBitmap(blob), k = bmp.width < 1600 ? Math.min(2.5, 2400 / bmp.width) : 1;
  let src = blob;
  if (k > 1.05){ const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, c.width, c.height); src = c; }
  const w = await Tesseract.createWorker("eng", 1, {logger: m => { if (m.status === "recognizing text") onProgress(m.progress); }});
  try { await w.setParameters({preserve_interword_spaces:"1", tessedit_pageseg_mode:"6"}); /* one block keeps each table row on one line */ const {data} = await w.recognize(src); return data.text; }
  finally { await w.terminate(); }
}
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });
const pzStatus = (m, err) => { $("#pz-st").textContent = m; $("#pz-st").className = "status" + (err ? " err" : ""); };
function openPaste(img){
  $("#pz-text").value = ""; pz.image = null; $("#pz-img").hidden = true; $("#pz-img").removeAttribute("src"); pzStatus("");
  if (!$("#dlg-paste").open) $("#dlg-paste").showModal();
  if (img) usePzImage(img); else $("#pz-text").focus();
}
async function usePzImage(blob){
  if (pz.busy) return;
  if (!/^image\//.test(blob.type)){ pzStatus("That isn't an image. Paste a screenshot (PNG or JPG) or text.", true); return; }
  pz.busy = true; $("#pz-go").disabled = true;
  const url = URL.createObjectURL(blob); $("#pz-img").src = url; $("#pz-img").hidden = false;
  try {
    pz.image = {mediaType:blob.type === "image/jpg" ? "image/jpeg" : blob.type, data:await blobToB64(blob)};
    pzStatus("Reading text from the screenshot… (the first time takes a little longer)");
    const text = await ocrImage(blob, p => pzStatus(`Reading text from the screenshot… ${Math.round(p * 100)}%`));
    $("#pz-text").value = text.trim();
    pzStatus(text.trim() ? "Done. Check the text below if you like, then press Find dates." : "No text found in that image. Try a sharper screenshot, or use Improve with AI on the next screen.", !text.trim());
  } catch(e){ pzStatus(e.message || "Couldn't read that image.", true); }
  pz.busy = false; $("#pz-go").disabled = false;
}
$("#btn-paste").onclick = () => openPaste();
$("#pz-pick").onclick = () => $("#pz-file").click();
$("#pz-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) usePzImage(f); e.target.value = ""; });
$("#dlg-paste").addEventListener("paste", e => {
  const it = [...(e.clipboardData.items || [])].find(i => i.type.startsWith("image/"));
  if (it){ e.preventDefault(); usePzImage(it.getAsFile()); }
});
const pzDrop = $("#pz-zone");
["dragenter","dragover"].forEach(t => pzDrop.addEventListener(t, e => { e.preventDefault(); pzDrop.classList.add("over"); }));
["dragleave","drop"].forEach(t => pzDrop.addEventListener(t, e => { e.preventDefault(); pzDrop.classList.remove("over"); }));
pzDrop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) usePzImage(f); });
$("#form-paste").addEventListener("submit", e => {
  e.preventDefault();
  if (pz.busy){ pzStatus("Still reading the screenshot…"); return; }
  const text = $("#pz-text").value;
  if (!text.trim() && !pz.image){ pzStatus("Paste some text or a screenshot first.", true); $("#pz-text").focus(); return; }
  if (!text.trim() && pz.image && !AI.enabled()){ pzStatus("No text was found in the screenshot. Turn on AI in Settings to read it with a model instead.", true); return; }
  handleText(text, pz.image ? "Screenshot" : "Pasted text", pz.image);
});
function handleText(text, name, image){
  resetImport(name); imp.image = image || null; imp.text = text;
  const tabbed = text.split("\n").filter(l => l.includes("\t")).length >= 3;
  if (tabbed){                                   // copied from a spreadsheet or a web table
    imp.kind = "csv"; imp.csv = IMP.parseCSV(text, "\t"); imp.year = IMP.docYear(text).year; imp.hIdx = IMP.csvHeaderIndex(imp.csv);
    $("#rv-course").value = ""; colsFromHeader(); runImport();
  } else {
    imp.kind = "text"; imp.lines = IMP.textLines(text); imp.year = IMP.docYear(text).year; imp.columnar = IMP.looksColumnar(imp.lines);
    const course = IMP.guessCourse(imp.lines, IMP.findHeader(imp.lines), ""); $("#rv-course").value = course; applyProfile(course);
    runImport();
  }
  $("#dlg-paste").close();
  $("#rv-cols").open = false;
  $("#dlg-review").showModal();
}

/* ---------- duplicates ---------- */
const dupKey = (course, date, title) => `${courseKey(course)}|${date}|${String(title).trim().toLowerCase()}`;
function existingIndex(){ const m = new Map(); for (const r of Store.all()) m.set(dupKey(r.course, r.date, r.title), r.id); return m; }
function dupOf(p, idx){ return p.date ? idx.get(dupKey($("#rv-course").value.trim(), p.date, p.title)) || null : null; }

/* ---------- class time ---------- */
const ctApplies = p => !!ct.start && CT_TYPES.has(p.type) && !p.time && p.date && (!ct.days.size || ct.days.has(parseYmd(p.date).getDay()));
function readingTodoFor(p){
  if (p.type !== "Lecture" || !p.reading || !p.date || addDays(p.date, -1) < todayS()) return null;   // only for lectures still ahead
  const what = p.reading.replace(/^text\s+/i, "");
  return {title:`Read ${what} before ${p.lectureNumber != null ? "Lecture " + p.lectureNumber : trunc(p.title, 40)}`, date:addDays(p.date, -1)};
}

/* ---------- render ---------- */
function renderReview(){
  const idx = existingIndex(), course = $("#rv-course").value.trim();
  const groups = RV_GROUPS.map(g => ({g, label:RV_PLURAL[g], list:pending.filter(p => p.date && p.type === g).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""))}))
    .concat(pending.some(p => p.date && !RV_GROUPS.includes(p.type)) ? [{g:"_x", label:"Other", list:pending.filter(p => p.date && !RV_GROUPS.includes(p.type))}] : [])
    .concat([{g:"_nd", label:"Needs a date", list:pending.filter(p => !p.date)}]).filter(x => x.list.length);

  $("#rv-title").textContent = `Review ${plural(pending.length, "item")}`;
  const src = {pdf: imp.mode === "table" ? "Read from the schedule table" : "No schedule table found, so dates were picked out line by line", csv:"Read from the CSV columns", ics:"Read from the calendar file", text: imp.image ? "Read from the screenshot with text recognition. Check spellings, numbers and dates before adding" : imp.mode === "lines" ? "No schedule rows found, so dates were picked out line by line" : "Read row by row from the pasted text", ai:"Rebuilt by AI (" + AI.label() + "). Check it before adding"}[imp.mode === "ai" ? "ai" : imp.kind] || "";
  $("#rv-note").textContent = `${imp.fileName}: ${src}.${imp.profileNote ? " " + imp.profileNote : ""} Only selected rows are added.` +
    (imp.columnar && imp.mode !== "ai" ? " This text looks like it was copied one column at a time, so rows can't be matched up reliably. A screenshot of the table works better, or try Improve with AI." : "");
  if (imp.tab !== "all" && !groups.some(x => x.g === imp.tab)) imp.tab = "all";
  const shown = imp.tab === "all" ? groups : groups.filter(x => x.g === imp.tab);
  rvOrder = shown.flatMap(x => x.list.map(p => p.id));
  $("#rv-counts").innerHTML = `<button type="button" data-tab="all" style="--tc:var(--accent)" aria-pressed="${imp.tab === "all"}">All <b>${pending.length}</b></button>` +
    groups.map(x => `<button type="button" data-tab="${esc(x.g)}" style="--tc:${x.g.startsWith("_") ? "var(--warn)" : TYPE_VAR(x.g)}" aria-pressed="${imp.tab === x.g}"><i></i>${esc(x.label)} <b>${x.list.length}</b></button>`).join("");

  /* columns panel */
  const tabular = (imp.kind === "pdf" || imp.kind === "csv") && imp.mode !== "ai";
  $("#rv-cols").hidden = !tabular;
  if (tabular){
    const opts = imp.kind === "pdf"
      ? imp.lines.filter(l => !l.junk).slice(0, 150).map(l => [l.i, `p${l.page}: ${trunc(l.text, 80)}`])
      : imp.csv.slice(0, 15).map((r, i) => [i, `Row ${i + 1}: ${trunc(r.join(" | "), 80)}`]);
    $("#rv-hdr").innerHTML = (imp.hIdx < 0 ? `<option value="-1">None found. Pick the table's header row</option>` : "") + opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
    $("#rv-hdr").value = String(imp.hIdx);
    $("#rv-colmap").innerHTML = imp.cols.length ? imp.cols.map((c, i) => `<label class="cm"><span title="${esc(c.label)}">${esc(trunc(c.label, 22) || "(blank)")}</span><select data-ci="${i}">${IMP.ROLES.map(r => `<option value="${r}" ${r === c.role ? "selected" : ""}>${IMP.ROLE_NAMES[r]}</option>`).join("")}</select></label>`).join("")
      : `<p class="note">Choose the header row above to set up columns.</p>`;
    $("#rv-cols-sum").textContent = imp.cols.length ? imp.cols.filter(c => c.role !== "ignore").map(c => IMP.ROLE_NAMES[c.role]).join(" · ") : "not found";
  }

  /* class time + readings */
  $("#rv-days").innerHTML = CT_DAYS.map(([d, l]) => `<button type="button" data-ctd="${d}" aria-pressed="${ct.days.has(d)}" aria-label="${DOW[d]}">${l}</button>`).join("");
  $("#rv-cs").value = ct.start; $("#rv-ce").value = ct.end;
  syncReviewNotes();

  /* list */
  let h = "";
  for (const x of shown){
    const gid = x.g.replace(/\W/g, "");
    h += `<li class="rv-grp" id="rvg-${gid}"><label><input type="checkbox" data-grp="${esc(x.g)}" aria-label="Select all ${esc(x.label)}"><span>${esc(x.label)}</span><b>${x.list.length}</b></label>${x.g === "_nd" ? `<span class="note">Set a date to add these. Rows left without one are skipped.</span>` : ""}</li>`;
    h += x.list.map(p => {
      const dup = dupOf(p, idx);
      const tr = p.time ? fmtTime(p.time) + (p.endTime ? "–" + fmtTime(p.endTime) : "") : "";
      const meta = [p.reading, tr, p.location, p.category !== "School" ? p.category : "", p.course && p.course !== course ? p.course : "", p.priority !== "None" ? p.priority + " priority" : "", p.flagged ? "Flagged" : "", p.notes ? "Note: " + trunc(p.notes, 40) : ""].filter(Boolean).join(" · ");
      return `<li data-rid="${p.id}" class="${dup ? "dup" : ""}"><input type="checkbox" data-sel="${p.id}" aria-label="Select"><input type="date" data-f="date" value="${p.date}" aria-label="Date"><input type="text" data-f="title" value="${esc(p.title)}" aria-label="Title"><select data-f="type" aria-label="Type">${typeOptions(p.type)}</select>${p.type === "No Class" ? `<select data-f="ncAll" aria-label="Who has no class"><option value="1" ${ncAllOf(p) ? "selected" : ""}>Whole day, every class</option><option value="" ${ncAllOf(p) ? "" : "selected"}>Only ${esc(course || "this course")}</option></select>` : ""}<span class="src" title="${esc(p.src || "")}">${dup ? `<span class="dupb">Already added</span>` : ""}${meta ? `<span class="rmeta">${esc(meta)}</span>` : ""}${esc(p.src || "")}</span></li>`;
    }).join("");
  }
  $("#rv-list").innerHTML = h || `<li class="empty">Nothing found yet. ${imp.kind === "pdf" ? "Pick the header row under Columns, or try Improve with AI." : ""}</li>`;

  /* duplicates bar */
  const nDup = pending.filter(p => dupOf(p, idx)).length;
  $("#rv-dup").hidden = !nDup;
  if (nDup) $("#rv-dup").innerHTML = `<span><b>${plural(nDup, "item")}</b> already on your calendar (same course, date and title).</span><div class="seg" role="group" aria-label="Duplicates"><button type="button" data-dup="skip" aria-pressed="${imp.dupMode === "skip"}">Skip them</button><button type="button" data-dup="update" aria-pressed="${imp.dupMode === "update"}">Update them</button></div>`;

  /* AI tools */
  $("#rv-ai").disabled = !AI.enabled() || (!imp.text && !imp.image);
  $("#rv-ai").title = AI.enabled() ? `Send the file's text to ${AI.label()} and rebuild this list` : "Turn on AI in Settings first";
  $("#rv-ai-undo").hidden = !imp.rulesPending;
  $("#rv-ai-mode").value = AI.mode();
  if (!AI.enabled()) $("#rv-ai-st").innerHTML = `Turn AI on to rebuild this list with a model. <button type="button" class="linkb" id="rv-ai-set">AI settings</button>`;
  else if (AI.mode() === "claude" && !AI.getKey()) $("#rv-ai-st").innerHTML = `Add your API key first. <button type="button" class="linkb" id="rv-ai-set">AI settings</button>`;
  else if (!/items from AI|Asking/.test($("#rv-ai-st").textContent)) $("#rv-ai-st").innerHTML = `Using ${esc(AI.label())}${AI.mode() === "local" ? " (" + esc(Settings.get().ai.localModel) + ")" : ""}. <button type="button" class="linkb" id="rv-ai-set">AI settings</button>`;
  syncReviewSel();
}
function syncReviewNotes(){
  const lec = pending.filter(p => CT_TYPES.has(p.type) && p.date), hit = lec.filter(ctApplies).length;
  $("#rv-ct-note").textContent = ct.start
    ? `${hit} of ${lec.length} lectures and reviews get this time${ct.end ? "" : " (add an end time for a duration)"}. The rest stay all-day.`
    : "Optional. Without a time, lectures and reviews are all-day items.";
  const nr = pending.filter(p => rvSel.ids.has(p.id) && readingTodoFor(p)).length;
  $("#rv-readtodo-n").textContent = nr ? `(${plural(nr, "to-do")}, for upcoming lectures)` : "(none: no upcoming lectures with readings)";
}
function syncReviewSel(){
  const ids = new Set(pending.map(p => p.id)); rvSel.prune([...ids]);
  $$("#rv-list [data-sel]").forEach(c => { c.checked = rvSel.ids.has(c.dataset.sel); c.closest("li").classList.toggle("sel", c.checked); });
  $$("#rv-list [data-grp]").forEach(c => setAllBox(c, rvSel.state(groupIds(c.dataset.grp))));
  setAllBox($("#rv-all"), rvSel.state(rvOrder));
  const idx = existingIndex(), sel = pending.filter(p => rvSel.ids.has(p.id));
  const dated = sel.filter(p => p.date), dups = dated.filter(p => dupOf(p, idx));
  const nNew = dated.length - dups.length, nUpd = imp.dupMode === "update" ? dups.length : 0;
  const b = $("#rv-add");
  b.textContent = nUpd ? `Add ${nNew} · update ${nUpd}` : `Add ${plural(nNew, "item")}`;
  b.disabled = !(nNew + nUpd);
  $("#rv-foot-note").textContent = [dups.length && imp.dupMode === "skip" ? `${dups.length} already added will be skipped` : "", sel.length - dated.length ? `${sel.length - dated.length} without a date will be skipped` : ""].filter(Boolean).join(" · ");
  rvBulk.show(sel.length);
  const vis = new Set(rvOrder), hiddenSel = sel.filter(p => !vis.has(p.id)).length;
  $("#rv-hidden-n").textContent = hiddenSel ? `${hiddenSel} more selected in other tabs.` : "";
  syncReviewNotes();
}
const groupIds = g => pending.filter(p => g === "_nd" ? !p.date : g === "_x" ? p.date && !RV_GROUPS.includes(p.type) : p.date && p.type === g).map(p => p.id);

/* ---------- review events ---------- */
$("#rv-list").addEventListener("click", e => {
  const c = e.target.closest("[data-sel]"); if (c){ rvSel.click(c.dataset.sel, e.shiftKey, rvOrder); syncReviewSel(); return; }
});
$("#rv-list").addEventListener("change", e => {
  const g = e.target.closest("[data-grp]"); if (g){ rvSel.setAll(groupIds(g.dataset.grp), g.checked); syncReviewSel(); return; }
  const f = e.target.dataset.f; if (!f) return;
  const p = pending.find(x => x.id === e.target.closest("li").dataset.rid); if (!p) return;
  if (f === "ncAll"){ p.ncAll = !!e.target.value; syncReviewSel(); return; }
  p[f] = e.target.value; if (f === "date") p.needsDate = !p.date;
  /* Dates fire "change" on every digit typed, so the list is regrouped only after you leave the date box. */
  if (f === "date"){ rvRegroup = true; syncReviewSel(); return; }
  if (f === "type") renderReview(); else syncReviewSel();
});
let rvRegroup = false;
$("#rv-list").addEventListener("focusout", e => {
  if (!rvRegroup || e.target.dataset.f !== "date") return;
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a.closest && a.closest("#rv-list") && a.dataset.f === "date") return;   // moved to another date box: wait
    rvRegroup = false;
    const box = $("#rv-list").closest(".dlg-b"), y = box ? box.scrollTop : 0, id = a && a.closest && a.closest("#rv-list li") ? a.closest("li").dataset.rid : null, f = a && a.dataset ? a.dataset.f : null;
    renderReview(); if (box) box.scrollTop = y;
    if (id && f){ const el = $(`#rv-list li[data-rid="${id}"] [data-f="${f}"]`); if (el) el.focus(); }
  }, 0);
});
$("#rv-list").addEventListener("input", e => { if (e.target.dataset.f !== "title") return; const p = pending.find(x => x.id === e.target.closest("li").dataset.rid); if (p) p.title = e.target.value; });
$("#rv-all").addEventListener("change", e => { rvSel.setAll(rvOrder, e.target.checked); syncReviewSel(); });
$("#rv-counts").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (!b) return; imp.tab = b.dataset.tab; renderReview(); const box = $("#rv-counts").closest(".dlg-b"), y = $("#rv-counts").offsetTop; if (box.scrollTop > y) box.scrollTop = y; });
$("#rv-dup").addEventListener("click", e => { const b = e.target.closest("[data-dup]"); if (!b) return; imp.dupMode = b.dataset.dup; $$("#rv-dup [data-dup]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); syncReviewSel(); });
$("#rv-course").addEventListener("input", () => { renderReviewSoon(); });
$("#rv-course").addEventListener("change", e => {
  const c = e.target.value.trim();
  if (profileFor(c) && imp.mode !== "ai"){ applyProfile(c); if (imp.kind === "pdf" || imp.kind === "csv"){ colsFromHeader(); runImport(); return; } }
  renderReview();
});
let rvTimer; const renderReviewSoon = () => { clearTimeout(rvTimer); rvTimer = setTimeout(renderReview, 250); };
$("#rv-days").addEventListener("click", e => { const b = e.target.closest("[data-ctd]"); if (!b) return; const d = +b.dataset.ctd; ct.days.has(d) ? ct.days.delete(d) : ct.days.add(d); b.setAttribute("aria-pressed", String(ct.days.has(d))); syncReviewNotes(); });
$("#rv-cs").addEventListener("change", e => { ct.start = e.target.value; syncReviewNotes(); });
$("#rv-ce").addEventListener("change", e => { ct.end = e.target.value; syncReviewNotes(); });
$("#rv-ct-clear").onclick = () => { ct.days.clear(); ct.start = ct.end = ""; renderReview(); };
$("#rv-hdr").addEventListener("change", e => { imp.hIdx = +e.target.value; colsFromHeader(); runImport(); });
$("#rv-colmap").addEventListener("change", e => { const s = e.target.closest("[data-ci]"); if (s) imp.cols[+s.dataset.ci].role = s.value; $("#rv-cols-sum").textContent = imp.cols.filter(c => c.role !== "ignore").map(c => IMP.ROLE_NAMES[c.role]).join(" · "); });
$("#rv-rerun").onclick = () => {
  runImport();
  const course = $("#rv-course").value.trim();
  if (course){ saveColumnSetup(course); imp.profileNote = `Column setup saved for ${course}.`; renderReview(); }
  toast(`Re-ran with these columns: ${plural(pending.length, "item")} found`);
};
function saveColumnSetup(course){
  if (!(imp.kind === "pdf" || imp.kind === "csv") || imp.hIdx < 0 || imp.mode === "ai") return;
  const header = imp.kind === "pdf" ? imp.lines[imp.hIdx].text : imp.csv[imp.hIdx].join(" ");
  saveProfile(course, {header, roles:Object.fromEntries(imp.cols.map(c => [IMP.normLabel(c.label), c.role]))});
}

/* ---------- AI pass ---------- */
$("#rv-ai").onclick = async () => {
  const b = $("#rv-ai"), st = $("#rv-ai-st");
  b.disabled = true; st.textContent = `Asking ${AI.label()}… this can take a minute.`;
  try {
    const txt = imp.image ? `(The schedule is in the attached screenshot. Text recognition read it as follows, possibly with mistakes; trust the image.)\n${imp.text || ""}` : imp.text;
    const prompt = IMP.aiPrompt(txt.slice(0, 60000), {year:imp.year, today:todayS()});
    const res = IMP.parseAIResult(await AI.complete(prompt, {images: imp.image ? [imp.image] : []}), {});
    if (!res.items.length) throw new Error("The model returned no items.");
    if (!imp.rulesPending) imp.rulesPending = {items:pending, mode:imp.mode};
    if (res.course && !$("#rv-course").value.trim()) $("#rv-course").value = res.course;
    imp.mode = "ai"; setPending(res.items);
    st.textContent = `${plural(res.items.length, "item")} from AI. Nothing is added until you press Add.`;
  } catch(e){ st.textContent = e.message || "The AI request failed."; }
  b.disabled = !AI.enabled();
};
$("#rv-ai-mode").addEventListener("change", e => { Settings.update(s => { s.ai.mode = e.target.value; }); $("#rv-ai-st").textContent = ""; renderReview(); });
$("#rv-ai-undo").onclick = () => {
  if (!imp.rulesPending) return;
  imp.mode = imp.rulesPending.mode; pending = imp.rulesPending.items; imp.rulesPending = null;
  rvSel.clear(); pending.forEach(p => rvSel.ids.add(p.id)); $("#rv-ai-st").textContent = ""; renderReview();
};
$("#form-review").addEventListener("click", e => { if (e.target.closest("#rv-ai-set")) openSettings("ai"); });
$("#dlg-settings").addEventListener("close", () => { if ($("#dlg-review").open) renderReview(); });

/* ---------- add ---------- */
$("#form-review").addEventListener("submit", e => {
  e.preventDefault();
  const course = $("#rv-course").value.trim(), idx = existingIndex();
  const rows = pending.filter(p => rvSel.ids.has(p.id) && p.date);
  const fields = p => {
    const useCt = ctApplies(p);
    return {title:p.title.trim() || "Untitled", category:p.category, course: catDef(p.category).hasCourse && !(p.type === "No Class" && ncAllOf(p)) ? (p.course || course) : "", type:p.type, date:p.date,
      time: useCt ? ct.start : p.time, endTime: useCt ? (ct.end || "") : (p.endTime || ""), location:p.location || "", reading:p.reading || "",
      lectureNumber:p.lectureNumber, priority:p.priority, flagged:p.flagged, notes:p.notes, completed:p.completed};
  };
  const fresh = [], upd = [];
  for (const p of rows){ const d = dupOf(p, idx); if (!d) fresh.push(fields(p)); else if (imp.dupMode === "update") upd.push([d, fields(p)]); }
  if ($("#rv-readtodo").checked){
    for (const p of rows){ const t = readingTodoFor(p); if (!t) continue;
      if (idx.has(dupKey(course, t.date, t.title)) || fresh.some(x => x.type === "Reading" && x.date === t.date && x.title === t.title)) continue;
      fresh.push({title:t.title, category:"School", course:p.course || course, type:"Reading", date:t.date, reading:p.reading, notes:`For ${p.title}`}); }
  }
  const before = upd.map(([id]) => JSON.parse(JSON.stringify(Store.get(id))));
  const made = fresh.length ? Store.createMany(fresh) : [];
  if (upd.length){ const map = new Map(upd); Store.updateMany([...map.keys()], r => { const {completed, priority, flagged, notes, ...rest} = map.get(r.id); return rest; }); }
  if (course){ saveColumnSetup(course); saveProfile(course, {classTime:{days:[...ct.days], start:ct.start, end:ct.end}}); }
  const skipped = pending.filter(p => rvSel.ids.has(p.id) && !p.date).length;
  $("#dlg-review").close();
  const msg = [made.length ? `Added ${plural(made.length, "item")}` : "", upd.length ? `updated ${upd.length}` : ""].filter(Boolean).join(", ");
  status(msg + (skipped ? `. ${plural(skipped, "item")} still needs a date and wasn't added.` : "."));
  toast(msg || "Nothing to add", () => { if (made.length) Store.purge(made.map(r => r.id)); if (before.length) Store.put(before); });
});

