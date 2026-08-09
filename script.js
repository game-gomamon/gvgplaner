/* ============================================================
   UNITED FRONT PLANNER — Etheria Restart
   Vanilla JS. No build step. Runs entirely in the browser.
   ============================================================ */

/* ============================================================
   1. BOX CONFIGURATION  ← EDIT THIS BLOCK TO MOVE THE ZONES
   ------------------------------------------------------------
   One entry per coloured box on the map. All values are
   PERCENTAGES of the image, so the zones scale with it:

     x  = distance from the image's left edge   (0–100)
     y  = distance from the image's top edge    (0–100)
     w  = zone width                            (0–100)
     h  = zone height                           (0–100)

   To move a zone:  change x / y.
   To resize one:   change w / h.
   To add a box:    append { id:"box-31", x:.., y:.., w:.., h:.. }
                    — ids just have to be unique.
   To remove one:   delete its line. Saved assignments pointing
                    at a missing id are dropped automatically.

   Tip: tick "Outline nodes" in the header to see every zone
   drawn over the map while you tune these numbers.

   These 30 boxes were measured against
   assets/united-front-planner.png (1601 × 982). If you swap in
   a different map image, re-measure them.

   box-01 … box-03 are the red stack on the top-left node.
   ============================================================ */
const BOXES = [
  { id: "box-01", x: 19.86, y:  1.43, w: 9.37, h: 5.19 },   // red
  { id: "box-02", x: 19.86, y:  7.64, w: 9.37, h: 5.19 },   // red
  { id: "box-03", x: 19.86, y: 13.85, w: 9.37, h: 5.19 },   // red
  { id: "box-04", x:  8.62, y: 18.53, w: 9.43, h: 5.60 },
  { id: "box-05", x:  8.62, y: 24.95, w: 9.43, h: 5.60 },
  { id: "box-06", x: 31.42, y: 10.69, w: 9.31, h: 5.40 },
  { id: "box-07", x: 31.48, y: 17.01, w: 9.24, h: 5.60 },
  { id: "box-08", x: 43.35, y: 15.58, w: 9.56, h: 5.60 },
  { id: "box-09", x: 55.84, y: 13.95, w: 9.43, h: 5.60 },
  { id: "box-10", x: 55.84, y: 20.47, w: 9.43, h: 5.60 },
  { id: "box-11", x:  6.06, y: 36.86, w: 9.56, h: 5.80 },
  { id: "box-12", x: 44.03, y: 27.80, w: 9.74, h: 5.50 },
  { id: "box-13", x: 63.96, y: 29.12, w: 9.56, h: 5.80 },
  { id: "box-14", x: 32.48, y: 34.11, w: 9.68, h: 5.70 },
  { id: "box-15", x: 22.36, y: 40.53, w: 9.49, h: 5.60 },
  { id: "box-16", x: 44.10, y: 37.17, w: 9.87, h: 5.60 },
  { id: "box-17", x: 44.10, y: 43.69, w: 9.87, h: 5.60 },
  { id: "box-18", x: 55.78, y: 40.73, w: 9.68, h: 5.60 },
  { id: "box-19", x: 70.14, y: 38.19, w: 9.62, h: 5.50 },
  { id: "box-20", x: 70.14, y: 44.60, w: 9.62, h: 5.50 },
  { id: "box-21", x: 12.24, y: 49.29, w: 9.93, h: 5.70 },
  { id: "box-22", x: 12.24, y: 55.91, w: 9.93, h: 5.60 },
  { id: "box-23", x: 37.85, y: 53.05, w: 9.12, h: 5.70 },
  { id: "box-24", x: 80.51, y: 52.65, w: 9.68, h: 5.50 },
  { id: "box-25", x: 64.77, y: 57.23, w: 9.81, h: 5.60 },
  { id: "box-26", x: 25.86, y: 60.69, w: 9.68, h: 5.60 },
  { id: "box-27", x: 51.41, y: 60.29, w: 10.12, h: 5.60 },
  { id: "box-28", x: 51.41, y: 66.80, w: 10.12, h: 5.70 },
  { id: "box-29", x: 83.14, y: 69.14, w: 9.56, h: 5.80 },
  { id: "box-30", x: 68.77, y: 74.34, w: 9.81, h: 5.60 }
];

