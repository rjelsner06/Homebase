/* Homebase: GROCERY LIST: quick add ("2 milk"), aisles, stores with "look up" links, in-cart section, home widget,
   and Settings → Grocery (stores and aisles).
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";

/* =====================================================================
   DATA (four synced kinds, each a DocStore: one record per thing, newest edit wins)

   "grocitem"  one line on the list
     {v:1, name, key, qty (number or null = just "some"), unit ("" / "lb" / "pack"…), note,
      cat (aisle id), store (store id, "" = any store), checked, checkedAt (ms), added (ms),
      list ("main"; room for more lists later),
      src (null, or where it came from, e.g. {kind:"recipe", id, title} for the coming Recipe book)}
   "grocprod"  what you've bought before, keyed by a simple name key ("tomatoes" and "Tomato" → "tomato").
               Drives autocomplete, "Buy again", and remembering an item's aisle and store.
               The future Pantry can hang its stock levels on these same keys.
     {v:1, name, cat, store, unit, uses (times added), bought (times cleared from the cart), last, lastBought}
   "grocstore" a store: {v:1, name, site, search (address with {q} where the search word goes), main, order, deleted}
               Stores are never removed, only marked deleted, so the built-in Payless never comes back by itself.
   "grocaisle" an aisle: {v:1, name, emoji, order, hidden, builtin}
   ===================================================================== */
const GROC_AISLES = [
  ["produce","Produce","🥬"], ["bakery","Bakery","🍞"], ["deli","Deli","🥪"], ["meat","Meat & seafood","🥩"],
  ["dairy","Dairy & eggs","🥛"], ["frozen","Frozen","🧊"], ["pantry","Pantry","🥫"], ["snacks","Snacks","🍿"],
  ["drinks","Drinks","🥤"], ["household","Household","🧻"], ["personal","Personal care","🧴"], ["other","Other","🛒"],
];
const GrocItems = DocStore("homebase.grocery.items.v1", "grocitem");
const GrocProducts = DocStore("homebase.grocery.products.v1", "grocprod");
const GrocStores = DocStore("homebase.grocery.stores.v1", "grocstore",
  () => [{id:"payless", d:{v:1, name:"Payless", site:"", search:"", main:true, order:0, deleted:false}, _m:0}]);
const GrocAisles = DocStore("homebase.grocery.aisles.v1", "grocaisle",
  () => GROC_AISLES.map(([id, name, emoji], i) => ({id, d:{v:1, name, emoji, order:i, hidden:false, builtin:true}, _m:0})));

/* =====================================================================
   TEXT: name keys, "2 lb chicken" parsing, and guessing the aisle
   ===================================================================== */
/* A rough singular so "Tomatoes" and "tomato", "berries" and "berry" match. Only used for matching. */
function grocStem(w){
  if (w.length > 3){
    if (/ies$/.test(w)) w = w.slice(0, -3) + "i";
    else if (/(oes|ches|shes|sses|xes|zes)$/.test(w)) w = w.slice(0, -2);
    else if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  }
  return w.replace(/ie$/, "i").replace(/([^aeiou])y$/, "$1i");
}
const grocTokens = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean).map(grocStem);
const grocKey = s => grocTokens(s).join(" ");

const GROC_UNITS = {lb:"lb", lbs:"lb", pound:"lb", pounds:"lb", oz:"oz", ounce:"oz", ounces:"oz", g:"g", gram:"g", grams:"g", kg:"kg",
  gal:"gal", gallon:"gal", gallons:"gal", qt:"qt", quart:"qt", quarts:"qt", pt:"pt", pint:"pt", pints:"pt", l:"L", liter:"L", liters:"L", litre:"L", litres:"L",
  ml:"mL", dozen:"dozen", doz:"dozen", pk:"pack", pkg:"pack", pack:"pack", packs:"pack", can:"can", cans:"can", box:"box", boxes:"box", bag:"bag", bags:"bag",
  bottle:"bottle", bottles:"bottle", jar:"jar", jars:"jar", bunch:"bunch", bunches:"bunch", ct:"ct", loaf:"loaf", loaves:"loaf", carton:"carton", cartons:"carton",
  head:"head", heads:"head", cup:"cup", cups:"cup", block:"block", blocks:"block", tub:"tub", tubs:"tub"};
const GROC_UNIT_LIST = ["", "lb", "oz", "g", "kg", "gal", "qt", "pt", "L", "mL", "dozen", "pack", "can", "box", "bag", "bottle", "jar", "bunch", "loaf", "carton", "head", "cup", "block", "tub", "ct"];
const GROC_FRAC = {"½":.5, "¼":.25, "¾":.75, "⅓":1/3, "⅔":2/3};
/* "1 1/2", "1/2", "1.5", "1,5", "½", "1½" → a number (or null) */
function grocNum(s){
  s = String(s || "").trim().replace(",", "."); if (!s) return null;
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔])$/); if (m) return +m[1] + GROC_FRAC[m[2]];
  if (GROC_FRAC[s]) return GROC_FRAC[s];
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m && +m[3]) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d+)\/(\d+)$/); if (m && +m[2]) return m[1] / m[2];
  return /^\d*\.?\d+$/.test(s) && +s > 0 ? +s : null;
}
/* "2 milk", "2x milk", "1.5 lb chicken", "2 cans of tuna", "a dozen eggs", "milk x2", "eggs (2)" → {qty, unit, name} */
function grocParse(raw){
  let s = String(raw || "").replace(/\s+/g, " ").trim(), qty = null, unit = "";
  const NUM = "(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔])";
  let m = s.match(new RegExp("^" + NUM + "\\s*(?:x|×)?\\s+(.+)$", "i"));
  if (m && grocNum(m[1]) != null){ qty = grocNum(m[1]); s = m[2]; }
  else if ((m = s.match(/^(?:a|an|one)\s+([a-z]+)\s+(?:of\s+)?(.+)$/i)) && GROC_UNITS[m[1].toLowerCase()]){ qty = 1; s = m[1] + " " + m[2]; }
  else if ((m = s.match(new RegExp("^(.+?)\\s*(?:\\s(?:x|×)\\s*|×\\s*|\\(\\s*)" + NUM + "\\s*\\)?$", "i"))) && grocNum(m[2]) != null){ qty = grocNum(m[2]); s = m[1]; }
  if (qty != null || /^[a-z]+\s/i.test(s)){
    const u = s.match(/^([a-z]+)\.?\s+(?:of\s+)?(.+)$/i);
    if (u && GROC_UNITS[u[1].toLowerCase()] && (qty != null || u[1].toLowerCase() === "dozen")){ unit = GROC_UNITS[u[1].toLowerCase()]; s = u[2]; if (qty == null) qty = 1; }
  }
  s = s.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");
  return {qty, unit, name:s};
}
const grocCap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function grocNumText(n){
  const w = Math.floor(n), f = Math.round((n - w) * 100) / 100, G = {.5:"½", .25:"¼", .75:"¾", .33:"⅓", .67:"⅔"};
  if (!f) return String(w);
  if (G[f]) return (w || "") + G[f];
  return String(Math.round(n * 100) / 100);
}
const GROC_COUNTED = {can:"cans", box:"boxes", bag:"bags", bottle:"bottles", jar:"jars", bunch:"bunches", loaf:"loaves", carton:"cartons", head:"heads", pack:"packs", block:"blocks", tub:"tubs", cup:"cups"};
const grocQty = (q, u) => q == null ? (u ? u : "") : (u ? `${grocNumText(q)} ${q > 1 && GROC_COUNTED[u] ? GROC_COUNTED[u] : u}` : `×${grocNumText(q)}`);

