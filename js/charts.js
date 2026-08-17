/* =========================================================
   charts.js — hand-built inline SVG. No chart library, no canvas,
   so everything stays crisp, themeable through CSS variables,
   and readable by a screen reader through <title> and <desc>.
   ========================================================= */

(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var HOUSE_VAR = {
    White: 'var(--house-white)',
    Purple: 'var(--house-purple)',
    Yellow: 'var(--house-yellow)',
    Red: 'var(--house-red)',
    Unknown: 'var(--house-none)'
  };

  /* A squad such as Purple* flies its parent's colour, so the eye reads
     "Purple" across the whole chart and the squad is told apart by texture. */
  function houseGroup(h) {
    if (global.EtheriaData) return global.EtheriaData.parentHouse(h);
    var houses = (global.APP_CONFIG && global.APP_CONFIG.houses) || {};
    var def = houses[h];
    if (def) return def.parent || h;
    var base = String(h == null ? '' : h).trim().replace(/\s*\*+$/, '');
    return (base && base !== h && houses[base]) ? base : h;
  }

  function isSquad(h) {
    if (global.EtheriaData) return global.EtheriaData.isSquad(h);
    var houses = (global.APP_CONFIG && global.APP_CONFIG.houses) || {};
    if (houses[h]) return !!houses[h].parent;
    return houseGroup(h) !== h;
  }

  function houseColor(h) { return HOUSE_VAR[houseGroup(h)] || 'var(--house-none)'; }

  /* -------------------------------------------------------
     Paired bars: wins above the baseline, losses below it.
     points: [{ label, win, loss, house }]
     ------------------------------------------------------- */
  function pairedBars(points, opts) {
    opts = opts || {};
    var title = opts.title || 'Weekly record';
    if (!points.length) return '<p class="empty">No weeks recorded yet.</p>';

    var W = 640, H = 210;
    var padL = 30, padR = 10, padT = 14, padB = 30;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    var maxWin = Math.max(1, ...points.map(function (p) { return p.win; }));
    var maxLoss = Math.max(1, ...points.map(function (p) { return p.loss; }));
    var total = maxWin + maxLoss;
    var zeroY = padT + plotH * (maxWin / total);

    var step = plotW / points.length;
    var barW = Math.min(26, step * 0.54);

    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">';
    svg += '<title>' + esc(title) + '</title>';

    // baseline and top/bottom guides
    svg += '<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + zeroY.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
    svg += '<text x="4" y="' + (padT + 9) + '" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono, monospace">' + maxWin + '</text>';
    svg += '<text x="4" y="' + (H - padB + 2) + '" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono, monospace">' + maxLoss + '</text>';

    points.forEach(function (p, i) {
      var cx = padL + step * i + step / 2;
      var x = cx - barW / 2;
      var winH = (p.win / total) * plotH;
      var lossH = (p.loss / total) * plotH;

      if (p.win > 0) {
        svg += '<rect x="' + x.toFixed(1) + '" y="' + (zeroY - winH).toFixed(1) + '" width="' + barW.toFixed(1) +
               '" height="' + winH.toFixed(1) + '" rx="2" fill="var(--win)" opacity=".9"><title>' +
               esc(p.label) + ': ' + p.win + ' wins</title></rect>';
      }
      if (p.loss > 0) {
        svg += '<rect x="' + x.toFixed(1) + '" y="' + zeroY.toFixed(1) + '" width="' + barW.toFixed(1) +
               '" height="' + lossH.toFixed(1) + '" rx="2" fill="var(--loss)" opacity=".55"><title>' +
               esc(p.label) + ': ' + p.loss + ' losses</title></rect>';
      }
      if (p.win === 0 && p.loss === 0) {
        svg += '<line x1="' + (cx - 6) + '" y1="' + zeroY.toFixed(1) + '" x2="' + (cx + 6) + '" y2="' + zeroY.toFixed(1) +
               '" stroke="var(--muted)" stroke-width="2"><title>' + esc(p.label) + ': no battles recorded</title></line>';
      }

      // house tick under the label, so colour history reads across the chart
      svg += '<rect x="' + (cx - 7) + '" y="' + (H - 12) + '" width="14" height="3" rx="1.5" fill="' + houseColor(p.house) + '" opacity=".85"/>';
      svg += '<text x="' + cx + '" y="' + (H - 17) + '" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono, monospace">' + esc(p.label) + '</text>';
    });

    svg += '</svg>';
    return svg;
  }

  /* -------------------------------------------------------
     Line with dots — used only when historical values exist.
     points: [{ label, value }]
     ------------------------------------------------------- */
  function line(points, opts) {
    opts = opts || {};
    if (points.length < 2) return '<p class="empty">Not enough recorded points to draw a trend.</p>';

    var W = 640, H = 190;
    var padL = 44, padR = 12, padT = 16, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var vals = points.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { max += 1; min -= 1; }
    var pad = (max - min) * 0.12;
    min -= pad; max += pad;

    var step = points.length > 1 ? plotW / (points.length - 1) : 0;
    var xy = points.map(function (p, i) {
      return {
        x: padL + step * i,
        y: padT + plotH - ((p.value - min) / (max - min)) * plotH,
        p: p
      };
    });

    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.title || 'Trend') + '">';
    svg += '<title>' + esc(opts.title || 'Trend') + '</title>';

    [0, 0.5, 1].forEach(function (f) {
      var y = padT + plotH * f;
      var v = Math.round(max - (max - min) * f);
      svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="var(--line-soft)" stroke-width="1"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono, monospace">' + v + '</text>';
    });

    svg += '<polyline fill="none" stroke="var(--brass)" stroke-width="2" stroke-linejoin="round" points="' +
           xy.map(function (d) { return d.x.toFixed(1) + ',' + d.y.toFixed(1); }).join(' ') + '"/>';

    xy.forEach(function (d) {
      svg += '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="3.5" fill="var(--ink)" stroke="var(--brass)" stroke-width="2"><title>' +
             esc(d.p.label) + ': ' + d.p.value + '</title></circle>';
      svg += '<text x="' + d.x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono, monospace">' + esc(d.p.label) + '</text>';
    });

    svg += '</svg>';
    return svg;
  }

  /* -------------------------------------------------------
     House ribbon: one segment per week, coloured by the house
     the player held that week. Hatched where they have no record.
     ------------------------------------------------------- */
  function ribbon(entries) {
    if (!entries.length) return '';
    var html = '<div class="ribbon">';
    entries.forEach(function (e) {
      html += '<div class="ribbon__seg" data-house="' + esc(e.house || 'Unknown') +
              '" data-squad="' + (isSquad(e.house) ? '1' : '0') +
              '" data-absent="' + (e.absent ? '1' : '0') + '" title="' +
              esc(e.week + ' · ' + (e.absent ? 'no record' : e.house)) + '">' +
              '<div class="ribbon__bar"></div><span class="ribbon__label">' + esc(e.week.replace(/^W/, '')) + '</span></div>';
    });
    return html + '</div>';
  }

  global.EtheriaCharts = {
    pairedBars: pairedBars, line: line, ribbon: ribbon,
    houseColor: houseColor, houseGroup: houseGroup, isSquad: isSquad, esc: esc
  };

})(window);