/* Label sizing, as a fraction of the map's width.
   Raise for chunkier names, lower for more room. */
const LABEL_SCALE = 0.0155;
const LABEL_FIT   = 0.88;                            // share of a box a name may fill
const EXPORT_SCALE = 2;                              // 2 = double-resolution PNG
const EXPORT_NAME  = "holyship-united-front-planner.png";
const STORE_KEY    = "etheria-uf-planner/v3";        // v3: node ids shifted for the 30-box map

/* The roster is read straight out of the repo — no upload needed.
   Drop your Member.xlsx next to index.html and it loads on every visit.
   Filenames are case-sensitive on GitHub Pages, so both spellings are
   tried in order. Add more names here if yours differs. */
const ROSTER_FILES = ["Member.xlsx", "member.xlsx"];

/* The map image. Each path is tried in order until one loads, so it
   works whether the PNG sits in assets/ or beside index.html.
   Case matters on GitHub Pages — add your exact filename here if it
   differs from these. */
const MAP_IMAGES = [
  "assets/united-front-planner.png",
  "united-front-planner.png",
  "assets/map.png"
];

/* ============================================================
   2. STATE
   ============================================================ */

let members = [];      // [{ key, id, rta, rank }] — key is the stable handle
let assign  = {};      // { boxId: memberKey }
let picked  = null;    // memberKey currently "in hand"
let dialogOpen = false;

const $ = (sel) => document.querySelector(sel);

const planner   = $("#planner");
const plannerImg= $("#planner-img");
const listEl    = $("#member-list");
const emptyNote = $("#empty-note");
const searchEl  = $("#search");
const rosterEl  = $("#roster-panel");
const loadState = $("#load-state");

const zoneById  = new Map();   // boxId -> zone element

/* ============================================================
   3. DROP ZONES
   Built once from BOXES. Each zone is a transparent button laid
   over the image — the artwork underneath is never touched.
   ============================================================ */

function buildZones(){
  BOXES.forEach((box) => {
    const zone = document.createElement("div");
    zone.className = "zone";
    zone.id = box.id;
    zone.dataset.box = box.id;
    zone.tabIndex = 0;
    zone.setAttribute("role", "button");
    zone.style.left   = box.x + "%";
    zone.style.top    = box.y + "%";
    zone.style.width  = box.w + "%";
    zone.style.height = box.h + "%";

    const name = document.createElement("span");
    name.className = "zone-name";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "clear";
    clear.textContent = "×";
    clear.title = "Clear this node";
    clear.addEventListener("click", (e) => {
      e.stopPropagation();
      unassignBox(box.id);
    });

    zone.append(name, clear);

    /* --- pointer / keyboard --- */
    zone.addEventListener("click", () => {
      if (swallowClick) return;       // the tap was the end of a drag
      onZoneActivate(box.id);
    });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onZoneActivate(box.id); }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); unassignBox(box.id); }
    });

    /* --- HTML5 drag target (mouse) --- */
    zone.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("text/plain")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zone.classList.add("is-over");
    });
    /* dragleave also fires when the cursor crosses onto the × button,
       so only clear the highlight when the zone is really left. */
    zone.addEventListener("dragleave", (e) => {
      if (zone.contains(e.relatedTarget)) return;
      zone.classList.remove("is-over");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-over");
      const key = e.dataTransfer.getData("text/plain");
      if (key) place(key, box.id);
    });

    /* A placed name can be dragged straight to another node.
       draggable is switched on in render(), only while the node is filled. */
    zone.addEventListener("dragstart", (e) => {
      const key = assign[box.id];
      if (!key) { e.preventDefault(); return; }
      e.dataTransfer.setData("text/plain", key);
      e.dataTransfer.effectAllowed = "move";
    });

    /* --- touch drag --- */
    zone.addEventListener("pointerdown", (e) => {
      const key = assign[box.id];
      if (key) armPointerDrag(e, key);
    });

    zoneById.set(box.id, zone);
    planner.appendChild(zone);
  });
}

