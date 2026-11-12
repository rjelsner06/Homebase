/* Homebase: Settings → Sync & account, setup links, and BOOT (starts everything; must load last).
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   SETTINGS → Sync & account
   ===================================================================== */
function renderCloud(){
  const st = Sync.state, cfg = Sync.config(), u = Sync.user(), box = $("#sy-box");
  if (!cfg){
    box.innerHTML = `<p class="note">Sign in to use the same Homebase on your laptop and iPhone. You need a free Supabase project first (the setup guide that came with this file walks you through it).</p>
      <div class="field"><label for="sy-url">Project URL</label><input id="sy-url" type="url" placeholder="https://abcdefghijkl.supabase.co" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label for="sy-key">Publishable key</label><input id="sy-key" autocomplete="off" spellcheck="false" placeholder="sb_publishable_… or the anon key"></div>
      <div class="rv-tools"><button type="button" class="btn small primary" data-sy="connect">Connect</button><span class="note" id="sy-msg"></span></div>
      <p class="note">These are saved in this browser only, never in the HTML file. The publishable key is meant to be public; your data is protected by sign-in and row-level security.</p>`;
    return;
  }
  const host = hostOf(cfg.url);
  if (!u){
    box.innerHTML = `<p class="note">${st === "connecting" ? "Connecting to " : "Project: "}<b>${esc(host)}</b>${st === "error" ? ` · <span style="color:var(--bad)">${esc(Sync.error)}</span>` : ""}</p>
      <form id="sy-form" class="sy-form" autocomplete="on" onsubmit="return false">
        <div class="row"><div class="field"><label for="sy-email">Email</label><input id="sy-email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="sy-pass">Password</label><input id="sy-pass" type="password" autocomplete="current-password" minlength="6"></div></div>
        <div class="rv-tools"><button type="button" class="btn small primary" data-sy="in">Sign in</button><button type="button" class="btn small" data-sy="up">Create account</button><button type="button" class="btn small ghost" data-sy="link">Email me a sign-in link</button></div>
      </form><p class="note" id="sy-msg"></p>
      <div class="rv-tools"><button type="button" class="btn small ghost" data-sy="forget">Use a different project</button></div>`;
    return;
  }
  box.innerHTML = `<div class="sy-status"><span class="sy-dot" data-s="${esc(st)}"></span><span><b>${esc(u.email || "Signed in")}</b><br><span class="note">${esc(Sync.statusText())}</span></span></div>
    <div class="rv-tools"><button type="button" class="btn small" data-sy="now">Sync now</button><button type="button" class="btn small" data-sy="setup">Copy setup link for your phone</button><button type="button" class="btn small ghost" data-sy="out">Sign out</button></div>
    <p class="note" id="sy-msg">Project: ${esc(host)}. The setup link carries only the project address and publishable key; you still sign in on the phone.</p>`;
}
$("#sy-box").addEventListener("click", async e => {
  const b = e.target.closest("[data-sy]"); if (!b) return;
  const m = t => { const el = $("#sy-msg"); if (el){ el.textContent = t; el.style.color = /^⚠|^That's a secret/.test(t) ? "var(--bad)" : ""; } };
  const em = () => ($("#sy-email") || {}).value?.trim() || "", pw = () => ($("#sy-pass") || {}).value || "";
  try {
    switch (b.dataset.sy){
      case "connect": {
        /* Accept the URL however it was copied: with /rest/v1/ on the end, or even the dashboard address. */
        let raw = $("#sy-url").value.trim(), url = ""; const key = $("#sy-key").value.trim();
        if (raw && !/^https?:\/\//i.test(raw)) raw = "https://" + raw;
        try { const x = new URL(raw), dm = x.pathname.match(/\/project\/([a-z0-9]{10,})/i);
          url = /(^|\.)supabase\.com$/i.test(x.hostname) && dm ? `https://${dm[1].toLowerCase()}.supabase.co` : x.protocol === "https:" ? x.origin : ""; } catch(_){}
        if (!url) return m("⚠ That project URL doesn't look right. It should look like https://abcdefghijkl.supabase.co");
        if (!key) return m("⚠ Paste the publishable key too.");
        if (/service_role|sb_secret_/i.test(key) || /"role"\s*:\s*"service_role"/.test(atobSafe(key.split(".")[1]))) return m("⚠ That's a secret key. Use the publishable (anon) key instead, and never paste the secret key into a web page.");
        m("Connecting…"); await Sync.setConfig({url, key}); renderCloud(); return;
      }
      case "in": if (!em() || !pw()) return m("Enter your email and password."); m("Signing in…"); await Sync.signIn(em(), pw()); m(""); return;
      case "up": if (!em() || pw().length < 6) return m("Enter your email and a password of at least 6 characters."); m("Creating your account…"); { const confirm = await Sync.signUp(em(), pw()); m(confirm ? "Check your email and click the confirmation link, then sign in here." : "Account created."); } return;
      case "link": if (!em()) return m("Enter your email first."); await Sync.magicLink(em()); m("Check your email for the sign-in link. Open it on this device."); return;
      case "forget": if (await confirmBox({title:"Use a different project?", body:"This browser forgets the project address and key. Your data stays in this browser and in the old project.", ok:"Forget project"})){ await Sync.setConfig(null); renderCloud(); } return;
      case "now": m("Syncing…"); await Sync.syncNow(); renderCloud(); return;
      case "setup": { const link = siteBase() + "#hbsetup=" + btoa(JSON.stringify(Sync.config()));
        try { await navigator.clipboard.writeText(link); m("Copied. Send it to your phone (for example in a note to yourself) and open it in Safari, then sign in."); } catch(_){ m(link); } return; }
      case "out": if (await confirmBox({title:"Sign out of sync?", body:"Everything stays in this browser. Changes made while signed out are merged the next time you sign in.", ok:"Sign out"})){ await Sync.signOut(); renderCloud(); } return;
    }
  } catch(err){ m(err.message || String(err)); }
});
function atobSafe(s){ try { return atob(String(s || "").replace(/-/g, "+").replace(/_/g, "/")); } catch(e){ return ""; } }
Sync.subscribe(() => {
  if ($("#dlg-settings").open && !$("#sy-box").contains(document.activeElement)) renderCloud();
  const n = $("#store-note"); if (n && Store.persistent) n.textContent = Sync.statusText();
});

/* A setup link from another device: #hbsetup=<base64 of {url, key}>. Works on a fresh load or in an open tab. */
function checkSetupLink(){
  const m = location.hash.match(/^#hbsetup=(.+)$/); if (!m) return false;
  history.replaceState(null, "", "#home");
  try {
    const c = JSON.parse(atob(decodeURIComponent(m[1])));
    if (c && /^https:\/\//.test(c.url) && c.key){
      Sync.setConfig({url:c.url, key:c.key});
      setTimeout(() => { toast("Sync project added. Sign in to finish."); openSettings("sync"); }, 300);
    }
  } catch(e){ toast("That setup link looks incomplete. Copy it again from your laptop."); }
  return true;
}
/* Everything above that needs the page to be up. Called from BOOT. */
function bootExtras(){
  renderLinkRow();
  if (!checkSetupLink()) Sync.start();
}

/* =====================================================================
   BOOT
   ===================================================================== */
(async () => {
  tick(); setInterval(tick, 1000);
  loadWeather();
  Store.subscribe(() => { if (ready) renderAll(); });
  await Store.init(LocalAdapter);
  Notes.purgeExpired();
  allCourses().forEach(courseIndex);   // give existing courses stable colors in alphabetical order
  /* items join sync only once they're loaded, so loading doesn't count as a change */
  Sync.register("item", {all:() => [...Store.all(), ...Store.deleted()], m:r => Date.parse(r.updatedAt) || 0,
    seedOnly:() => [...Store.all(), ...Store.deleted()].every(r => r.sample), isSeed:r => !!r.sample, apply:(u, d) => Store.applyRemote(u, d)});
  Store.subscribe(() => Sync.touch("item"));
  ready = true;
  bootExtras();
  route();
})();
