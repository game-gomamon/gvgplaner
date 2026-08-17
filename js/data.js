/* =========================================================
   data.js — reads master.xlsx and every W<n>.xlsx, checks them,
   and hands the app one clean object. Nothing here touches the DOM.

   Rule of the house: a broken file never takes the site down.
   It is reported, skipped, and everything else still loads.
   ========================================================= */

(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG;

  /* ---------- issue log ---------- */

  function Issues() { this.list = []; }
  Issues.prototype.add = function (level, scope, message) {
    this.list.push({ level: level, scope: scope, message: message });
  };
  Issues.prototype.error = function (scope, msg) { this.add('error', scope, msg); };
  Issues.prototype.warn  = function (scope, msg) { this.add('warn',  scope, msg); };
  Issues.prototype.count = function (level) {
    return this.list.filter(function (i) { return i.level === level; }).length;
  };

  /* ---------- small helpers ---------- */

  function normKey(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function trim(v) {
    return v == null ? '' : String(v).trim();
  }

  /* House names keep their trailing marker, because "Purple" and "Purple*"
     are two different squads — normKey drops punctuation and would fuse them.
     Common ways of typing the same squad are folded together here, so
     "Purple*", "purple *", "Purple2" and "Purple star" all land on purple*. */
  function houseKey(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    t = t.replace(/[\u2217\u2731\u066D\uFF0A]/g, '*');   // look-alike asterisks
    t = t.replace(/[^a-z0-9*]/g, '');
    t = t.replace(/(?:star|2|ii|b)$/, '*');
    t = t.replace(/\*+$/, '*');
    return t;
  }

  /* "Purple*" without the marker is "Purple". */
  function baseHouse(house) {
    return String(house == null ? '' : house)
      .trim()
      .replace(/\s*[*\u2217\u2731\uFF0A\u066D]+$/, '')
      .trim();
  }

  /* A squad ("Purple*") rolls up into its parent ("Purple").
     A trailing marker means "squad of the house before it" even when the
     squad has no entry of its own in config.houses — otherwise a name that
     was never configured would be dropped and never shown. */
  function parentHouse(house) {
    var def = CFG.houses[house];
    if (def) return def.parent || house;
    var base = baseHouse(house);
    return (base && base !== house && CFG.houses[base]) ? base : house;
  }

  /* Squad settings first, then the parent's, so a squad only has to
     declare what differs from the house it belongs to. */
  function houseDef(house) {
    return CFG.houses[house] || CFG.houses[parentHouse(house)] || null;
  }

  function isSquad(house) {
    var def = CFG.houses[house];
    if (def) return !!def.parent;
    return parentHouse(house) !== house;
  }

  function bust(url) {
    if (!CFG.bustCache) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
  }

  /* Parses a cell that should hold a whole number.
     Returns { value, state } where state is 'ok' | 'empty' | 'invalid'. */
  function toCount(raw) {
    if (raw === null || raw === undefined || trim(raw) === '') {
      return { value: 0, state: 'empty' };
    }
    if (typeof raw === 'number' && isFinite(raw)) {
      return { value: Math.max(0, Math.round(raw)), state: 'ok' };
    }
    var cleaned = trim(raw).replace(/[,\s]/g, '');
    var n = Number(cleaned);
    if (cleaned !== '' && isFinite(n)) return { value: Math.max(0, Math.round(n)), state: 'ok' };
    return { value: 0, state: 'invalid' };
  }

  function toScore(raw) {
    if (raw === null || raw === undefined || trim(raw) === '') return { value: null, state: 'empty' };
    if (typeof raw === 'number' && isFinite(raw)) return { value: Math.round(raw), state: 'ok' };
    var n = Number(trim(raw).replace(/[,\s]/g, ''));
    if (isFinite(n) && trim(raw) !== '') return { value: Math.round(n), state: 'ok' };
    return { value: null, state: 'invalid' };
  }

  /* Matches the sheet's house text against the configured houses,
     case-insensitively. Unrecognised text is kept as 'Unknown'. */
  function normalizeHouse(raw) {
    var t = trim(raw);
    if (!t) return { house: 'Unknown', state: 'empty' };
    // An unresolved lookup in the sheet is a blank, not a bad house name.
    if (/^#(N\/A|REF!|VALUE!|NAME\?|NULL!|DIV\/0!)$/i.test(t)) return { house: 'Unknown', state: 'empty' };

    var keys = Object.keys(CFG.houses);
    var want = houseKey(t);
    for (var i = 0; i < keys.length; i++) {
      if (houseKey(keys[i]) === want) return { house: keys[i], state: 'ok' };
    }

    /* A squad that is not listed in config.houses: keep it visible as
       "<Parent>*" and let it count towards the parent, rather than
       collapsing it into Unknown. */
    if (/\*$/.test(want)) {
      var wantBase = want.slice(0, -1);
      for (var j = 0; j < keys.length; j++) {
        if (houseKey(keys[j]) === wantBase) {
          return { house: keys[j] + '*', state: 'ok', unconfigured: true };
        }
      }
    }

    return { house: 'Unknown', state: 'invalid', raw: t };
  }

  /* ---------- column mapping ---------- */

  var ALIASES = {
    name:    ['name', 'playername', 'player', 'nickname', 'ign'],
    code:    ['playercode', 'code', 'playerid', 'id', 'uid'],
    rta:     ['rta', 'rtascore', 'rtapoints', 'rtapoint', 'score'],
    rtaRank: ['rtarank', 'rank', 'tier', 'rtatier'],
    status:  ['status', 'state', 'membership'],
    house:   ['house', 'housecolor', 'housecolour', 'color', 'colour', 'team'],
    atkW:    ['atkwins', 'attackwins', 'atkw', 'offensewins', 'attackwin'],
    atkL:    ['atklosses', 'attacklosses', 'atkl', 'offenselosses', 'attackloss'],
    defW:    ['defwins', 'defensewins', 'defencewins', 'defw', 'defensewin'],
    defL:    ['deflosses', 'defenselosses', 'defencelosses', 'defl', 'defenseloss']
  };

  /* Finds the header row within the first few rows, then maps each wanted
     field to a column index. Sheets often start with a title or blank rows,
     so we look for the row that carries the most recognisable headers. */
  function mapColumns(rows, wanted) {
    var best = null;
    var limit = Math.min(rows.length, 12);

    for (var r = 0; r < limit; r++) {
      var row = rows[r] || [];
      var map = {};
      var hits = 0;
      for (var c = 0; c < row.length; c++) {
        var key = normKey(row[c]);
        if (!key) continue;
        for (var f in ALIASES) {
          if (map[f] !== undefined) continue;
          if (ALIASES[f].indexOf(key) !== -1) { map[f] = c; hits++; break; }
        }
      }
      var required = wanted.filter(function (f) { return map[f] !== undefined; }).length;
      if (!best || required > best.required || (required === best.required && hits > best.hits)) {
        best = { headerRow: r, map: map, hits: hits, required: required };
      }
      if (required === wanted.length) break;
    }
    return best || { headerRow: 0, map: {}, hits: 0, required: 0 };
  }

  function cell(row, map, field) {
    if (map[field] === undefined) return '';
    var v = row[map[field]];
    return v === undefined ? '' : v;
  }

  /* ---------- fetching ---------- */

  function fetchArrayBuffer(url) {
    return fetch(bust(url), { cache: CFG.bustCache ? 'no-store' : 'default' }).then(function (res) {
      if (!res.ok) {
        var err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.arrayBuffer();
    });
  }

  function readSheet(buffer, sheetName, scope, issues) {
    var wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    var sheet = wb.Sheets[sheetName];

    if (!sheet) {
      // Tolerate a differently-cased or renamed tab when there is only one.
      var match = wb.SheetNames.filter(function (n) { return normKey(n) === normKey(sheetName); })[0];
      if (!match && wb.SheetNames.length === 1) {
        match = wb.SheetNames[0];
        issues.warn(scope, 'No worksheet named "' + sheetName + '". Using the only sheet present, "' + match + '".');
      } else if (match) {
        issues.warn(scope, 'Worksheet "' + sheetName + '" matched as "' + match + '" (different spelling or case).');
      }
      if (!match) {
        throw new Error('No worksheet named "' + sheetName + '". Sheets found: ' + (wb.SheetNames.join(', ') || 'none') + '.');
      }
      sheet = wb.Sheets[match];
    }
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false, defval: '' });
  }

  /* ---------- master.xlsx ---------- */

  function parseMaster(rows, issues) {
    var scope = 'master.xlsx';
    var wanted = ['name', 'code', 'rta', 'rtaRank', 'status'];
    var found = mapColumns(rows, wanted);
    var map = found.map;

    var missing = wanted.filter(function (f) { return map[f] === undefined; });
    if (map.code === undefined) {
      throw new Error('No "Player Code" column found. Expected headers: Name, Player Code, RTA, RTA Rank, Status.');
    }
    var hasStatus = map.status !== undefined;
    if (missing.length) {
      issues.warn(scope, 'Missing column' + (missing.length > 1 ? 's' : '') + ': ' + missing.join(', ') + '. Those values show as "—".' +
        (hasStatus ? '' : ' Without a Status column everyone is treated as active.'));
    }

    var players = new Map();
    var badNumbers = 0;

    for (var r = found.headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var code = trim(cell(row, map, 'code'));
      var name = trim(cell(row, map, 'name'));

      if (!code && !name) continue;                       // blank spacer row
      if (!code) {
        issues.warn(scope, 'Row ' + (r + 1) + ' ("' + (name || 'unnamed') + '") has no player code and was skipped.');
        continue;
      }
      if (players.has(code)) {
        issues.warn(scope, 'Duplicate player code ' + code + ' on row ' + (r + 1) + '. The first entry ("' + players.get(code).name + '") is used.');
        continue;
      }

      var rta = toScore(cell(row, map, 'rta'));
      if (rta.state === 'invalid') badNumbers++;

      var status = trim(cell(row, map, 'status'));
      players.set(code, {
        code: code,
        name: name || code,
        rta: rta.value,
        rtaRank: trim(cell(row, map, 'rtaRank')),
        status: status || (hasStatus ? 'Unknown' : 'Active'),
        isActive: hasStatus ? CFG.activeStatuses.indexOf(normKey(status)) !== -1 : true,
        inMaster: true
      });
    }

    if (badNumbers) issues.warn(scope, badNumbers + ' RTA value' + (badNumbers > 1 ? 's are' : ' is') + ' not a number and shows as "—".');
    if (!players.size) issues.error(scope, 'The Players sheet has no usable rows.');

    return players;
  }

  /* ---------- W<n>.xlsx ---------- */

  function parseWeek(rows, weekId, issues) {
    var scope = weekId + '.xlsx';
    var wanted = ['name', 'code', 'house', 'atkW', 'atkL', 'defW', 'defL'];
    var found = mapColumns(rows, wanted);
    var map = found.map;

    if (map.code === undefined) {
      throw new Error('No "Player Code" column found. Expected headers: Name, Player Code, House, ATK Wins, ATK Losses, DEF Wins, DEF Losses.');
    }
    var missing = wanted.filter(function (f) { return map[f] === undefined; });
    if (missing.length) {
      issues.warn(scope, 'Missing column' + (missing.length > 1 ? 's' : '') + ': ' + missing.join(', ') + '. Missing counts are read as 0.');
    }

    var records = new Map();
    var invalidNumbers = 0;
    var badHouses = [];

    for (var r = found.headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var code = trim(cell(row, map, 'code'));
      var name = trim(cell(row, map, 'name'));
      if (!code && !name) continue;
      if (!code) {
        issues.warn(scope, 'Row ' + (r + 1) + ' ("' + (name || 'unnamed') + '") has no player code and was skipped.');
        continue;
      }
      if (records.has(code)) {
        issues.warn(scope, 'Player code ' + code + ' appears twice. The first row is used.');
        continue;
      }

      var h = normalizeHouse(cell(row, map, 'house'));
      if (h.state === 'invalid' && badHouses.indexOf(h.raw) === -1) badHouses.push(h.raw);

      var aw = toCount(cell(row, map, 'atkW'));
      var al = toCount(cell(row, map, 'atkL'));
      var dw = toCount(cell(row, map, 'defW'));
      var dl = toCount(cell(row, map, 'defL'));
      [aw, al, dw, dl].forEach(function (x) { if (x.state === 'invalid') invalidNumbers++; });

      var flags = [];
      if (aw.value + al.value > CFG.atkAttemptsPerWeek) {
        flags.push('ATK total ' + (aw.value + al.value) + ' is above the ' + CFG.atkAttemptsPerWeek + '-attack limit');
      }
      var hDef = houseDef(h.house);
      var limit = hDef && hDef.defenseTeams;
      if (limit && dl.value > limit) {
        flags.push('DEF losses ' + dl.value + ' exceed the ' + h.house + ' limit of ' + limit + ' teams');
      }

      var weekRta = toScore(cell(row, map, 'rta'));

      records.set(code, {
        code: code,
        name: name,
        house: h.house,                      // exactly as recorded, e.g. 'Purple*'
        houseGroup: parentHouse(h.house),    // what it counts towards, e.g. 'Purple'
        isSquad: isSquad(h.house),
        houseRaw: h.state === 'invalid' ? h.raw : h.house,
        atkW: aw.value, atkL: al.value,
        defW: dw.value, defL: dl.value,
        defRecorded: !(dw.state === 'empty' && dl.state === 'empty') || dw.value + dl.value > 0,
        rta: weekRta.value,
        rtaRank: trim(cell(row, map, 'rtaRank')) || null,
        flags: flags
      });
    }

    if (invalidNumbers) issues.warn(scope, invalidNumbers + ' cell' + (invalidNumbers > 1 ? 's are' : ' is') + ' not a number and counted as 0.');
    if (badHouses.length) issues.warn(scope, 'Unrecognised house value' + (badHouses.length > 1 ? 's' : '') + ': ' + badHouses.join(', ') + '. Expected ' + Object.keys(CFG.houses).join(', ') + '.');
    if (!records.size) issues.warn(scope, 'No player rows found in this week.');

    return records;
  }

  /* ---------- week discovery ---------- */

  function weekNumber(id) {
    var m = /^W(\d+)$/i.exec(id);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function loadManifest(issues) {
    return fetch(bust(CFG.manifestPath), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var weeks = (json && json.weeks) || [];
        if (!Array.isArray(weeks)) throw new Error('manifest.json has no "weeks" array.');
        var clean = weeks.map(trim).filter(function (id) {
          if (isNaN(weekNumber(id))) {
            issues.warn('manifest.json', 'Ignoring "' + id + '" — week names must look like W01.');
            return false;
          }
          return true;
        });
        return { weeks: clean, source: 'manifest', generated: json.generated || null };
      })
      .catch(function (err) {
        issues.warn('manifest.json', 'Could not read the week manifest (' + err.message + '). Falling back to a direct file scan — push to GitHub so the workflow can generate it.');
        if (!CFG.manifestFallback.enabled) return { weeks: [], source: 'none' };
        return probeWeeks().then(function (found) {
          return { weeks: found, source: 'probe' };
        });
      });
  }

  /* Safety net only: HEAD-checks W1…W{maxWeek} in small batches.
     Each number is tried unpadded, 2-digit and 3-digit — W10, W010 and W0010
     are all the same week, and a file named either way must still be found. */
  function probeWeeks() {
    var max = CFG.manifestFallback.maxWeek;
    var ids = [];
    for (var n = 1; n <= max; n++) {
      ['' + n, String(n).padStart(2, '0'), String(n).padStart(3, '0')].forEach(function (s) {
        var id = 'W' + s;
        if (ids.indexOf(id) === -1) ids.push(id);
      });
    }

    var hits = {};                 // week number -> first spelling that answered
    var batchSize = 18;

    function runBatch(start) {
      if (start >= ids.length) {
        return Promise.resolve(Object.keys(hits)
          .sort(function (a, b) { return a - b; })
          .map(function (k) { return hits[k]; }));
      }
      var slice = ids.slice(start, start + batchSize);
      return Promise.all(slice.map(function (id) {
        return fetch(CFG.weeksPath + id + '.xlsx', { method: 'HEAD' })
          .then(function (r) {
            var num = weekNumber(id);
            if (r.ok && !isNaN(num) && hits[num] === undefined) hits[num] = id;
          })
          .catch(function () {});
      })).then(function () { return runBatch(start + batchSize); });
    }
    return runBatch(0);
  }

  /* ---------- orchestration ---------- */

  function load() {
    var issues = new Issues();

    var masterPromise = fetchArrayBuffer(CFG.masterPath)
      .then(function (buf) { return parseMaster(readSheet(buf, CFG.masterSheet, 'master.xlsx', issues), issues); })
      .catch(function (err) {
        issues.error('master.xlsx', describeFileError(err, CFG.masterPath));
        return null;
      });

    return Promise.all([masterPromise, loadManifest(issues)]).then(function (res) {
      var players = res[0];
      var manifest = res[1];
      var ids = manifest.weeks.slice().sort(function (a, b) { return weekNumber(a) - weekNumber(b); });

      if (!ids.length) issues.error('data/weeks/', 'No weekly files were found. Add W01.xlsx and push, or check that manifest.json lists your weeks.');

      return Promise.all(ids.map(function (id) {
        return fetchArrayBuffer(CFG.weeksPath + id + '.xlsx')
          .then(function (buf) {
            return {
              id: id,
              num: weekNumber(id),
              rows: parseWeek(readSheet(buf, CFG.weekSheet, id + '.xlsx', issues), id, issues)
            };
          })
          .catch(function (err) {
            issues.error(id + '.xlsx', describeFileError(err, CFG.weeksPath + id + '.xlsx'));
            return null;
          });
      })).then(function (weeks) {
        weeks = weeks.filter(Boolean).sort(function (a, b) { return a.num - b.num; });
        return finalize(players, weeks, issues, manifest);
      });
    });
  }

  function describeFileError(err, path) {
    if (err && err.status === 404) return 'File not found at ' + path + '.';
    if (err instanceof TypeError) return 'Could not be fetched. If you opened index.html straight from disk, run a local web server instead — browsers block file:// reads.';
    return err && err.message ? err.message : 'Unknown error.';
  }

  function finalize(players, weeks, issues, manifest) {
    var degraded = !players;
    if (degraded) players = new Map();

    // Players who appear in a week but not in master.
    var unlisted = [];
    weeks.forEach(function (w) {
      w.rows.forEach(function (rec, code) {
        if (players.has(code)) return;
        if (unlisted.indexOf(code) === -1) unlisted.push(code);
        players.set(code, {
          code: code,
          name: rec.name || code,
          rta: null,
          rtaRank: '',
          status: degraded ? 'Active' : 'Not in master',
          isActive: degraded,
          inMaster: false
        });
      });
    });

    if (!degraded && unlisted.length) {
      issues.warn('data/weeks/', unlisted.length + ' player code' + (unlisted.length > 1 ? 's appear' : ' appears') +
        ' in weekly files but not in master.xlsx: ' + unlisted.slice(0, 8).join(', ') +
        (unlisted.length > 8 ? '…' : '') + '. Their weekly numbers are shown, tagged "not in master".');
    }
    if (degraded) {
      issues.warn('master.xlsx', 'Running on weekly files alone: RTA, RTA Rank and Status are unavailable, and every player is treated as active.');
    }

    // Which weeks each player appears in, oldest first.
    var appearances = new Map();
    weeks.forEach(function (w) {
      w.rows.forEach(function (rec, code) {
        if (!appearances.has(code)) appearances.set(code, []);
        appearances.get(code).push(w.id);
      });
    });

    return {
      ok: weeks.length > 0 || players.size > 0,
      degraded: degraded,
      players: players,
      weeks: weeks,
      appearances: appearances,
      manifest: manifest,
      issues: issues.list,
      errorCount: issues.count('error'),
      warnCount: issues.count('warn'),
      loadedAt: new Date()
    };
  }

  /* ---------- aggregation used by the views ---------- */

  /* Sums real wins and losses across the given weeks.
     Percentages are never averaged — totals are summed, then divided once. */
  function aggregate(weeks, code) {
    var t = { atkW: 0, atkL: 0, defW: 0, defL: 0, weeks: 0, lastHouse: null, lastHouseGroup: null, flags: 0 };
    weeks.forEach(function (w) {
      var rec = w.rows.get(code);
      if (!rec) return;
      t.atkW += rec.atkW; t.atkL += rec.atkL;
      t.defW += rec.defW; t.defL += rec.defL;
      t.weeks += 1;
      t.lastHouse = rec.house;
      t.lastHouseGroup = rec.houseGroup;
      t.flags += rec.flags.length;
    });
    return t;
  }

  function rankIndex(rank) {
    var i = CFG.rankOrder.findIndex(function (r) { return normKey(r) === normKey(rank); });
    return i === -1 ? (trim(rank) ? 900 : 999) : i;
  }

  global.EtheriaData = {
    load: load,
    aggregate: aggregate,
    rankIndex: rankIndex,
    weekNumber: weekNumber,
    normKey: normKey,
    houseKey: houseKey,
    parentHouse: parentHouse,
    houseDef: houseDef,
    isSquad: isSquad
  };

})(window);