/* Drop a name back on the roster to unassign it */
rosterEl.addEventListener("dragover", (e) => {
  if (!e.dataTransfer.types.includes("text/plain")) return;
  e.preventDefault();
  rosterEl.classList.add("is-dropping");
});
rosterEl.addEventListener("dragleave", (e) => {
  if (rosterEl.contains(e.relatedTarget)) return;
  rosterEl.classList.remove("is-dropping");
});
rosterEl.addEventListener("drop", (e) => {
  e.preventDefault();
  rosterEl.classList.remove("is-dropping");
  const key = e.dataTransfer.getData("text/plain");
  if (key) { unassignMember(key); }
});

/* ============================================================
   3b. MAP IMAGE
   Tries each path in MAP_IMAGES. If none load, the frame explains
   what's missing instead of sitting there blank, and offers a local
   file as a stopgap so the board still works.
   ============================================================ */

function loadMapImage(index = 0){
  if (index >= MAP_IMAGES.length){
    $("#map-error").hidden = false;
    $("#map-error-paths").textContent =
      "Looked for: " + MAP_IMAGES.join("  ·  ");
    planner.classList.add("no-map");
    return;
  }
  plannerImg.onerror = () => loadMapImage(index + 1);
  plannerImg.onload  = () => {
    $("#map-error").hidden = true;
    planner.classList.remove("no-map");
    fitLabels();
  };
  plannerImg.src = MAP_IMAGES[index];
}

/* Stopgap: use an image off the device for this session. Note that a
   file chosen this way can't be exported — the canvas gets tainted —
   so it's a preview, not a fix. */
$("#btn-pick-map").addEventListener("click", () => $("#map-input").click());
$("#map-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  plannerImg.onerror = null;
  plannerImg.onload = () => { $("#map-error").hidden = true; planner.classList.remove("no-map"); fitLabels(); };
  plannerImg.src = URL.createObjectURL(file);
  toast("Using a local image — push it to the repo to make it stick");
});

/* ============================================================
   4. ASSIGNMENT RULES
   - A member holds exactly one node.
   - Dropping onto an occupied node swaps the two if the incoming
     member already had a node; otherwise it asks before replacing.
   ============================================================ */

function boxOf(key){
  return Object.keys(assign).find((b) => assign[b] === key) || null;
}

async function place(key, boxId){
  const member = members.find((m) => m.key === key);
  if (!member) return;

  const occupant = assign[boxId];
  if (occupant === key) { setPicked(null); return; }

  if (occupant && !boxOf(key)){
    const other = members.find((m) => m.key === occupant);
    const ok = await confirmDialog({
      title: "Replace " + (other ? other.id : "member") + "?",
      body:  member.id + " takes this node and " + (other ? other.id : "the current member") +
             " goes back to the roster.",
      ok:    "Replace"
    });
    if (!ok) return;
  }

  /* Re-read the board after the await — it may have moved on while
     the dialog was open. */
  const from = boxOf(key);
  const now  = assign[boxId];

  if (now && from)      assign[from] = now;      // straight swap
  else if (from)        delete assign[from];

  assign[boxId] = key;
  setPicked(null);
  save(); render();
}

function unassignBox(boxId){
  if (!assign[boxId]) return;
  delete assign[boxId];
  save(); render();
}

function unassignMember(key){
  const b = boxOf(key);
  if (!b) return;
  delete assign[b];
  save(); render();
}

/* Tapping a node: drop the held member in, or pick up whoever is there */
function onZoneActivate(boxId){
  if (picked){ place(picked, boxId); return; }
  const occupant = assign[boxId];
  if (occupant) setPicked(occupant);
}

function setPicked(key){
  picked = key;
  render();
}

/* ============================================================
   4b. TOUCH DRAG
   HTML5 drag events never fire on a touch screen, so a finger gets
   its own path: press and hold for a moment, then drag. The hold
   gate means a normal tap and a list scroll behave exactly as
   before — nothing here runs unless the drag actually starts.
   ============================================================ */