/* Words that point to an aisle. A word's last match wins ("chicken noodle soup" → Pantry), whole phrases
   beat their parts ("peanut butter" → Pantry, not Dairy). Your own choice for an item always wins next time. */
const GROC_WORDS = {
  produce:"apple banana orange lemon lime grape strawberry blueberry raspberry blackberry berry avocado tomato potato onion garlic lettuce spinach kale carrot celery cucumber pepper broccoli cauliflower zucchini squash mushroom cilantro parsley basil mint herb ginger jalapeno corn pear peach plum nectarine mango pineapple melon watermelon cantaloupe honeydew kiwi cabbage salad greens arugula asparagus yam radish beet scallion shallot leek fruit veggie vegetable produce cherry clementine grapefruit pomegranate coleslaw|green bean|sweet potato|green onion|bell pepper|romaine|bok choy|brussels sprout|snap pea|baby carrot|salad kit",
  bakery:"bread bagel bun roll tortilla croissant muffin donut doughnut cake pie pita baguette loaf brioche biscuit naan scone cupcake|english muffin|hamburger bun|hot dog bun|sourdough",
  deli:"salami pepperoni prosciutto hummus guacamole|lunch meat|deli meat|rotisserie chicken|sliced turkey|sliced ham|potato salad|pasta salad|chicken salad",
  meat:"chicken beef pork steak bacon sausage turkey ham fish salmon shrimp brat bratwurst hotdog meatball chorizo tilapia cod lamb rib wing tenderloin drumstick thigh brisket veal crab lobster scallop|ground beef|ground turkey|hot dog|chicken breast|pork chop",
  dairy:"milk egg butter cheese yogurt yoghurt cream creamer mozzarella cheddar parmesan feta provolone margarine kefir ricotta|sour cream|cream cheese|half and half|cottage cheese|oat milk|almond milk|soy milk|string cheese|whipped cream|heavy cream|greek yogurt|orange juice",
  frozen:"frozen popsicle waffle pizza|ice cream|pizza roll|tater tot|french fry|frozen vegetable|frozen fruit|ice pop|frozen dinner|hash brown|chicken nugget|ice",
  pantry:"rice pasta spaghetti penne noodle macaroni flour sugar salt oil vinegar ketchup mustard mayo mayonnaise sauce salsa jelly jam honey syrup cereal oatmeal oat granola soup broth stock bean lentil tuna spice cinnamon vanilla yeast coffee tea seasoning dressing ranch sriracha quinoa ramen nutella cornstarch breadcrumb crouton pickle olive|black pepper|olive oil|peanut butter|baking soda|baking powder|brown sugar|hot sauce|soy sauce|bbq sauce|pasta sauce|mac and cheese|protein powder|maple syrup|chicken broth|canned tomato|tomato sauce|tomato paste|vegetable oil|cooking spray|pancake mix",
  snacks:"chip cracker cookie pretzel popcorn candy chocolate nut almond cashew peanut pistachio jerky dorito cheeto oreo|granola bar|protein bar|trail mix|fruit snack|rice cake|tortilla chip|potato chip",
  drinks:"water juice soda coke pepsi sprite gatorade powerade lemonade beer wine kombucha seltzer|sparkling water|energy drink|apple juice|cold brew|sports drink|la croix",
  household:"detergent sponge bleach cleaner lysol battery lightbulb napkin tissue foil|paper towel|toilet paper|trash bag|garbage bag|aluminum foil|plastic wrap|zip bag|ziploc bag|dish soap|dishwasher pod|laundry detergent|light bulb|paper plate|dryer sheet|hand soap",
  personal:"shampoo conditioner soap toothpaste toothbrush floss deodorant razor lotion sunscreen ibuprofen tylenol advil vitamin bandage chapstick mouthwash|body wash|contact solution|band aid|q tip|face wash|cough drop",
};
const GROC_DICT = (() => {
  const one = new Map(), many = new Map();
  for (const [cat, txt] of Object.entries(GROC_WORDS)){
    const [singles, ...phrases] = txt.split("|");
    singles.split(" ").filter(Boolean).forEach(w => one.set(grocStem(w), cat));
    phrases.forEach(p => many.set(grocKey(p), cat));
  }
  return {one, many};
})();
function grocGuess(name){
  const t = grocTokens(name); if (!t.length) return "other";
  if (t.includes("frozen")) return "frozen";
  if (t.includes("canned")) return "pantry";
  const used = t.map(() => false), hits = [];
  for (let len = 3; len >= 2; len--) for (let i = 0; i + len <= t.length; i++){
    const c = GROC_DICT.many.get(t.slice(i, i + len).join(" "));
    if (c && !used.slice(i, i + len).some(Boolean)){ for (let k = i; k < i + len; k++) used[k] = true; hits.push({c, end:i + len - 1, len}); }
  }
  t.forEach((w, i) => { const c = !used[i] && GROC_DICT.one.get(w); if (c) hits.push({c, end:i, len:1}); });
  hits.sort((a, b) => b.end - a.end || b.len - a.len);
  return hits.length ? hits[0].c : "other";
}

/* =====================================================================
   THE GROCERY PAGE (#grocery), the edit sheet, the home widget, Settings → Grocery
   ===================================================================== */
