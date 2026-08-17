/* =========================================================
   app.js — views, routing, sorting, filtering.
   Read-only by design: this file shows numbers and never
   decides anything about placement.
   ========================================================= */

(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  var esc = window.EtheriaCharts.esc;
  var Charts = window.EtheriaCharts;
  var Data = window.EtheriaData;

  var DB = null;
  var state = {
    view: 'dashboard',
    weekId: null,
    range: 'all',
    dashSort: { key: 'rta', dir: 'desc' },
    ovSort:   { key: 'rta', dir: 'desc' },
    dashSearch: '', dashHouse: 'all', dashIncludeLeft: false,
    ovSearch: '', ovIncludeLeft: false,
    plSearch: '', plStatus: 'active',
    playerCode: null
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------
     Formatting
     --------------------------------------------------------- */

  function record(w, l) {
    if (w === 0 && l === 0) return '<span class="record record--void">0W/0L</span>';
    return '<span class="record"><b>' + w + 'W</b>/<i>' + l + 'L</i></span>';
  }

  function ratio(w, l) {
    if (w + l === 0) return '<span class="pct">no battles</span>';
    return '<span class="pct">' + Math.round((w / (w + l)) * 100) + '%</span>';
  }

  function houseBadge(house) {
    var h = house || 'Unknown';
    var def = Data.houseDef(h);
    var squad = Data.isSquad(h);
    var title = def
      ? (squad ? h + ' — squad of ' + Data.parentHouse(h) + ', ' + def.defenseTeams + ' defence teams'
               : h + ' — ' + def.defenseTeams + ' defence teams')
      : 'House not recognised';
    return '<span class="badge" data-house="' + esc(h) + '" data-squad="' + (squad ? '1' : '0') +
           '" title="' + esc(title) + '">' +
           '<span class="badge__dot"></span>' + esc(h) + '</span>';
  }

  /* Counts houses twice over: exactly as recorded, and rolled up into the
     parent house. Purple 7 + Purple* 7 reads as Purple 14 with the split kept. */
  function houseTally(items, getHouse) {
    var groups = {};
    items.forEach(function (item) {
      var h = getHouse(item) || 'Unknown';
      var g = Data.parentHouse(h);
      if (!groups[g]) groups[g] = { total: 0, parts: {} };
      groups[g].total += 1;
      groups[g].parts[h] = (groups[g].parts[h] || 0) + 1;
    });

    var order = [];
    Object.keys(CFG.houses).forEach(function (h) {
      var g = Data.parentHouse(h);
      if (groups[g] && order.indexOf(g) === -1) order.push(g);
    });
    Object.keys(groups).forEach(function (g) { if (order.indexOf(g) === -1) order.push(g); });

    return { groups: groups, order: order };
  }

  /* Parent house first, then its squads, then anything unconfigured. */
  function partsInOrder(parts) {
    var list = Object.keys(CFG.houses).filter(function (h) { return parts[h] !== undefined; });
    Object.keys(parts).sort().forEach(function (h) { if (list.indexOf(h) === -1) list.push(h); });
    return list;
  }

  function splitText(entry) {
    var parts = partsInOrder(entry.parts);
    if (parts.length < 2) return '';
    return parts.map(function (h) { return h + ' ' + entry.parts[h]; }).join(', ');
  }

  function rtaValue(p) {
    return p.rta === null || p.rta === undefined ? '<span class="rta" style="color:var(--muted)">—</span>'
                                                 : '<span class="rta">' + p.rta + '</span>';
  }

  function rankValue(p) {
    return '<span class="rank-label">' + (p.rtaRank ? esc(p.rtaRank) : '—') + '</span>';
  }

  function nameCell(p, extraTags) {
    var tags = '';
    if (!p.inMaster) tags += ' <span class="tag tag--unknown">not in master</span>';
    else if (!p.isActive) tags += ' <span class="tag tag--left">' + esc(p.status) + '</span>';
    if (extraTags) tags += extraTags;
    return '<a class="cell-name" href="#/player/' + encodeURIComponent(p.code) + '">' +
           '<b>' + esc(p.name) + tags + '</b><small>' + esc(p.code) + '</small></a>';
  }

  function statCard(label, value, sub) {
    return '<div class="stat"><p class="stat__label">' + esc(label) + '</p>' +
           '<p class="stat__value">' + value + '</p>' +
           (sub ? '<p class="stat__sub">' + sub + '</p>' : '') + '</div>';
  }

  function matches(query, player) {
    if (!query) return true;
    var q = query.toLowerCase().trim();
    return player.name.toLowerCase().indexOf(q) !== -1 || player.code.toLowerCase().indexOf(q) !== -1;
  }

  /* ---------------------------------------------------------
     Sorting
     --------------------------------------------------------- */

  function compare(a, b, key, dir) {
    var mul = dir === 'asc' ? 1 : -1;
    var av, bv;

    switch (key) {
      case 'name':  return mul * a.player.name.localeCompare(b.player.name);
      case 'house': {
        // group first, so Purple and Purple* stay adjacent
        var ga = String(a.houseGroup || a.house || ''), gb = String(b.houseGroup || b.house || '');
        var byGroup = ga.localeCompare(gb);
        return mul * (byGroup !== 0 ? byGroup : String(a.house || '').localeCompare(String(b.house || '')));
      }
      case 'rank':
        av = window.EtheriaData.rankIndex(a.player.rtaRank);
        bv = window.EtheriaData.rankIndex(b.player.rtaRank);
        if (av === bv) return (b.player.rta || 0) - (a.player.rta || 0);
        return mul * (av - bv);
      case 'rta':
        av = a.player.rta === null ? -1 : a.player.rta;
        bv = b.player.rta === null ? -1 : b.player.rta;
        break;
      case 'weeks': av = a.weeks; bv = b.weeks; break;
      default: av = a[key]; bv = b[key];
    }
    if (av === bv) return a.player.name.localeCompare(b.player.name);
    return mul * (av - bv);
  }

  function bindSortHeaders(table, sortState, rerender) {
    table.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.querySelector('button').addEventListener('click', function (ev) {
        var key = th.getAttribute('data-sort');
        // Alt-click flips an ATK/DEF column from wins to losses.
        if (ev.altKey && /^(atk|def)W$/.test(key)) key = key.replace('W', 'L');
        if (sortState.key === key) {
          sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sortState.key = key;
          sortState.dir = (key === 'name' || key === 'house' || key === 'rank') ? 'asc' : 'desc';
        }
        rerender();
      });
    });
  }

  function paintSortHeaders(table, sortState) {
    table.querySelectorAll('th[data-sort]').forEach(function (th) {
      var key = th.getAttribute('data-sort');
      var active = key === sortState.key || key.replace('W', 'L') === sortState.key;
      th.setAttribute('aria-sort', active ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      var btn = th.querySelector('button');
      var base = btn.getAttribute('data-label') || btn.textContent.trim();
      btn.setAttribute('data-label', base);
      btn.textContent = active && /L$/.test(sortState.key) && /^(atk|def)W$/.test(key) ? base + ' (losses)' : base;
    });
  }

  /* ---------------------------------------------------------
     Dashboard
     --------------------------------------------------------- */

  function currentWeek() {
    return DB.weeks.filter(function (w) { return w.id === state.weekId; })[0] || DB.weeks[DB.weeks.length - 1] || null;
  }

  function buildWeekRows(week) {
    var rows = [];
    week.rows.forEach(function (rec, code) {
      var p = DB.players.get(code);
      if (!p) return;
      rows.push({
        player: p, house: rec.house, houseGroup: rec.houseGroup || Data.parentHouse(rec.house),
        atkW: rec.atkW, atkL: rec.atkL, defW: rec.defW, defL: rec.defL,
        flags: rec.flags
      });
    });
    return rows;
  }

  function renderDashboard() {
    var week = currentWeek();
    if (!week) {
      $('weekTitle').textContent = 'No weeks recorded';
      $('weekStats').innerHTML = '';
      $('dashBody').innerHTML = '';
      $('dashEmpty').hidden = false;
      $('dashEmpty').textContent = 'Add a weekly file to data/weeks/ to see results here.';
      return;
    }
    state.weekId = week.id;
    $('weekSelect').value = week.id;
    $('weekTitle').textContent = 'Week ' + week.num;

    var all = buildWeekRows(week);
    var visibleByStatus = all.filter(function (r) { return state.dashIncludeLeft || r.player.isActive || !r.player.inMaster; });

    // headline numbers, computed over the status-visible set
    var totals = visibleByStatus.reduce(function (t, r) {
      t.atkW += r.atkW; t.atkL += r.atkL; t.defW += r.defW; t.defL += r.defL;
      if (r.player.rta !== null) { t.rtaSum += r.player.rta; t.rtaN += 1; }
      return t;
    }, { atkW: 0, atkL: 0, defW: 0, defL: 0, rtaSum: 0, rtaN: 0 });

    var activeCount = all.filter(function (r) { return r.player.isActive; }).length;
    var avgRta = totals.rtaN ? Math.round(totals.rtaSum / totals.rtaN) : null;

    $('weekStats').innerHTML =
      statCard('Active players', activeCount, all.length !== activeCount ? all.length + ' rows recorded' : 'all recorded rows') +
      statCard('Average RTA', avgRta === null ? '—' : avgRta, totals.rtaN + ' player' + (totals.rtaN === 1 ? '' : 's') + ' with a score') +
      statCard('Attack', record(totals.atkW, totals.atkL), ratio(totals.atkW, totals.atkL)) +
      statCard('Defence', record(totals.defW, totals.defL), ratio(totals.defW, totals.defL));

    renderHouseStrip(all);

    // filters
    var rows = visibleByStatus.filter(function (r) {
      if (!houseFilterMatch(r)) return false;
      return matches(state.dashSearch, r.player);
    });

    rows.sort(function (a, b) { return compare(a, b, state.dashSort.key, state.dashSort.dir); });
    paintSortHeaders($('dashTable'), state.dashSort);

    $('dashBody').innerHTML = rows.map(function (r, i) {
      var flag = r.flags.length ? ' <span class="tag tag--flag" title="' + esc(r.flags.join(' · ')) + '">check</span>' : '';
      return '<tr data-house="' + esc(r.house) + '" data-squad="' + (Data.isSquad(r.house) ? '1' : '0') +
        '" data-code="' + esc(r.player.code) + '">' +
        '<td class="col-rank">' + (i + 1) + '</td>' +
        '<td>' + nameCell(r.player, flag) + '</td>' +
        '<td>' + houseBadge(r.house) + '</td>' +
        '<td class="num">' + rtaValue(r.player) + '</td>' +
        '<td>' + rankValue(r.player) + '</td>' +
        '<td class="num">' + record(r.atkW, r.atkL) + '</td>' +
        '<td class="num">' + record(r.defW, r.defL) + '</td>' +
      '</tr>';
    }).join('');

    $('dashEmpty').hidden = rows.length > 0;
    $('dashEmpty').textContent = all.length && !visibleByStatus.length
      ? 'No player in ' + week.id + ' is marked Active in master.xlsx. Tick "Include players who left" to see the ' + all.length + ' recorded row' + (all.length > 1 ? 's' : '') + '.'
      : 'No players match this filter. Clear the search or choose another house.';

    // active players in master with no row this week
    var missing = [];
    DB.players.forEach(function (p) {
      if (p.inMaster && p.isActive && !week.rows.has(p.code)) missing.push(p.name);
    });
    $('dashNote').innerHTML = 'Sort the attack and defence columns by wins; hold <kbd>Alt</kbd> and click to sort by losses instead.' +
      (missing.length ? '<br>' + missing.length + ' active player' + (missing.length > 1 ? 's have' : ' has') +
        ' no row in ' + week.id + ': ' + esc(missing.slice(0, 10).join(', ')) + (missing.length > 10 ? '…' : '') + '.' : '');
  }

  function renderHouseStrip(rows) {
    if (!rows.length) { $('houseStrip').hidden = true; return; }
    $('houseStrip').hidden = false;

    var tally = houseTally(rows, function (r) { return r.house; });
    var total = rows.length;

    // One bar segment per recorded house; a squad carries the parent's colour
    // under a hatch, so the banner still reads as one house.
    $('houseStripBar').innerHTML = tally.order.map(function (g) {
      return partsInOrder(tally.groups[g].parts).map(function (h) {
        var n = tally.groups[g].parts[h];
        return '<span data-squad="' + (Data.isSquad(h) ? '1' : '0') +
               '" style="width:' + ((n / total) * 100).toFixed(2) + '%;background-color:' + Charts.houseColor(h) +
               '" title="' + esc(h + ': ' + n) + '"></span>';
      }).join('');
    }).join('');

    $('houseStripLegend').innerHTML = tally.order.map(function (g) {
      var entry = tally.groups[g];
      var def = Data.houseDef(g);
      var lim = def ? def.defenseTeams + ' def teams' : 'unrecognised house';
      var split = splitText(entry);
      return '<li><span class="badge__dot" style="background:' + Charts.houseColor(g) + '"></span>' +
             '<b>' + esc(g) + '</b> ' + entry.total +
             (split ? ' <small>(' + esc(split) + ')</small>' : '') +
             ' <small>· ' + esc(lim) + '</small></li>';
    }).join('');
  }

  /* Selected value is "all", "group:Purple" (the house and its squads)
     or "exact:Purple*" (that squad alone). */
  function houseFilterMatch(row) {
    var sel = state.dashHouse;
    if (!sel || sel === 'all') return true;
    if (sel.indexOf('group:') === 0) return row.houseGroup === sel.slice(6);
    if (sel.indexOf('exact:') === 0) return row.house === sel.slice(6);
    return row.house === sel;   // tolerate a value chosen before squads existed
  }

  /* ---------------------------------------------------------
     Overall
     --------------------------------------------------------- */

  function rangeWeeks() {
    if (state.range === 'all') return DB.weeks.slice();
    var n = parseInt(state.range, 10);
    return DB.weeks.slice(Math.max(0, DB.weeks.length - n));
  }

  function renderOverall() {
    var weeks = rangeWeeks();
    $('rangeSelect').value = state.range;

    $('rangeNote').textContent = weeks.length
      ? 'Adding up actual wins and losses from ' + weeks[0].id + ' to ' + weeks[weeks.length - 1].id +
        ' (' + weeks.length + ' week' + (weeks.length === 1 ? '' : 's') + '). RTA and RTA Rank are the current values from master.xlsx.'
      : 'No weeks available.';

    var rows = [];
    DB.players.forEach(function (p) {
      if (!state.ovIncludeLeft && p.inMaster && !p.isActive) return;
      var t = window.EtheriaData.aggregate(weeks, p.code);
      if (!t.weeks) return;
      rows.push({ player: p, weeks: t.weeks, house: t.lastHouse, houseGroup: t.lastHouseGroup, atkW: t.atkW, atkL: t.atkL, defW: t.defW, defL: t.defL });
    });

    var tot = rows.reduce(function (t, r) {
      t.atkW += r.atkW; t.atkL += r.atkL; t.defW += r.defW; t.defL += r.defL; return t;
    }, { atkW: 0, atkL: 0, defW: 0, defL: 0 });

    $('overallStats').innerHTML =
      statCard('Players', rows.length, 'with at least one recorded week') +
      statCard('Weeks', weeks.length, weeks.length ? weeks[0].id + '–' + weeks[weeks.length - 1].id : '—') +
      statCard('Attack', record(tot.atkW, tot.atkL), ratio(tot.atkW, tot.atkL)) +
      statCard('Defence', record(tot.defW, tot.defL), ratio(tot.defW, tot.defL));

    var shown = rows.filter(function (r) { return matches(state.ovSearch, r.player); });
    shown.sort(function (a, b) { return compare(a, b, state.ovSort.key, state.ovSort.dir); });
    paintSortHeaders($('ovTable'), state.ovSort);

    $('ovBody').innerHTML = shown.map(function (r, i) {
      return '<tr data-house="' + esc(r.house || 'Unknown') + '" data-squad="' + (Data.isSquad(r.house) ? '1' : '0') +
        '" data-code="' + esc(r.player.code) + '">' +
        '<td class="col-rank">' + (i + 1) + '</td>' +
        '<td>' + nameCell(r.player) + '</td>' +
        '<td class="num">' + rtaValue(r.player) + '</td>' +
        '<td>' + rankValue(r.player) + '</td>' +
        '<td class="num">' + record(r.atkW, r.atkL) + ratio(r.atkW, r.atkL) + '</td>' +
        '<td class="num">' + record(r.defW, r.defL) + ratio(r.defW, r.defL) + '</td>' +
        '<td class="num"><span class="rta">' + r.weeks + '</span></td>' +
      '</tr>';
    }).join('');

    $('ovEmpty').hidden = shown.length > 0;
  }

  /* ---------------------------------------------------------
     Players
     --------------------------------------------------------- */

  function renderPlayers() {
    var list = [];
    DB.players.forEach(function (p) { list.push(p); });

    list = list.filter(function (p) {
      if (state.plStatus === 'active' && !(p.isActive || !p.inMaster)) return false;
      if (state.plStatus === 'left' && (p.isActive || !p.inMaster)) return false;
      return matches(state.plSearch, p);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    $('rosterList').innerHTML = list.map(function (p) {
      var appear = DB.appearances.get(p.code) || [];
      var lastWeek = appear.length ? appear[appear.length - 1] : null;
      var house = 'None';
      if (lastWeek) {
        var w = DB.weeks.filter(function (x) { return x.id === lastWeek; })[0];
        house = w ? w.rows.get(p.code).house : 'None';
      }
      var t = window.EtheriaData.aggregate(DB.weeks, p.code);
      return '<li><a href="#/player/' + encodeURIComponent(p.code) + '" data-house="' + esc(house) +
        '" data-squad="' + (Data.isSquad(house) ? '1' : '0') + '">' +
        '<span class="roster__top"><span class="roster__name">' + esc(p.name) + '</span>' +
        '<span class="roster__code">' + esc(p.code) + '</span></span>' +
        '<p class="roster__meta">' + (p.rta === null ? '—' : p.rta) + ' <span>·</span> ' + esc(p.rtaRank || '—') +
        (p.inMaster && !p.isActive ? ' <span class="tag tag--left">' + esc(p.status) + '</span>' : '') +
        (!p.inMaster ? ' <span class="tag tag--unknown">not in master</span>' : '') + '</p>' +
        '<p class="roster__meta"><span>ATK</span> ' + t.atkW + 'W/' + t.atkL + 'L <span>·</span> <span>DEF</span> ' + t.defW + 'W/' + t.defL + 'L ' +
        '<span>·</span> ' + t.weeks + ' week' + (t.weeks === 1 ? '' : 's') + '</p>' +
      '</a></li>';
    }).join('');

    $('plEmpty').hidden = list.length > 0;
  }

  /* ---------------------------------------------------------
     Player detail
     --------------------------------------------------------- */

  function renderPlayer() {
    var p = DB.players.get(state.playerCode);
    var host = $('playerBody');

    if (!p) {
      host.innerHTML = '<div class="panel panel--fatal"><h2 class="panel__title">No player with code ' + esc(state.playerCode) + '</h2>' +
        '<p class="panel__note">Check the code in master.xlsx, or pick someone from the roster.</p></div>';
      return;
    }

    var history = [];
    DB.weeks.forEach(function (w) {
      var rec = w.rows.get(p.code);
      history.push({ week: w.id, num: w.num, rec: rec || null });
    });
    var played = history.filter(function (h) { return h.rec; });
    var t = window.EtheriaData.aggregate(DB.weeks, p.code);

    var tags = '';
    if (!p.inMaster) tags += '<span class="tag tag--unknown">not in master.xlsx</span>';
    else tags += '<span class="tag' + (p.isActive ? '' : ' tag--left') + '">' + esc(p.status) + '</span>';

    var html =
      '<div class="player-head">' +
        '<div><p class="player-head__code">' + esc(p.code) + '</p>' +
        '<h2 class="player-head__name">' + esc(p.name) + '</h2>' +
        '<div class="player-head__tags">' + tags +
        '<span class="tag">' + played.length + ' week' + (played.length === 1 ? '' : 's') + ' recorded</span></div></div>' +
      '</div>';

    html += '<div class="stat-strip">' +
      statCard('Current RTA', p.rta === null ? '—' : p.rta, 'from master.xlsx') +
      statCard('RTA Rank', esc(p.rtaRank || '—'), 'as reported by the game') +
      statCard('Attack, all weeks', record(t.atkW, t.atkL), ratio(t.atkW, t.atkL)) +
      statCard('Defence, all weeks', record(t.defW, t.defL), ratio(t.defW, t.defL)) +
    '</div>';

    // house ribbon
    if (history.length) {
      html += '<div class="panel"><h3 class="panel__title">House by week</h3>' +
        '<p class="panel__note">Hatched segments are weeks with no recorded row.</p>' +
        Charts.ribbon(history.map(function (h) {
          return { week: h.week, house: h.rec ? h.rec.house : 'Unknown', absent: !h.rec };
        })) + '</div>';
    }

    // weekly table
    html += '<div class="panel"><h3 class="panel__title">Weekly performance history</h3>' +
      '<p class="panel__note">House is kept exactly as it was recorded that week.</p>';
    if (!played.length) {
      html += '<p class="empty">No weekly records yet for this player.</p>';
    } else {
      html += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th scope="col">Week</th><th scope="col">House</th><th scope="col" class="num">ATK</th><th scope="col" class="num">DEF</th>' +
        '</tr></thead><tbody>' +
        played.slice().reverse().map(function (h) {
          var flag = h.rec.flags.length ? ' <span class="tag tag--flag" title="' + esc(h.rec.flags.join(' · ')) + '">check</span>' : '';
          return '<tr data-house="' + esc(h.rec.house) + '" data-squad="' + (Data.isSquad(h.rec.house) ? '1' : '0') + '" style="cursor:default">' +
            '<td class="col-rank" style="font-size:13px">' + esc(h.week) + flag + '</td>' +
            '<td>' + houseBadge(h.rec.house) + '</td>' +
            '<td class="num">' + record(h.rec.atkW, h.rec.atkL) + '</td>' +
            '<td class="num">' + record(h.rec.defW, h.rec.defL) + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</div>';

    // charts
    if (played.length) {
      var atkPoints = played.map(function (h) { return { label: h.week.replace(/^W/, ''), win: h.rec.atkW, loss: h.rec.atkL, house: h.rec.house }; });
      var defPoints = played.map(function (h) { return { label: h.week.replace(/^W/, ''), win: h.rec.defW, loss: h.rec.defL, house: h.rec.house }; });

      html += '<div class="grid-2">' +
        '<div class="panel"><h3 class="panel__title">Attack by week</h3>' +
        '<p class="panel__note">Wins above the line, losses below. Up to ' + CFG.atkAttemptsPerWeek + ' attacks per week.</p>' +
        Charts.pairedBars(atkPoints, { title: 'Attack wins and losses by week' }) + chartLegend() + '</div>' +
        '<div class="panel"><h3 class="panel__title">Defence by week</h3>' +
        '<p class="panel__note">A flat marker means no defensive battles were recorded that week.</p>' +
        Charts.pairedBars(defPoints, { title: 'Defence wins and losses by week' }) + chartLegend() + '</div>' +
      '</div>';

      // RTA trend only when weekly files actually carry an RTA column
      var rtaPoints = played.filter(function (h) { return h.rec.rta !== null && h.rec.rta !== undefined; })
        .map(function (h) { return { label: h.week.replace(/^W/, ''), value: h.rec.rta }; });
      if (rtaPoints.length >= 2) {
        html += '<div class="panel"><h3 class="panel__title">RTA by week</h3>' +
          '<p class="panel__note">Recorded in the weekly files. Nothing here is estimated.</p>' +
          Charts.line(rtaPoints, { title: 'RTA score by week' }) + '</div>';
      }
    }

    host.innerHTML = html;
  }

  function chartLegend() {
    return '<div class="chart-legend">' +
      '<span><i style="background:var(--win)"></i>Wins</span>' +
      '<span><i style="background:var(--loss);opacity:.6"></i>Losses</span>' +
      '<span><i style="background:var(--brass)"></i>House tick under each week</span></div>';
  }

  /* ---------------------------------------------------------
     History
     --------------------------------------------------------- */

  function renderHistory() {
    var host = $('historyBody');
    if (!DB.weeks.length) {
      host.innerHTML = '<p class="empty">No weeks recorded yet. Add W01.xlsx to data/weeks/ and push.</p>';
      return;
    }

    host.innerHTML = DB.weeks.slice().reverse().map(function (w, idx, arr) {
      var prev = DB.weeks[DB.weeks.indexOf(w) - 1] || null;
      var codes = [];
      var recs = [];
      var tot = { atkW: 0, atkL: 0, defW: 0, defL: 0 };
      w.rows.forEach(function (rec, code) {
        codes.push(code);
        recs.push(rec);
        tot.atkW += rec.atkW; tot.atkL += rec.atkL; tot.defW += rec.defW; tot.defL += rec.defL;
      });

      var joined = [], gone = [];
      if (prev) {
        codes.forEach(function (c) { if (!prev.rows.has(c)) joined.push(nameOf(c)); });
        prev.rows.forEach(function (rec, c) { if (!w.rows.has(c)) gone.push(nameOf(c)); });
      }

      var tally = houseTally(recs, function (rec) { return rec.house; });
      var houseBits = tally.order.map(function (g) {
        var entry = tally.groups[g];
        var split = splitText(entry);
        return '<span class="badge" data-house="' + esc(g) + '" title="' + esc(g + ' ' + entry.total + (split ? ' — ' + split : '')) + '">' +
               '<span class="badge__dot"></span>' + esc(g) + ' ' + entry.total +
               (split ? '<small class="badge__split">' + esc(split) + '</small>' : '') + '</span>';
      }).join(' ');

      return '<article class="week-card">' +
        '<div class="week-card__head">' +
          '<h3 class="week-card__id"><a href="#/dashboard" data-week="' + esc(w.id) + '">' + esc(w.id) + '</a></h3>' +
          '<div class="week-card__stats">' +
            '<span>Players</span> ' + codes.length +
            ' <span>ATK</span> ' + tot.atkW + 'W/' + tot.atkL + 'L' +
            ' <span>DEF</span> ' + tot.defW + 'W/' + tot.defL + 'L' +
          '</div>' +
        '</div>' +
        '<div class="player-head__tags" style="margin-top:10px">' + houseBits + '</div>' +
        (prev ? '<div class="week-card__moves">' +
          '<p><b>New this week</b><br>' + (joined.length ? esc(joined.join(', ')) : '—') + '</p>' +
          '<p><b>Not recorded</b><br>' + (gone.length ? esc(gone.join(', ')) : '—') + '</p>' +
        '</div>' : '') +
      '</article>';
    }).join('');

    host.querySelectorAll('a[data-week]').forEach(function (a) {
      a.addEventListener('click', function () {
        state.weekId = a.getAttribute('data-week');
        renderDashboard();
      });
    });
  }

  function nameOf(code) {
    var p = DB.players.get(code);
    return p ? p.name : code;
  }

  /* ---------------------------------------------------------
     Data check panel
     --------------------------------------------------------- */

  function renderIssues() {
    var chip = $('statusChip');
    chip.hidden = false;
    var e = DB.errorCount, w = DB.warnCount;

    chip.classList.toggle('chip--error', e > 0);
    chip.classList.toggle('chip--warn', e === 0 && w > 0);
    $('statusChipText').textContent = e ? (e + ' problem' + (e > 1 ? 's' : '') + (w ? ' · ' + w + ' note' + (w > 1 ? 's' : '') : ''))
                                        : (w ? w + ' note' + (w > 1 ? 's' : '') : 'Files read cleanly');

    $('issueLede').textContent = DB.issues.length
      ? 'Problems stop a file from loading. Notes mean the file loaded but something looked off.'
      : 'Every file was read without complaint.';

    $('issueList').innerHTML = DB.issues.map(function (i) {
      return '<li class="is-' + i.level + '"><span class="issues__tag">' + esc(i.scope) + '</span><span>' + esc(i.message) + '</span></li>';
    }).join('') || '<li><span class="issues__tag">ok</span><span>Nothing to report.</span></li>';

    chip.addEventListener('click', function () {
      var open = $('issuePanel').hidden;
      $('issuePanel').hidden = !open;
      chip.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------------------------------------------------------
     Routing
     --------------------------------------------------------- */

  /* 'planner' is the placement board; the rest read the spreadsheets.
     They share this router so the whole site is one page and one nav. */
  var VIEWS = ['planner', 'dashboard', 'overall', 'players', 'player', 'history'];
  var STATS_VIEWS = ['dashboard', 'overall', 'players', 'player', 'history'];

  function defaultView() {
    var want = (CFG && CFG.defaultView) || 'dashboard';
    return VIEWS.indexOf(want) === -1 || want === 'player' ? 'dashboard' : want;
  }

  function route() {
    var hash = location.hash.replace(/^#\/?/, '') || defaultView();
    var parts = hash.split('/');
    var view = parts[0];

    if (view === 'player' && parts[1]) {
      state.playerCode = decodeURIComponent(parts[1]);
    } else if (VIEWS.indexOf(view) === -1 || view === 'player') {
      view = defaultView();
    }
    state.view = view;

    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== view; });
    document.querySelectorAll('.nav__link').forEach(function (a) {
      var v = a.getAttribute('data-view');
      a.classList.toggle('is-active', v === view || (view === 'player' && v === 'players'));
    });

    // the board wants a wider page than the tables do
    document.body.classList.toggle('is-planner', view === 'planner');

    if (view === 'planner') {
      $('fatal').hidden = true;
      $('boot').hidden = true;          // the board needs none of the spreadsheets
      // Boots on first visit, re-measures the node labels on every visit.
      if (window.UFPlanner) window.UFPlanner.init();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    /* The statistics half needs its files. If they never arrived, say so
       here rather than crashing a render — the planner still works. */
    if (!DB) {
      STATS_VIEWS.forEach(function (v) { $('view-' + v).hidden = true; });
      $('fatal').hidden = false;
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    $('fatal').hidden = true;

    if (view === 'dashboard') renderDashboard();
    if (view === 'overall') renderOverall();
    if (view === 'players') renderPlayers();
    if (view === 'player') renderPlayer();
    if (view === 'history') renderHistory();

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------------------------------------------------
     Wiring
     --------------------------------------------------------- */

  function fillSelectors() {
    $('weekSelect').innerHTML = DB.weeks.slice().reverse().map(function (w) {
      return '<option value="' + esc(w.id) + '">' + esc(w.id) + '</option>';
    }).join('');

    var houses = Object.keys(CFG.houses);
    var seen = {};
    DB.weeks.forEach(function (w) { w.rows.forEach(function (r) { seen[r.house] = true; }); });
    Object.keys(seen).forEach(function (h) { if (houses.indexOf(h) === -1) houses.push(h); });

    // A house with squads gets an "— all" option plus one option per squad.
    var groups = [];
    houses.forEach(function (h) {
      var g = Data.parentHouse(h);
      var entry = groups.filter(function (x) { return x.name === g; })[0];
      if (!entry) { entry = { name: g, members: [] }; groups.push(entry); }
      if (entry.members.indexOf(h) === -1) entry.members.push(h);
    });

    var html = '<option value="all">All houses</option>';
    groups.forEach(function (g) {
      if (g.members.length < 2) {
        html += '<option value="group:' + esc(g.name) + '">' + esc(g.name) + '</option>';
        return;
      }
      html += '<optgroup label="' + esc(g.name) + '">';
      html += '<option value="group:' + esc(g.name) + '">' + esc(g.name) + ' — all</option>';
      g.members.forEach(function (m) {
        html += '<option value="exact:' + esc(m) + '">' + esc(m) + ' only</option>';
      });
      html += '</optgroup>';
    });
    $('dashHouse').innerHTML = html;
  }

  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function bind() {
    $('weekSelect').addEventListener('change', function () { state.weekId = this.value; renderDashboard(); });
    $('dashHouse').addEventListener('change', function () { state.dashHouse = this.value; renderDashboard(); });
    $('dashIncludeLeft').addEventListener('change', function () { state.dashIncludeLeft = this.checked; renderDashboard(); });
    $('dashSearch').addEventListener('input', debounce(function () {
      state.dashSearch = $('dashSearch').value; renderDashboard();
    }, 120));

    $('rangeSelect').addEventListener('change', function () { state.range = this.value; renderOverall(); });
    $('ovIncludeLeft').addEventListener('change', function () { state.ovIncludeLeft = this.checked; renderOverall(); });
    $('ovSearch').addEventListener('input', debounce(function () {
      state.ovSearch = $('ovSearch').value; renderOverall();
    }, 120));

    $('plStatus').addEventListener('change', function () { state.plStatus = this.value; renderPlayers(); });
    $('plSearch').addEventListener('input', debounce(function () {
      state.plSearch = $('plSearch').value; renderPlayers();
    }, 120));

    bindSortHeaders($('dashTable'), state.dashSort, renderDashboard);
    bindSortHeaders($('ovTable'), state.ovSort, renderOverall);

    // whole-row click opens the player, but let real links do their own thing
    [$('dashBody'), $('ovBody')].forEach(function (body) {
      body.addEventListener('click', function (ev) {
        if (ev.target.closest('a')) return;
        var tr = ev.target.closest('tr[data-code]');
        if (tr) location.hash = '#/player/' + encodeURIComponent(tr.getAttribute('data-code'));
      });
    });

  }

  /* Bindings the shell always needs, whether or not the spreadsheets
     loaded — otherwise a data failure would strand the Planner tab. */
  function bindShell() {
    window.addEventListener('hashchange', route);
  }

  /* Fills the fatal panel and hands control back to the router, so the
     Planner tab stays reachable. Statistics views show the panel instead. */
  function showFatal(message, details) {
    $('boot').hidden = true;
    DB = null;
    $('fatalBody').innerHTML = '<p class="panel__note">' + message + '</p>' +
      '<ul>' + details.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ul>';
    route();
  }

  function start() {
    bindShell();

    /* The board reads Member.xlsx and the map image only, so it should not
       sit behind the statistics load. Open it straight away when it is the
       landing tab; route() runs again once the data resolves. */
    var wanted = (location.hash.replace(/^#\/?/, '') || defaultView()).split('/')[0];
    if (wanted === 'planner') route();

    if (typeof XLSX === 'undefined') {
      showFatal('The spreadsheet reader (SheetJS) did not load, so no Excel file can be opened.', [
        'Check your connection — the library is loaded from a CDN.',
        'If your network blocks CDNs, download <code>xlsx.full.min.js</code>, drop it in <code>js/</code>, and point the script tag in <code>index.html</code> at it.'
      ]);
      return;
    }

    window.EtheriaData.load().then(function (db) {
      DB = db;
      $('boot').hidden = true;

      if (!DB.weeks.length && !DB.players.size) {
        renderIssues();
        showFatal('No data files could be read.', DB.issues.map(function (i) {
          return '<code>' + esc(i.scope) + '</code> — ' + esc(i.message);
        }).concat([
          'Expected <code>data/master.xlsx</code> and at least one <code>data/weeks/W01.xlsx</code>.'
        ]));
        return;
      }

      state.weekId = DB.weeks.length ? DB.weeks[DB.weeks.length - 1].id : null;
      fillSelectors();
      bind();
      renderIssues();

      $('footerMeta').textContent =
        DB.weeks.length + ' week' + (DB.weeks.length === 1 ? '' : 's') + ' · ' +
        DB.players.size + ' players · week list from ' +
        (DB.manifest.source === 'manifest' ? 'manifest.json' : DB.manifest.source === 'probe' ? 'a direct file scan' : 'nowhere') +
        ' · loaded ' + DB.loadedAt.toLocaleString();

      route();
    }).catch(function (err) {
      showFatal('Something went wrong while loading.', [esc(err && err.message ? err.message : String(err))]);
      if (window.console) console.error(err);
    });
  }

  // Start once, whether or not the document has already finished parsing.
  var started = false;
  function boot() { if (started) return; started = true; start(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