const HOLD_MS   = 240;   // press-and-hold before a drag begins
const SLOP_PX   = 10;    // movement that counts as a scroll, not a drag

let drag = null;         // { key, pointerId, x, y, active, ghost, over }
let holdTimer = null;
let swallowClick = false;

function armPointerDrag(e, key){
  if (e.pointerType === "mouse") return;      // the mouse keeps native drag+drop
  if (drag) return;
  const start = { x: e.clientX, y: e.clientY };
  drag = { key, pointerId: e.pointerId, x: start.x, y: start.y, active: false, ghost: null, over: null };

  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    if (!drag || drag.active) return;
    drag.active = true;
    drag.ghost = makeGhost(key, drag.x, drag.y);
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
  }, HOLD_MS);
}

function makeGhost(key, x, y){
  const m = members.find((mm) => mm.key === key);
  const el = document.createElement("div");
  el.className = "drag-ghost";
  el.textContent = m ? m.id : key;
  document.body.appendChild(el);
  moveGhost(el, x, y);
  return el;
}

function moveGhost(el, x, y){
  el.style.transform = "translate(" + (x + 14) + "px," + (y - 22) + "px)";
}

function hoverTarget(x, y){
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const zone = el.closest(".zone");
  if (zone) return { kind: "zone", id: zone.dataset.box, el: zone };
  if (el.closest("#roster-panel")) return { kind: "roster", el: rosterEl };
  return null;
}

function paintHover(next){
  const prev = drag.over;
  if (prev && (!next || prev.el !== next.el)){
    prev.el.classList.remove(prev.kind === "zone" ? "is-over" : "is-dropping");
  }
  if (next) next.el.classList.add(next.kind === "zone" ? "is-over" : "is-dropping");
  drag.over = next;
}

document.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;

  if (!drag.active){
    // moved before the hold finished → the user is scrolling, not dragging
    if (Math.abs(e.clientX - drag.x) > SLOP_PX || Math.abs(e.clientY - drag.y) > SLOP_PX){
      cancelPointerDrag();
    }
    return;
  }

  drag.x = e.clientX; drag.y = e.clientY;
  moveGhost(drag.ghost, drag.x, drag.y);
  paintHover(hoverTarget(drag.x, drag.y));
});

/* Non-passive, so the page stops scrolling once a drag is under way */
document.addEventListener("touchmove", (e) => {
  if (drag && drag.active) e.preventDefault();
}, { passive: false });

document.addEventListener("pointerup", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  if (d.active){
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    const target = hoverTarget(e.clientX, e.clientY);
    paintHover(null);
    if (target && target.kind === "zone")   place(d.key, target.id);
    if (target && target.kind === "roster") unassignMember(d.key);
  }
  cancelPointerDrag();
});

document.addEventListener("pointercancel", cancelPointerDrag);

function cancelPointerDrag(){
  clearTimeout(holdTimer);
  if (!drag) return;
  if (drag.over) paintHover(null);
  if (drag.ghost) drag.ghost.remove();
  drag = null;
}

/* ============================================================
   5. EXCEL PARSING (SheetJS)
   Reads the first worksheet, matches the ID / RTA Score / Rank
   headers loosely (case and spacing are ignored), then sorts by
   Rank ascending. Ties break on the higher RTA Score.
   ============================================================ */

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function pickColumn(keys, candidates){
  for (const cand of candidates){
    const hit = keys.find((k) => norm(k) === cand);
    if (hit) return hit;
  }
  return keys.find((k) => candidates.some((c) => norm(k).includes(c))) || null;
}

