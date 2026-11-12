/* Homebase: Sync wiring for settings, small helpers, LINKS row and link pop-up, uploaded HTML apps.
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   SYNC WIRING: items and settings join the synced data.
   ===================================================================== */
Sync.register("settings", {
  all: () => [{id:"main", s:Settings.get()}],
  m: o => +o.s._m || 0,
  seedOnly: () => true,
  apply(u){ if (u[0] && u[0].s) Settings.replace(u[0].s); },
});
Settings.onReplace(() => {
  applyNotesColor(); applyTheme();
  if (ready){ Home.render(true); renderAll(); }
  if ($("#dlg-settings").open) renderSettings();
});
const downloadText = (name, text, type = "text/plain") => {
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], {type}));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
};
const safeJSON = x => JSON.stringify(x).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch(e){ return ""; } };
const siteBase = () => location.origin + location.pathname;

/* =====================================================================
   LINKS: the row under the header. Each link opens in a pop-up (or a
   new tab). Kinds: "url" (a web page), "html" (an uploaded HTML file,
   run sandboxed) and "app" (built in: Lifts).
   ===================================================================== */
const LinkStore = DocStore("homebase.links.v1", "link", () => [{id:"lifts", d:{kind:"app", app:"lifts", title:"Lifts", icon:"e:🏋️", order:0}, _m:0}]);
const Workouts = DocStore("homebase.lifts.workouts.v1", "workout");
const LiftSessions = DocStore("homebase.lifts.sessions.v1", "liftsession");
const AppData = DocStore("homebase.appdata.v1", "appdata");

/* Sites that refuse to be shown inside another page. New links to them default to "always open in a new tab". */
const NO_FRAME = ["google.com","gmail.com","github.com","facebook.com","instagram.com","x.com","twitter.com","linkedin.com","reddit.com","amazon.com","netflix.com",
  "apple.com","icloud.com","microsoft.com","office.com","live.com","outlook.com","microsoftonline.com","sharepoint.com","notion.so","chatgpt.com","openai.com",
  "claude.ai","anthropic.com","brightspace.com","instructure.com","stackoverflow.com","discord.com","slack.com","zoom.us","spotify.com","twitch.tv","tiktok.com",
  "paypal.com","venmo.com","chase.com","bankofamerica.com","wellsfargo.com","capitalone.com","dropbox.com","canva.com","figma.com","supabase.com","vercel.com","ntfy.sh"];