const Grocery = (() => {
  const UI_KEY = "homebase.grocery.ui.v1";   // this device only: which store is picked, whether "In cart" is open
  const ui = Object.assign({store:"", cartOpen:true}, HBStore.get(UI_KEY, null) || {});
  const saveUi = () => HBStore.set(UI_KEY, {store:ui.store, cartOpen:ui.cartOpen});
  const SV = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    edit:SV('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'),
    look:SV('<circle cx="10.5" cy="10.5" r="6"/><path d="m20 20-5-5"/>'),
    share:SV('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
    gear:SV('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    chev:SV('<path d="m6 9 6 6 6-6"/>'),
    out:SV('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    up:SV('<path d="m6 15 6-6 6 6"/>'), down:SV('<path d="m6 9 6 6 6-6"/>'),
  };
  const num = x => x === null || x === undefined || x === "" ? null : (Number.isFinite(+x) && +x > 0 ? +x : null);
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- reading records ---------- */
  const normItem = o => { const d = o.d || {};
    return {id:o.id, name:String(d.name || "").trim() || "Item", key:String(d.key || grocKey(d.name)), qty:num(d.qty), unit:String(d.unit || ""), note:String(d.note || ""),
      cat:String(d.cat || "other"), store:String(d.store || ""), checked:!!d.checked, checkedAt:+d.checkedAt || 0, added:+d.added || 0, list:String(d.list || "main"), src:d.src || null}; };
  const items = () => GrocItems.all().map(normItem).filter(i => i.list === "main");
  const openItems = () => items().filter(i => !i.checked);
  let aCache = null, sCache = null;
  GrocAisles.subscribe(() => { aCache = null; });
  GrocStores.subscribe(() => { sCache = null; });
  function aisles(){
    if (aCache) return aCache;
    const L = GrocAisles.all().map(o => { const d = o.d || {}; return {id:o.id, name:String(d.name || o.id), emoji:String(d.emoji || ""), order:+d.order || 0, hidden:!!d.hidden, builtin:!!d.builtin}; })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    if (!L.some(a => a.id === "other")) L.push({id:"other", name:"Other", emoji:"🛒", order:999, hidden:false, builtin:true});
    return aCache = {list:L, map:new Map(L.map(a => [a.id, a]))};
  }
  const aisle = id => aisles().map.get(id) || aisles().map.get("other");
  function stores(){
    if (sCache) return sCache;
    return sCache = GrocStores.all().map(o => { const d = o.d || {}; return {id:o.id, name:String(d.name || "Store"), site:String(d.site || ""), search:String(d.search || ""), main:!!d.main, order:+d.order || 0, deleted:!!d.deleted}; })
      .filter(s => !s.deleted).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  const storeById = id => (id && stores().find(s => s.id === id)) || null;
  const mainStore = () => stores().find(s => s.main) || stores()[0] || null;
  const canLook = s => !!(s && /\{q\}/i.test(s.search));
  /* the store an item's "look up" link goes to: its own store, else the one picked at the top, else your main store */
  const lookStore = i => [storeById(i.store), storeById(ui.store), mainStore()].find(canLook) || null;
  const lookUrl = (s, name) => s.search.replace(/\{q\}/gi, encodeURIComponent(name));
  const inView = i => !ui.store || !i.store || i.store === ui.store;

  /* ---------- what you've bought before ---------- */
  const prodGet = key => { const d = key && GrocProducts.get(key);
    return d ? {key, name:String(d.name || ""), cat:String(d.cat || ""), store:String(d.store || ""), unit:String(d.unit || ""), uses:+d.uses || 0, bought:+d.bought || 0, last:+d.last || 0, lastBought:+d.lastBought || 0} : null; };
  const PROD0 = {v:1, name:"", cat:"", store:"", unit:"", uses:0, bought:0, last:0, lastBought:0};
  function remember(key, patch){
    if (!key) return;
    const cur = GrocProducts.get(key) || PROD0, next = {...PROD0, ...cur, ...patch};
    if (JSON.stringify(next) !== JSON.stringify(cur)) GrocProducts.put(key, next);
  }

  /* ---------- changing the list ---------- */
  let flashId = null;
  /* p = {qty, unit, name} (from grocParse). opts: {store, cat, note, src}. Returns the item's id. */
  function add(p, opts = {}){
    if (!p || !p.name || !p.name.trim()) return null;
    const key = grocKey(p.name), prod = prodGet(key), now = Date.now();
    const name = prod && prod.name ? prod.name : grocCap(p.name.trim());
    const store = opts.store != null ? opts.store : (ui.store || (prod && storeById(prod.store) ? prod.store : ""));
    const cat = opts.cat && aisles().map.has(opts.cat) ? opts.cat : prod && aisles().map.has(prod.cat) ? prod.cat : grocGuess(name);
    const same = i => key && i.key === key && (i.store === store || !i.store || !store);
    const all = items(), ex = all.find(i => same(i) && !i.checked) || all.find(i => same(i) && i.checked);
    if (ex){
      const before = GrocItems.get(ex.id);
      if (!ex.checked && p.qty == null){ flash(ex.id); toast(`${ex.name} is already on your list`); return ex.id; }
      let qty = ex.qty, unit = ex.unit;
      if (ex.checked){ if (p.qty != null){ qty = p.qty; unit = p.unit; } }
      else if (!ex.unit || !p.unit || ex.unit === p.unit){ qty = (ex.qty == null ? 1 : ex.qty) + p.qty; unit = ex.unit || p.unit; }
      else { qty = p.qty; unit = p.unit; }
      GrocItems.put(ex.id, {...before, qty, unit, checked:false, checkedAt:0, ...(opts.src ? {src:opts.src} : {})});
      remember(key, {name:ex.name, uses:(prod ? prod.uses : 0) + 1, last:now});
      toast(ex.checked ? `Moved ${ex.name} back to your list` : `${ex.name}: now ${grocQty(qty, unit)}`, () => GrocItems.put(ex.id, before));
      flash(ex.id); return ex.id;
    }
    const id = uid();
    GrocItems.put(id, {v:1, name, key, qty:p.qty, unit:p.unit || "", note:opts.note || "", cat, store, checked:false, checkedAt:0, added:now, list:"main", src:opts.src || null});
    remember(key, {name, cat, ...(store ? {store} : {}), ...(p.unit ? {unit:p.unit} : {}), uses:(prod ? prod.uses : 0) + 1, last:now});
    flash(id); return id;
  }
  /* For later (Recipe book): add several at once, e.g. addMany([{name:"Eggs", qty:2}], {src:{kind:"recipe", id, title:"Pancakes"}}). */
  function addMany(list, opts = {}){ return (list || []).map(x => add({qty:num(x.qty), unit:x.unit || "", name:String(x.name || "")}, opts)).filter(Boolean); }
  function setChecked(id, on, quiet){
    const d = GrocItems.get(id); if (!d) return;
    const before = {...d};
    GrocItems.put(id, {...d, checked:on, checkedAt:on ? Date.now() : 0});
    if (!quiet) toast(on ? `${trunc(d.name, 28)} is in the cart` : `${trunc(d.name, 28)} is back on the list`, () => GrocItems.put(id, before));
  }
  function remove(id){
    const d = GrocItems.get(id); if (!d) return;
    GrocItems.del(id); toast(`Deleted "${trunc(d.name, 30)}"`, () => GrocItems.put(id, d));
  }
  /* Clearing the cart counts as buying them (for "Buy again" and autocomplete order). Undo puts everything back. */
  function clearChecked(){
    const L = items().filter(i => i.checked && inView(i)); if (!L.length) return;
    const now = Date.now(), snapI = L.map(i => [i.id, GrocItems.get(i.id)]);
    const keys = [...new Set(L.map(i => i.key).filter(Boolean))], snapP = keys.map(k => [k, GrocProducts.get(k)]);
    const prods = new Map();
    for (const i of L){ if (!i.key) continue; const cur = prods.get(i.key) || {...PROD0, ...(GrocProducts.get(i.key) || {})};
      prods.set(i.key, {...cur, name:cur.name || i.name, cat:i.cat, unit:i.unit || cur.unit, bought:(+cur.bought || 0) + 1, lastBought:now}); }
    if (prods.size) GrocProducts.putMany([...prods]);
    GrocItems.delMany(L.map(i => i.id));
    toast(`Cleared ${plural(L.length, "item")} from the cart`, () => {
      GrocItems.putMany(snapI);
      const back = snapP.filter(([, d]) => d), gone = snapP.filter(([, d]) => !d).map(([k]) => k);
      if (back.length) GrocProducts.putMany(back);
      if (gone.length) GrocProducts.delMany(gone);
    });
  }

  /* ---------- the page ---------- */
  const pend = new Map();   // rows mid check-off animation: id → timer
  const rowHTML = (i, inCart) => {
    const s = inCart ? null : lookStore(i), many = stores().length > 1;
    const st = !ui.store && many && i.store ? storeById(i.store) : null;
    const sub = [i.note ? esc(i.note) : "", st ? `<span class="gr-st">${esc(st.name)}</span>` : "", i.src && i.src.title ? `for ${esc(i.src.title)}` : ""].filter(Boolean).join(" · ");
    const q = grocQty(i.qty, i.unit);
    return `<li class="gr-row ${inCart ? "done" : ""} ${pend.has(i.id) ? "checking" : ""}" data-gid="${i.id}">
      <button type="button" class="gr-tap" data-gtog="${i.id}" aria-label="${inCart ? "Put " + esc(i.name) + " back on the list" : "Check off " + esc(i.name)}">
        <span class="gr-ck" aria-hidden="true"></span>
        <span class="gr-tx"><span class="gr-nm">${esc(i.name)}</span>${q ? `<span class="gr-q">${esc(q)}</span>` : ""}${sub ? `<span class="gr-sub">${sub}</span>` : ""}</span>
      </button>${s ? `<a class="gr-ib" href="${esc(lookUrl(s, i.name))}" target="_blank" rel="noopener" title="Look up at ${esc(s.name)}" aria-label="Look up ${esc(i.name)} at ${esc(s.name)}">${IC.look}</a>` : ""}<button type="button" class="gr-ib" data-gedit="${i.id}" title="Edit" aria-label="Edit ${esc(i.name)}">${IC.edit}</button></li>`;
  };
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, {sensitivity:"base"});
  function render(){
    if (!ready) return;
    const all = items(), open = all.filter(i => !i.checked);
    const nc = $("#nav-groc"); if (nc){ nc.textContent = open.length || ""; nc.hidden = !open.length; }
    if (page !== "grocery") return;
    if (ui.store && !storeById(ui.store)){ ui.store = ""; saveUi(); }
    const S = stores(), vis = all.filter(inView), vOpen = vis.filter(i => !i.checked).sort(byName), vCart = vis.filter(i => i.checked).sort((a, b) => b.checkedAt - a.checkedAt);
    const hiddenN = all.length - vis.length;
    $("#gr-sub").textContent = all.length ? `${vOpen.length} to get${vCart.length ? ` · ${vCart.length} in cart` : ""}` : "";
    /* store picker (only with two or more stores) and the picked store's website */
    const cur = storeById(ui.store) || (S.length === 1 ? S[0] : null);
    const chips = S.length > 1 ? `<button type="button" data-gstore="" aria-pressed="${!ui.store}">All stores <b>${open.length}</b></button>` + S.map(s => `<button type="button" data-gstore="${s.id}" aria-pressed="${ui.store === s.id}">${esc(s.name)} <b>${open.filter(i => !i.store || i.store === s.id).length}</b></button>`).join("") : "";
    const site = cur && /^https?:\/\//i.test(cur.site) ? `<a class="gr-site" href="${esc(cur.site)}" target="_blank" rel="noopener">${esc(cur.name)} website ${IC.out}</a>` : "";
    $("#gr-stores").innerHTML = chips + site; $("#gr-stores").hidden = !chips && !site;
    /* the list, by aisle */
    const A = aisles(), groups = new Map();
    for (const i of vOpen){ const a = A.map.has(i.cat) ? i.cat : "other"; if (!groups.has(a)) groups.set(a, []); groups.get(a).push(i); }
    let h = A.list.filter(a => groups.has(a.id)).map(a => { const L = groups.get(a.id);
      return `<section class="gr-aisle" data-aisle="${a.id}"><h3 class="gr-ah"><span class="gr-em" aria-hidden="true">${esc(a.emoji)}</span>${esc(a.name)}<b>${L.length}</b></h3><ul class="gr-ul">${L.map(i => rowHTML(i, false)).join("")}</ul></section>`; }).join("");
    if (!vOpen.length){
      h = all.length && vCart.length
        ? `<div class="gr-empty"><b>Everything's in the cart.</b><span>Tap “Clear cart” when you're done, or add more above.</span></div>`
        : `<div class="gr-empty"><b>${all.length ? "Nothing here for this store." : "Your list is empty."}</b><span>Type something above, like <i>2 milk</i> or <i>1.5 lb chicken</i>, and press Enter.</span></div>`;
    }
    if (hiddenN) h += `<p class="note gr-hid">${plural(hiddenN, "item")} for other stores ${hiddenN === 1 ? "is" : "are"} hidden. <button type="button" class="linkb" data-gstore="">Show all stores</button></p>`;
    $("#gr-list").innerHTML = h;
    /* in the cart */
    $("#gr-cart").hidden = !vCart.length;
    $("#gr-cart").innerHTML = vCart.length ? `<div class="gr-ch"><button type="button" class="gr-ct" data-gcart aria-expanded="${ui.cartOpen}"><span>In cart</span><b>${vCart.length}</b>${IC.chev}</button><span class="sp"></span><button type="button" class="btn small" data-gclear>Clear cart</button></div>
      ${ui.cartOpen ? `<ul class="gr-ul">${vCart.map(i => rowHTML(i, true)).join("")}</ul>` : ""}` : "";
    syncOffline();
    if (flashId){
      const el = document.querySelector(`#pg-grocery [data-gid="${flashId}"]`); flashId = null;
      if (el){ el.classList.remove("gr-new"); void el.offsetWidth; el.classList.add("gr-new"); const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({block:"center", behavior:reduce() ? "auto" : "smooth"}); }
    }
    if ($("#dlg-groc").open && sh.id && !GrocItems.get(sh.id)) $("#dlg-groc").close();
  }
  let raf = 0;
  const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
  function flash(id){ flashId = id; soon(); }
  function syncOffline(){ const o = $("#gr-off"); if (o) o.hidden = !(navigator.onLine === false || Sync.state === "offline"); }
  addEventListener("online", syncOffline); addEventListener("offline", syncOffline);
  Sync.subscribe(syncOffline);
  function changed(){ soon(); if (ready) Home.refresh(); }
  [GrocItems, GrocProducts, GrocStores, GrocAisles].forEach(s => s.subscribe(changed));
  GrocStores.subscribe(() => renderSettingsSec());
  GrocAisles.subscribe(() => renderSettingsSec());

  /* tap a row: it fills in, slides away, then moves to "In cart". Tapping again before it goes cancels. */
  function tapCheck(id, li){
    if (pend.has(id)){ clearTimeout(pend.get(id)); pend.delete(id); if (li){ li.classList.remove("checking", "leaving"); li.style.height = ""; } return; }
    if (reduce() || !li){ setChecked(id, true); return; }
    li.classList.add("checking");
    pend.set(id, setTimeout(() => {
      const el = document.querySelector(`#gr-list [data-gid="${id}"]`);
      if (el){ el.style.height = el.offsetHeight + "px"; void el.offsetHeight; el.classList.add("leaving"); }
      pend.set(id, setTimeout(() => { pend.delete(id); setChecked(id, true); }, 240));
    }, 420));
  }
  $("#pg-grocery").addEventListener("click", e => {
    const t = e.target;
    const tg = t.closest("[data-gtog]");
    if (tg){ const li = tg.closest(".gr-row"); if (li.classList.contains("done")) setChecked(tg.dataset.gtog, false, true); else tapCheck(tg.dataset.gtog, li); return; }
    const ed = t.closest("[data-gedit]"); if (ed) return openSheet(ed.dataset.gedit);
    const st = t.closest("[data-gstore]"); if (st){ ui.store = st.dataset.gstore; saveUi(); render(); return; }
    if (t.closest("[data-gclear]")) return clearChecked();
    if (t.closest("[data-gcart]")){ ui.cartOpen = !ui.cartOpen; saveUi(); render(); return; }
    if (t.closest("#gr-share")) return share();
    if (t.closest("#gr-set")){ renderSettingsSec(); openSettings("grocery"); }
  });

  /* ---------- quick add with autocomplete ---------- */
  const inp = $("#gr-add"), sug = $("#gr-sug");
  let sugList = [], sugMode = "", sugAct = -1, hideT = 0;
  function suggestions(){
    const p = grocParse(inp.value), term = p.name.toLowerCase().trim();
    const onList = new Set(openItems().map(i => i.key));
    const all = GrocProducts.all().map(o => prodGet(o.id)).filter(x => x && x.name);
    if (!inp.value.trim()) return {mode:"again", list:all.filter(x => !onList.has(x.key)).sort((a, b) => (b.bought * 3 + b.uses) - (a.bought * 3 + a.uses) || b.last - a.last).slice(0, 12), onList};
    if (!term) return {mode:"", list:[], onList};
    const tk = grocKey(term);
    const sc = x => { const n = x.name.toLowerCase(); if (n === term) return 5; if (n.startsWith(term)) return 4; if (n.split(/[^a-z0-9]+/).some(w => w.startsWith(term))) return 3; if (tk && x.key.startsWith(tk)) return 2; if (tk.length > 2 && x.key.includes(tk)) return 1; return 0; };
    return {mode:"match", list:all.map(x => [x, sc(x)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1] || (b[0].uses + b[0].bought) - (a[0].uses + a[0].bought)).slice(0, 6).map(([x]) => x), onList};
  }
  function drawSug(){
    const focused = document.activeElement === inp;
    const r = focused ? suggestions() : {mode:"", list:[]};
    sugList = r.list; sugMode = r.mode; if (sugAct >= sugList.length) sugAct = -1;
    if (!sugList.length){ sug.hidden = true; sug.innerHTML = ""; inp.setAttribute("aria-expanded", "false"); return; }
    if (sugMode === "again"){
      sug.innerHTML = `<div class="gr-sl">Buy again</div><div class="gr-again">${sugList.map((x, k) => `<button type="button" data-gsug="${k}" tabindex="-1"><span aria-hidden="true">${esc(aisle(x.cat).emoji)}</span>${esc(x.name)}</button>`).join("")}</div>`;
    } else {
      sug.innerHTML = `<ul role="listbox" aria-label="Suggestions">${sugList.map((x, k) => `<li role="option" id="gr-opt-${k}" data-gsug="${k}" aria-selected="${k === sugAct}"><span class="gr-se" aria-hidden="true">${esc(aisle(x.cat).emoji)}</span><span class="gr-sn">${esc(x.name)}</span><span class="note">${esc(aisle(x.cat).name)}</span>${r.onList.has(x.key) ? `<span class="gr-on">on list</span>` : ""}</li>`).join("")}</ul>`;
    }
    sug.hidden = false; inp.setAttribute("aria-expanded", "true");
    if (sugAct >= 0) inp.setAttribute("aria-activedescendant", "gr-opt-" + sugAct); else inp.removeAttribute("aria-activedescendant");
  }
  function pick(k){
    const x = sugList[k]; if (!x) return;
    const p = grocParse(inp.value);
    add({qty:sugMode === "match" ? p.qty : null, unit:sugMode === "match" ? p.unit : "", name:x.name});
    inp.value = ""; sugAct = -1; inp.focus(); drawSug();
  }
  $("#gr-add-form").addEventListener("submit", e => {
    e.preventDefault();
    if (sugAct >= 0 && sugMode === "match") return pick(sugAct);
    const v = inp.value.trim(); if (!v){ inp.focus(); return; }
    /* several at once: "milk, eggs, 2 bread" */
    const parts = v.split(/\s*[,;\n]\s*/).filter(Boolean);
    parts.forEach(x => add(grocParse(x)));
    inp.value = ""; sugAct = -1; drawSug();
  });
  inp.addEventListener("input", () => { sugAct = -1; drawSug(); });
  inp.addEventListener("focus", () => { clearTimeout(hideT); drawSug(); });
  inp.addEventListener("blur", () => { clearTimeout(hideT); hideT = setTimeout(drawSug, 180); });
  inp.addEventListener("keydown", e => {
    if (e.key === "Escape"){ if (!sug.hidden){ e.preventDefault(); sug.hidden = true; } else inp.blur(); return; }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && sugMode === "match" && sugList.length){
      e.preventDefault(); const n = sugList.length;
      sugAct = e.key === "ArrowDown" ? (sugAct + 1) % n : (sugAct <= 0 ? n - 1 : sugAct - 1); drawSug();
    }
  });
  /* keep the keyboard up while tapping a suggestion */
  sug.addEventListener("mousedown", e => e.preventDefault());
  sug.addEventListener("click", e => { const b = e.target.closest("[data-gsug]"); if (b){ clearTimeout(hideT); pick(+b.dataset.gsug); } });

  /* ---------- share or copy the list ---------- */
  async function share(){
    const vis = items().filter(i => !i.checked && inView(i)).sort(byName), A = aisles(), s = storeById(ui.store);
    if (!vis.length){ toast("Nothing on the list to share."); return; }
    const lines = [`Grocery list${s ? " (" + s.name + ")" : ""}`];
    for (const a of A.list){ const L = vis.filter(i => (A.map.has(i.cat) ? i.cat : "other") === a.id); if (!L.length) continue;
      lines.push("", a.name, ...L.map(i => `- ${i.name}${i.qty != null || i.unit ? " (" + grocQty(i.qty, i.unit).replace(/^×/, "") + ")" : ""}${i.note ? " - " + i.note : ""}`)); }
    const text = lines.join("\n");
    if (navigator.share && matchMedia("(pointer:coarse)").matches){ try { await navigator.share({title:"Grocery list", text}); return; } catch(e){ if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(text); toast("Copied the list. Paste it in a text or note."); }
    catch(e){ toast("Couldn't copy. Your browser blocked the clipboard."); }
  }

  /* ---------- edit sheet ---------- */
  const sh = {id:null};
  const shItem = () => { const d = sh.id && GrocItems.get(sh.id); return d ? normItem({id:sh.id, d}) : null; };
  function openSheet(id){ if (!GrocItems.get(id)) return; sh.id = id; fillSheet(); const d = $("#dlg-groc"); if (!d.open) d.showModal(); $("#gi-name").blur(); }
  function fillSheet(){
    const i = shItem(); if (!i) return;
    const a = aisle(i.cat), S = stores(), prod = prodGet(i.key);
    $("#gi-emoji").textContent = a.emoji;
    $("#gi-h-t").textContent = i.checked ? "In the cart" : "Item";
    $("#gi-name").value = i.name;
    $("#gi-qty").value = i.qty == null ? "" : grocNumText(i.qty);
    $("#gi-unit").innerHTML = [...new Set([...GROC_UNIT_LIST, i.unit])].map(u => `<option value="${esc(u)}" ${u === i.unit ? "selected" : ""}>${u ? esc(u) : "(none)"}</option>`).join("");
    $("#gi-cats").innerHTML = aisles().list.filter(x => !x.hidden || x.id === i.cat).map(x => `<button type="button" data-gcat="${x.id}" aria-pressed="${x.id === a.id}"><span aria-hidden="true">${esc(x.emoji)}</span>${esc(x.name)}</button>`).join("");
    $("#gi-cat-n").textContent = `Homebase remembers this for “${i.name}” next time.`;
    $("#gi-store-f").hidden = !S.length;
    $("#gi-stores").innerHTML = `<button type="button" data-gst="" aria-pressed="${!i.store}">Any store</button>` + S.map(s => `<button type="button" data-gst="${s.id}" aria-pressed="${i.store === s.id}">${esc(s.name)}</button>`).join("");
    $("#gi-note").value = i.note;
    const ls = lookStore(i), lk = $("#gi-look");
    lk.hidden = !ls; if (ls){ lk.href = lookUrl(ls, i.name); lk.innerHTML = `${IC.look}Look up at ${esc(ls.name)}`; }
    $("#gi-chk").textContent = i.checked ? "Put back on the list" : "✓ In cart";
    $("#gi-meta").textContent = prod && prod.bought ? `Bought ${plural(prod.bought, "time")}${prod.lastBought ? ", last on " + new Date(prod.lastBought).toLocaleDateString(undefined, {month:"short", day:"numeric"}) : ""}.` : "";
  }
  function patch(p, rememberToo){
    const d = sh.id && GrocItems.get(sh.id); if (!d) return;
    GrocItems.put(sh.id, {...d, ...p});
    if (rememberToo){ const key = p.key || d.key || grocKey(p.name || d.name); remember(key, {...rememberToo, name:p.name || d.name}); }
  }
  function saveName(){
    const i = shItem(); if (!i) return;
    const v = $("#gi-name").value.trim().replace(/\s+/g, " ");
    if (!v){ $("#gi-name").value = i.name; return; }
    if (v !== i.name){ const key = grocKey(v); patch({name:v, key}, {cat:i.cat}); }
  }
  function saveQty(){ const i = shItem(); if (!i) return; const q = grocNum($("#gi-qty").value); if (q !== i.qty) patch({qty:q}); $("#gi-qty").value = q == null ? "" : grocNumText(q); }
  $("#form-groc").addEventListener("change", e => {
    const t = e.target;
    if (t.id === "gi-name") saveName();
    else if (t.id === "gi-qty") saveQty();
    else if (t.id === "gi-unit"){ patch({unit:t.value}, t.value ? {unit:t.value} : null); fillSheet(); }
    else if (t.id === "gi-note") patch({note:t.value.trim()});
  });
  $("#form-groc").addEventListener("click", e => {
    const t = e.target, i = shItem(); if (!i) return;
    const stp = t.closest("[data-gstep]");
    if (stp){ const cur = grocNum($("#gi-qty").value), n = (cur == null ? 1 : cur) + +stp.dataset.gstep; patch({qty:n >= 1 ? Math.round(n * 100) / 100 : (n > 0 ? n : null)}); fillSheet(); return; }
    const c = t.closest("[data-gcat]"); if (c){ patch({cat:c.dataset.gcat}, {cat:c.dataset.gcat}); fillSheet(); return; }
    const s = t.closest("[data-gst]"); if (s){ patch({store:s.dataset.gst}, {store:s.dataset.gst}); fillSheet(); return; }
    if (t.closest("#gi-del")){ const id = sh.id; $("#dlg-groc").close(); remove(id); return; }
    if (t.closest("#gi-chk")){ const id = sh.id; $("#dlg-groc").close(); setChecked(id, !i.checked, i.checked); }
  });
  $("#gi-name").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); saveName(); e.target.blur(); } });
  $("#gi-qty").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); saveQty(); e.target.blur(); } });
  $("#form-groc").addEventListener("submit", e => { e.preventDefault(); $("#dlg-groc").close(); });
  $("#dlg-groc").addEventListener("close", () => {
    const i = shItem();
    if (i){ const n = $("#gi-note").value.trim(); if (n !== i.note) patch({note:n}); saveName(); saveQty(); }
    sh.id = null;
  });

  /* ---------- home widget ---------- */
  function widget(){
    const open = openItems(), cart = items().filter(i => i.checked).length, A = aisles();
    const ord = new Map(A.list.map((a, k) => [a.id, k]));
    const L = open.sort((a, b) => (ord.get(a.cat) ?? 99) - (ord.get(b.cat) ?? 99) || byName(a, b)), shown = L.slice(0, 24);
    return `<section class="tile tinted mw groc-w" aria-label="Grocery list, ${plural(open.length, "item")} to get">
      <h2><span>Grocery</span><span class="nw-open">Open ›</span></h2>
      <div class="gw-n"><b>${open.length}</b><span>${open.length === 1 ? "item" : "items"} to get${cart ? `<em data-drop="2"> · ${cart} in cart</em>` : ""}</span></div>
      <ul class="gw-l" data-fitlist data-min="0">${shown.map(i => `<li><span aria-hidden="true">${esc(aisle(i.cat).emoji)}</span>${esc(i.name)}</li>`).join("") || `<li class="empty">Nothing on the list.</li>`}${shown.length ? `<li class="fit-more"><span class="more-link"><span data-more-n data-extra="${L.length - shown.length}"></span></span></li>` : ""}</ul></section>`;
  }
  $("#home-grid").addEventListener("click", e => { if (e.target.closest(".groc-w")) location.hash = "#grocery"; });

  /* =====================================================================
     SETTINGS → Grocery: stores (name, website, search link) and aisles
     ===================================================================== */
  const sMsg = new Map();   // store id → {t, err} shown under its search link
  function fixSearch(raw){
    let t = String(raw || "").trim(); if (!t) return {t:"", m:""};
    if (!/^https?:\/\//i.test(t)) t = "https://" + t.replace(/^\/+/, "");
    try { const u = new URL(t.replace(/\{q\}/gi, "x")); if (!u.hostname.includes(".")) throw 0; } catch(e){ return {t, m:"That doesn't look like a web address.", err:true}; }
    if (/\{q\}/i.test(t)) return {t:t.replace(/\{q\}/gi, "{q}"), m:""};
    if (/milk/i.test(t)) return {t:t.replace(/milk/i, "{q}"), m:"Swapped “milk” for {q}. Tap Test to check it."};
    return {t, m:"Put {q} where the search word goes, or paste the address of a search for “milk” and Homebase does it for you.", err:true};
  }
  function fixSite(raw){ let t = String(raw || "").trim(); if (!t) return ""; if (!/^https?:\/\//i.test(t)) t = "https://" + t; try { return new URL(t).href; } catch(e){ return t; } }
  const putStore = (id, p) => { const d = GrocStores.get(id); if (d) GrocStores.put(id, {...d, ...p}); };
  const putAisle = (id, p) => { const d = GrocAisles.get(id); if (d) GrocAisles.put(id, {...d, ...p}); };
  function renderSettingsSec(){
    const box = $("#gs-stores"), al = $("#gc-list"); if (!box || !al) return;
    const typing = el => el.contains(document.activeElement) && document.activeElement.matches("input,select,textarea");
    const S = stores(), A = aisles().list, all = items();
    if (!typing(box)) box.innerHTML = S.map((s, k) => { const m = sMsg.get(s.id);
      return `<div class="gs-card" data-sid="${s.id}">
        <div class="gs-top"><input class="gs-name" data-gsf="name" value="${esc(s.name)}" maxlength="40" aria-label="Store name" autocomplete="off">
          <label class="gs-main" title="Used for look-up links on items with no store"><input type="radio" name="gs-main" data-gsmain="${s.id}" ${s.main || (!S.some(x => x.main) && k === 0) ? "checked" : ""}>Main</label>
          <button type="button" class="btn icon sm" data-gsmv="${s.id},-1" aria-label="Move ${esc(s.name)} up" ${k ? "" : "disabled"}>${IC.up}</button><button type="button" class="btn icon sm" data-gsmv="${s.id},1" aria-label="Move ${esc(s.name)} down" ${k < S.length - 1 ? "" : "disabled"}>${IC.down}</button>
          <button type="button" class="btn small ghost danger" data-gsdel="${s.id}">Delete</button></div>
        <div class="field"><label for="gs-site-${s.id}">Website</label><input id="gs-site-${s.id}" type="url" inputmode="url" data-gsf="site" value="${esc(s.site)}" placeholder="Optional: the store's home page" spellcheck="false" autocomplete="off"></div>
        <div class="field"><label for="gs-q-${s.id}">Search link</label><div class="cp-row"><input id="gs-q-${s.id}" type="url" inputmode="url" data-gsf="search" value="${esc(s.search)}" placeholder="Paste the address of a search for “milk”" spellcheck="false" autocomplete="off" style="flex:1;min-width:0"><button type="button" class="btn small" data-gstest="${s.id}" ${canLook(s) ? "" : "disabled"}>Test</button></div>
          <p class="note ${m && m.err ? "gs-err" : ""}" data-gsmsg>${m ? esc(m.m) : canLook(s) ? "Each item on the list gets a small 🔍 link that searches this store." : "Empty: no look-up links for this store."}</p></div></div>`; }).join("") || `<p class="note">No stores yet. Press + to add one.</p>`;
    if (!typing(al)) al.innerHTML = A.map((a, k) => { const n = all.filter(i => (aisles().map.has(i.cat) ? i.cat : "other") === a.id).length;
      return `<li class="gc-row ${a.hidden ? "off" : ""}" data-aid="${a.id}"><input class="gc-em" data-gcf="emoji" value="${esc(a.emoji)}" maxlength="8" aria-label="Symbol for ${esc(a.name)}"><input class="gc-nm" data-gcf="name" value="${esc(a.name)}" maxlength="30" aria-label="Aisle name"><span class="note">${n || ""}</span>
        <button type="button" class="btn icon sm" data-gcmv="${a.id},-1" aria-label="Move ${esc(a.name)} up" ${k ? "" : "disabled"}>${IC.up}</button><button type="button" class="btn icon sm" data-gcmv="${a.id},1" aria-label="Move ${esc(a.name)} down" ${k < A.length - 1 ? "" : "disabled"}>${IC.down}</button>
        ${a.id === "other" ? `<span class="gc-sp"></span>` : a.builtin ? `<button type="button" class="btn small ghost" data-gchide="${a.id}">${a.hidden ? "Show" : "Hide"}</button>` : `<button type="button" class="btn small ghost danger" data-gcdel="${a.id}">Delete</button>`}</li>`; }).join("");
  }
  const sec = $("#st-grocery");
  sec.addEventListener("change", e => {
    const t = e.target, card = t.closest("[data-sid]"), row = t.closest("[data-aid]");
    if (t.dataset.gsmain){ const id = t.dataset.gsmain; GrocStores.putMany(stores().map(s => { const d = GrocStores.get(s.id); return [s.id, {...d, main:s.id === id}]; })); return; }
    if (card && t.dataset.gsf){
      const id = card.dataset.sid, f = t.dataset.gsf;
      if (f === "name"){ const v = t.value.trim(); if (!v){ t.value = (storeById(id) || {}).name || ""; return; } putStore(id, {name:v}); }
      if (f === "site"){ const v = fixSite(t.value); t.value = v; putStore(id, {site:v}); }
      if (f === "search"){ const r = fixSearch(t.value); t.value = r.t; r.m ? sMsg.set(id, r) : sMsg.delete(id); putStore(id, {search:r.t}); t.blur(); renderSettingsSec(); }
      return;
    }
    if (row && t.dataset.gcf){
      const id = row.dataset.aid, f = t.dataset.gcf, v = f === "emoji" ? [...t.value.trim()].slice(0, 4).join("") : t.value.trim();
      if (f === "name" && !v){ t.value = aisle(id).name; return; }
      putAisle(id, {[f]:v});
    }
  });
  sec.addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("#gs-add")){
      const id = uid(), S = stores();
      GrocStores.put(id, {v:1, name:"New store", site:"", search:"", main:!S.length, order:S.length ? Math.max(...S.map(s => s.order)) + 1 : 0, deleted:false});
      renderSettingsSec(); const n = $(`#gs-stores [data-sid="${id}"] .gs-name`); if (n){ n.focus(); n.select(); } return;
    }
    if (t.closest("#gc-add")){
      const id = uid(), A = aisles().list, oth = A.find(a => a.id === "other"), top = Math.max(0, ...A.filter(a => a.id !== "other").map(a => a.order));
      const order = oth && oth.order > top ? (top + oth.order) / 2 : top + 1;   // just above Other
      GrocAisles.put(id, {v:1, name:"New aisle", emoji:"🏷️", order, hidden:false, builtin:false});
      renderSettingsSec(); const n = $(`#gc-list [data-aid="${id}"] .gc-nm`); if (n){ n.focus(); n.select(); } return;
    }
    const tst = t.closest("[data-gstest]"); if (tst){ const s = storeById(tst.dataset.gstest); if (canLook(s)) window.open(lookUrl(s, "milk"), "_blank", "noopener"); return; }
    const mv = t.closest("[data-gsmv],[data-gcmv]");
    if (mv){
      const isS = !!mv.dataset.gsmv, [id, dir] = (mv.dataset.gsmv || mv.dataset.gcmv).split(","), L = (isS ? stores() : aisles().list).map(x => x.id), i = L.indexOf(id), j = i + +dir;
      if (i < 0 || j < 0 || j >= L.length) return;
      [L[i], L[j]] = [L[j], L[i]];
      const D = isS ? GrocStores : GrocAisles;
      D.putMany(L.map((x, k) => [x, {...D.get(x), order:k}]).filter(([x, d]) => d));
      renderSettingsSec(); const b = $(`#st-grocery [data-${isS ? "gsmv" : "gcmv"}="${id},${dir}"]`); if (b && !b.disabled) b.focus(); return;
    }
    const del = t.closest("[data-gsdel]");
    if (del){
      const s = storeById(del.dataset.gsdel); if (!s) return;
      const used = items().filter(i => i.store === s.id);
      if (!(await confirmBox({title:`Delete “${s.name}”?`, body:used.length ? `${plural(used.length, "item")} on your list for this store will be for any store instead.` : "It's removed from your stores on all your devices.", ok:"Delete"}))) return;
      if (used.length) GrocItems.putMany(used.map(i => [i.id, {...GrocItems.get(i.id), store:""}]));
      const ps = GrocProducts.all().filter(o => o.d && o.d.store === s.id); if (ps.length) GrocProducts.putMany(ps.map(o => [o.id, {...o.d, store:""}]));
      const rest = stores().filter(x => x.id !== s.id);
      GrocStores.putMany([[s.id, {...GrocStores.get(s.id), deleted:true, main:false}], ...(s.main && rest.length ? [[rest[0].id, {...GrocStores.get(rest[0].id), main:true}]] : [])]);
      if (ui.store === s.id){ ui.store = ""; saveUi(); }
      return;
    }
    const hd = t.closest("[data-gchide]"); if (hd){ putAisle(hd.dataset.gchide, {hidden:!aisle(hd.dataset.gchide).hidden}); return; }
    const cd = t.closest("[data-gcdel]");
    if (cd){
      const a = aisle(cd.dataset.gcdel); if (!a || a.builtin) return;
      const used = items().filter(i => i.cat === a.id);
      if (!(await confirmBox({title:`Delete the aisle “${a.name}”?`, body:used.length ? `${plural(used.length, "item")} in it move to Other.` : "No items are in it.", ok:"Delete"}))) return;
      if (used.length) GrocItems.putMany(used.map(i => [i.id, {...GrocItems.get(i.id), cat:"other"}]));
      const ps = GrocProducts.all().filter(o => o.d && o.d.cat === a.id); if (ps.length) GrocProducts.putMany(ps.map(o => [o.id, {...o.d, cat:"other"}]));
      GrocAisles.del(a.id);
    }
  });
  $("#dlg-settings .st-nav").addEventListener("click", e => { if (e.target.closest('[data-stcat="grocery"]')) renderSettingsSec(); });
  renderSettingsSec();

  return {render, widget, renderSettingsSec, add, addMany, parse:grocParse, guess:grocGuess,
    focusAdd(){ if (page !== "grocery") location.hash = "#grocery"; setTimeout(() => { inp.focus(); scrollTo({top:0, behavior:reduce() ? "auto" : "smooth"}); }, 30); }};
})();

/* Put a small Grocery widget on every saved home screen once (Settings flag "groceryWidgetAdded"),
   the same way This Week was added. Removing it afterwards keeps it removed. */
Home.ensureWidget("groceryWidgetAdded", "grocery", {laptop:[2,1], phone:[2,2]});
Settings.onReplace(() => setTimeout(() => Home.ensureWidget("groceryWidgetAdded", "grocery", {laptop:[2,1], phone:[2,2]}), 0));