function parseWorkbook(buffer){
  const wb    = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) throw new Error("That sheet has no rows.");

  /* Header keys come from the first row, but a blank cell there means
     the key is missing from that object — so scan every row. */
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const idKey  = pickColumn(keys, ["id", "member", "name", "memberid"]);
  const rtaKey = pickColumn(keys, ["rtascore", "rta", "score"]);
  const rankKey= pickColumn(keys, ["rank", "ranking"]);

  if (!idKey) throw new Error("No ID column found. Add a column headed ID.");

  const seen = new Set();
  const parsed = rows
    .map((row, i) => {
      const rank = Number(rankKey ? row[rankKey] : NaN);
      const id   = String(row[idKey]).trim();
      // Key on the ID, so assignments survive a page reload or a roster
      // edit. Repeated IDs get a suffix so they stay distinct.
      let key = id;
      let n = 2;
      while (seen.has(key)) key = id + "#" + n++;
      seen.add(key);
      return {
        key,
        id,
        rta:  Number(rtaKey ? row[rtaKey] : NaN),
        rank: Number.isFinite(rank) ? rank : i + 1
      };
    })
    .filter((m) => m.id !== "");

  if (!parsed.length) throw new Error("Every ID cell was empty.");

  parsed.sort((a, b) => a.rank - b.rank || (b.rta || 0) - (a.rta || 0));
  return parsed;
}

/* Fetch the workbook shipped with the site. Cache is bypassed so an
   updated Member.xlsx shows up on the next refresh rather than days later. */
async function loadRosterFile(){
  if (typeof XLSX === "undefined"){
    fail("Spreadsheet library did not load — check the connection");
    return;
  }
  loadState.textContent = "Loading roster…";
  loadState.className = "load-state";

  let lastErr = null;
  for (const name of ROSTER_FILES){
    try {
      const res = await fetch(name + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) { lastErr = new Error(name + " not found"); continue; }
      const buf = await res.arrayBuffer();
      members = parseWorkbook(new Uint8Array(buf));
      picked  = null;
      loadState.textContent = members.length + " members · " + name;
      loadState.className = "load-state ok";
      $("#btn-pick").hidden = true;
      render();          // prunes anything stale first…
      save();            // …then persists the cleaned-up board
      return;
    } catch (err){ lastErr = err; }
  }
  fail(lastErr && lastErr.message ? lastErr.message : "Roster not found");
}

function fail(msg){
  loadState.textContent = msg;
  loadState.className = "load-state bad";
  $("#btn-pick").hidden = false;   // manual pick as a fallback
  render();
}

$("#btn-pick").addEventListener("click", () => $("#file-input").click());

$("#file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    members = parseWorkbook(new Uint8Array(buf));
    picked  = null;
    loadState.textContent = members.length + " members · " + file.name;
    loadState.className = "load-state ok";
    render(); save();
    toast("Roster loaded — " + members.length + " members");
  } catch (err){
    fail(err.message || "Could not read that file");
  }
  e.target.value = "";
});

/* ============================================================
   6. RENDER
   ============================================================ */

