/* =========================================================
   defence.js — the Defence Team tab.

   Reads data/team_stat.xlsx once, on the first visit to the tab,
   and answers one question: which three-Animus teams defend best?

   Nothing here touches the statistics half of the site. If
   master.xlsx and the weekly files are missing, this tab still works,
   exactly as the planner does.
   ========================================================= */

(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG || {};
  var DCFG = CFG.defence || {};

  /* Sheets to treat as weekly data: "W" followed by digits, nothing else.
     W011, W12, W1 all qualify; "Animus", "Notes", "W1 draft" do not.
     Overridable from config.js so the naming can change without touching JS. */
  var WEEK_SHEET = new RegExp(DCFG.weekSheetPattern || '^W\\d+$', 'i');

  var TEAM_SIZE = 3;

  /* ---------------------------------------------------------
     Small helpers
     --------------------------------------------------------- */

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function trim(v) { return v == null ? '' : String(v).trim(); }

  /* Header matching, borrowed from data.js so both halves of the site
     tolerate the same spelling drift ("DEF_Win", "def win", "DEFWins"). */
  var normKey = (global.EtheriaData && global.EtheriaData.normKey) || function (s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  /* Case- and spacing-insensitive identity for an Animus name, so that
     "nathenn", "Nathenn" and "Nathenn " are one and the same. */
  function nameKey(s) {
    return trim(s).toLowerCase().replace(/\s+/g, ' ');
  }

  function slug(s) {
    return trim(s).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'animus';
  }

  function initials(name) {
    var parts = trim(name).split(/[\s\[\]]+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /* DEF_Win must never reach the UI as NaN. Anything unreadable counts as 0
     and is tallied so the footnote can admit how many cells were skipped. */
  function toWins(raw) {
    if (raw === null || raw === undefined || trim(raw) === '') return { value: 0, ok: false };
    if (typeof raw === 'number') {
      return isFinite(raw) ? { value: Math.max(0, Math.round(raw)), ok: true } : { value: 0, ok: false };
    }
    var cleaned = trim(raw).replace(/[,\s]/g, '');
    var n = Number(cleaned);
    if (cleaned !== '' && isFinite(n)) return { value: Math.max(0, Math.round(n)), ok: true };
    return { value: 0, ok: false };
  }

  function bust(url) {
    var on = DCFG.bustCache === undefined ? CFG.bustCache : DCFG.bustCache;
    if (!on) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------------------------------------------------------
     Fetching

     The workbook can be large — the portraits Excel stores in the
     Profile column are megabytes each — so the download is streamed
     and the tab reports progress rather than sitting blank.
     --------------------------------------------------------- */

  function fetchWorkbook(url, onProgress) {
    return fetch(bust(url), { cache: (DCFG.bustCache === undefined ? CFG.bustCache : DCFG.bustCache) ? 'no-store' : 'default' })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        var total = Number(res.headers.get('content-length')) || 0;
        if (!res.body || !res.body.getReader) return res.arrayBuffer();

        var reader = res.body.getReader();
        var chunks = [];
        var received = 0;

        return (function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              var out = new Uint8Array(received);
              var at = 0;
              chunks.forEach(function (c) { out.set(c, at); at += c.length; });
              return out.buffer;
            }
            chunks.push(r.value);
            received += r.value.length;
            if (onProgress) onProgress(received, total);
            return pump();
          });
        })();
      });
  }

  /* ---------------------------------------------------------
     Sheet reading
     --------------------------------------------------------- */

  function sheetRows(wb, name) {
    var sheet = wb.Sheets[name];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false, defval: '' });
  }

  /* Finds the header row in the first few rows and maps each wanted field
     to a column index. Sheets often open with a title or a blank line. */
  function mapColumns(rows, aliases, required) {
    var best = null;
    var limit = Math.min(rows.length, 10);

    for (var r = 0; r < limit; r++) {
      var row = rows[r] || [];
      var map = {};
      var hits = 0;
      for (var c = 0; c < row.length; c++) {
        var key = normKey(row[c]);
        if (!key) continue;
        for (var f in aliases) {
          if (map[f] !== undefined) continue;
          if (aliases[f].indexOf(key) !== -1) { map[f] = c; hits++; break; }
        }
      }
      var got = required.filter(function (f) { return map[f] !== undefined; }).length;
      if (!best || got > best.got || (got === best.got && hits > best.hits)) {
        best = { headerRow: r, map: map, hits: hits, got: got };
      }
      if (got === required.length) break;
    }
    return best || { headerRow: 0, map: {}, hits: 0, got: 0 };
  }

  function cell(row, map, field) {
    if (map[field] === undefined) return '';
    var v = row[map[field]];
    return v === undefined ? '' : v;
  }

  var ANIMUS_ALIASES = {
    name:    ['animus', 'animusname', 'name', 'unit', 'character'],
    profile: ['profile', 'image', 'img', 'portrait', 'icon', 'picture', 'avatar']
  };

  var WEEK_ALIASES = {
    a:   ['animusa', 'animus1', 'a', 'slot1', 'first'],
    b:   ['animusb', 'animus2', 'b', 'slot2', 'second'],
    c:   ['animusc', 'animus3', 'c', 'slot3', 'third'],
    win: ['defwin', 'defwins', 'defencewin', 'defencewins', 'defensewin', 'defensewins', 'wins', 'win']
  };

  /* ---------------------------------------------------------
     Animus sheet -> name -> { name, profile }

     The Profile column is read if it holds usable text (a relative path or
     a URL). In this workbook it does not: Excel stores those pictures as
     in-cell rich values, which SheetJS reports as empty. The portraits are
     therefore resolved against assets/animus/ instead — see
     scripts/extract-animus.mjs, which unpacks them from the workbook.
     Supporting both means the sheet can be switched to plain paths later
     without any change here.
     --------------------------------------------------------- */

  function parseAnimus(rows, stats) {
    var found = mapColumns(rows, ANIMUS_ALIASES, ['name']);
    var map = found.map;
    var byKey = new Map();

    if (map.name === undefined) {
      stats.notes.push('The Animus sheet has no "Animus" column, so portraits could not be matched to names.');
      return byKey;
    }

    for (var r = found.headerRow + 1; r < rows.length; r++) {
      var name = trim(cell(rows[r] || [], map, 'name'));
      if (!name) continue;
      var key = nameKey(name);
      if (byKey.has(key)) continue;             // first spelling wins

      var raw = trim(cell(rows[r] || [], map, 'profile'));
      // An in-cell picture surfaces as an error string, not a path.
      var usable = raw && !/^#(VALUE!|N\/A|REF!|NAME\?|NULL!|DIV\/0!)$/i.test(raw);

      byKey.set(key, { name: name, profile: usable ? raw : null });
    }

    stats.animusCount = byKey.size;
    return byKey;
  }

  /* Portrait index written by scripts/extract-animus.mjs. Optional: without
     it the tab falls back to a slug guess, then to initials. */
  function loadProfileIndex() {
    var path = DCFG.profileIndex;
    if (!path) return Promise.resolve(null);
    return fetch(bust(path), { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) { return (json && json.profiles) || null; })
      .catch(function () { return null; });
  }

  /* ---------------------------------------------------------
     Weekly sheets -> aggregated teams

     One pass over every row of every weekly sheet. Each row is folded
     straight into the Map, so nothing is scanned twice and rendering
     never re-reads the source data.
     --------------------------------------------------------- */

  /* THE NORMALISED KEY.

     A defence team is a *set* of three Animus, not an ordered list.
     Nathenn|Sharon|Areal and Areal|Nathenn|Sharon are the same team, so
     the names are lowercased and sorted before being joined:

        [Nathenn, Sharon, Areal]  ->  areal|nathenn|sharon
        [Areal, Nathenn, Sharon]  ->  areal|nathenn|sharon

     Both land on the same Map entry and their DEF_Win values add up.
     The key is only ever used for aggregation — what gets displayed is
     the order the team was first written in. */
  function teamKey(names) {
    return names.map(nameKey).sort().join('|');
  }

  function parseWeek(rows, sheetName, teams, stats) {
    var found = mapColumns(rows, WEEK_ALIASES, ['a', 'b', 'c', 'win']);
    var map = found.map;

    if (map.a === undefined || map.b === undefined || map.c === undefined) {
      stats.notes.push('Sheet "' + sheetName + '" has no Animus_A / Animus_B / Animus_C columns and was skipped.');
      return 0;
    }
    if (map.win === undefined) {
      stats.notes.push('Sheet "' + sheetName + '" has no DEF_Win column; its rows count as 0 wins.');
    }

    var used = 0;

    for (var r = found.headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var names = [trim(cell(row, map, 'a')), trim(cell(row, map, 'b')), trim(cell(row, map, 'c'))];

      // A row needs all three Animus. Anything short is skipped, not fatal.
      if (names.filter(Boolean).length !== TEAM_SIZE) {
        if (names.some(Boolean)) stats.badRows++;
        continue;
      }

      var wins = toWins(cell(row, map, 'win'));
      if (!wins.ok && trim(cell(row, map, 'win')) !== '') stats.badWins++;

      var key = teamKey(names);
      var entry = teams.get(key);

      if (!entry) {
        entry = {
          key: key,
          members: names.slice(),     // display order = first spelling seen
          wins: 0,
          rows: 0,
          weeks: new Set()
        };
        teams.set(key, entry);
      }

      // Duplicate rows are never dropped — they are summed, here and across sheets.
      entry.wins += wins.value;
      entry.rows += 1;
      entry.weeks.add(sheetName);
      used++;
    }

    if (!used) stats.emptySheets.push(sheetName);
    return used;
  }

  /* ---------------------------------------------------------
     Load + build, once
     --------------------------------------------------------- */

  var cache = null;

  function build() {
    if (cache) return cache;

    var stats = {
      animusCount: 0, weekSheets: [], emptySheets: [],
      badRows: 0, badWins: 0, totalRows: 0, notes: []
    };

    cache = Promise.all([
      fetchWorkbook(DCFG.dataPath || 'data/team_stat.xlsx', reportProgress),
      loadProfileIndex()
    ]).then(function (res) {
      var wb = XLSX.read(new Uint8Array(res[0]), { type: 'array' });
      var index = res[1];

      var animusSheet = (DCFG.animusSheet || 'Animus');
      var actualAnimus = wb.SheetNames.filter(function (n) { return normKey(n) === normKey(animusSheet); })[0];
      var animus = actualAnimus
        ? parseAnimus(sheetRows(wb, actualAnimus), stats)
        : new Map();

      if (!actualAnimus) {
        stats.notes.push('No "' + animusSheet + '" sheet found, so names are shown without portraits.');
      }

      // Weekly sheets are discovered, never listed. New weeks appear on their own.
      var weekNames = wb.SheetNames.filter(function (n) { return WEEK_SHEET.test(trim(n)); })
        .sort(function (a, b) {
          var na = parseInt(String(a).replace(/^\D+/, ''), 10);
          var nb = parseInt(String(b).replace(/^\D+/, ''), 10);
          return (na - nb) || String(a).localeCompare(String(b));
        });

      stats.weekSheets = weekNames;

      var teams = new Map();
      weekNames.forEach(function (name) {
        stats.totalRows += parseWeek(sheetRows(wb, name), name, teams, stats);
      });

      // Resolve each name to a portrait exactly once, not per render.
      var list = [];
      teams.forEach(function (entry) {
        list.push({
          key: entry.key,
          wins: entry.wins,
          rows: entry.rows,
          weeks: entry.weeks.size,
          members: entry.members.map(function (raw) {
            var rec = animus.get(nameKey(raw));
            return {
              name: rec ? rec.name : raw,        // canonical spelling from the Animus sheet
              src: profileSrc(rec ? rec.name : raw, rec, index),
              known: !!rec
            };
          })
        });
      });

      /* Descending by wins; ties broken by the normalised key, so the order
         is identical on every load and every machine. */
      list.sort(function (a, b) {
        return (b.wins - a.wins) || a.key.localeCompare(b.key);
      });

      return { teams: list, stats: stats, sheets: wb.SheetNames.slice() };
    });

    return cache;
  }

  /* Portrait lookup, best source first:
       1. a real path or URL typed into the Profile column
       2. assets/animus/index.json, written by scripts/extract-animus.mjs
       3. a slug guess in the same folder
       4. nothing — the initials placeholder takes over on error   */
  function profileSrc(name, rec, index) {
    if (rec && rec.profile) return rec.profile;
    var dir = DCFG.profileDir || 'assets/animus/';
    if (index) {
      var file = index[name] || index[trim(name)];
      if (!file) {
        var want = nameKey(name);
        for (var k in index) { if (nameKey(k) === want) { file = index[k]; break; } }
      }
      if (file) return dir + file;
    }
    return dir + slug(name) + '.' + (DCFG.profileExt || 'png');
  }

  /* ---------------------------------------------------------
     Rendering
     --------------------------------------------------------- */

  function reportProgress(received, total) {
    var el = $('dtProgress');
    if (!el) return;
    var mb = function (n) { return (n / 1048576).toFixed(1) + ' MB'; };
    el.textContent = total
      ? 'Reading team_stat.xlsx — ' + mb(received) + ' of ' + mb(total) +
        ' (' + Math.round((received / total) * 100) + '%)'
      : 'Reading team_stat.xlsx — ' + mb(received);
  }

  function setState(name) {
    var view = $('view-defence');
    if (view) view.setAttribute('data-state', name);
  }

  function portrait(member) {
    var alt = esc(member.name);
    return '<figure class="dt-animus">' +
             '<span class="dt-animus__frame" data-fallback="' + esc(initials(member.name)) + '">' +
             (member.src ? '<img src="' + esc(member.src) + '" alt="' + alt + '" loading="lazy" decoding="async">' : '') +
           '</span>' +
           '<figcaption class="dt-animus__name">' + alt +
             (member.known ? '' : ' <span class="tag tag--unknown" title="Not listed on the Animus sheet">?</span>') +
           '</figcaption>' +
         '</figure>';
  }

  function teamCard(team, position) {
    return '<li class="dt-team' + (position <= 3 ? ' is-podium' : '') + '">' +
        '<div class="dt-team__rank">' + position + '</div>' +
        '<div class="dt-team__line">' + team.members.map(portrait).join('') + '</div>' +
        '<div class="dt-team__score">' +
          '<b>' + team.wins + '</b>' +
          '<span>' + (team.wins === 1 ? 'defence win' : 'defence wins') + '</span>' +
        '</div>' +
      '</li>';
  }

  function render(data) {
    var teams = data.teams;
    var stats = data.stats;

    if (!teams.length) {
      setState('empty');
      $('dtEmpty').innerHTML = stats.weekSheets.length
        ? 'The ' + plural(stats.weekSheets.length, 'weekly sheet', 'weekly sheets') +
          ' in <code>team_stat.xlsx</code> (' + esc(stats.weekSheets.join(', ')) +
          ') hold no rows with all three Animus filled in.'
        : 'No weekly sheets were found in <code>team_stat.xlsx</code>. Weekly sheets are named <code>W</code> followed by digits — <code>W011</code>, <code>W012</code>, and so on.';
      return;
    }

    var totalWins = teams.reduce(function (n, t) { return n + t.wins; }, 0);
    var best = teams[0];

    $('dtStats').innerHTML =
      stat('Teams', teams.length, 'distinct three-Animus sets') +
      stat('Weeks read', stats.weekSheets.length, stats.weekSheets.length ? esc(stats.weekSheets[0]) + '–' + esc(stats.weekSheets[stats.weekSheets.length - 1]) : '—') +
      stat('Defence wins', totalWins, 'across every sheet') +
      stat('Best team', best.wins, esc(best.members.map(function (m) { return m.name; }).join(' · ')));

    $('dtList').innerHTML = teams.map(function (t, i) { return teamCard(t, i + 1); }).join('');

    // Portraits that 404 fall back to the initials drawn on the frame.
    $('dtList').querySelectorAll('.dt-animus__frame img').forEach(function (img) {
      img.addEventListener('error', function () { img.remove(); }, { once: true });
    });

    var notes = stats.notes.slice();
    if (stats.badRows) {
      notes.push(plural(stats.badRows, 'row was', 'rows were') + ' missing an Animus and skipped.');
    }
    if (stats.badWins) {
      notes.push(plural(stats.badWins, 'DEF_Win cell', 'DEF_Win cells') + ' could not be read as a number and counted as 0.');
    }
    if (stats.emptySheets.length) {
      notes.push('No usable rows on ' + esc(stats.emptySheets.join(', ')) + '.');
    }

    $('dtNote').innerHTML =
      'Rows are matched on the set of three Animus, so the same team counts once however the names are ordered. ' +
      'Totals add up ' + plural(stats.totalRows, 'row', 'rows') + ' from ' +
      plural(stats.weekSheets.length, 'sheet', 'sheets') + '.' +
      (notes.length ? '<br>' + notes.map(esc).join(' ') : '');

    setState('ready');
  }

  function stat(label, value, sub) {
    return '<div class="stat"><p class="stat__label">' + esc(label) + '</p>' +
           '<p class="stat__value">' + esc(String(value)) + '</p>' +
           '<p class="stat__sub">' + sub + '</p></div>';
  }

  function fail(err) {
    setState('error');
    var path = DCFG.dataPath || 'data/team_stat.xlsx';
    var why;
    if (err && err.status === 404) {
      why = 'No file at <code>' + esc(path) + '</code>. Check it is committed, and that the name matches exactly — GitHub Pages is case-sensitive.';
    } else if (err instanceof TypeError) {
      why = 'The file could not be fetched. If you opened <code>index.html</code> straight from disk, run a local web server instead — browsers block <code>file://</code> reads.';
    } else {
      why = esc(err && err.message ? err.message : String(err));
    }
    $('dtErrorBody').innerHTML = '<p class="panel__note">' + why + '</p>';
    if (global.console) global.console.error(err);
  }

  /* ---------------------------------------------------------
     Entry point — called by the router on every visit to the tab.
     The workbook is fetched on the first visit only.
     --------------------------------------------------------- */

  var painted = false;

  function init() {
    if (painted) return;

    if (typeof XLSX === 'undefined') {
      setState('error');
      $('dtErrorBody').innerHTML =
        '<p class="panel__note">The spreadsheet reader (SheetJS) did not load, so <code>team_stat.xlsx</code> cannot be opened.</p>';
      painted = true;
      return;
    }

    setState('loading');
    build().then(function (data) {
      painted = true;
      render(data);
    }).catch(function (err) {
      painted = true;
      cache = null;              // let a later visit try again
      fail(err);
    });
  }

  /* Drops the cache so the next visit re-reads the workbook. */
  function refresh() {
    cache = null;
    painted = false;
    init();
  }

  global.EtheriaDefence = { init: init, refresh: refresh, teamKey: teamKey };

})(window);