const likelyBlocks = u => { const h = hostOf(u); return !!h && NO_FRAME.some(d => h === d || h.endsWith("." + d)); };
const opensTab = l => l.kind !== "app" && (!!l.newTab || (l.kind === "url" && /^http:/i.test(l.url || "")));
function embedUrl(u){
  try {
    const x = new URL(u), h = x.hostname.replace(/^(www|m)\./, "");
    if (h === "youtube.com" && x.pathname === "/watch" && x.searchParams.get("v")) return `https://www.youtube.com/embed/${encodeURIComponent(x.searchParams.get("v"))}`;
    if (h === "youtu.be" && x.pathname.length > 1) return `https://www.youtube.com/embed/${encodeURIComponent(x.pathname.slice(1))}`;
  } catch(e){}
  return u;
}
const LICONS = {
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  cap:'<path d="M12 4 2 9l10 5 10-5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  code:'<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  music:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h11l2-8H6.2"/>',
  dumbbell:'<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  flask:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>',
  home:'<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>',
  star:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
};
const LEMOJI = ["🏋️","📚","🎓","📅","📝","💼","⚡","🔋","🧮","🔬","💡","🌐","🏠","💰","🛒","🍳","🏃","🎵","🎬","📈","🗂️","⭐","🎮","☕"];
function iconHTML(l){
  const ic = (l && l.icon) || "";
  if (ic.startsWith("e:")) return `<span class="lk-ic" aria-hidden="true">${esc(ic.slice(2))}</span>`;
  if (ic.startsWith("i:") && LICONS[ic.slice(2)]) return `<span class="lk-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LICONS[ic.slice(2)]}</svg></span>`;
  if (ic.startsWith("img:")) return `<span class="lk-ic img" aria-hidden="true"><img src="${esc(ic.slice(4))}" alt=""></span>`;
  if (ic === "f:" && l.url && hostOf(l.url)) return `<span class="lk-ic" aria-hidden="true"><img src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(new URL(l.url).hostname)}.ico" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  return "";
}
const linkName = l => l.title || (l.kind === "url" ? hostOf(l.url) : (l.fileName || "").replace(/\.html?$/i, "")) || "Link";
const linksSorted = () => LinkStore.all().map(o => ({id:o.id, ...o.d})).filter(l => l.title || l.icon || l.url || l.html).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || linkName(a).localeCompare(linkName(b)));
const getLink = id => { const d = LinkStore.get(id); return d ? {id, ...d} : null; };

function renderLinkRow(){
  const el = $("#linkrow"), L = linksSorted();
  el.innerHTML = L.map(l => { const ic = iconHTML(l) || (l.title ? "" : iconHTML({...l, icon:"f:"})), only = !l.title && ic;
    return `<button type="button" class="lk ${only ? "icononly" : ""}" data-link="${esc(l.id)}" title="${esc(linkName(l))}${opensTab(l) ? " (opens in a new tab)" : ""}" aria-label="${esc(linkName(l))}">${ic}${only ? "" : `<span class="lk-t">${esc(linkName(l))}</span>`}${opensTab(l) && !only ? '<span class="lk-ext" aria-hidden="true">↗</span>' : ""}</button>`; }).join("");
  el.hidden = !L.length;
}
$("#linkrow").addEventListener("click", e => { const b = e.target.closest("[data-link]"); if (b) openLink(b.dataset.link); });

/* ---------- the pop-up ---------- */
const SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";
const lx = {id:null, timer:0};
const appWins = new Map();   // sandboxed app window → link id (for saving what it stores)
let liftFrame = null;
function openLink(id, forcePopup){
  const l = getLink(id); if (!l) return;
  if (!forcePopup && opensTab(l)) return openInTab(l);
  lx.id = l.id; clearTimeout(lx.timer);
  $("#lx-ic").innerHTML = iconHTML(l);
  $("#lx-t").textContent = linkName(l);
  $("#lx-sub").textContent = l.kind === "url" ? hostOf(l.url) : l.kind === "html" ? `${l.fileName || "HTML file"} · runs sandboxed` : "Built into Homebase";
  $("#lx-hint").hidden = true;
  const body = $("#lx-body");
  body.querySelectorAll("iframe:not(#lx-lifts)").forEach(f => { appWins.delete(f.contentWindow); f.remove(); });
  if (liftFrame) liftFrame.hidden = true;
  if (l.kind === "app"){ ensureLiftFrame().hidden = false; }
  else {
    const f = document.createElement("iframe");
    f.title = linkName(l);
    if (l.kind === "html"){ f.setAttribute("sandbox", SANDBOX); f.dataset.app = l.id; body.appendChild(f); appWins.set(f.contentWindow, l.id); f.srcdoc = appDoc(l); }
    else {
      f.src = embedUrl(l.url); f.referrerPolicy = "strict-origin-when-cross-origin"; f.allow = "fullscreen; clipboard-write; autoplay";
      body.appendChild(f);
      if (!l.embedOk){ const show = () => { if (lx.id === l.id) $("#lx-hint").hidden = false; }; f.addEventListener("load", () => setTimeout(show, 900), {once:true}); lx.timer = setTimeout(show, 6000); }
    }
  }
  const d = $("#dlg-link"); if (!d.open) d.showModal();
}
function openInTab(l){
  if (l.kind === "url") return void window.open(l.url, "_blank", "noopener");
  if (l.kind === "app") return void window.open(siteBase() + "#link/" + encodeURIComponent(l.id), "_blank");
  /* An uploaded HTML file gets a blank tab of ours holding the same sandboxed frame, so it still can't read Homebase's data. */
  const w = window.open("", "_blank");
  if (!w){ toast("Your browser blocked the new tab. Allow pop-ups for this site."); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(linkName(l))}<\/title><style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}<\/style><\/head><body><\/body><\/html>`);
  w.document.close();
  const f = w.document.createElement("iframe"); f.setAttribute("sandbox", SANDBOX); w.document.body.appendChild(f);
  appWins.set(f.contentWindow, l.id); w.addEventListener("message", onAppMessage);
  f.srcdoc = appDoc(l);
}
$("#lx-tab").onclick = () => { const l = getLink(lx.id); if (l) openInTab(l); };
$("#lx-reload").onclick = () => {
  const l = getLink(lx.id); if (!l) return;
  if (l.kind === "app"){ if (liftFrame){ setLiftDoc(liftFrame); } return; }
  openLink(l.id, true);
};
$("#lx-hint").addEventListener("click", e => {
  const b = e.target.closest("[data-lxh]"); if (!b) return; const l = getLink(lx.id); if (!l) return;
  const {id, ...d} = l;
  if (b.dataset.lxh === "tab"){ openInTab(l); return; }
  if (b.dataset.lxh === "always"){ LinkStore.put(id, {...d, newTab:true}); $("#dlg-link").close(); openInTab(l); toast(`"${trunc(linkName(l), 24)}" will open in a new tab from now on`); return; }
  if (b.dataset.lxh === "ok"){ LinkStore.put(id, {...d, embedOk:true}); $("#lx-hint").hidden = true; }
});
$("#dlg-link").addEventListener("close", () => {
  clearTimeout(lx.timer); lx.id = null;
  $("#lx-body").querySelectorAll("iframe:not(#lx-lifts)").forEach(f => { appWins.delete(f.contentWindow); f.remove(); });
  if (/^#link\//.test(location.hash)) history.replaceState(null, "", "#home");
});

/* ---------- uploaded HTML: sandboxed, with storage kept by Homebase ---------- */
/* The file runs with no access to Homebase. Its localStorage is replaced by a copy Homebase keeps (and syncs);
   writes come back by postMessage from that one frame only. */
const APP_SHIM = `(function(){var D=__DATA__;function mk(init,area){var m=Object.create(null);Object.keys(init||{}).forEach(function(k){m[k]=String(init[k]);});
function post(op,k,v){try{parent.postMessage({hbApp:1,area:area,op:op,k:k,v:v},"*");}catch(e){}}
var st={getItem:function(k){k=String(k);return k in m?m[k]:null;},setItem:function(k,v){k=String(k);v=String(v);m[k]=v;post("set",k,v);},removeItem:function(k){k=String(k);delete m[k];post("del",k);},clear:function(){m=Object.create(null);post("clear");},key:function(i){return Object.keys(m)[i]||null;},get length(){return Object.keys(m).length;}};
return new Proxy(st,{get:function(t,p){if(p in t)return t[p];if(typeof p==="string"&&p in m)return m[p];return undefined;},set:function(t,p,v){t.setItem(p,v);return true;},deleteProperty:function(t,p){t.removeItem(p);return true;},ownKeys:function(){return Object.keys(m);},getOwnPropertyDescriptor:function(t,p){return p in m?{value:m[p],writable:true,enumerable:true,configurable:true}:undefined;}});}
try{Object.defineProperty(window,"localStorage",{value:mk(D,"ls"),configurable:true});}catch(e){}
try{Object.defineProperty(window,"sessionStorage",{value:mk({},"ss"),configurable:true});}catch(e){}})();`;
function appDoc(l){
  const tag = `<script>${APP_SHIM.replace("__DATA__", safeJSON(((AppData.get(l.id) || {}).ls) || {}))}<\/script>`;
  const html = String(l.html || "");
  for (const rx of [/<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i, /<!doctype[^>]*>/i]) if (rx.test(html)) return html.replace(rx, m => m + tag);
  return tag + html;
}
const appPending = {}, appTimers = {};
function onAppMessage(e){
  const m = e.data; if (!m || m.hbApp !== 1 || m.area !== "ls") return;
  const id = appWins.get(e.source); if (!id) return;
  const ls = appPending[id] || (appPending[id] = {...(((AppData.get(id) || {}).ls) || {})});
  if (m.op === "set" && typeof m.k === "string") ls[m.k] = String(m.v);
  else if (m.op === "del") delete ls[m.k];
  else if (m.op === "clear") for (const k of Object.keys(ls)) delete ls[k];
  clearTimeout(appTimers[id]);
  appTimers[id] = setTimeout(() => { AppData.put(id, {ls:appPending[id]}); delete appPending[id]; }, 500);
}
addEventListener("message", onAppMessage);

