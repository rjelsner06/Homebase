/* Homebase: DOCUMENT VIEWER for files in Notes (PDF, Word; PowerPoint through a PDF export).
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html.
 
   One viewer for every kind: pages one under another, page numbers, zoom (buttons, Ctrl+scroll, pinch on a phone),
   a strip of page thumbnails, text search with highlights, and download of the original file.
     PDF   drawn page by page with PDF.js (only the pages near the screen are kept drawn, which keeps iPhones happy).
     Word  laid out with docx-preview, split where Word itself breaks pages.
     PowerPoint on its own isn't shown (browsers can't lay slides out reliably); the viewer offers the .pptx as a
           download and lets you attach a PDF export of it, which is then shown instead.
   Each page has an empty layer (.dv-ann, data-page) where page comments can go later (note.annotations).
   js/notes.js calls DocView.show(note) / DocView.hide(); importing is in js/notefiles.js. */
"use strict";
 
const DocView = (() => {
  const CSS_PX = 96 / 72;                  // 100% = a PDF point at 96 dpi, like Acrobat
  const MIN = .25, MAX = 5, STEPS = [.25,.33,.5,.67,.75,.9,1,1.1,1.25,1.5,1.75,2,2.5,3,4,5];
  const UIKEY = "homebase.viewerui.v1";
  const ui = {thumbs:null, ...(HBStore.get(UIKEY, {}) || {})};
  const saveUi = () => HBStore.set(UIKEY, {thumbs:ui.thumbs});
  const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const FULL_IC = ic('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), UNFULL_IC = ic('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>');
 
  const root = $("#nt-view");
  root.innerHTML = `
    <div class="ne-top dv-top">
      <button class="nt-ib nt-showside" type="button" title="Show folders" aria-label="Show folders" hidden>${ic('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M6 8h0M6 11h0"/>')}</button>
      <button class="btn small" id="dv-back" type="button">‹ Notes</button>
      <label class="note" for="dv-move">Folder</label><select id="dv-move"></select>
      <span class="note dv-info" id="dv-info"></span><span class="sp"></span>
      <button class="btn small" id="dv-ai" type="button" title="Make an editable text note from this document with AI" hidden>✦ Text summary</button>
      <button class="btn small" id="dv-dl" type="button" aria-haspopup="menu">${ic('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>')}<span class="dv-dl-l">Download</span></button>
      <button class="nt-ib" id="dv-full" type="button" title="Full screen" aria-label="Full screen">${FULL_IC}</button>
      <button class="btn small danger" id="dv-del" type="button" title="Delete" aria-label="Delete">${ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}<span class="dv-del-l">Delete</span></button>
    </div>
    <input id="dv-title" class="dv-title" placeholder="Title" aria-label="File title" autocomplete="off">
    <div class="nt-tb dv-bar" role="toolbar" aria-label="Viewer">
      <button type="button" data-dv="thumbs" title="Page thumbnails" aria-label="Page thumbnails" aria-pressed="false">${ic('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 5h7M14 10h7M14 15h7M14 20h5"/>')}</button><span class="sep"></span>
      <button type="button" data-dv="prev" title="Previous page" aria-label="Previous page">${ic('<path d="m15 6-6 6 6 6"/>')}</button>
      <span class="dv-pgs"><input id="dv-pg" inputmode="numeric" autocomplete="off" aria-label="Page number"><span id="dv-pn" class="note">/ –</span></span>
      <button type="button" data-dv="next" title="Next page" aria-label="Next page">${ic('<path d="m9 6 6 6-6 6"/>')}</button><span class="sep"></span>
      <button type="button" data-dv="zout" title="Zoom out" aria-label="Zoom out">−</button>
      <button type="button" data-dv="zfit" id="dv-zl" class="dv-zl" title="Switch between fit to width and 100%">100%</button>
      <button type="button" data-dv="zin" title="Zoom in" aria-label="Zoom in">+</button>
      <span class="dv-sp"></span>
      <span class="dv-find">${ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')}<input type="search" id="dv-q" placeholder="Search in document" aria-label="Search in document" autocomplete="off" spellcheck="false"><span class="note" id="dv-qn" aria-live="polite"></span>
        <button type="button" data-dv="qprev" title="Previous match (Shift+Enter)" aria-label="Previous match">${ic('<path d="m6 15 6-6 6 6"/>')}</button><button type="button" data-dv="qnext" title="Next match (Enter)" aria-label="Next match">${ic('<path d="m6 9 6 6 6-6"/>')}</button></span>
    </div>
    <div class="dv-main" id="dv-main">
      <aside class="dv-thumbs" id="dv-thumbs" aria-label="Pages"></aside>
      <div class="dv-scroll" id="dv-scroll" tabindex="-1"><div class="dv-pages" id="dv-pages"></div></div>
    </div>
    <div class="dv-menu" id="dv-menu" role="menu" hidden></div>
    <input type="file" id="dv-attach" accept=".pdf,application/pdf" hidden>`;
  const sc = $("#dv-scroll"), pagesEl = $("#dv-pages"), thumbsEl = $("#dv-thumbs"), menu = $("#dv-menu");
 
  /* everything about the open document */
  const V = {id:null, fileId:null, kind:"", token:0, pdf:null, docx:null, pages:[], scale:1, zoom:"auto", cur:1, io:null, tio:null,
    waiting:false, ready:false, find:{q:"", hits:[], i:-1, tok:0}, text:{}, thumbsBuilt:false};
 
  /* ---------- open / close ---------- */
  function show(n){
    if (page !== "notes"){ if (V.id) hide(); return; }     // only load while Notes is on screen
    header(n);
    if (V.id === n.id && V.fileId === n.file.fileId) return;
    load(n);
  }
  function hide(){ teardown(); V.id = V.fileId = null; V.kind = ""; V.token++; closeMenu(); }
  function teardown(){
    V.token++;
    if (V.io){ V.io.disconnect(); V.io = null; } if (V.tio){ V.tio.disconnect(); V.tio = null; }
    for (const P of V.pages){ try { P.task && P.task.cancel(); } catch(_){} if (P.canvas){ P.canvas.width = P.canvas.height = 0; } }
    if (V.pdf){ try { V.pdf.destroy(); } catch(_){} V.pdf = null; }
    V.docx = null; V.pages = []; V.text = {}; V.find = {q:V.find.q, hits:[], i:-1, tok:V.find.tok + 1}; V.ready = false; V.waiting = false; V.thumbsBuilt = false;
    pagesEl.innerHTML = ""; pagesEl.style.cssText = ""; thumbsEl.innerHTML = ""; root.classList.remove("dv-ok");
    updBar(); updFind();
  }
  function msg(text, opts = {}){
    pagesEl.innerHTML = `<div class="dv-msg${opts.err ? " err" : ""}">${opts.html || `<p>${esc(text)}</p>`}${opts.retry ? `<button type="button" class="btn small" data-dv="retry">Try again</button>` : ""}</div>`;
  }
  async function load(n){
    teardown();
    const tok = V.token; V.id = n.id; V.fileId = n.file.fileId; V.kind = n.file.ext; V.cur = 1; V.zoom = "auto";
    $("#dv-q").value = ""; V.find.q = "";
    if (n.file.ext === "pptx"){ pptxPanel(n); return; }
    if (!Files.get(n.file.fileId)){
      V.waiting = true;
      msg(Sync.user() ? "Waiting for this file to sync to this device…" : "Sign in to sync (Settings → Account & sync) to open this file.");
      return;
    }
    msg("Opening…");
    try {
      const {blob} = await Files.open(n.file.fileId);
      if (tok !== V.token) return;
      if (n.file.ext === "pdf") await loadPdf(blob, tok); else await loadDocx(blob, tok);
      if (tok !== V.token) return;
      V.ready = true; root.classList.add("dv-ok");
      fitAuto(); buildThumbsSoon(); updBar();
      sc.scrollTop = 0; sc.scrollLeft = 0;
    } catch(e){
      if (tok !== V.token) return;
      console.warn("Homebase viewer:", e);
      msg(e.message || "Couldn't open this file.", {err:true, retry:true});
    }
  }
 
  /* ---------- PDF ---------- */
  async function loadPdf(blob, tok){
    const pdf = await NoteFiles.openPdf(blob);
    if (tok !== V.token){ pdf.destroy(); return; }
    V.pdf = pdf;
    const sizes = new Array(pdf.numPages);
    for (let i = 0; i < pdf.numPages; i += 25){
      await Promise.all(Array.from({length:Math.min(25, pdf.numPages - i)}, async (_, k) => {
        const p = await pdf.getPage(i + k + 1), vp = p.getViewport({scale:1}); sizes[i + k] = {w:vp.width * CSS_PX, h:vp.height * CSS_PX};
      }));
      if (tok !== V.token) return;
    }
    pagesEl.innerHTML = "";
    V.pages = sizes.map((s, i) => {
      const el = document.createElement("div");
      el.className = "dv-pg"; el.dataset.page = i + 1;
      el.innerHTML = `<div class="dv-hl"></div><div class="dv-ann" data-page="${i + 1}"></div>`;
      pagesEl.appendChild(el);
      return {n:i + 1, el, w:s.w, h:s.h, canvas:null, drawn:0, drawing:false, task:null, visible:false};
    });
    V.io = new IntersectionObserver(es => { for (const e of es){ const P = V.pages[+e.target.dataset.page - 1]; if (P) P.visible = e.isIntersecting; } drawSoon(); }, {root:sc, rootMargin:"120% 0px"});
    V.pages.forEach(P => V.io.observe(P.el));
  }
  let drawT = 0, pumping = false;
  const drawSoon = (ms = 40) => { clearTimeout(drawT); drawT = setTimeout(pump, ms); };
  async function pump(){
    if (pumping || !V.pdf) return; pumping = true;
    const tok = V.token;
    try {
      for (;;){
        if (tok !== V.token) break;
        const todo = V.pages.filter(P => P.visible && P.drawn !== V.scale && !P.drawing).sort((a, b) => Math.abs(a.n - V.cur) - Math.abs(b.n - V.cur));
        if (!todo.length) break;
        await drawPage(todo[0], tok);
      }
      trimDrawn();
    } finally { pumping = false; }
  }
  async function drawPage(P, tok){
    P.drawing = true;
    const s = V.scale;
    try {
      const page = await V.pdf.getPage(P.n); if (tok !== V.token) return;
      const vp1 = page.getViewport({scale:1}), dpr = Math.min(window.devicePixelRatio || 1, 2);
      let k = s * CSS_PX * dpr;
      const maxPx = 9e6;                                            // iPhone Safari refuses very large canvases
      if (vp1.width * k * vp1.height * k > maxPx) k = Math.sqrt(maxPx / (vp1.width * vp1.height));
      const vp = page.getViewport({scale:k});
      const c = document.createElement("canvas"); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const g = c.getContext("2d", {alpha:false}); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      P.task = page.render({canvasContext:g, viewport:vp});
      await P.task.promise;
      if (tok !== V.token){ c.width = c.height = 0; return; }
      if (P.canvas){ P.canvas.width = P.canvas.height = 0; P.canvas.remove(); }
      P.canvas = c; P.el.prepend(c); P.drawn = s;
    } catch(e){ if (!e || e.name !== "RenderingCancelledException") console.warn("Homebase viewer: page", P.n, e); P.drawn = s; }
    finally { P.drawing = false; P.task = null; }
  }
  /* keep at most a dozen pages drawn; the rest go back to blank until you scroll near them */
  function trimDrawn(){
    const drawn = V.pages.filter(P => P.canvas && !P.visible);
    if (drawn.length + V.pages.filter(P => P.canvas && P.visible).length <= 12) return;
    drawn.sort((a, b) => Math.abs(b.n - V.cur) - Math.abs(a.n - V.cur)).slice(0, Math.max(0, drawn.length - 4)).forEach(P => {
      P.canvas.width = P.canvas.height = 0; P.canvas.remove(); P.canvas = null; P.drawn = 0;
    });
  }
 
  /* ---------- Word ---------- */
  async function loadDocx(blob, tok){
    const D = await NoteFiles.lib("docx"); if (tok !== V.token) return;
    pagesEl.innerHTML = "";
    const st = document.createElement("div"), body = document.createElement("div");
    st.className = "dv-docx-st"; body.className = "dv-docx"; pagesEl.append(st, body);
    try { await D.renderAsync(blob, body, st, NoteFiles.docxOptions()); }
    catch(e){ throw new Error("Couldn't lay out this Word file. Download it to open it in Word."); }
    if (tok !== V.token) return;
    const secs = [...body.querySelectorAll("section.docx")];
    if (!secs.length) throw new Error("This Word file looks empty.");
    V.docx = body;
    V.pages = secs.map((el, i) => {
      el.dataset.page = i + 1;
      const ann = document.createElement("div"); ann.className = "dv-ann"; ann.dataset.page = i + 1; el.appendChild(ann);
      return {n:i + 1, el, w:el.offsetWidth, h:el.offsetHeight};
    });
  }
 
  /* ---------- PowerPoint on its own ---------- */
  function pptxPanel(n){
    const f = n.file;
    msg("", {html:`${f.thumb ? `<img class="dv-pp-img" src="${esc(f.thumb)}" alt="First slide">` : `<span class="ft-badge big" data-ft="pptx">PPTX</span>`}
      <p><b>${esc(f.name)}</b>${f.pages ? ` · ${plural(f.pages, "slide")}` : ""}</p>
      <p>PowerPoint slides can't be shown reliably in a browser (fonts, layouts and charts move around). For the viewer, export it as a PDF and attach it here. The .pptx stays attached for download.</p>
      <ol class="dv-steps"><li><b>Windows:</b> in PowerPoint, File → Export → Create PDF/XPS → Publish.</li><li><b>Mac:</b> File → Export → File Format: PDF → Export.</li><li><b>iPhone:</b> in the PowerPoint app, ⋯ → Export → PDF.</li></ol>
      <div class="rv-tools"><button type="button" class="btn small primary" data-dv="attach">Attach the PDF…</button><button type="button" class="btn small" data-dv="dlorig">Download .pptx</button></div>
      ${f.text ? `<details class="dv-pp-text"><summary>Slide text</summary><pre>${esc(f.text.slice(0, 20000))}</pre></details>` : ""}`});
    updBar();
  }
  $("#dv-attach").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f || !V.id) return;
    const id = V.id; msg(`Uploading ${f.name}…`);
    try { await NoteFiles.attachPdf(id, f); toast("PDF attached"); }
    catch(err){ const n = Notes.note(id); if (n && n.file) { pptxPanel(n); } toast(err.message); }
  });
 
  /* ---------- zoom and layout ---------- */
  const baseW = () => V.pages.reduce((m, P) => Math.max(m, P.w), 0) || 816;
  const pad = () => innerWidth < 700 ? 8 : 24;
  function fitScale(){ return Math.max(MIN, Math.min(MAX, (sc.clientWidth - pad() * 2) / baseW())); }
  function autoScale(){
    const P = V.pages[0], wide = P && P.w > P.h * 1.1;
    return Math.min(fitScale(), wide ? 1.6 : 1);
  }
  function applySizes(){
    if (V.pdf) for (const P of V.pages){ P.el.style.width = Math.round(P.w * V.scale) + "px"; P.el.style.height = Math.round(P.h * V.scale) + "px"; }
    else if (V.docx) V.docx.style.zoom = V.scale;
  }
  const pageBox = P => { const r = P.el.getBoundingClientRect(), s = sc.getBoundingClientRect(); return {top:r.top - s.top + sc.scrollTop, left:r.left - s.left + sc.scrollLeft, height:r.height, width:r.width}; };
  /* the page at a given height in the scrolled content (binary search; pages are in order) */
  function pageAtY(y){
    let lo = 0, hi = V.pages.length - 1, ans = 0;
    while (lo <= hi){ const m = (lo + hi) >> 1; if (pageBox(V.pages[m]).top <= y){ ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  function setScale(s, at){
    if (!V.ready || !V.pages.length) return;
    s = Math.max(MIN, Math.min(MAX, s));
    const old = V.scale, cx = at ? at.cx : sc.clientWidth / 2, cy = at ? at.cy : sc.clientHeight / 2;
    const Y = sc.scrollTop + cy, X = sc.scrollLeft + cx;
    const i = pageAtY(Y), b0 = pageBox(V.pages[i]), fy = b0.height ? (Y - b0.top) / b0.height : 0;
    V.scale = s; applySizes();
    const b1 = pageBox(V.pages[i]);
    sc.scrollTop = Math.max(0, b1.top + fy * b1.height - cy);
    sc.scrollLeft = Math.max(0, X * (s / (old || s)) - cx);
    updZoom(); drawSoon(120);
  }
  function fitAuto(){ if (!V.ready) return; V.scale = V.scale || 1; applySizes(); setScale(autoScale()); V.zoom = "auto"; updZoom(); }
  function zoomStep(dir){
    const s = V.scale;
    const next = dir > 0 ? STEPS.find(x => x > s + .001) || MAX : [...STEPS].reverse().find(x => x < s - .001) || MIN;
    V.zoom = "num"; setScale(next);
  }
  const updZoom = () => { $("#dv-zl").textContent = V.ready ? Math.round(V.scale * 100) + "%" : "–"; $("#dv-zl").title = V.zoom !== "num" ? "Fitted to the window. Click for 100%" : "Click to fit the page width to the window"; };
  new ResizeObserver(() => { if (V.ready && V.zoom !== "num") requestAnimationFrame(() => { const s = V.zoom === "fit" ? fitScale() : autoScale(); if (Math.abs(s - V.scale) > .005) setScale(s); }); }).observe(sc);
 
  /* pinch to zoom on a phone or tablet; Ctrl + scroll (or a trackpad pinch) on a laptop */
  let pz = null;
  const tdist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  sc.addEventListener("touchstart", e => {
    if (e.touches.length !== 2 || !V.ready) return;
    const [a, b] = e.touches, s = sc.getBoundingClientRect(), p = pagesEl.getBoundingClientRect();
    const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
    pz = {d:tdist(a, b), s0:V.scale, r:1, cx:mx - s.left, cy:my - s.top};
    pagesEl.style.transformOrigin = `${mx - p.left}px ${my - p.top}px`;
  }, {passive:true});
  sc.addEventListener("touchmove", e => {
    if (!pz || e.touches.length !== 2) return;
    e.preventDefault();
    pz.r = Math.max(MIN / pz.s0, Math.min(MAX / pz.s0, tdist(e.touches[0], e.touches[1]) / pz.d));
    pagesEl.style.transform = `scale(${pz.r})`;
  }, {passive:false});
  const endPinch = e => {
    if (!pz || (e.touches && e.touches.length >= 2)) return;
    const p = pz; pz = null; pagesEl.style.transform = ""; pagesEl.style.transformOrigin = "";
    if (Math.abs(p.r - 1) > .02){ V.zoom = "num"; setScale(p.s0 * p.r, {cx:p.cx, cy:p.cy}); }
  };
  sc.addEventListener("touchend", endPinch); sc.addEventListener("touchcancel", endPinch);
  sc.addEventListener("wheel", e => {
    if (!e.ctrlKey || !V.ready) return;
    e.preventDefault();
    const s = sc.getBoundingClientRect(); V.zoom = "num";
    setScale(V.scale * Math.exp(-e.deltaY * .01), {cx:e.clientX - s.left, cy:e.clientY - s.top});
  }, {passive:false});
 
  /* ---------- pages: which one you're on, going to one ---------- */
  let scrollRaf = 0;
  sc.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      if (!V.ready || !V.pages.length) return;
      const n = pageAtY(sc.scrollTop + sc.clientHeight * .35) + 1;
      if (n !== V.cur){ V.cur = n; updPage(); }
      closeMenu();
    });
  }, {passive:true});
  function goPage(n, smooth){
    if (!V.ready || !V.pages.length) return;
    n = Math.max(1, Math.min(V.pages.length, Math.round(+n) || 1));
    const b = pageBox(V.pages[n - 1]);
    sc.scrollTo({top:Math.max(0, b.top - 10), behavior:smooth ? "smooth" : "auto"});
    V.cur = n; updPage();
  }
  function updPage(){
    if (document.activeElement !== $("#dv-pg")) $("#dv-pg").value = V.pages.length ? V.cur : "";
    thumbsEl.querySelectorAll(".dv-tb.on").forEach(x => x.classList.remove("on"));
    const t = thumbsEl.querySelector(`.dv-tb[data-page="${V.cur}"]`);
    if (t){ t.classList.add("on"); if (root.classList.contains("dv-thumbs-on")){ const r = t.getBoundingClientRect(), s = thumbsEl.getBoundingClientRect(); if (r.top < s.top || r.bottom > s.bottom) thumbsEl.scrollTop += r.top - s.top - s.height / 2 + r.height / 2; } }
  }
  function updBar(){
    const ok = V.ready && V.pages.length;
    $$("#nt-view .dv-bar button, #dv-pg, #dv-q").forEach(b => b.disabled = !ok);
    $("#dv-pn").textContent = ok ? `/ ${V.pages.length}` : "/ –";
    updPage(); updZoom(); thumbsBtn();
  }
 
  /* ---------- thumbnails ---------- */
  const thumbsWanted = () => ui.thumbs === null ? innerWidth >= 1000 && V.pages.length > 1 : ui.thumbs;
  function thumbsBtn(){
    const on = V.ready && V.pages.length > 0 && thumbsWanted();
    root.classList.toggle("dv-thumbs-on", on);
    const b = $('#nt-view [data-dv="thumbs"]'); b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on);
    if (on) buildThumbs();
  }
  const buildThumbsSoon = () => setTimeout(() => { if (thumbsWanted()) buildThumbs(); }, 50);
  function buildThumbs(){
    if (V.thumbsBuilt || !V.ready) return; V.thumbsBuilt = true;
    const TW = 112;
    thumbsEl.innerHTML = V.pages.map(P => `<button type="button" class="dv-tb" data-page="${P.n}" aria-label="Page ${P.n}"><span class="dv-tbi" style="width:${TW}px;height:${Math.round(TW * P.h / P.w)}px"></span><span class="dv-tbn">${P.n}</span></button>`).join("");
    const tok = V.token;
    if (V.pdf){
      let q = Promise.resolve();
      V.tio = new IntersectionObserver(es => {
        for (const e of es){
          if (!e.isIntersecting) continue;
          const box = e.target.querySelector(".dv-tbi"); V.tio.unobserve(e.target);
          const n = +e.target.dataset.page;
          q = q.then(async () => {
            if (tok !== V.token || !V.pdf) return;
            try {
              const pg = await V.pdf.getPage(n), vp1 = pg.getViewport({scale:1}), dpr = Math.min(devicePixelRatio || 1, 2);
              const vp = pg.getViewport({scale:TW * dpr / vp1.width}), c = document.createElement("canvas");
              c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
              const g = c.getContext("2d", {alpha:false}); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
              await pg.render({canvasContext:g, viewport:vp}).promise;
              if (tok === V.token) box.appendChild(c);
            } catch(_){}
          });
        }
      }, {root:thumbsEl, rootMargin:"200px 0px"});
      thumbsEl.querySelectorAll(".dv-tb").forEach(b => V.tio.observe(b));
    } else if (V.docx){
      thumbsEl.querySelectorAll(".dv-tb").forEach(b => {
        const P = V.pages[+b.dataset.page - 1], box = b.querySelector(".dv-tbi"), k = TW / P.w;
        const c = P.el.cloneNode(true); c.querySelectorAll("mark.dv-mk").forEach(m => m.replaceWith(...m.childNodes));
        c.style.cssText += `;transform:scale(${k});transform-origin:0 0;margin:0;position:absolute;left:0;top:0;pointer-events:none`;
        const w = document.createElement("div"); w.className = "docx-wrapper dv-tbw"; w.appendChild(c); box.appendChild(w);
      });
    }
    updPage();
  }
  thumbsEl.addEventListener("click", e => {
    const b = e.target.closest(".dv-tb"); if (!b) return;
    goPage(+b.dataset.page);
    if (innerWidth < 820){ ui.thumbs = false; thumbsBtn(); }
  });
 
  /* ---------- search ---------- */
  let qT = 0;
  $("#dv-q").addEventListener("input", e => { clearTimeout(qT); const q = e.target.value; qT = setTimeout(() => runFind(q), 280); });
  $("#dv-q").addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); clearTimeout(qT); if ($("#dv-q").value !== V.find.q) runFind($("#dv-q").value); else stepHit(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape" && $("#dv-q").value){ e.preventDefault(); e.stopPropagation(); $("#dv-q").value = ""; runFind(""); }
  });
  function clearHits(){
    for (const P of V.pages){ const h = P.el.querySelector(".dv-hl"); if (h) h.innerHTML = ""; }
    if (V.docx){ const ps = new Set(); V.docx.querySelectorAll("mark.dv-mk").forEach(m => { ps.add(m.parentNode); m.replaceWith(...m.childNodes); }); ps.forEach(p => p && p.normalize()); }
  }
  async function runFind(q){
    const tok = ++V.find.tok, docTok = V.token;
    clearHits(); V.find = {q, hits:[], i:-1, tok, busy:false};
    q = q.trim(); if (!q || !V.ready){ updFind(); return; }
    const needle = q.toLowerCase().replace(/\s+/g, " ");
    if (V.docx){ V.find.hits = markDocx(needle); if (V.find.hits.length) goHit(0); updFind(); return; }
    if (!V.pdf) return;
    V.find.busy = true;
    for (const P of V.pages){
      if (tok !== V.find.tok || docTok !== V.token) return;
      const T = await pdfText(P.n); if (tok !== V.find.tok || docTok !== V.token) return;
      let at = T.low.indexOf(needle), found = false;
      while (at >= 0){ V.find.hits.push({page:P.n, rects:rectsFor(T, at, at + needle.length)}); found = true; at = T.low.indexOf(needle, at + Math.max(1, needle.length)); }
      if (found) paintHits(P.n);
      if (V.find.i < 0 && V.find.hits.length) goHit(0);
      if (P.n % 8 === 0 || P.n === V.pages.length){ V.find.prog = P.n; updFind(); }
    }
    V.find.busy = false; updFind();
  }
  /* a page's text as one string, remembering where each piece sits on the page */
  async function pdfText(n){
    if (V.text[n]) return V.text[n];
    const pg = await V.pdf.getPage(n), vp = pg.getViewport({scale:1}), tc = await pg.getTextContent();
    let str = "", prev = null; const spans = [];
    for (const it of tc.items){
      if (!it.str) { if (it.hasEOL) str += " "; continue; }
      const t = it.transform, fh = Math.hypot(t[2], t[3]) || it.height || 10;
      if (prev){
        const sameLine = Math.abs(prev.t[5] - t[5]) < fh * .5, gap = t[4] - (prev.t[4] + prev.w);
        if ((!sameLine || gap > fh * .15 || prev.eol) && !/\s$/.test(str)) str += " ";
      }
      spans.push({a:str.length, b:str.length + it.str.length, x:t[4], y:t[5], w:it.width, fh, len:it.str.length});
      str += it.str; prev = {t, w:it.width, eol:it.hasEOL};
    }
    const low = str.toLowerCase().replace(/\s/g, " ");
    return (V.text[n] = {low, spans, vw:vp.width, vh:vp.height, vp});
  }
  function rectsFor(T, a, b){
    const out = [];
    for (const s of T.spans){
      if (s.b <= a || s.a >= b) continue;
      const f1 = (Math.max(a, s.a) - s.a) / s.len, f2 = (Math.min(b, s.b) - s.a) / s.len;
      const r = T.vp.convertToViewportRectangle([s.x + s.w * f1, s.y - s.fh * .22, s.x + s.w * f2, s.y + s.fh * .88]);
      const L = Math.min(r[0], r[2]), R = Math.max(r[0], r[2]), Tp = Math.min(r[1], r[3]), B = Math.max(r[1], r[3]);
      out.push([L / T.vw * 100, Tp / T.vh * 100, (R - L) / T.vw * 100, (B - Tp) / T.vh * 100]);
    }
    return out;
  }
  function paintHits(n){
    const P = V.pages[n - 1]; if (!P) return;
    const h = P.el.querySelector(".dv-hl"); if (!h) return;
    h.innerHTML = V.find.hits.map((x, i) => x.page === n ? x.rects.map(r => `<i data-hit="${i}" class="${i === V.find.i ? "on" : ""}" style="left:${r[0]}%;top:${r[1]}%;width:${r[2]}%;height:${r[3]}%"></i>`).join("") : "").join("");
  }
  /* Word: wrap matches in <mark>, paragraph by paragraph (a word can be split over several pieces of formatting) */
  function markDocx(needle){
    const hits = [];
    for (const blk of V.docx.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6")){
      if (blk.querySelector("p, li")) continue;
      const nodes = [], walk = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); let t, str = "";
      while ((t = walk.nextNode())){ nodes.push({t, a:str.length}); str += t.nodeValue; }
      if (!str) continue;
      const low = str.toLowerCase().replace(/\s/g, " "), found = [];
      let at = low.indexOf(needle); while (at >= 0){ found.push(at); at = low.indexOf(needle, at + Math.max(1, needle.length)); }
      const marks = [];
      for (let k = found.length - 1; k >= 0; k--){
        const a = found[k], b = a + needle.length, mine = [];
        for (let j = nodes.length - 1; j >= 0; j--){
          const nd = nodes[j], s = nd.a, e = s + nd.t.nodeValue.length;
          if (e <= a || s >= b) continue;
          const r = document.createRange(); r.setStart(nd.t, Math.max(a, s) - s); r.setEnd(nd.t, Math.min(b, e) - s);
          const m = document.createElement("mark"); m.className = "dv-mk";
          try { r.surroundContents(m); mine.unshift(m); } catch(_){}
        }
        if (mine.length) marks.unshift(mine);
      }
      hits.push(...marks.map(ms => ({page:+(ms[0].closest("section.docx") || {dataset:{}}).dataset.page || 1, marks:ms})));
    }
    return hits;
  }
  function goHit(i){
    const H = V.find.hits; if (!H.length) return;
    const prev = V.find.i; V.find.i = (i + H.length) % H.length;
    const h = H[V.find.i];
    if (V.docx){
      if (H[prev]) H[prev].marks.forEach(m => m.classList.remove("on"));
      h.marks.forEach(m => m.classList.add("on"));
      const r = h.marks[0].getBoundingClientRect(), s = sc.getBoundingClientRect();
      sc.scrollTop += r.top - s.top - sc.clientHeight * .3;
      if (r.left < s.left || r.right > s.right) sc.scrollLeft += r.left - s.left - sc.clientWidth * .3;
    } else {
      if (H[prev] && H[prev].page !== h.page) paintHits(H[prev].page);
      paintHits(h.page);
      const P = V.pages[h.page - 1], b = pageBox(P), r = h.rects[0] || [0, 0, 0, 0];
      sc.scrollTop = Math.max(0, b.top + r[1] / 100 * b.height - sc.clientHeight * .3);
      const x = b.left + r[0] / 100 * b.width; if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = Math.max(0, x - sc.clientWidth * .3);
    }
    V.cur = h.page; updPage(); updFind();
  }
  const stepHit = d => { if (V.find.hits.length) goHit(V.find.i + d); };
  function updFind(){
    const f = V.find, n = f.hits.length, el = $("#dv-qn");
    el.textContent = !f.q.trim() ? "" : n ? `${f.i + 1} of ${n}${f.busy ? "+" : ""}` : f.busy ? `Searching… ${f.prog || 0}/${V.pages.length}` : (V.docx || V.pdf) ? "No matches" : "";
    el.classList.toggle("none", !!f.q.trim() && !n && !f.busy);
  }
 
  /* ---------- header: title, folder, info, buttons ---------- */
  function header(n){
    const f = n.file, kind = NoteFiles.KINDS[f.ext] || f.ext.toUpperCase();
    if (document.activeElement !== $("#dv-title")) $("#dv-title").value = n.title || "";
    $("#dv-back").textContent = "‹ " + folderName(nt.folder);
    const tree = folderTree();
    $("#dv-move").innerHTML = `<option value="">Not in a folder</option>` + tree.map(({f, lvl}) => `<option value="${f.id}">${"  ".repeat(lvl)}${esc(f.name)}</option>`).join("");
    $("#dv-move").value = n.folderId || "";
    const unit = f.ext === "pptx" ? "slide" : "page";
    $("#dv-info").textContent = [kind, f.pages ? plural(f.pages, unit) : "", Files.fmtBytes(f.size), f.original ? "PowerPoint original attached" : ""].filter(Boolean).join(" · ");
    $("#dv-ai").hidden = !AI.enabled();
    const b = $("#dv-full"); b.innerHTML = nt.full ? UNFULL_IC : FULL_IC; b.title = nt.full ? "Exit full screen (Esc)" : "Full screen"; b.setAttribute("aria-label", b.title); b.classList.toggle("on", nt.full);
  }
  $("#dv-title").addEventListener("input", e => { if (V.id) Notes.updateNote(V.id, {title:e.target.value}, true); });
  $("#dv-title").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); e.target.blur(); } });
  $("#dv-title").addEventListener("change", () => renderNotes());
  $("#dv-move").addEventListener("change", e => { if (V.id) Notes.updateNote(V.id, {folderId:e.target.value || null}); });
  $("#dv-back").onclick = () => closeNote();
  $$("#nt-view .nt-showside").forEach(b => b.onclick = () => setSide(true));
  $("#dv-full").onclick = () => { setNoteFull(!nt.full); const n = V.id && Notes.note(V.id); if (n) header(n); };
  $("#dv-del").onclick = () => {
    const id = V.id, n = id && Notes.note(id); if (!n) return;
    if (nt.full) setNoteFull(false);
    Notes.removeNote(id); nt.note = null; nt.mobileEdit = false;
    toast(`Deleted "${trunc(n.title || "Untitled", 28)}"`, () => Notes.restore("note", id));
  };
  $("#dv-ai").onclick = async () => {
    const b = $("#dv-ai"), id = V.id; if (!id || b.disabled) return;
    b.disabled = true; const t = b.textContent; b.textContent = `Writing (${AI.label()})…`;
    try { await NoteFiles.summarize(id, {open:true}); toast("Summary note added next to the file. It's a normal note you can edit."); }
    catch(e){ toast(e.message || "The AI summary didn't work."); }
    b.disabled = false; b.textContent = t;
  };
 
  /* ---------- download ---------- */
  async function download(fileId, name){
    try {
      const {blob} = await Files.open(fileId), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name || "file"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch(e){ toast(e.message || "Couldn't download the file."); }
  }
  function closeMenu(){ if (!menu.hidden){ menu.hidden = true; menu.innerHTML = ""; } }
  $("#dv-dl").onclick = e => {
    const n = V.id && Notes.note(V.id); if (!n) return;
    const f = n.file;
    if (!f.original){ download(f.fileId, f.name); return; }
    if (!menu.hidden){ closeMenu(); return; }
    menu.innerHTML = `<button type="button" class="mi" data-dl="${esc(f.fileId)}"><span class="ft-badge" data-ft="${esc(f.ext)}">${esc(f.ext.toUpperCase())}</span>${esc(f.name)}</button>`
      + `<button type="button" class="mi" data-dl="${esc(f.original.fileId)}"><span class="ft-badge" data-ft="${esc(f.original.ext)}">${esc(f.original.ext.toUpperCase())}</span>${esc(f.original.name)} <span class="note">original</span></button>`;
    menu.hidden = false;
    const r = e.currentTarget.getBoundingClientRect(), w = menu.offsetWidth;
    menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px"; menu.style.top = (r.bottom + 6) + "px";
  };
  menu.addEventListener("click", e => {
    const b = e.target.closest("[data-dl]"); if (!b) return;
    const n = Notes.note(V.id), f = n && n.file; closeMenu(); if (!f) return;
    const it = b.dataset.dl === f.fileId ? f : f.original; download(it.fileId, it.name);
  });
  document.addEventListener("mousedown", e => { if (!menu.hidden && !e.target.closest("#dv-menu, #dv-dl")) closeMenu(); });
 
  /* ---------- toolbar and keys ---------- */
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-dv]"); if (!b) return;
    switch (b.dataset.dv){
      case "prev": goPage(V.cur - 1); break;
      case "next": goPage(V.cur + 1); break;
      case "zin": zoomStep(1); break;
      case "zout": zoomStep(-1); break;
      case "zfit": if (V.zoom === "num"){ V.zoom = "fit"; setScale(fitScale()); } else { V.zoom = "num"; setScale(1); } updZoom(); break;
      case "thumbs": ui.thumbs = !thumbsWanted(); saveUi(); thumbsBtn(); break;
      case "qnext": stepHit(1); break;
      case "qprev": stepHit(-1); break;
      case "retry": { const n = Notes.note(V.id); if (n && n.file){ V.fileId = null; show(n); } break; }
      case "attach": $("#dv-attach").click(); break;
      case "dlorig": { const n = Notes.note(V.id); if (n && n.file) download(n.file.fileId, n.file.name); break; }
    }
  });
  $("#dv-pg").addEventListener("change", e => goPage(e.target.value));
  $("#dv-pg").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); goPage(e.target.value); e.target.blur(); } });
  $("#dv-pg").addEventListener("focus", e => e.target.select());
  document.addEventListener("keydown", e => {
    if (root.hidden || page !== "notes" || !V.ready || document.querySelector("dialog[open]")) return;
    const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f"){ e.preventDefault(); $("#dv-q").focus(); $("#dv-q").select(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")){ e.preventDefault(); zoomStep(1); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "-"){ e.preventDefault(); zoomStep(-1); return; }
    if (typing) return;
    if (e.key === "PageDown" || (e.key === "ArrowRight" && !e.shiftKey)){ e.preventDefault(); goPage(V.cur + 1); }
    if (e.key === "PageUp" || (e.key === "ArrowLeft" && !e.shiftKey)){ e.preventDefault(); goPage(V.cur - 1); }
    if (e.key === "Home"){ e.preventDefault(); goPage(1); }
    if (e.key === "End"){ e.preventDefault(); goPage(V.pages.length); }
  });
 
  /* a file that arrives from another device a moment after its note: open it once its details are here */
  FileMeta.subscribe(() => { if (V.waiting && V.id){ const n = Notes.note(V.id); if (n && n.file && Files.get(n.file.fileId)){ V.fileId = null; show(n); } } });
 
  return {show, hide, get openId(){ return V.id; }};
})();