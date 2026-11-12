/* Homebase: LIFTS: bridge between Homebase storage and the Lifts frame (the app itself is apps/lifts.html).
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   LIFTS: the Two-Day Lift Log, built in. It runs in its own frame (its
   code and styles are in apps/lifts.html), and its
   saved workouts go through Homebase's synced storage instead of Claude's.
   ===================================================================== */
const LiftDB = (() => {
  const col = n => n === "sessions" ? LiftSessions : Workouts;
  const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);
  const merge = (a, b) => { Object.keys(b).forEach(k => { const v = b[k]; if (v === undefined) return; a[k] = isObj(v) ? merge(isObj(a[k]) ? a[k] : {}, v) : v; }); return a; };
  const cp = o => o == null ? o : JSON.parse(JSON.stringify(o));
  return {
    collection(name){
      const S = col(name), q = {limit(){ return q; }, onSnapshot(cb){
        const fire = () => { try { cb({docs:S.all().map(o => ({id:o.id, exists:true, data:() => cp(o.d)}))}); } catch(e){ console.error(e); } };
        const un = S.subscribe(fire); setTimeout(fire, 0); return un; }};
      return q;
    },
    doc(path){
      const [c, id] = String(path).split("/"), S = col(c);
      return {
        async update(data){ S.put(id, merge(cp(S.get(id)) || {}, cp(data))); },
        async set(data){ S.put(id, cp(data)); },
        async get(){ return {exists:!!S.get(id), data:() => cp(S.get(id))}; },
      };
    },
  };
})();
window.HB_LIFTS = {db:LiftDB, downloads:{async save({filename, data}){ downloadText(filename, data, /\.json$/i.test(filename) ? "application/json" : "text/csv"); }}};
const LIFT_BRIDGE = `window.claude={use:function(n){var B=parent.HB_LIFTS;if(!B)return Promise.reject(new Error("no host"));if(n==="db")return Promise.resolve(B.db);if(n==="downloads")return Promise.resolve(B.downloads);return Promise.reject(Object.assign(new Error("unavailable"),{code:"unavailable"}));}};`;
function liftDoc(){
  return `<!doctype html><html lang="en" data-theme="${currentTheme()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Lifts</title><script>${LIFT_BRIDGE}<\/script><\/head><body>${$("#tpl-lifts").innerHTML}<\/body><\/html>`;
}
/* apps/lifts.html is fetched once at startup and kept in a <template id="tpl-lifts">, exactly as when it lived inside
   index.html. (fetch works on Live Server and GitHub Pages; it does not work if index.html is opened as a plain file.) */
const liftTemplate = fetch("apps/lifts.html", {cache:"no-cache"})
  .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
  /* VS Code's Live Server slips its auto-reload script into every .html file it serves (before the first </body>, </svg>
     or </head>, even one inside the Lifts code). Take it back out so Lifts runs exactly as on GitHub Pages. */
  .then(html => html.replace(/<!-- Code injected by live-server -->[\s\S]*?<\/script>(\r?\n)?/g, ""))
  .then(html => { const t = document.createElement("template"); t.id = "tpl-lifts"; t.innerHTML = html; document.body.appendChild(t); });
liftTemplate.catch(e => console.error("Lifts: couldn't load apps/lifts.html", e));
function setLiftDoc(f){
  liftTemplate.then(() => { f.srcdoc = liftDoc(); },
    () => { f.srcdoc = `<!doctype html><meta charset="utf-8"><body style="font:15px -apple-system,sans-serif;padding:24px">Couldn't load the Lifts app (apps/lifts.html). Check your connection and reload.</body>`; });
}
function ensureLiftFrame(){
  if (liftFrame) return liftFrame;
  const f = document.createElement("iframe"); f.id = "lx-lifts"; f.title = "Lifts";
  $("#lx-body").appendChild(f); setLiftDoc(f); liftFrame = f; return f;
}
window.HB_onTheme = t => { try { if (liftFrame && liftFrame.contentDocument) liftFrame.contentDocument.documentElement.dataset.theme = t; } catch(e){} };