function render(){
  const filter = searchEl.value.trim().toLowerCase();
  const zoneIds = new Set(BOXES.map((b) => b.id));

  // drop stale assignments (edited BOXES, or a roster reload)
  Object.keys(assign).forEach((b) => {
    if (!zoneIds.has(b) || !members.some((m) => m.key === assign[b])) delete assign[b];
  });

  // the held member may have just left the roster
  if (picked && !members.some((m) => m.key === picked)) picked = null;

  /* --- roster --- */
  listEl.innerHTML = "";
  members.forEach((m) => {
    if (filter && !m.id.toLowerCase().includes(filter)) return;

    const li  = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "member";
    btn.draggable = true;
    btn.dataset.key = m.key;

    const at = boxOf(m.key);
    if (at) btn.classList.add("assigned");
    if (picked === m.key) btn.classList.add("selected");

    btn.innerHTML =
      '<span class="rank"></span>' +
      '<span class="name"></span>' +
      '<span class="at">' + (at ? at.replace("box-", "N") : "") + '</span>';
    btn.querySelector(".rank").textContent = "#" + m.rank;
    btn.querySelector(".name").textContent = m.id;
    btn.title = "Rank " + m.rank + (Number.isFinite(m.rta) ? " · RTA " + m.rta : "");

    btn.addEventListener("click", () => {
      if (swallowClick) return;
      setPicked(picked === m.key ? null : m.key);
    });
    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", m.key);
      e.dataTransfer.effectAllowed = "move";
      setPicked(m.key);
    });
    btn.addEventListener("pointerdown", (e) => armPointerDrag(e, m.key));

    li.appendChild(btn);
    listEl.appendChild(li);
  });

  emptyNote.hidden = members.length > 0;

  /* --- map labels --- */
  BOXES.forEach((box) => {
    const zone = zoneById.get(box.id);
    if (!zone) return;
    const key  = assign[box.id];
    const m    = key ? members.find((x) => x.key === key) : null;
    zone.querySelector(".zone-name").textContent = m ? m.id : "";
    zone.classList.toggle("filled", !!m);
    zone.classList.toggle("is-target", !!picked);
    zone.classList.toggle("is-held", !!m && m.key === picked);
    zone.draggable = !!m;                     // empty nodes aren't draggable
    zone.setAttribute("aria-label",
      m ? box.id + ", " + m.id : box.id + ", empty");
  });

  /* --- counters --- */
  const used = Object.keys(assign).length;
  $("#count-loaded").textContent   = members.length;
  $("#count-assigned").textContent = used;
  $("#count-open").textContent     = Math.max(members.length - used, 0);
  $("#ratio").textContent          = used + " / " + members.length;
  $("#nodes-free").textContent     = BOXES.length - used;
  $("#meter-fill").style.width     = (members.length ? (used / members.length) * 100 : 0) + "%";

  const held = picked ? members.find((m) => m.key === picked) : null;
  $("#stage-hint").textContent = held
    ? "Holding " + held.id + " — tap a node to place it."
    : "Pick a member, then tap a node. Or drag a name straight onto the map.";

  fitLabels();
}

/* ============================================================
   6b. LABEL SIZING
   One canvas measurement per name instead of a shrink-by-half-a-pixel
   loop, so the map doesn't force 30 × 40 reflows on every render —
   and the on-screen size matches the exported one exactly.
   ============================================================ */

const measureCtx = document.createElement("canvas").getContext("2d");

function labelFont(size){
  return "700 " + size + 'px "Chakra Petch", sans-serif';
}

/* Largest size at or below `base` that keeps `text` inside `maxPx`. */
function labelSize(text, maxPx, base){
  if (!text) return base;
  measureCtx.font = labelFont(base);
  const w = measureCtx.measureText(text).width;
  if (!w || w <= maxPx) return base;
  return Math.max(7, base * maxPx / w);
}

function fitLabels(){
  const mapW = planner.clientWidth;
  if (!mapW) return;
  const base = mapW * LABEL_SCALE;
  BOXES.forEach((box) => {
    const zone = zoneById.get(box.id);
    if (!zone) return;
    const text = zone.querySelector(".zone-name").textContent;
    const maxPx = mapW * (box.w / 100) * LABEL_FIT;
    zone.style.fontSize = labelSize(text, maxPx, base) + "px";
  });
}

/* Fonts land after first paint; re-fit once they're ready. */
if (document.fonts && document.fonts.ready){
  document.fonts.ready.then(fitLabels).catch(() => {});
}

/* The roster is sticky, so it needs to know how tall the header is
   to size itself against the viewport. */
const topbar = document.querySelector(".topbar");
function syncHeaderHeight(){
  document.documentElement.style.setProperty("--head-h", topbar.offsetHeight + "px");
}
new ResizeObserver(syncHeaderHeight).observe(topbar);
syncHeaderHeight();

searchEl.addEventListener("input", render);
new ResizeObserver(fitLabels).observe(planner);
plannerImg.addEventListener("load", fitLabels);
$("#outline-toggle").addEventListener("change", (e) => {
  planner.parentElement.classList.toggle("outline", e.target.checked);
});

/* ============================================================
   7. PERSISTENCE (localStorage)
   ============================================================ */

function save(){
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ members, assign }));
  } catch (_) { /* private mode / quota — the app still works in-session */ }
}

function restore(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.members)) members = data.members;
    if (data.assign && typeof data.assign === "object") assign = data.assign;
    // members are refreshed from the file a moment later; this just
    // avoids an empty panel on slow connections
  } catch (_) { /* corrupt entry — start clean */ }
}

