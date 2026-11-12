/* Homebase: IMPORT CORE: pure functions that turn PDF/CSV/.ics text into items (no page access).
   Plain script (no modules). Shares one global scope with the other js/ files; load order is set in index.html. */
"use strict";


/*@@CORE-START*/
/* =====================================================================
   IMPORT CORE: pure functions, no page access. Turns positioned PDF
   text, CSV rows, or AI JSON into candidate items for the review screen.
   ===================================================================== */
const ImportCore = (() => {
  const p2 = n => String(n).padStart(2, "0");
  const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

  /* ---------- column roles ---------- */
  const ROLES = ["date","num","topic","reading","assign","type","start","end","location","notes","ignore"];
  const ROLE_NAMES = {date:"Date", num:"Lecture #", topic:"Topic / title", reading:"Reading", assign:"Assignment / due", type:"Type",
    start:"Start time", end:"End time", location:"Location", notes:"Notes", ignore:"Ignore"};
  /* Checked in this order, so "Due date" is an assignment column and "Lecture topic" is a topic column. */
  const ROLE_WORDS = [
    ["topic",    ["topic","topics","subject","subjects","title","titles","content","contents","description","material","materials","activity","activities","agenda"]],
    ["reading",  ["reading","readings","read","text","texts","textbook","chapter","chapters","ch","chs","chap","section","sections","sec","book","pages"]],
    ["assign",   ["assignment","assignments","due","hw","homework","deliverable","deliverables","problem","pset","psets","work"]],
    ["location", ["location","room","where","place","venue","building"]],
    ["type",     ["type","kind","category"]],
    ["start",    ["start","starts","begin","begins","time","from"]],
    ["end",      ["end","ends","until","to"]],
    ["date",     ["date","dates","day","when"]],
    ["num",      ["lecture","lectures","lec","lect","class","#","no","session","sessions","meeting","mtg","lesson","number","num","l#","lec#"]],
    ["notes",    ["notes","note","comments","comment","remarks","events","event","announcements","other"]],
    ["ignore",   ["week","wk","weeks"]],
  ];
  const normLabel = s => String(s || "").toLowerCase().replace(/#/g, " # ").replace(/[^a-z0-9# ]+/g, " ").replace(/\s+/g, " ").trim();
  function roleOf(label){
    const words = normLabel(label).split(" ").filter(Boolean);
    if (!words.length || words.length > 4) return null;
    for (const [role, set] of ROLE_WORDS) if (words.some(w => set.includes(w))) return role;
    return null;
  }
  const roleWordCount = label => normLabel(label).split(" ").filter(w => ROLE_WORDS.some(([, s]) => s.includes(w))).length;

  /* ---------- dates ---------- */
  const RX_NUMDATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g;
  const RX_ISO = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  const RX_NAMEDATE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-–—]\s*(\d{1,2})(?!\/))?(?:,?\s+(20\d{2}))?\b/gi;
  const RX_UNKNOWN = /\b(xx\s*\/\s*xx|tbd|tba|to be (announced|determined)|\?\?)\b|xx\/xx/i;
  const RX_WEEKDAY = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?\b\.?|^\s*[mtwrfsu]{1,2}\b\.?/gi;

  /* All dates written in a string: [{m (0-11), d, y|null}], with "11/25 – 11/27" and "Nov 25–27" as ranges. */
  function findDates(s){
    s = String(s || ""); const out = [];
    for (const m of s.matchAll(RX_ISO)) out.push({m:+m[2]-1, d:+m[3], y:+m[1], at:m.index});
    if (!out.length){
      for (const m of s.matchAll(RX_NUMDATE)){
        const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
        out.push({m:+m[1]-1, d:+m[2], y, at:m.index, end:m.index + m[0].length});
      }
      for (const m of s.matchAll(RX_NAMEDATE)){
        const mo = MONTHS[m[1].slice(0,3).toLowerCase()], y = m[4] ? +m[4] : null;
        out.push({m:mo, d:+m[2], y, at:m.index});
        if (m[3]) out.push({m:mo, d:+m[3], y, at:m.index + 1, rangeEnd:true});
      }
    }
    out.sort((a, b) => a.at - b.at);
    /* numeric ranges: 11/25 – 11/27 */
    for (let i = 1; i < out.length; i++){
      const a = out[i-1], b = out[i];
      if (a.end != null && /^\s*(-|–|—|to|through|thru)\s*$/i.test(s.slice(a.end, b.at))) b.rangeEnd = true;
    }
    return out.filter(x => x.m >= 0 && x.m <= 11 && x.d >= 1 && x.d <= 31);
  }
  const isDateOnly = s => { const t = String(s).replace(RX_NUMDATE, "").replace(RX_NAMEDATE, "").replace(RX_WEEKDAY, "").replace(/[\s,.\-–—/]+/g, ""); return t === "" && findDates(s).length > 0; };

  /* Year for the document: "Fall 2026" wins, otherwise the most common 20xx year. */
  function docYear(text){
    const t = String(text || "");
    const term = t.match(/\b(spring|summer|fall|autumn|winter)\s+(?:semester\s+|term\s+|quarter\s+)?(20\d{2})\b/i);
    if (term) return {year:+term[2], term:term[1].toLowerCase()};
    const counts = {};
    for (const m of t.matchAll(/\b(20\d{2})\b/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? {year:+best[0], term:null} : {year:null, term:null};
  }

  /* Walks dates in table order: missing years come from the document (or today), and roll over Dec → Jan. */
  function dateResolver(year, today){
    let y = year, lastM = null;
    const now = today || new Date();
    return function(dt){
      if (dt.y){ y = dt.y; lastM = dt.m; }
      else {
        if (y == null){
          y = now.getFullYear();
          const t = new Date(y, dt.m, dt.d), diff = (t - now) / 864e5;
          if (diff > 200) y--; else if (diff < -165) y++;
        } else if (lastM != null && dt.m < lastM - 5) y++;
        lastM = dt.m;
      }
      const d = new Date(y, dt.m, dt.d);
      return d.getMonth() === dt.m ? `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}` : null;
    };
  }
  const addDay = (s, n) => { const [y, m, d] = s.split("-").map(Number); const x = new Date(y, m-1, d + n); return `${x.getFullYear()}-${p2(x.getMonth()+1)}-${p2(x.getDate())}`; };

  /* ---------- times and places ---------- */
  const MER = "(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|noon)";
  const RX_TRANGE = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?\\s*(?:-|–|—|to|until)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?`, "i");
  const RX_TONE = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))\\s*${MER}?|\\b(\\d{1,2})\\s*${MER}`, "i");
  const merOf = s => !s ? "" : /noon/i.test(s) ? "p" : s.toLowerCase()[0];
  function to24(h, m, mer){
    h = +h; m = +(m || 0); if (h > 23 || m > 59) return null;
    if (mer === "p" && h < 12) h += 12; if (mer === "a" && h === 12) h = 0;
    return `${p2(h)}:${p2(m)}`;
  }
  /* "8:00 – 9:00 p.m." → {time:"20:00", endTime:"21:00"}. Needs a colon or am/pm so dates aren't mistaken for times. */
  function parseTimes(s){
    s = String(s || "");
    let m = s.match(RX_TRANGE);
    if (m && (m[2] || m[5] || m[3] || m[6]) && +m[1] <= 23 && +m[4] <= 23){
      let ma = merOf(m[3]), mb = merOf(m[6]);
      if (!ma && !mb && +m[1] < 7 && +m[4] <= 12){ ma = mb = "p"; }   // "1:30–2:20" with no am/pm: afternoon
      if (!ma) ma = mb;
      let a = to24(m[1], m[2], ma), b = to24(m[4], m[5], mb || ma);
      if (a && b && a > b && !merOf(m[3])) a = to24(m[1], m[2], "a");
      if (a && b) return {time:a, endTime:b > a ? b : "", index:m.index, length:m[0].length};
    }
    m = s.match(RX_TONE);
    if (m){ const t = m[1] ? to24(m[1], m[2], merOf(m[3])) : to24(m[4], 0, merOf(m[5])); if (t) return {time:t, endTime:"", index:m.index, length:m[0].length}; }
    return null;
  }
  function parseClockCell(s){ const t = parseTimes(s); return t ? t.time : (/^\d{1,2}:\d{2}$/.test(String(s).trim()) ? to24(...String(s).trim().split(":"), "") : ""); }
  const RX_ROOM = /\b([A-Z]{2,6}\s?[A-Z]?\d{1,4}[A-Z]?)\b/;
  function parseLocation(tail){
    let t = String(tail || "").replace(/^[\s,;:–—\-]+/, "").replace(/^(in|at|room|rm\.?|location:?|loc\.?:?)\s+/i, "");
    t = t.split(/[;|(\n]/)[0].replace(/[\s,.;:–—\-)]+$/, "").trim();
    if (!t || /^(tba|tbd)\b/i.test(t)) return "";
    if (t.length <= 40 && /[A-Za-z]/.test(t) && (RX_ROOM.test(t) || t.split(" ").length <= 4)) return t;
    const r = String(tail).match(RX_ROOM); return r ? r[1] : "";
  }

  /* ---------- text helpers ---------- */
  const SMALL = new Set(["a","an","and","the","of","for","in","on","to","at","by","or","vs"]);
  function smartCase(s){
    s = String(s || "").trim();
    const letters = s.replace(/[^A-Za-z]/g, "");
    if (letters.length < 3 || letters !== letters.toUpperCase()) return s;
    return s.toLowerCase().replace(/[a-z][a-z']*/g, (w, i) => (i > 0 && SMALL.has(w)) ? w : w[0].toUpperCase() + w.slice(1));
  }
  const tidy = s => String(s || "").replace(/\s+/g, " ").replace(/^[\s–—\-:,;.|•*(]+|[\s–—\-:,;|•*]+$/g, "").replace(/^\((.*)\)$/, "$1").trim();
  function fmtReading(s){
    s = String(s || "").replace(/\s+/g, " ").trim(); if (!s) return "";
    const core = s.replace(/^(?:(?:text(?:book)?|reading|read|chapters?|chs?|chap)\.?:?\s*)+/i, "").trim();
    if (/^\d{1,2}(?:\s*(?:,|;|&|and|-|–)\s*\d{1,2})*$/i.test(core)) return "Text ch. " + core.replace(/\s*,\s*/g, ", ").replace(/\s*[-–]\s*/g, "–").replace(/\s*;\s*/g, ", ");
    if (/^\d{1,2}\.\d/.test(core)) return "Text sec. " + core;
    return s;
  }

  /* ---------- classification ---------- */
  const RX_NOCLASS = /\b(no\s+class(?:es)?|no\s+lecture|class(?:es)?\s+cancel+ed|cancel+ed|recess|holiday|vacation|thanksgiving|labor\s+day|memorial\s+day|martin\s+luther\s+king|mlk\s+day|reading\s+day|(?:fall|spring|winter|october|mid-?semester|semester|thanksgiving)\s+break|^break$)\b/i;
  const RX_REVIEW = /\breview\b/i;
  const EMPTY = /^[\s–—\-_.\/]*$|^(n\/?a|none)$/i;     // "–" placeholders in empty cells
  const RX_EXAM = /\b(final\s+exam(?:ination)?|final(?!\s+(?:project|report|presentation|paper|design|demo))|mid-?term(?:\s+exam)?(?:\s*#?\s*\d+)?|exam(?:ination)?(?:\s*#?\s*\d+)?|test\s*#?\s*\d+|quiz(?:zes)?(?:\s*#?\s*\d+)?)\b/i;
  const RX_SKIP_ASSIGN = /\b(assigned|posted|released|handed out|out)\b/i;
  const TYPE_ALIASES = {
    "lecture":"Lecture","lec":"Lecture","recitation":"Recitation","rec":"Recitation","recit":"Recitation","class":"Lecture","review":"Review","no class":"No Class","noclass":"No Class","holiday":"No Class","break":"No Class",
    "exam":"Exam","midterm":"Exam","final":"Exam","final exam":"Exam","test":"Exam","quiz":"Quiz","homework":"Homework","hw":"Homework","assignment":"Homework",
    "lab":"Lab","project":"Project","reading":"Reading","event":"Event","task":"Task","other":"Other",
  };

  function guessType(s){
    s = String(s || "").toLowerCase();
    if (RX_NOCLASS.test(s)) return "No Class";
    if (/\b(exam|midterm|final)\b/.test(s)) return "Exam";
    if (/\bquiz/.test(s)) return "Quiz";
    if (/\breview\b/.test(s)) return "Review";
    if (/\blab\b|\blab\s*\d/.test(s)) return "Lab";
    if (/\bproject|presentation|proposal\b/.test(s)) return "Project";
    if (/\b(hw|homework|assignment|problem set|pset|ps\s?\d|due|essay|paper|report)\b/.test(s)) return "Homework";
    if (/\b(lecture|class|recitation)\b/.test(s)) return "Lecture";
    return "Other";
  }

  /* Finds an exam/quiz mention in any cell and pulls its time and room. */
  function findExam(cells){
    for (const key of ["assign","notes","topic","other"]){
      const t = cells[key]; if (!t) continue;
      const m = RX_EXAM.exec(t); if (!m) continue;
      const segEnd = (() => { const r = t.slice(m.index).search(/[;|]/); return r < 0 ? t.length : m.index + r; })();
      const seg = t.slice(m.index, segEnd);
      let label = smartCase(m[0].replace(/\s+/g, " ").replace(/#\s*/, ""));
      if (/^final$/i.test(label)) label = "Final Exam";
      label = label.replace(/^(\w)/, c => c.toUpperCase()).replace(/\bexam\b/, "Exam").replace(/\bquiz\b/, "Quiz");
      const after = seg.slice(m[0].length), tm = parseTimes(after);
      const location = cells.location ? tidy(cells.location) : parseLocation(tm ? after.slice(tm.index + tm.length) : after.replace(/^.*?\b(in|room)\b/i, "$1"));
      let note = after; if (tm) note = note.slice(0, tm.index) + " " + note.slice(tm.index + tm.length);
      if (location) note = note.replace(location, " ");
      note = tidy(note.replace(/^[\s,;:–—\-]+/, "").replace(/\b(in|at|room)\s*$/i, ""));
      return {key, type:/quiz/i.test(m[0]) ? "Quiz" : "Exam", title:label, time:tm ? tm.time : "", endTime:tm ? tm.endTime : "",
        location, notes:/[a-z]{3}/i.test(note) ? note : "", rest:tidy(t.slice(0, m.index) + " " + t.slice(segEnd))};
    }
    return null;
  }

  /* One table row → zero or more items. cells: {date,num,topic,reading,assign,notes,type,start,end,location,other}. */
  function classifyRow(cells, ctx){
    const src = Object.values(cells).filter(Boolean).join("  ·  ");
    const dt = findDates(cells.date || "");
    const unknown = !dt.length;                               // XX/XX, TBD, blank
    let dates = dt.filter(d => !d.rangeEnd).slice(0, 1).map(ctx.resolve).filter(Boolean);
    const rangeEnd = dt.find(d => d.rangeEnd);
    const rangeTo = rangeEnd ? ctx.resolve(rangeEnd) : null;
    const date = dates[0] || "";
    const numM = String(cells.num || "").match(/\d{1,3}/);
    const n = numM ? +numM[0] : null;
    const topic = tidy(cells.topic || "");
    const reading = fmtReading(cells.reading);
    const base = {date, src, needsDate:!date};
    const items = [];
    const startT = cells.start ? parseClockCell(cells.start) : "", endT = cells.end ? parseClockCell(cells.end) : "";
    const loc = cells.location ? tidy(cells.location) : "";
    const notes = tidy(cells.notes || "");

    /* An explicit Type column (CSV) is trusted as-is. */
    if (cells.type && TYPE_ALIASES[normLabel(cells.type)]){
      const type = TYPE_ALIASES[normLabel(cells.type)];
      let title = topic || (type === "No Class" ? "No class" : type);
      if (type === "Lecture" && n != null && !/^lecture\b/i.test(title)) title = `Lecture ${n}: ${title}`;
      if (type === "No Class" && topic && !/no\s+class/i.test(topic)) title = `No class — ${topic}`;
      const it = {...base, type, title:smartCase(title), lectureNumber:n, reading, time:startT, endTime:endT, location:loc, notes};
      if (cells.assign && !RX_SKIP_ASSIGN.test(cells.assign)) it.notes = [it.notes, "Due: " + tidy(cells.assign)].filter(Boolean).join("\n");
      return [it];
    }

    const exam = findExam({topic:cells.topic, assign:cells.assign, notes:cells.notes, other:cells.other, location:cells.location});
    const mk = x => ({...base, lectureNumber:null, reading:"", time:"", endTime:"", location:"", notes:"", ...x});

    if (n == null && RX_NOCLASS.test(topic || src)){
      const t = topic || tidy(src);
      const nm = t.match(/\bno\s+class(?:es)?\b|\bno\s+lecture\b/i);
      const after = nm ? t.slice(nm.index + nm[0].length).replace(/\s+$/, "") : "";
      const title = nm ? ("No class" + (/^[\s–—\-:,(]*$/.test(after) ? "" : (/^\s*[(–—\-:,]/.test(after) ? smartCase(after).replace(/^\s*:/, ":") : ": " + smartCase(after.trim())))).replace(/^No class\s*(?=[(–—])/, "No class ") : smartCase(t);
      const days = [date];
      if (date && rangeTo && rangeTo > date){ let d = date; while (d < rangeTo && days.length < 10){ d = addDay(d, 1); days.push(d); } }
      days.forEach(d => items.push(mk({type:"No Class", title, date:d || "", needsDate:!d})));
      if (exam && exam.time) items.push(mk({type:exam.type, title:exam.title, time:exam.time, endTime:exam.endTime, location:exam.location, notes:exam.notes}));
      return items;
    }
    if (n == null && RX_REVIEW.test(topic) && !(exam && exam.key !== "topic" && exam.time === "" && false)){
      items.push(mk({type:"Review", title:smartCase(topic), notes}));
      if (exam && exam.key !== "topic") items.push(mk({type:exam.type, title:exam.title, time:exam.time, endTime:exam.endTime, location:exam.location, notes:exam.notes}));
      return items;
    }
    if (exam){
      items.push(mk({type:exam.type, title:exam.title, time:exam.time || startT, endTime:exam.endTime || endT, location:exam.location || loc, notes:[exam.notes, notes].filter(Boolean).join("\n")}));
      const lecTopic = exam.key === "topic" ? exam.rest : topic;
      if (n != null) items.push(mk({type:"Lecture", title:lecTopic ? `Lecture ${n}: ${smartCase(lecTopic)}` : `Lecture ${n}`, lectureNumber:n, reading, time:startT, endTime:endT, location:loc}));
      else if (exam.key !== "topic" && topic) items.push(mk({type:"Lecture", title:smartCase(topic), reading}));
    } else if (n != null){
      items.push(mk({type:"Lecture", title:topic ? `Lecture ${n}: ${smartCase(topic)}` : `Lecture ${n}`, lectureNumber:n, reading, time:startT, endTime:endT, location:loc, notes}));
    } else if (topic){
      let type = guessType(topic); if (type === "Other") type = "Lecture";   // an unnumbered class session
      items.push(mk({type, title:smartCase(topic), reading, time:startT, endTime:endT, location:loc, notes}));
    }
    const asg = tidy(cells.assign || "");
    if (asg && (!exam || exam.key !== "assign") && !RX_SKIP_ASSIGN.test(asg) || (asg && /\bdue\b/i.test(asg) && (!exam || exam.key !== "assign"))){
      let type = guessType(asg); if (!["Homework","Lab","Project","Quiz","Reading"].includes(type)) type = "Homework";
      items.push(mk({type, title:smartCase(asg.replace(/\s*\bdue\b\s*$/i, "")) || "Assignment due", time:/\d(:\d\d)?\s*[ap]\.?m/i.test(asg) ? (parseTimes(asg) || {}).time || "" : ""}));
    }
    if (!items.length && unknown && !src.trim()) return [];
    return items;
  }

  /* ---------- PDF text → lines ---------- */
  /* pages: [{page, height, items:[{str,x,y,w,h}]}] (pdf.js user space: y grows upward) */
  function buildLines(pages){
    const lines = [];
    for (const pg of pages){
      const its = [];
      for (const it of pg.items){
        const str = String(it.str || ""); if (!str.trim()) continue;
        const cw = it.w / Math.max(1, str.length);
        /* split runs that contain wide gaps (two or more spaces) into separate cells */
        let pos = 0;
        for (const part of str.split(/(\s{2,})/)){
          if (part.trim() && !/^\s+$/.test(part)){ const lead = part.length - part.trimStart().length; its.push({text:part.trim(), x0:it.x + (pos + lead) * cw, x1:it.x + (pos + part.trimEnd().length) * cw, y:it.y, h:it.h || 10}); }
          pos += part.length;
        }
      }
      its.sort((a, b) => b.y - a.y || a.x0 - b.x0);
      const pl = [];
      for (const it of its){
        let L = pl.find(l => Math.abs(l.y - it.y) <= Math.max(2, Math.min(l.h, it.h) * 0.45));
        if (!L){ L = {page:pg.page, pageH:pg.height, y:it.y, h:it.h, items:[]}; pl.push(L); }
        L.items.push(it); L.h = Math.max(L.h, it.h);
      }
      pl.sort((a, b) => b.y - a.y);
      for (const L of pl){
        L.items.sort((a, b) => a.x0 - b.x0);
        const merged = [];                       // glue runs that touch (ligatures like "Ampli" + "fi" + "ers")
        for (const it of L.items){ const pv = merged[merged.length - 1];
          if (pv && it.x0 - pv.x1 < Math.max(0.8, L.h * 0.12)) { pv.text += it.text; pv.x1 = Math.max(pv.x1, it.x1); } else merged.push({...it}); }
        L.items = merged; L.text = merged.map(i => i.text).join(" "); lines.push(L);
      }
    }
    lines.forEach((l, i) => l.i = i);
    markJunk(lines);
    return lines;
  }
  /* Page headers/footers: "page 5 of 5", a lone printed date in a corner, or text repeated at the top/bottom of several pages. */
  function markJunk(lines){
    const pagesOf = {};
    for (const l of lines){ const k = l.text.toLowerCase().trim(); (pagesOf[k] ||= new Set()).add(l.page); }
    for (const l of lines){
      const H = l.pageH || 792, margin = l.y > H * 0.9 || l.y < H * 0.09, t = l.text.trim();
      l.junk = (/\bpage\s*\d+\s*(of|\/)\s*\d+\b/i.test(t) && t.length < 60) || /^page\s*\d+$/i.test(t) || /^-?\s*\d+\s*-?$/.test(t) && margin
        || (margin && (isDateOnly(t) || pagesOf[t.toLowerCase()].size >= 2 || /^\d+\s*(of|\/)\s*\d+$/.test(t)));
    }
  }

  /* Header row cells (merging "Lec" + "#" style neighbours that share a role). */
  function headerCols(line){
    let cells = line.items.map(i => ({text:i.text, x0:i.x0, x1:i.x1}));
    if (cells.length === 1 && roleWordCount(cells[0].text) >= 3){       // whole header in one run: split into words
      const c = cells[0], words = c.text.split(/\s+/), cw = (c.x1 - c.x0) / Math.max(1, c.text.length); let pos = 0; cells = [];
      for (const w of words){ cells.push({text:w, x0:c.x0 + pos * cw, x1:c.x0 + (pos + w.length) * cw}); pos += w.length + 1; }
    }
    const out = [];
    for (const c of cells){
      const role = roleOf(c.text), prev = out[out.length - 1];
      if (prev && ((role && role === prev.guess) || (!role && c.x0 - prev.x1 < 4) || (prev.guess == null && role && c.x0 - prev.x1 < 4))){
        prev.text += " " + c.text; prev.x1 = c.x1; prev.guess = prev.guess || role;
      } else out.push({text:c.text, x0:c.x0, x1:c.x1, guess:role});
    }
    return out.map(c => ({label:c.text, x0:c.x0, x1:c.x1, role:roleOf(c.text) || "ignore"}));
  }
  function headerScore(line){
    if (!line || line.junk || line.items.length > 14) return 0;
    const cols = headerCols(line);
    if (cols.some(c => c.label.length > 32 || findDates(c.label).length)) return 0;
    const roles = new Set(cols.map(c => c.role).filter(r => r !== "ignore"));
    if (!roles.has("date") || roles.size < 2) return 0;
    return roles.size + (roles.has("topic") ? 1 : 0);
  }
  function findHeader(lines, savedText){
    if (savedText){ const k = normLabel(savedText); const hit = lines.find(l => normLabel(l.text) === k); if (hit) return hit.i; }
    let best = -1, bs = 0;
    for (const l of lines){ const s = headerScore(l); if (s > bs){ bs = s; best = l.i; } }
    return best;
  }

  /* Column edges: for each pair of neighbouring headers, the emptiest vertical strip of the table body between their centres. */
  function columnBounds(cols, body){
    const B = 2, maxX = Math.max(...cols.map(c => c.x1), ...body.flatMap(l => l.items.map(i => i.x1))) + 10;
    const cov = new Array(Math.ceil(maxX / B) + 2).fill(0);
    for (const l of body) for (const it of l.items) for (let b = Math.floor(it.x0 / B); b <= Math.floor(it.x1 / B); b++) if (b >= 0 && b < cov.length) cov[b]++;
    const bounds = [];
    for (let i = 0; i < cols.length - 1; i++){
      const a = (cols[i].x0 + cols[i].x1) / 2, b = (cols[i+1].x0 + cols[i+1].x1) / 2;
      const lo = Math.ceil(a / B), hi = Math.max(lo, Math.floor(b / B));
      const inLabel = k => cols.some(c => k * B >= c.x0 && k * B <= c.x1);   // an edge never cuts through a header word
      const ok = k => !inLabel(k) || ![...Array(hi - lo + 1).keys()].some(j => !inLabel(lo + j));
      let min = Infinity; for (let k = lo; k <= hi; k++) if (ok(k)) min = Math.min(min, cov[k] ?? 0);
      const gapMid = (cols[i].x1 + cols[i+1].x0) / 2;
      let best = null;
      for (let k = lo; k <= hi; k++){
        if (!ok(k) || (cov[k] ?? 0) !== min) continue;
        let e = k; while (e + 1 <= hi && ok(e + 1) && (cov[e+1] ?? 0) === min) e++;
        const mid = (k + e + 1) / 2 * B, len = e - k + 1;
        if (!best || len > best.len || (len === best.len && Math.abs(mid - gapMid) < Math.abs(best.mid - gapMid))) best = {mid, len};
        k = e;
      }
      bounds.push(best ? best.mid : gapMid);
    }
    return bounds;
  }
  const colAt = (x, bounds) => { let i = 0; while (i < bounds.length && x >= bounds[i]) i++; return i; };

  /* Body lines → table rows. A row starts with a date (or XX/XX, TBD) in the date column or a number in the lecture column;
     other lines close below it are wrapped text of that row. */
  function tableRows(lines, hIdx, cols){
    const hdr = lines[hIdx], hk = normLabel(hdr.text);
    const body = lines.filter(l => l.i > hIdx && !l.junk && normLabel(l.text) !== hk);
    const bounds = columnBounds(cols, body);
    const dateCol = cols.findIndex(c => c.role === "date"), numCol = cols.findIndex(c => c.role === "num");
    const info = body.map(l => {
      const cells = cols.map(() => []);
      for (const it of l.items){
        const a = colAt(it.x0 + 1, bounds), b = colAt(it.x1 - 1, bounds);
        if (a === b) { cells[a].push(it.text); continue; }
        const words = it.text.split(/\s+/), cw = (it.x1 - it.x0) / Math.max(1, it.text.length); let pos = 0;   // run crosses a column edge
        for (const w of words){ cells[colAt(it.x0 + (pos + w.length / 2) * cw, bounds)].push(w); pos += w.length + 1; }
      }
      const txt = cells.map(c => c.join(" ").trim());
      const dTxt = dateCol >= 0 ? txt[dateCol] : "";
      const start = (dTxt && (findDates(dTxt).length > 0 || RX_UNKNOWN.test(dTxt))) || (numCol >= 0 && /^(l|lec|lecture)?\s*\.?\s*#?\s*\d{1,3}\s*$/i.test(txt[numCol]));
      return {l, txt, start};
    });
    const rows = []; let cur = null, prev = null, detached = true, pre = [];
    const gap = (a, b) => a.page === b.page ? a.y - b.y : Infinity;
    for (let k = 0; k < info.length; k++){
      const L = info[k], nx = info[k+1];
      if (L.start){
        cur = {cells:L.txt.slice(), first:L.l};
        for (const p of pre) p.txt.forEach((t, c) => { if (t) cur.cells[c] = (t + " " + cur.cells[c]).trim(); });
        pre = []; rows.push(cur); detached = false; prev = L.l; continue;
      }
      const h = Math.max(L.l.h, 8), dPrev = prev ? gap(prev, L.l) : Infinity, dNext = nx ? gap(L.l, nx.l) : Infinity;
      const nearPrev = !detached && dPrev <= 2.2 * h, nearNext = nx && nx.start && dNext <= 2.2 * h;
      const strong = /\b(final|exam|midterm|quiz|no class|review|break|holiday)\b/i.test(L.l.text) && dPrev > 1.6 * h && dPrev <= 3.5 * h && !detached;
      if (nearNext && (!nearPrev || dNext < dPrev - 1)) pre.push(L);          // text that sits above its row's date (vertically centred cells)
      else if (strong){ cur = {cells:L.txt.slice(), first:L.l}; rows.push(cur); prev = L.l; }
      else if (nearPrev && cur){ L.txt.forEach((t, c) => { if (t) cur.cells[c] = (cur.cells[c] + " " + t).trim(); }); prev = L.l; }
      else detached = true;                                              // prose after the table, captions, etc.
    }
    return {rows:rows.map(r => {
      const cells = {};
      cols.forEach((c, i) => { const t = r.cells[i]; if (!t || EMPTY.test(t) || c.role === "ignore") return; const key = c.role; cells[key] = cells[key] ? cells[key] + " " + t : t; });
      return {cells, page:r.first.page};
    }), bounds};
  }

  /* Line-by-line fallback when no table header is found (round-1 behaviour, now with times and rooms). */
  function looseLines(lines, resolve){
    const out = [];
    for (const l of lines){
      if (l.junk) continue;
      const line = l.text.replace(/\s+/g, " ").trim(); if (line.length < 4) continue;
      const ds = findDates(line).filter(d => !d.rangeEnd); if (!ds.length) continue;
      let title = line.replace(RX_NUMDATE, " ").replace(RX_NAMEDATE, " ").replace(RX_WEEKDAY, " ");
      const tm = parseTimes(title); if (tm) title = title.slice(0, tm.index) + " " + title.slice(tm.index + tm.length);
      title = tidy(title) || "Untitled item"; if (title.length > 90) title = title.slice(0, 87) + "…";
      const type = guessType(line);
      for (const d of ds){ const date = resolve(d); if (date) out.push({date, title:smartCase(title), type, time:tm ? tm.time : "", endTime:tm ? tm.endTime : "", location:"", reading:"", lectureNumber:null, notes:"", src:line, needsDate:false}); }
    }
    return out;
  }

  /* ---------- CSV ---------- */
  function parseCSV(text, forceDelim){
    const rows = []; let row = [], f = "", q = false; text = String(text).replace(/^﻿/, "");
    const delim = forceDelim || ((text.split(/\r?\n/)[0].match(/\t/g) || []).length > (text.split(/\r?\n/)[0].match(/,/g) || []).length ? "\t" : ",");
    for (let i = 0; i < text.length; i++){
      const c = text[i];
      if (q){ if (c === '"'){ if (text[i+1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === delim){ row.push(f); f = ""; }
      else if (c === "\n" || c === "\r"){ if (c === "\r" && text[i+1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f || row.length){ row.push(f); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function csvHeaderIndex(rows){ for (let i = 0; i < Math.min(rows.length, 15); i++){ const roles = new Set(rows[i].map(roleOf).filter(r => r && r !== "ignore")); if (roles.has("date") && roles.size >= 2) return i; } return 0; }
  function csvRows(rows, hIdx, cols){
    return rows.slice(hIdx + 1).map(r => { const cells = {}; cols.forEach((c, i) => { const t = String(r[i] ?? "").trim(); if (!t || EMPTY.test(t) || c.role === "ignore") return; cells[c.role] = cells[c.role] ? cells[c.role] + " " + t : t; }); return {cells}; })
      .filter(r => Object.keys(r.cells).length);
  }

  /* ---------- AI request / response ---------- */
  const AI_TYPES = ["Lecture","Recitation","Review","No Class","Exam","Quiz","Homework","Lab","Project","Reading","Other"];
  function aiPrompt(text, ctx){
    return `You convert a college course schedule into calendar items. Reply with ONLY a JSON object, no prose and no code fences, shaped exactly like:
{"course":"ECE 25500","items":[{"date":"2026-08-24","type":"Lecture","title":"Field-Effect Transistors","lectureNumber":1,"reading":"Text ch. 4","time":"","endTime":"","location":"","notes":""}]}

Rules:
- One item per schedule row. If a row holds a lecture AND an exam (or quiz), output two items with the same date.
- type is one of: ${AI_TYPES.join(", ")}. Numbered class sessions are "Lecture". Rows saying REVIEW are "Review". NO CLASS, breaks and holidays are "No Class" (title = the reason, e.g. "No class: Labor Day").
- For a Lecture, title is the topic only (no "Lecture 9:" prefix) and lectureNumber is the number. reading is like "Text ch. 1, 7".
- date is YYYY-MM-DD. ${ctx.year ? `Assume the year ${ctx.year} unless the text says otherwise (a schedule that runs past December continues into the next year).` : `Today is ${ctx.today}; pick the semester that fits.`} If the date is unknown (XX/XX, TBD), use null.
- time and endTime are 24-hour HH:MM ("8:00 – 9:00 p.m." → "20:00" and "21:00"), or "" if not given. location is the room, e.g. "BHEE 129".
- Ignore page headers and footers such as a printed date in a corner or "page 5 of 5". Do not invent rows.

Schedule text:
${text}`;
  }
  function parseAIResult(raw, ctx){
    let s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a < 0 || b < a) throw new Error("The model didn't return JSON.");
    const obj = JSON.parse(s.slice(a, b + 1));
    const list = Array.isArray(obj) ? obj : obj.items;
    if (!Array.isArray(list)) throw new Error("The JSON has no items list.");
    const tm = v => /^\d{1,2}:\d{2}$/.test(String(v || "").trim()) ? String(v).trim().padStart(5, "0") : "";
    const items = list.map(x => {
      let type = AI_TYPES.find(t => t.toLowerCase() === String(x.type || "").toLowerCase()) || TYPE_ALIASES[normLabel(x.type)] || "Other";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) ? x.date : "";
      const n = Number.isFinite(+x.lectureNumber) && x.lectureNumber !== null && x.lectureNumber !== "" ? Math.round(+x.lectureNumber) : null;
      let title = String(x.title || "").trim() || type;
      if (type === "Lecture" && n != null && !/^lecture\s*\d/i.test(title)) title = `Lecture ${n}: ${title}`;
      if (type === "No Class" && x.title && !/no\s+class/i.test(title)) title = `No class — ${title}`;
      return {date, needsDate:!date, type, title, lectureNumber:n, reading:fmtReading(x.reading || ""), time:tm(x.time), endTime:tm(x.endTime),
        location:String(x.location || "").trim(), notes:String(x.notes || "").trim(), src:"From AI"};
    });
    return {course:String(obj.course || "").trim(), items};
  }

  const CSV_COLUMNS = ["Date","Type","Lecture #","Title","Reading","Start","End","Location","Notes"];
  function conversionPrompt(){
    return `Convert the attached course schedule into a CSV file I can import into my calendar. Reply with only the CSV inside one code block, nothing else.

Use exactly this header row:
${CSV_COLUMNS.join(",")}

Rules for each column:
- Date: YYYY-MM-DD. Use the year printed in the document; if a schedule crosses New Year, continue into the next year. If a date is unknown (XX/XX, TBD), write TBD.
- Type: one of Lecture, Review, No Class, Exam, Quiz, Homework, Lab, Project, Reading, Other.
  Numbered class sessions are Lecture. REVIEW rows are Review. NO CLASS rows, breaks and holidays are No Class.
- Lecture #: the lecture number for Lecture rows, otherwise blank.
- Title: the topic only, without "Lecture 9:" (the importer adds that). For No Class rows, the reason (for example "Labor Day"). For exams, e.g. "Exam 1" or "Final Exam".
- Reading: e.g. "Text ch. 1, 7", or blank.
- Start and End: 24-hour HH:MM (8:00 – 9:00 p.m. becomes 20:00 and 21:00), or blank.
- Location: the room, e.g. BHEE 129, or blank.
- Notes: anything else useful, or blank.

One row per item. If one day has both a lecture and an exam, write two rows with the same date.
Skip page headers and footers (a printed date in a corner, "page 5 of 5", the course title).
Quote any field that contains a comma.`;
  }

  /* Course name: a code like "ECE 20002" near the top, else the title line above the table, else the file name. */
  function guessCourse(lines, hIdx, fileName){
    const top = lines.filter(l => !l.junk && (hIdx < 0 || l.i < hIdx) && l.page === (lines[0] || {}).page).slice(0, 8);
    const code = /\b([A-Z]{2,5})\s?(\d{3,5}[A-Z]?)\b/;
    for (const l of top){ const m = l.text.match(code); if (m && !/\b(room|rm|hall)\b/i.test(l.text)) return `${m[1]} ${m[2]}`; }
    const f = String(fileName || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " "), fm = f.match(code) || f.match(/\b([A-Z]{2,5})[\s-]?(\d{3,5})\b/i);
    if (fm) return `${fm[1].toUpperCase()} ${fm[2]}`;
    for (const l of top){
      const t = tidy(l.text.replace(RX_NUMDATE, " ").replace(RX_NAMEDATE, " ").replace(/\b(course\s+)?(schedule|calendar|syllabus|tentative|lecture schedule)\b/ig, " ").replace(/\b(spring|summer|fall|autumn|winter)\s+20\d{2}\b/ig, " "));
      if (t.length >= 3 && t.length <= 50 && /[A-Za-z]{3}/.test(t)) return t;
    }
    return "";
  }

  /* ---------- pasted text and screenshot (OCR) text ---------- */
  /* Plain text → line objects shaped like PDF lines, so header and course detection work the same. */
  function textLines(text){
    const raw = String(text || "").replace(/\r/g, "").split("\n").map(t => t.replace(/\t/g, "  ").replace(/\s+$/, "")).filter(t => t.trim());
    const H = (raw.length + 2) * 12;
    return buildLines([{page:1, height:H, items:raw.map((t, i) => ({str:t, x:0, y:H - (i + 1) * 12, w:t.length * 6, h:10}))}]);
  }
  const RX_ROWSTART = /^[^\w(]*(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?|[MTWRFSUX]{1,3}\.?)?\s*(\d{1,2}\s*\/\s*\d{1,2}(?:\/\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})?|20\d{2}-\d{1,2}-\d{1,2}|x+\s*x*\s*\/\s*x+|tbd|tba)(?![\w/])/i;
  const RX_NOREADING = /\b(review|exam|quiz|midterm|test|lab|hw|homework|project|chapter|part|week|unit|lecture|session|day|break)\s+\d{1,2}$/i;
  /* One schedule row per line that starts with a date. Lecture number = a small number right after the date;
     reading = chapter-like numbers at the end of the line. Short lines without a date continue the row above. */
  function textRows(lines){
    const hIdx = findHeader(lines), hdr = hIdx >= 0 ? headerCols(lines[hIdx]).map(c => c.role) : [];
    const body = lines.filter(l => !l.junk && l.i > hIdx);
    const starts = body.map(l => ({l, m:l.text.trim().match(RX_ROWSTART)})).filter(x => x.m);
    const restOf = x => x.l.text.trim().slice(x.m[0].length).trim();
    const share = f => starts.length ? starts.filter(x => f(restOf(x))).length / starts.length : 0;
    const useNum = hdr.includes("num") || share(r => /^\d{1,3}\.?\s+\S/.test(r)) >= 0.3;
    const useRead = (hdr.includes("reading") && hdr.indexOf("reading") > hdr.indexOf("topic")) || share(r => /\s\d{1,2}(?:\s*[,&–-]\s*\d{1,2})*$/.test(r)) >= 0.3;
    const rows = []; let cur = null, gap = 0;
    for (const l of body){
      const t = l.text.replace(/(^|\s)[=|_~«»]+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim(), m = t.match(RX_ROWSTART);   // OCR reads table borders as "=" or "|"
      if (!t) continue;
      if (m){
        let rest = t.slice(m[0].length).replace(/^[\s.:,|–—-]+(?=\S)/, "").trim();
        const date = m[1].replace(/\s+/g, "");
        if (!rest && !RX_UNKNOWN.test(date) && isDateOnly(date)) continue;   // a lone printed date
        const cells = {date};
        if (useNum){ const nm = rest.match(/^(\d{1,3})\.?\s+(?=\S)|^[–—-]\s+(?=\S)/); if (nm){ if (nm[1]) cells.num = nm[1]; rest = rest.slice(nm[0].length); } }
        rest = rest.replace(/\s+[–—-]\s*$/, "");                             // "–" placeholder in an empty last column
        if (useRead && !RX_NOREADING.test(rest) && !(/\b[A-Z]{2,6}\s?\d{1,4}$/.test(rest) && /\b(exam|quiz|midterm|final|room|in|at)\b/i.test(rest)) && !/\d:\d\d/.test(rest)){
          const rm = rest.match(/\s+(\d{1,2}(?:\s*[,&–-]\s*\d{1,2})*)$/); if (rm){ cells.reading = rm[1]; rest = rest.slice(0, rm.index); }
        }
        cells.topic = rest.replace(/\s+[–—-]\s*$/, "").trim();
        cur = {cells}; rows.push(cur); gap = 0;
      } else if (/^[^\w(]*[MTWRFSUX]{1,3}\s?[\w|]{1,3}\s?\/\s?[\w|]{1,3}\b/.test(t) && t.length > 10){
        /* a row whose date the OCR garbled (e.g. "WII/1L"): keep it, without a date, so it lands in "Needs a date" */
        const g = t.match(/^[^\w(]*[MTWRFSUX]{1,3}\s?[\w|]{1,3}\s?\/\s?[\w|]{1,3}\b\.?\s*/)[0];
        let rest = t.slice(g.length).trim(); const cells = {date:"??"};
        if (useNum){ const nm = rest.match(/^(\d{1,3})\.?\s+(?=\S)/); if (nm){ cells.num = nm[1]; rest = rest.slice(nm[0].length); } }
        if (useRead){ const rm = rest.match(/\s+(\d{1,2}(?:\s*[,&–-]\s*\d{1,2})*)$/); if (rm && !RX_NOREADING.test(rest)){ cells.reading = rm[1]; rest = rest.slice(0, rm.index); } }
        cells.topic = rest; cur = {cells}; rows.push(cur); gap = 0;
      } else if (cur && useRead && !cur.cells.reading && /^\d{1,2}(?:\s*[,.&–-]\s*\d{1,2})*$/.test(t)){
        cur.cells.reading = t.replace(/(\d)\.(\d)/g, "$1,$2"); gap++;                  // OCR put the chapter on its own line
      } else if (cur && t.length <= 100 && gap < 2 && !findDates(t).length && !headerScore(l)){
        cur.cells.topic = (cur.cells.topic + " " + t).trim(); gap++;
      } else gap = 9;
    }
    return {rows, hIdx};
  }
  /* Text copied column by column (some PDF viewers do this): long runs of lines that are only dates. */
  function looksColumnar(lines){ let run = 0, best = 0; for (const l of lines){ const t = l.text.trim(); if (isDateOnly(t) || (RX_UNKNOWN.test(t) && t.length < 12)){ run++; best = Math.max(best, run); } else run = 0; } return best >= 6; }

  return {textLines, textRows, looksColumnar, guessCourse, ROLES, ROLE_NAMES, roleOf, normLabel, findDates, isDateOnly, docYear, dateResolver, parseTimes, parseLocation, smartCase, fmtReading,
    guessType, classifyRow, buildLines, headerCols, headerScore, findHeader, tableRows, looseLines, parseCSV, csvHeaderIndex, csvRows,
    aiPrompt, parseAIResult, conversionPrompt, addDay, AI_TYPES, CSV_COLUMNS};
})();
/*@@CORE-END*/
