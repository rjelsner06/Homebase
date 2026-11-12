/* Homebase: FILES IN NOTES: importing PDF / Word / PowerPoint files into Notes, and the AI text summary.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html.
 
   An imported file is a normal note with a "file" part (see Notes.addFile in js/notes.js):
     note.file = {v, fileId, name, ext, type, size, pages, thumb, thumbHtml, text, original}
       fileId     the file shown in the viewer (kept in Supabase Storage through Files, js/files.js)
       ext        "pdf", "docx" or "pptx"
       pages      page (or slide) count, or null if it couldn't be counted
       thumb      a small JPEG of the first page (data: URL), or ""
       thumbHtml  for Word files with no picture: the start of the first page as note HTML, or ""
       text       the document's text (capped), used by Notes search and the AI summary
       original   the file it came from, when that's different (a .pptx kept next to its PDF export), or null
     note.annotations = {}   reserved for comments on pages later: {"<page number>": [ ... ]}
   The viewer itself is js/viewer.js. */
"use strict";
 
const NoteFiles = (() => {
  /* ---------- libraries (CDN, loaded only when needed) ---------- */
  const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const JSZIP = "https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js";
  const DOCX = "https://cdn.jsdelivr.net/npm/docx-preview@0.4.1/dist/docx-preview.min.js";
  const loading = {};
  const script = src => loading[src] ||= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.async = true;
    s.onload = res;
    s.onerror = () => { delete loading[src]; s.remove(); rej(new Error("Couldn't load the document reader. Check your internet connection and try again.")); };
    document.head.appendChild(s);
  });
  async function lib(kind){
    if (kind === "pdf"){
      if (!window.pdfjsLib) throw new Error("The PDF reader didn't load. Check your connection and reload.");
      try { if (pdfjsLib.GlobalWorkerOptions.workerSrc !== PDF_WORKER) pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER; } catch(_){}
      return pdfjsLib;
    }
    if (!window.JSZip) await script(JSZIP);
    if (kind === "docx" && !window.docx) await script(DOCX);
    return kind === "docx" ? window.docx : window.JSZip;
  }
  async function openPdf(blob){
    const L = await lib("pdf");
    try { return await L.getDocument({data:new Uint8Array(await blob.arrayBuffer()), isEvalSupported:false}).promise; }
    catch(e){
      if (e && e.name === "PasswordException") throw new Error("This PDF is password-protected, so it can't be shown here. Download it to open it.");
      throw new Error("Couldn't read this PDF. It may be damaged.");
    }
  }
 
  /* ---------- kinds ---------- */
  const KINDS = {pdf:"PDF", docx:"Word", pptx:"PowerPoint"};
  const extOf = name => ((String(name).match(/\.([a-z0-9]{1,6})$/i) || [])[1] || "").toLowerCase();
  const baseName = name => String(name || "").replace(/\.[a-z0-9]{1,6}$/i, "");
  const kindOf = file => { const e = extOf(file.name); return KINDS[e] ? e : ""; };
  const OLD = {doc:"Word 97–2003 (.doc)", ppt:"PowerPoint 97–2003 (.ppt)"};
  const TEXT_MAX = 60000;
 
  /* ---------- reading a file on this device: page count, thumbnail, text ---------- */
  const clean = s => String(s || "").replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  function pageText(tc){ return tc.items.map(i => (i.str || "") + (i.hasEOL ? "\n" : " ")).join(""); }
  async function renderThumb(page, width = 360){
    const vp1 = page.getViewport({scale:1}), scale = width / vp1.width, vp = page.getViewport({scale});
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    await page.render({canvasContext:g, viewport:vp}).promise;
    const url = c.toDataURL("image/jpeg", .72); c.width = c.height = 0;
    return url;
  }
  async function shrinkImage(blob, width = 360){
    try {
      const bmp = await createImageBitmap(blob), k = Math.min(1, width / bmp.width);
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", .75); c.width = c.height = 0; return url;
    } catch(e){ return ""; }
  }
  async function pdfInfo(blob){
    const pdf = await openPdf(blob);
    try {
      const p1 = await pdf.getPage(1);
      let thumb = ""; try { thumb = await renderThumb(p1); } catch(_){}
      let text = "";
      for (let i = 1; i <= pdf.numPages && text.length < TEXT_MAX; i++){
        const pg = i === 1 ? p1 : await pdf.getPage(i);
        try { text += pageText(await pg.getTextContent()) + "\n\n"; } catch(_){}
        pg.cleanup();
      }
      return {pages:pdf.numPages, thumb, thumbHtml:"", text:clean(text).slice(0, TEXT_MAX)};
    } finally { pdf.destroy(); }
  }
  /* Word: render it out of sight with docx-preview to count pages and read the text. */
  async function docxInfo(blob){
    const D = await lib("docx");
    const thumb = "";   // Word's saved preview picture is often missing or blank, so the card shows the first page's own text
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-20000px;top:0;width:1000px;visibility:hidden;pointer-events:none";
    const st = document.createElement("div"), body = document.createElement("div"); box.append(st, body); document.body.appendChild(box);
    try {
      await D.renderAsync(blob, body, st, docxOptions());
      const secs = [...body.querySelectorAll("section.docx")];
      const text = clean(secs.map(s => blockText(s)).join("\n\n")).slice(0, TEXT_MAX);
      let thumbHtml = "";
      if (secs[0]){
        const art = secs[0].querySelector("article") || secs[0], parts = []; let n = 0;
        for (const el of art.children){ const t = el.textContent.trim(); if (!t) continue; parts.push(el.outerHTML); n += t.length; if (n > 900 || parts.length > 14) break; }
        thumbHtml = cleanHTML(parts.join("")).slice(0, 8000);
      }
      return {pages:secs.length || null, thumb, thumbHtml, text};
    } finally { box.remove(); }
  }
  function blockText(root){
    const d = root.cloneNode(true);
    d.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,td,th,br,div").forEach(e => e.append("\n"));
    return d.textContent;
  }
  /* PowerPoint: the file is a zip; read the slide count, the slide text and the preview picture PowerPoint saves. */
  async function pptxInfo(blob){
    const Z = await lib("zip"), z = await Z.loadAsync(blob);
    const slides = z.file(/^ppt\/slides\/slide\d+\.xml$/i).sort((a, b) => +a.name.match(/(\d+)\.xml$/i)[1] - +b.name.match(/(\d+)\.xml$/i)[1]);
    let text = "";
    for (const s of slides){
      if (text.length > TEXT_MAX) break;
      const xml = await s.async("string");
      const paras = xml.split(/<\/a:p>/).map(p => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join("")).filter(Boolean);
      text += `Slide ${slides.indexOf(s) + 1}\n` + paras.map(unXml).join("\n") + "\n\n";
    }
    let thumb = "";
    const t = z.file(/^docProps\/thumbnail\.(jpe?g|png)$/i)[0];
    if (t) thumb = await shrinkImage(await t.async("blob"));
    return {pages:slides.length || null, thumb, thumbHtml:"", text:clean(text).slice(0, TEXT_MAX)};
  }
  const unXml = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
  async function readInfo(file, kind){
    try { return kind === "pdf" ? await pdfInfo(file) : kind === "docx" ? await docxInfo(file) : await pptxInfo(file); }
    catch(e){ console.warn("Homebase: couldn't read", file.name, e); return {pages:null, thumb:"", thumbHtml:"", text:"", warn:e.message || "Couldn't make a preview."}; }
  }
  /* docx-preview settings shared with the viewer: Word's own page breaks, so pages match Word. */
  const docxOptions = () => ({className:"docx", inWrapper:true, ignoreWidth:false, ignoreHeight:false, ignoreFonts:false, breakPages:true,
    ignoreLastRenderedPageBreak:false, experimental:true, trimXmlDeclaration:true, useBase64URL:false, renderHeaders:true, renderFooters:true,
    renderFootnotes:true, renderEndnotes:true, renderComments:false, renderChanges:false});
  const fileInfo = (r, file, kind) => ({fileId:r.fileId, name:file.name, ext:kind, type:r.type, size:r.size});
 
  /* ---------- the import dialog ---------- */
  const imp = {rows:[], busy:false, folder:"", newFolder:"", ai:false, picked:false};
  const dlg = $("#dlg-nimp");
  const COURSE = /(?:^|[^A-Za-z])([A-Za-z]{2,5})[\s_-]?(\d{3,5})(?!\d)/;   // "ECE 20002", "ece20002_hw3.pdf", "MA-26100"
  /* group the picked files: a .pptx and a .pdf with the same name become one note (the PDF is shown, the .pptx is kept) */
  function group(files){
    const rows = [], byBase = new Map();
    for (const f of files){
      const k = kindOf(f), e = extOf(f.name);
      if (!k){ rows.push({id:uid(), file:f, kind:"", err:OLD[e] ? `${OLD[e]} files can't be shown. Save it as ${e === "doc" ? ".docx" : ".pptx"} or PDF and import that.` : "Only PDF, Word (.docx) and PowerPoint (.pptx) files can be imported here.", st:"skip"}); continue; }
      if (f.size > Files.MAX_FILE){ rows.push({id:uid(), file:f, kind:k, err:`${Files.fmtBytes(f.size)}: over the 50 MB limit per file.`, st:"skip"}); continue; }
      const b = baseName(f.name).toLowerCase(), prev = byBase.get(b);
      if (prev && ((prev.kind === "pdf" && k === "pptx") || (prev.kind === "pptx" && k === "pdf")) && !prev.pair){
        if (k === "pdf"){ prev.pair = prev.file; prev.file = f; prev.kind = "pdf"; } else prev.pair = f;
        continue;
      }
      const r = {id:uid(), file:f, kind:k, pair:null, st:"ready"}; rows.push(r); if (!prev) byBase.set(b, r);
    }
    return rows;
  }
  function open(files){
    if (imp.busy){ add(files); return; }
    imp.rows = []; imp.newFolder = ""; imp.ai = false; imp.picked = false;
    const f = nt.folder !== "all" && nt.folder !== "unfiled" && Notes.folder(nt.folder) ? nt.folder : "";
    imp.folder = f;
    add(files || []);
    if (!dlg.open) dlg.showModal();
    if (!files || !files.length) $("#ni-file").click();
  }
  function add(files){
    const all = [...imp.rows.filter(r => r.st === "ready" || r.st === "skip").map(r => [r.file, r.pair]).flat().filter(Boolean), ...files];
    const kept = imp.rows.filter(r => r.st !== "ready" && r.st !== "skip");
    imp.rows = [...kept, ...group(all)];
    if (!imp.folder && !imp.picked){   // no folder open or chosen: suggest one from a course code in the names (e.g. "ECE 20002")
      const m = imp.rows.map(r => (r.file.name.match(COURSE) || [])).find(x => x[0]);
      if (m){ const name = `${m[1].toUpperCase()} ${m[2].toUpperCase()}`, hit = Notes.folders().find(x => x.name.toLowerCase() === name.toLowerCase());
        if (hit) imp.folder = hit.id; else { imp.folder = "new"; imp.newFolder = name; } }
    }
    render();
  }
  function render(){
    const signedIn = !!(Sync.client() && Sync.user());
    const todo = imp.rows.filter(r => r.st === "ready");
    const badge = k => `<span class="ft-badge" data-ft="${esc(k || "x")}">${esc(k ? k.toUpperCase() : "?")}</span>`;
    const stTxt = r => r.st === "skip" ? `<span class="ni-err">${esc(r.err)}</span>` : r.st === "work" ? `<span class="note">${esc(r.msg || "Working…")}</span>`
      : r.st === "done" ? `<span class="ni-ok">Imported${r.warn ? ` <span class="note">(${esc(r.warn)})</span>` : ""}</span>` : r.st === "fail" ? `<span class="ni-err">${esc(r.err)}</span>`
      : r.kind === "pptx" && !r.pair ? `<span class="note">Kept for download. For the viewer, also import a PDF of it (see below).</span>`
      : r.pair ? `<span class="note">With ${esc(r.pair.name)} (kept for download)</span>` : `<span class="note">${Files.fmtBytes(r.file.size)}</span>`;
    $("#ni-list").innerHTML = imp.rows.length ? imp.rows.map(r => `<li class="ni-r" data-st="${r.st}">${badge(r.kind)}<span class="ni-n"><b title="${esc(r.file.name)}">${esc(r.file.name)}</b>${stTxt(r)}</span>${r.st === "ready" || r.st === "skip" ? `<button type="button" class="x" data-nirm="${r.id}" aria-label="Remove ${esc(r.file.name)}" ${imp.busy ? "disabled" : ""}>×</button>` : ""}</li>`).join("")
      : `<li class="ni-empty note">No files picked yet.</li>`;
    const tree = folderTree();
    $("#ni-folder").innerHTML = `<option value="">Not in a folder</option>` + tree.map(({f, lvl}) => `<option value="${f.id}">${"  ".repeat(lvl)}${esc(f.name)}</option>`).join("")
      + (imp.newFolder ? `<option value="new">New folder: ${esc(imp.newFolder)}</option>` : "") + `<option value="ask">New folder…</option>`;
    $("#ni-folder").value = imp.folder;
    $("#ni-folder").disabled = imp.busy;
    const anyPptx = imp.rows.some(r => r.kind === "pptx" && !r.pair && r.st === "ready");
    $("#ni-pptx").hidden = !anyPptx;
    $("#ni-ai-row").hidden = !AI.enabled();
    $("#ni-ai").checked = imp.ai; $("#ni-ai").disabled = imp.busy;
    $("#ni-ai-l").textContent = `Also make an editable text summary of each file with AI (${AI.label()})`;
    $("#ni-sign").hidden = signedIn;
    const go = $("#ni-go");
    go.textContent = imp.busy ? "Importing…" : todo.length ? `Import ${plural(todo.length, "file")}` : "Import";
    go.disabled = imp.busy || !todo.length || !signedIn;
    $("#ni-more").disabled = imp.busy;
    $("#ni-cancel").textContent = imp.rows.some(r => r.st === "done") && !imp.busy ? "Close" : "Cancel";
  }
  async function folderFor(){
    if (imp.folder === "new"){ const f = Notes.addFolder(imp.newFolder, null); imp.folder = f.id; imp.newFolder = ""; return f.id; }
    return imp.folder && Notes.folder(imp.folder) ? imp.folder : null;
  }
  async function run(){
    if (imp.busy) return;
    const rows = imp.rows.filter(r => r.st === "ready"); if (!rows.length) return;
    imp.busy = true; render();
    const folderId = await folderFor(), made = [];
    for (const r of rows){
      const say = m => { r.st = "work"; r.msg = m; render(); };
      try {
        say("Reading…");
        const info = await readInfo(r.file, r.kind);
        const noteId = uid();
        say(r.pair ? "Uploading (1 of 2)…" : "Uploading…");
        const up = await Files.upload(r.file, {noteId});
        let original = null;
        if (r.pair){ say("Uploading (2 of 2)…"); const up2 = await Files.upload(r.pair, {noteId}); original = fileInfo(up2, r.pair, "pptx"); }
        const n = Notes.addFile(folderId, {id:noteId, title:baseName(r.file.name), file:{v:1, ...fileInfo(up, r.file, r.kind), pages:info.pages, thumb:info.thumb, thumbHtml:info.thumbHtml, text:info.text, original}});
        r.st = "done"; r.warn = info.warn ? "no preview" : ""; made.push(n);
      } catch(e){ r.st = "fail"; r.err = e.message || "Couldn't import this file."; }
      render();
    }
    if (folderId && nt.folder !== folderId && made.length){ nt.folder = folderId; nt.q = ""; $("#nt-q").value = ""; }
    renderNotes();
    if (imp.ai && made.length && AI.enabled()){
      for (const n of made){
        const r = imp.rows.find(x => x.file.name === n.file.name || (x.pair && x.pair.name === n.file.name));
        try { if (r){ r.st = "work"; r.msg = `Writing an AI summary (${AI.label()})…`; render(); } await summarize(n.id, {open:false}); if (r){ r.st = "done"; r.warn = "AI summary added"; } }
        catch(e){ if (r){ r.st = "done"; r.warn = "AI summary failed: " + e.message; } }
        render();
      }
    }
    imp.busy = false; render();
    const failed = imp.rows.filter(r => r.st === "fail").length;
    if (made.length) toast(`Imported ${plural(made.length, "file")}${failed ? ` · ${failed} failed` : ""}`);
    if (!failed && made.length && !imp.ai) dlg.close();
  }
  $("#ni-file").addEventListener("change", e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) add(fs); });
  $("#ni-more").onclick = () => $("#ni-file").click();
  $("#ni-go").onclick = run;
  $("#ni-cancel").onclick = () => { if (!imp.busy) dlg.close(); };
  $("#ni-x").onclick = () => { if (!imp.busy) dlg.close(); };
  dlg.addEventListener("cancel", e => { if (imp.busy) e.preventDefault(); });
  $("#ni-list").addEventListener("click", e => { const b = e.target.closest("[data-nirm]"); if (!b || imp.busy) return; imp.rows = imp.rows.filter(r => r.id !== b.dataset.nirm); render(); });
  $("#ni-folder").addEventListener("change", e => {
    const v = e.target.value; imp.picked = true;
    if (v === "ask"){
      const name = (window.prompt("Name for the new folder", imp.newFolder || "") || "").trim();
      if (name){ const hit = Notes.folders().find(x => x.name.toLowerCase() === name.toLowerCase()); if (hit){ imp.folder = hit.id; imp.newFolder = ""; } else { imp.folder = "new"; imp.newFolder = name; } }
      render(); return;
    }
    imp.folder = v; render();
  });
  $("#ni-ai").addEventListener("change", e => { imp.ai = e.target.checked; });
  $("#ni-signin").onclick = () => { dlg.close(); openSettings("sync"); };
  dlg.addEventListener("dragover", e => { if (hasFiles(e)){ e.preventDefault(); dlg.classList.add("over"); } });
  dlg.addEventListener("dragleave", e => { if (e.target === dlg) dlg.classList.remove("over"); });
  dlg.addEventListener("drop", e => { if (!hasFiles(e)) return; e.preventDefault(); dlg.classList.remove("over"); if (!imp.busy) add([...e.dataTransfer.files]); });
  $("#dlg-settings").addEventListener("close", () => { if (dlg.open) render(); });
 
  /* drag files anywhere onto the Notes page */
  const hasFiles = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files"));
  const pg = $("#pg-notes"); let dragN = 0;
  pg.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); dragN++; $("#notes").classList.add("nt-dropping"); });
  pg.addEventListener("dragover", e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  pg.addEventListener("dragleave", e => { if (!hasFiles(e)) return; if (--dragN <= 0){ dragN = 0; $("#notes").classList.remove("nt-dropping"); } });
  pg.addEventListener("drop", e => { if (!hasFiles(e)) return; e.preventDefault(); dragN = 0; $("#notes").classList.remove("nt-dropping"); const fs = [...e.dataTransfer.files]; if (fs.length) open(fs); });
  $("#nt-import").onclick = () => open([]);
 
  /* ---------- attaching a PDF to a PowerPoint note (from the viewer) ---------- */
  async function attachPdf(noteId, file){
    const n = Notes.note(noteId); if (!n || !n.file) throw new Error("That note is gone.");
    if (kindOf(file) !== "pdf") throw new Error("Pick the PDF you exported from PowerPoint.");
    if (file.size > Files.MAX_FILE) throw new Error(`${Files.fmtBytes(file.size)}: over the 50 MB limit per file.`);
    const info = await readInfo(file, "pdf");
    const up = await Files.upload(file, {noteId});
    const original = n.file.ext === "pptx" ? {fileId:n.file.fileId, name:n.file.name, ext:"pptx", type:n.file.type, size:n.file.size} : n.file.original;
    Notes.updateNote(noteId, {file:{v:1, ...fileInfo(up, file, "pdf"), pages:info.pages, thumb:info.thumb || n.file.thumb, thumbHtml:"", text:info.text || n.file.text, original}});
  }
 
  /* ---------- AI summary: a new, editable text note made from the document ---------- */
  async function summarize(noteId, opts = {}){
    const n = Notes.note(noteId); if (!n || !n.file) throw new Error("That note is gone.");
    if (!AI.enabled()) throw new Error("Turn on AI in Settings → AI-assisted import first.");
    const text = String(n.file.text || "").trim();
    if (text.length < 40) throw new Error("There's no readable text in this file (it may be scanned pages), so there's nothing to summarize.");
    const cap = AI.mode() === "local" ? 9000 : 150000, cut = text.length > cap;
    const prompt = `You turn a class document into clean, editable study notes. Reply with ONLY a JSON object, no prose and no code fences, shaped exactly like:
{"title":"Short title","summary":"One or two sentences on what the document covers.","sections":[{"heading":"Section heading","points":["A key point","Another key point"]}]}
 
Rules:
- Follow the document's own order and headings. Up to 14 sections, up to 10 points each. Points are short sentences or phrases.
- Keep definitions, formulas (written as plain text, e.g. V = I*R), numbers, dates and due dates exactly as written.
- Do not invent anything that isn't in the document.
 
Document name: ${n.file.name}
Document text${cut ? " (only the first part)" : ""}:
${text.slice(0, cap)}`;
    const raw = await AI.complete(prompt);
    let s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("The model didn't return the summary in the expected form. Try again.");
    let obj; try { obj = JSON.parse(s.slice(a, b + 1)); } catch(e){ throw new Error("The model's reply couldn't be read. Try again."); }
    const secs = Array.isArray(obj.sections) ? obj.sections : [];
    const html = `<p class="sub">${esc(obj.summary || "")}</p>`
      + `<p>AI summary of <b>${esc(n.file.name)}</b>${cut ? " (first part only)" : ""}, made ${esc(new Date().toLocaleDateString())}. Check it against the original.</p>`
      + secs.map(x => `<h2>${esc(x.heading || "")}</h2>` + (Array.isArray(x.points) && x.points.length ? `<ul>${x.points.map(p => `<li>${esc(typeof p === "string" ? p : JSON.stringify(p))}</li>`).join("")}</ul>` : "")).join("");
    if (!secs.length && !obj.summary) throw new Error("The model returned an empty summary.");
    const m = Notes.addNote(n.folderId || null);
    Notes.updateNote(m.id, {title:String(obj.title || "").trim() ? `${String(obj.title).trim()} (summary)` : `${n.title || baseName(n.file.name)} (summary)`, html:cleanHTML(html), fromNote:n.id});
    if (opts.open) openNote(m.id);
    return m;
  }
 
  return {open, attachPdf, summarize, lib, openPdf, docxOptions, kindOf, extOf, baseName, KINDS};
})();