/* ============================================================
   8. RESET / CLEAR
   ============================================================ */

$("#btn-reset").addEventListener("click", async () => {
  if (!Object.keys(assign).length) { toast("Nothing assigned yet"); return; }
  const ok = await confirmDialog({
    title: "Reset all assignments?",
    body:  "Every member returns to the roster. The map itself is untouched.",
    ok:    "Reset"
  });
  if (!ok) return;
  assign = {}; picked = null;
  save(); render();
  toast("Board cleared");
});

$("#btn-clear").addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Clear saved data?",
    body:  "This removes the stored assignments from this browser. The roster reloads from Member.xlsx.",
    ok:    "Clear"
  });
  if (!ok) return;
  localStorage.removeItem(STORE_KEY);
  members = []; assign = {}; picked = null;
  render();
  loadRosterFile();          // the file is the source of truth — read it again
  toast("Saved data cleared");
});

/* ============================================================
   9. EXPORT
   Redraws the untouched map onto a canvas at EXPORT_SCALE, then
   paints the names in the same spots. No html2canvas needed, so
   the output is pixel-exact and high resolution.
   ============================================================ */

$("#btn-export").addEventListener("click", async () => {
  const img = plannerImg;
  if (!img.complete || !img.naturalWidth){ toast("Map image is still loading"); return; }

  try { await document.fonts.ready; } catch (_) {}

  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width  = W * EXPORT_SCALE;
  canvas.height = H * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.drawImage(img, 0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  BOXES.forEach((box) => {
    const key = assign[box.id];
    if (!key) return;
    const m = members.find((x) => x.key === key);
    if (!m) return;

    const bx = (box.x / 100) * W, by = (box.y / 100) * H;
    const bw = (box.w / 100) * W, bh = (box.h / 100) * H;

    const size = labelSize(m.id, bw * LABEL_FIT, W * LABEL_SCALE);
    ctx.font = labelFont(size);

    const cx = bx + bw / 2, cy = by + bh / 2;
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.lineWidth = Math.max(size * 0.18, 2);
    ctx.strokeText(m.id, cx, cy);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(m.id, cx, cy);
  });

  try {
    canvas.toBlob((blob) => {
      if (!blob){ toast("Export failed — try again"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = EXPORT_NAME;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Exported " + EXPORT_NAME);
    }, "image/png");
  } catch (_){
    // Happens only when opening index.html straight off the disk, or
    // after picking a map from the device: the canvas is tainted.
    toast("Export needs a web server — run the folder locally or use GitHub Pages");
  }
});

/* ============================================================
   10. DIALOG + TOAST
   ============================================================ */

function confirmDialog({ title, body, ok = "Confirm" }){
  if (dialogOpen) return Promise.resolve(false);   // never stack two dialogs
  dialogOpen = true;

  return new Promise((resolve) => {
    const scrim = $("#modal");
    $("#modal-title").textContent = title;
    $("#modal-body").textContent  = body;
    $("#modal-ok").textContent    = ok;
    scrim.hidden = false;
    $("#modal-ok").focus();

    const done = (val) => {
      scrim.hidden = true;
      dialogOpen = false;
      $("#modal-ok").removeEventListener("click", yes);
      $("#modal-cancel").removeEventListener("click", no);
      scrim.removeEventListener("click", onScrim);
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const yes = () => done(true);
    const no  = () => done(false);
    const onScrim = (e) => { if (e.target === scrim) done(false); };
    const onKey = (e) => { if (e.key === "Escape") done(false); };

    $("#modal-ok").addEventListener("click", yes);
    $("#modal-cancel").addEventListener("click", no);
    scrim.addEventListener("click", onScrim);
    document.addEventListener("keydown", onKey);
  });
}

let toastTimer;
function toast(msg){
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* Escape also drops whatever is in hand */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && picked && !dialogOpen) setPicked(null);
});

/* ============================================================
   11. BOOT
   ============================================================ */

buildZones();
loadMapImage();
restore();     // brings back the saved assignments straight away
render();
loadRosterFile();
