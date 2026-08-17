/* =========================================================
   planner.js — the United Front placement board.

   Same behaviour as the standalone planner, with three changes
   for life inside the tabbed site:

     1. Everything lives in one IIFE and is exposed as
        window.UFPlanner — no globals leak into the stats app.
     2. It boots lazily. Nothing is fetched (roster, map image)
        until someone actually opens the Planner tab, so the
        statistics tabs stay light.
     3. Configuration moved to APP_CONFIG.planner in js/config.js.

   Read-only note: this file never touches the statistics data.
   ========================================================= */

(function (global) {
  'use strict';

  var CFG = (global.APP_CONFIG && global.APP_CONFIG.planner) || {};

  var BOXES        = CFG.boxes || [];
  var LABEL_SCALE  = CFG.labelScale  || 0.0155;
  var LABEL_FIT    = CFG.labelFit    || 0.88;
  var EXPORT_SCALE = CFG.exportScale || 2;
  var EXPORT_NAME  = CFG.exportName  || 'united-front-planner.png';
  var STORE_KEY    = CFG.storeKey    || 'etheria-uf-planner/v3';
  var ROSTER_FILES = CFG.rosterFiles || ['Member.xlsx'];
  var MAP_IMAGES   = CFG.mapImages   || ['assets/united-front-planner.png'];

  /* =========================================================
     STATE
     ========================================================= */

  var members = [];      // [{ key, id, rta, rank }] — key is the stable handle
  var assign  = {};      // { boxId: memberKey }
  var picked  = null;    // memberKey currently "in hand"
  var dialogOpen = false;
  var booted = false;

  var $ = function (sel) { return document.querySelector(sel); };

  var planner, plannerImg, listEl, emptyNote, searchEl, rosterEl, loadState, viewEl;
  var zoneById = new Map();   // boxId -> zone element

  /* =========================================================
     DROP ZONES
     Built once from BOXES. Each zone is a transparent button laid
     over the image — the artwork underneath is never touched.
     ========================================================= */

  function buildZones() {
    BOXES.forEach(function (box) {
      var zone = document.createElement('div');
      zone.className = 'zone';
      zone.id = box.id;
      zone.dataset.box = box.id;
      zone.tabIndex = 0;
      zone.setAttribute('role', 'button');
      zone.style.left   = box.x + '%';
      zone.style.top    = box.y + '%';
      zone.style.width  = box.w + '%';
      zone.style.height = box.h + '%';

      var name = document.createElement('span');
      name.className = 'zone-name';

      var clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'clear';
      clear.textContent = '×';
      clear.title = 'Clear this node';
      clear.addEventListener('click', function (e) {
        e.stopPropagation();
        unassignBox(box.id);
      });

      zone.append(name, clear);

      /* --- pointer / keyboard --- */
      zone.addEventListener('click', function () {
        if (swallowClick) return;       // the tap was the end of a drag
        onZoneActivate(box.id);
      });
      zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZoneActivate(box.id); }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); unassignBox(box.id); }
      });

      /* --- HTML5 drag target (mouse) --- */
      zone.addEventListener('dragover', function (e) {
        if (!e.dataTransfer.types.includes('text/plain')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('is-over');
      });
      /* dragleave also fires when the cursor crosses onto the × button,
         so only clear the highlight when the zone is really left. */
      zone.addEventListener('dragleave', function (e) {
        if (zone.contains(e.relatedTarget)) return;
        zone.classList.remove('is-over');
      });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('is-over');
        var key = e.dataTransfer.getData('text/plain');
        if (key) place(key, box.id);
      });

      /* A placed name can be dragged straight to another node.
         draggable is switched on in render(), only while the node is filled. */
      zone.addEventListener('dragstart', function (e) {
        var key = assign[box.id];
        if (!key) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
      });

      /* --- touch drag --- */
      zone.addEventListener('pointerdown', function (e) {
        var key = assign[box.id];
        if (key) armPointerDrag(e, key);
      });

      zoneById.set(box.id, zone);
      planner.appendChild(zone);
    });
  }

  /* Drop a name back on the roster to unassign it */
  function wireRosterDropTarget() {
    rosterEl.addEventListener('dragover', function (e) {
      if (!e.dataTransfer.types.includes('text/plain')) return;
      e.preventDefault();
      rosterEl.classList.add('is-dropping');
    });
    rosterEl.addEventListener('dragleave', function (e) {
      if (rosterEl.contains(e.relatedTarget)) return;
      rosterEl.classList.remove('is-dropping');
    });
    rosterEl.addEventListener('drop', function (e) {
      e.preventDefault();
      rosterEl.classList.remove('is-dropping');
      var key = e.dataTransfer.getData('text/plain');
      if (key) unassignMember(key);
    });
  }

  /* =========================================================
     MAP IMAGE
     Tries each path in mapImages. If none load, the frame explains
     what's missing instead of sitting there blank, and offers a local
     file as a stopgap so the board still works.
     ========================================================= */

  function loadMapImage(index) {
    index = index || 0;
    if (index >= MAP_IMAGES.length) {
      $('#map-error').hidden = false;
      $('#map-error-paths').textContent = 'Looked for: ' + MAP_IMAGES.join('  ·  ');
      planner.classList.add('no-map');
      return;
    }
    plannerImg.onerror = function () { loadMapImage(index + 1); };
    plannerImg.onload  = function () {
      $('#map-error').hidden = true;
      planner.classList.remove('no-map');
      fitLabels();
    };
    plannerImg.src = MAP_IMAGES[index];
  }

  /* Stopgap: use an image off the device for this session. Note that a
     file chosen this way can't be exported — the canvas gets tainted —
     so it's a preview, not a fix. */
  function wireMapPicker() {
    $('#btn-pick-map').addEventListener('click', function () { $('#map-input').click(); });
    $('#map-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      plannerImg.onerror = null;
      plannerImg.onload = function () {
        $('#map-error').hidden = true;
        planner.classList.remove('no-map');
        fitLabels();
      };
      plannerImg.src = URL.createObjectURL(file);
      toast('Using a local image — push it to the repo to make it stick');
    });
  }

  /* =========================================================
     ASSIGNMENT RULES
     - A member holds exactly one node.
     - Dropping onto an occupied node swaps the two if the incoming
       member already had a node; otherwise it asks before replacing.
     ========================================================= */

  function boxOf(key) {
    return Object.keys(assign).filter(function (b) { return assign[b] === key; })[0] || null;
  }

  function place(key, boxId) {
    var member = members.filter(function (m) { return m.key === key; })[0];
    if (!member) return Promise.resolve();

    var occupant = assign[boxId];
    if (occupant === key) { setPicked(null); return Promise.resolve(); }

    var ask = Promise.resolve(true);
    if (occupant && !boxOf(key)) {
      var other = members.filter(function (m) { return m.key === occupant; })[0];
      ask = confirmDialog({
        title: 'Replace ' + (other ? other.id : 'member') + '?',
        body:  member.id + ' takes this node and ' + (other ? other.id : 'the current member') +
               ' goes back to the roster.',
        ok:    'Replace'
      });
    }

    return ask.then(function (ok) {
      if (!ok) return;

      /* Re-read the board after the await — it may have moved on while
         the dialog was open. */
      var from = boxOf(key);
      var now  = assign[boxId];

      if (now && from)      assign[from] = now;      // straight swap
      else if (from)        delete assign[from];

      assign[boxId] = key;
      setPicked(null);
      save(); render();
    });
  }

  function unassignBox(boxId) {
    if (!assign[boxId]) return;
    delete assign[boxId];
    save(); render();
  }

  function unassignMember(key) {
    var b = boxOf(key);
    if (!b) return;
    delete assign[b];
    save(); render();
  }

  /* Tapping a node: drop the held member in, or pick up whoever is there */
  function onZoneActivate(boxId) {
    if (picked) { place(picked, boxId); return; }
    var occupant = assign[boxId];
    if (occupant) setPicked(occupant);
  }

  function setPicked(key) {
    picked = key;
    render();
  }

  /* =========================================================
     TOUCH DRAG
     HTML5 drag events never fire on a touch screen, so a finger gets
     its own path: press and hold for a moment, then drag. The hold
     gate means a normal tap and a list scroll behave exactly as
     before — nothing here runs unless the drag actually starts.
     ========================================================= */

  var HOLD_MS = 240;   // press-and-hold before a drag begins
  var SLOP_PX = 10;    // movement that counts as a scroll, not a drag

  var drag = null;     // { key, pointerId, x, y, active, ghost, over }
  var holdTimer = null;
  var swallowClick = false;

  function armPointerDrag(e, key) {
    if (e.pointerType === 'mouse') return;      // the mouse keeps native drag+drop
    if (drag) return;
    drag = { key: key, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false, ghost: null, over: null };

    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      if (!drag || drag.active) return;
      drag.active = true;
      drag.ghost = makeGhost(key, drag.x, drag.y);
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
    }, HOLD_MS);
  }

  function makeGhost(key, x, y) {
    var m = members.filter(function (mm) { return mm.key === key; })[0];
    var el = document.createElement('div');
    el.className = 'drag-ghost';
    el.textContent = m ? m.id : key;
    document.body.appendChild(el);
    moveGhost(el, x, y);
    return el;
  }

  function moveGhost(el, x, y) {
    el.style.transform = 'translate(' + (x + 14) + 'px,' + (y - 22) + 'px)';
  }

  function hoverTarget(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    var zone = el.closest('.zone');
    if (zone) return { kind: 'zone', id: zone.dataset.box, el: zone };
    if (el.closest('#roster-panel')) return { kind: 'roster', el: rosterEl };
    return null;
  }

  function paintHover(next) {
    var prev = drag.over;
    if (prev && (!next || prev.el !== next.el)) {
      prev.el.classList.remove(prev.kind === 'zone' ? 'is-over' : 'is-dropping');
    }
    if (next) next.el.classList.add(next.kind === 'zone' ? 'is-over' : 'is-dropping');
    drag.over = next;
  }

  function cancelPointerDrag() {
    clearTimeout(holdTimer);
    if (!drag) return;
    if (drag.over) paintHover(null);
    if (drag.ghost) drag.ghost.remove();
    drag = null;
  }

  function wireDragListeners() {
    document.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.pointerId) return;

      if (!drag.active) {
        // moved before the hold finished → the user is scrolling, not dragging
        if (Math.abs(e.clientX - drag.x) > SLOP_PX || Math.abs(e.clientY - drag.y) > SLOP_PX) {
          cancelPointerDrag();
        }
        return;
      }

      drag.x = e.clientX; drag.y = e.clientY;
      moveGhost(drag.ghost, drag.x, drag.y);
      paintHover(hoverTarget(drag.x, drag.y));
    });

    /* Non-passive, so the page stops scrolling once a drag is under way */
    document.addEventListener('touchmove', function (e) {
      if (drag && drag.active) e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerup', function (e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      var d = drag;
      if (d.active) {
        swallowClick = true;
        setTimeout(function () { swallowClick = false; }, 0);
        var target = hoverTarget(e.clientX, e.clientY);
        paintHover(null);
        if (target && target.kind === 'zone')   place(d.key, target.id);
        if (target && target.kind === 'roster') unassignMember(d.key);
      }
      cancelPointerDrag();
    });

    document.addEventListener('pointercancel', cancelPointerDrag);

    /* Escape also drops whatever is in hand */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && picked && !dialogOpen) setPicked(null);
    });
  }

  /* =========================================================
     EXCEL PARSING (SheetJS)
     Reads the first worksheet, matches the ID / RTA Score / Rank
     headers loosely (case and spacing are ignored), then sorts by
     Rank ascending. Ties break on the higher RTA Score.
     ========================================================= */

  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* Exact-header match only. Used for short headers like "No", where a
     loose substring match would happily grab "Notes" or "Nodes". */
  function pickExact(keys, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      var hit = keys.filter(function (k) { return norm(k) === cand; })[0];
      if (hit) return hit;
    }
    return null;
  }

  function pickColumn(keys, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      var hit = keys.filter(function (k) { return norm(k) === cand; })[0];
      if (hit) return hit;
    }
    return keys.filter(function (k) {
      return candidates.some(function (c) { return norm(k).indexOf(c) !== -1; });
    })[0] || null;
  }

  function parseWorkbook(buffer) {
    var wb    = XLSX.read(buffer, { type: 'array' });
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) throw new Error('That sheet has no rows.');

    /* Header keys come from the first row, but a blank cell there means
       the key is missing from that object — so scan every row. */
    var keys = Array.from(new Set(rows.reduce(function (acc, r) {
      return acc.concat(Object.keys(r));
    }, [])));

    var idKey   = pickColumn(keys, ['id', 'member', 'memberid', 'name']);
    var rtaKey  = pickColumn(keys, ['rtascore', 'rta', 'score']);
    var rankKey = pickColumn(keys, ['rank', 'ranking']);
    /* "No" is the guild's own running number. When it is present it
       decides both the badge and the order, so the panel reads exactly
       like the spreadsheet. */
    var noKey   = pickExact(keys, ['no', 'no1', 'num', 'number', 'order']);
    /* Optional second label (a Discord handle, a real name…). Shown in
       the tooltip and searchable, but never painted on the map. */
    var nameKey = pickExact(keys, ['name', 'nickname', 'discord', 'handle']);
    if (nameKey === idKey) nameKey = null;

    if (!idKey) throw new Error('No ID column found. Add a column headed ID.');

    var seen = new Set();
    var parsed = rows.map(function (row, i) {
      var rank = Number(rankKey ? row[rankKey] : NaN);
      var id   = String(row[idKey]).trim();
      // Tolerate "1", "1.", "#1" — anything but the digits is dropped.
      var no   = Number(noKey ? String(row[noKey]).replace(/[^\d.-]/g, '') : NaN);
      // Key on the ID, so assignments survive a page reload or a roster
      // edit. Repeated IDs get a suffix so they stay distinct.
      var key = id;
      var n = 2;
      while (seen.has(key)) key = id + '#' + (n++);
      seen.add(key);
      return {
        key: key,
        id: id,
        name: nameKey ? String(row[nameKey]).trim() : '',
        row:  i,                                    // position in the sheet
        rta:  Number(rtaKey ? row[rtaKey] : NaN),
        rank: isFinite(rank) ? rank : i + 1,
        // The badge number: No if there is one, else Rank, else the row.
        no:   isFinite(no) ? no : (isFinite(rank) ? rank : i + 1)
      };
    }).filter(function (m) { return m.id !== ''; });

    if (!parsed.length) throw new Error('Every ID cell was empty.');

    /* Sorted on the badge number, so a sheet with a No column comes out in
       sheet order and a sheet with only a Rank column behaves as before.
       Ties fall back to the sheet row, never to alphabetical. */
    parsed.sort(function (a, b) {
      return a.no - b.no || (b.rta || 0) - (a.rta || 0) || a.row - b.row;
    });
    return parsed;
  }

  /* Fetch the workbook shipped with the site. Cache is bypassed so an
     updated Member.xlsx shows up on the next refresh rather than days later. */
  function loadRosterFile() {
    if (typeof XLSX === 'undefined') {
      fail('Spreadsheet library did not load — check the connection');
      return Promise.resolve();
    }
    loadState.textContent = 'Loading roster…';
    loadState.className = 'load-state';

    var i = 0;
    var lastErr = null;

    function attempt() {
      if (i >= ROSTER_FILES.length) {
        fail(lastErr && lastErr.message ? lastErr.message : 'Roster not found');
        return Promise.resolve();
      }
      var name = ROSTER_FILES[i++];
      return fetch(name + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error(name + ' not found');
          return res.arrayBuffer();
        })
        .then(function (buf) {
          members = parseWorkbook(new Uint8Array(buf));
          picked  = null;
          loadState.textContent = members.length + ' members · ' + name;
          loadState.className = 'load-state ok';
          $('#btn-pick').hidden = true;
          render();          // prunes anything stale first…
          save();            // …then persists the cleaned-up board
        })
        .catch(function (err) { lastErr = err; return attempt(); });
    }
    return attempt();
  }

  function fail(msg) {
    loadState.textContent = msg;
    loadState.className = 'load-state bad';
    $('#btn-pick').hidden = false;   // manual pick as a fallback
    render();
  }

  function wireFilePicker() {
    $('#btn-pick').addEventListener('click', function () { $('#file-input').click(); });

    $('#file-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      file.arrayBuffer().then(function (buf) {
        members = parseWorkbook(new Uint8Array(buf));
        picked  = null;
        loadState.textContent = members.length + ' members · ' + file.name;
        loadState.className = 'load-state ok';
        render(); save();
        toast('Roster loaded — ' + members.length + ' members');
      }).catch(function (err) {
        fail(err.message || 'Could not read that file');
      });
      e.target.value = '';
    });
  }

  /* =========================================================
     RENDER
     ========================================================= */

  function render() {
    if (!booted) return;
    var filter = searchEl.value.trim().toLowerCase();
    var zoneIds = new Set(BOXES.map(function (b) { return b.id; }));

    // drop stale assignments (edited boxes, or a roster reload)
    Object.keys(assign).forEach(function (b) {
      var stillThere = members.some(function (m) { return m.key === assign[b]; });
      if (!zoneIds.has(b) || !stillThere) delete assign[b];
    });

    // the held member may have just left the roster
    if (picked && !members.some(function (m) { return m.key === picked; })) picked = null;

    /* --- roster --- */
    listEl.innerHTML = '';
    members.forEach(function (m) {
      if (filter && (m.id + ' ' + m.name + ' ' + m.no).toLowerCase().indexOf(filter) === -1) return;

      var li  = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'member';
      btn.draggable = true;
      btn.dataset.key = m.key;

      var at = boxOf(m.key);
      if (at) btn.classList.add('assigned');
      if (picked === m.key) btn.classList.add('selected');

      btn.innerHTML =
        '<span class="rank"></span>' +
        '<span class="name"></span>' +
        '<span class="at">' + (at ? at.replace('box-', 'N') : '') + '</span>';
      btn.querySelector('.rank').textContent = '#' + m.no;
      btn.querySelector('.name').textContent = m.id;
      /* Hover / long-press tooltip: the Name column from the sheet.
         Falls back to the ID when that member has no Name. */
      btn.title = m.name || m.id;

      btn.addEventListener('click', function () {
        if (swallowClick) return;
        setPicked(picked === m.key ? null : m.key);
      });
      btn.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', m.key);
        e.dataTransfer.effectAllowed = 'move';
        setPicked(m.key);
      });
      btn.addEventListener('pointerdown', function (e) { armPointerDrag(e, m.key); });

      li.appendChild(btn);
      listEl.appendChild(li);
    });

    emptyNote.hidden = members.length > 0;

    /* --- map labels --- */
    BOXES.forEach(function (box) {
      var zone = zoneById.get(box.id);
      if (!zone) return;
      var key = assign[box.id];
      var m   = key ? members.filter(function (x) { return x.key === key; })[0] : null;
      zone.querySelector('.zone-name').textContent = m ? m.id : '';
      zone.classList.toggle('filled', !!m);
      zone.classList.toggle('is-target', !!picked);
      zone.classList.toggle('is-held', !!m && m.key === picked);
      zone.draggable = !!m;                     // empty nodes aren't draggable
      if (m) zone.title = m.name || m.id;       // same tooltip on the board
      else   zone.removeAttribute('title');
      zone.setAttribute('aria-label', m ? box.id + ', ' + m.id : box.id + ', empty');
    });

    /* --- counters --- */
    var used = Object.keys(assign).length;
    $('#count-loaded').textContent   = members.length;
    $('#count-assigned').textContent = used;
    $('#count-open').textContent     = Math.max(members.length - used, 0);
    $('#ratio').textContent          = used + ' / ' + members.length;
    $('#nodes-free').textContent     = BOXES.length - used;
    $('#meter-fill').style.width     = (members.length ? (used / members.length) * 100 : 0) + '%';

    var held = picked ? members.filter(function (m) { return m.key === picked; })[0] : null;
    $('#stage-hint').textContent = held
      ? 'Holding ' + held.id + ' — tap a node to place it.'
      : 'Pick a member, then tap a node. Or drag a name straight onto the map.';

    fitLabels();
  }

  /* =========================================================
     LABEL SIZING
     One canvas measurement per name instead of a shrink-by-half-a-pixel
     loop, so the map doesn't force 30 × 40 reflows on every render —
     and the on-screen size matches the exported one exactly.
     ========================================================= */

  var measureCtx = document.createElement('canvas').getContext('2d');

  function labelFont(size) {
    return '700 ' + size + 'px "Chakra Petch", sans-serif';
  }

  /* Largest size at or below `base` that keeps `text` inside `maxPx`. */
  function labelSize(text, maxPx, base) {
    if (!text) return base;
    measureCtx.font = labelFont(base);
    var w = measureCtx.measureText(text).width;
    if (!w || w <= maxPx) return base;
    return Math.max(7, base * maxPx / w);
  }

  function fitLabels() {
    if (!planner) return;
    var mapW = planner.clientWidth;
    if (!mapW) return;                       // hidden tab — refitted on show
    var base = mapW * LABEL_SCALE;
    BOXES.forEach(function (box) {
      var zone = zoneById.get(box.id);
      if (!zone) return;
      var text = zone.querySelector('.zone-name').textContent;
      var maxPx = mapW * (box.w / 100) * LABEL_FIT;
      zone.style.fontSize = labelSize(text, maxPx, base) + 'px';
    });
  }

  /* The roster is sticky, so it needs to know how tall the masthead is
     to size itself against the viewport. */
  function syncHeaderHeight() {
    var masthead = document.querySelector('.masthead');
    if (!masthead) return;
    document.documentElement.style.setProperty('--uf-head-h', masthead.offsetHeight + 'px');
  }

  /* =========================================================
     PERSISTENCE (localStorage)
     ========================================================= */

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ members: members, assign: assign }));
    } catch (_) { /* private mode / quota — the app still works in-session */ }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (Array.isArray(data.members)) members = data.members;
      if (data.assign && typeof data.assign === 'object') assign = data.assign;
      // members are refreshed from the file a moment later; this just
      // avoids an empty panel on slow connections
    } catch (_) { /* corrupt entry — start clean */ }
  }

  /* =========================================================
     RESET / CLEAR
     ========================================================= */

  function wireResetButtons() {
    $('#btn-reset').addEventListener('click', function () {
      if (!Object.keys(assign).length) { toast('Nothing assigned yet'); return; }
      confirmDialog({
        title: 'Reset all assignments?',
        body:  'Every member returns to the roster. The map itself is untouched.',
        ok:    'Reset'
      }).then(function (ok) {
        if (!ok) return;
        assign = {}; picked = null;
        save(); render();
        toast('Board cleared');
      });
    });

    $('#btn-clear').addEventListener('click', function () {
      confirmDialog({
        title: 'Clear saved data?',
        body:  'This removes the stored assignments from this browser. The roster reloads from Member.xlsx.',
        ok:    'Clear'
      }).then(function (ok) {
        if (!ok) return;
        try { localStorage.removeItem(STORE_KEY); } catch (_) {}
        members = []; assign = {}; picked = null;
        render();
        loadRosterFile();          // the file is the source of truth — read it again
        toast('Saved data cleared');
      });
    });
  }

  /* =========================================================
     EXPORT
     Redraws the untouched map onto a canvas at exportScale, then
     paints the names in the same spots. No html2canvas needed, so
     the output is pixel-exact and high resolution.
     ========================================================= */

  function wireExport() {
    $('#btn-export').addEventListener('click', function () {
      var img = plannerImg;
      if (!img.complete || !img.naturalWidth) { toast('Map image is still loading'); return; }

      var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      ready.catch(function () {}).then(function () {
        var W = img.naturalWidth, H = img.naturalHeight;
        var canvas = document.createElement('canvas');
        canvas.width  = W * EXPORT_SCALE;
        canvas.height = H * EXPORT_SCALE;
        var ctx = canvas.getContext('2d');
        ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
        ctx.drawImage(img, 0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';

        BOXES.forEach(function (box) {
          var key = assign[box.id];
          if (!key) return;
          var m = members.filter(function (x) { return x.key === key; })[0];
          if (!m) return;

          var bx = (box.x / 100) * W, by = (box.y / 100) * H;
          var bw = (box.w / 100) * W, bh = (box.h / 100) * H;

          var size = labelSize(m.id, bw * LABEL_FIT, W * LABEL_SCALE);
          ctx.font = labelFont(size);

          var cx = bx + bw / 2, cy = by + bh / 2;
          ctx.strokeStyle = 'rgba(0,0,0,.85)';
          ctx.lineWidth = Math.max(size * 0.18, 2);
          ctx.strokeText(m.id, cx, cy);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(m.id, cx, cy);
        });

        try {
          canvas.toBlob(function (blob) {
            if (!blob) { toast('Export failed — try again'); return; }
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = EXPORT_NAME;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            toast('Exported ' + EXPORT_NAME);
          }, 'image/png');
        } catch (_) {
          // Happens only when opening index.html straight off the disk, or
          // after picking a map from the device: the canvas is tainted.
          toast('Export needs a web server — run the folder locally or use GitHub Pages');
        }
      });
    });
  }

  /* =========================================================
     DIALOG + TOAST
     ========================================================= */

  function confirmDialog(opts) {
    var title = opts.title, body = opts.body, ok = opts.ok || 'Confirm';
    if (dialogOpen) return Promise.resolve(false);   // never stack two dialogs
    dialogOpen = true;

    return new Promise(function (resolve) {
      var scrim = $('#modal');
      $('#modal-title').textContent = title;
      $('#modal-body').textContent  = body;
      $('#modal-ok').textContent    = ok;
      scrim.hidden = false;
      $('#modal-ok').focus();

      var done = function (val) {
        scrim.hidden = true;
        dialogOpen = false;
        $('#modal-ok').removeEventListener('click', yes);
        $('#modal-cancel').removeEventListener('click', no);
        scrim.removeEventListener('click', onScrim);
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      var yes = function () { done(true); };
      var no  = function () { done(false); };
      var onScrim = function (e) { if (e.target === scrim) done(false); };
      var onKey = function (e) { if (e.key === 'Escape') done(false); };

      $('#modal-ok').addEventListener('click', yes);
      $('#modal-cancel').addEventListener('click', no);
      scrim.addEventListener('click', onScrim);
      document.addEventListener('keydown', onKey);
    });
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* =========================================================
     BOOT
     init() is called by the router the first time the Planner tab
     is opened; show() runs on every visit after that.
     ========================================================= */

  function init() {
    if (booted) { show(); return; }

    viewEl     = document.getElementById('view-planner');
    planner    = $('#planner');
    plannerImg = $('#planner-img');
    listEl     = $('#member-list');
    emptyNote  = $('#empty-note');
    searchEl   = $('#search');
    rosterEl   = $('#roster-panel');
    loadState  = $('#load-state');

    if (!planner) return;   // markup missing — nothing to do
    booted = true;

    buildZones();
    wireRosterDropTarget();
    wireMapPicker();
    wireFilePicker();
    wireResetButtons();
    wireExport();
    wireDragListeners();

    searchEl.addEventListener('input', render);
    $('#outline-toggle').addEventListener('change', function (e) {
      viewEl.classList.toggle('outline', e.target.checked);
    });

    if (global.ResizeObserver) {
      new ResizeObserver(fitLabels).observe(planner);
      var masthead = document.querySelector('.masthead');
      if (masthead) new ResizeObserver(syncHeaderHeight).observe(masthead);
    }
    global.addEventListener('resize', syncHeaderHeight);
    plannerImg.addEventListener('load', fitLabels);

    /* Fonts land after first paint; re-fit once they're ready. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitLabels).catch(function () {});
    }

    syncHeaderHeight();
    loadMapImage();
    restore();     // brings back the saved assignments straight away
    render();
    loadRosterFile();
  }

  /* Called every time the tab is opened. The map has zero width while the
     section is hidden, so labels are re-measured once it is on screen. */
  function show() {
    if (!booted) return;
    syncHeaderHeight();
    fitLabels();
  }

  global.UFPlanner = { init: init, show: show };

})(window);
