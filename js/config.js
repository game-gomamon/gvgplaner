/* =========================================================
   config.js — everything you might want to change lives here.
   Edit this file, not the app logic.
   ========================================================= */

window.APP_CONFIG = {

  /* Paths are relative, so the site works from a repository
     subpath such as https://user.github.io/etheria-restart/ */
  masterPath:   'data/master.xlsx',
  weeksPath:    'data/weeks/',
  manifestPath: 'data/weeks/manifest.json',

  /* Worksheet names inside the Excel files */
  masterSheet: 'Players',
  weekSheet:   'Performance',

  /* Attack attempts allowed per player per week.
     Used only to flag rows that exceed it — nothing is auto-corrected. */
  atkAttemptsPerWeek: 5,

  /* House colours and how many defence teams each house fields.
     Add a house here and it becomes a filter option automatically;
     give it a colour in css/styles.css to match.

     A house with a "parent" is a squad of that house — a second team
     flying the same banner. It keeps its own badge, its own filter
     option and its own defence limit, but its players are counted
     towards the parent's total everywhere a house total is shown, and
     it inherits the parent's colour. So writing "Purple" on 7 rows and
     "Purple*" on 7 more reads as: Purple 14 (Purple 7, Purple* 7). */
  houses: {
    White:     { defenseTeams: 4 },
    Purple:    { defenseTeams: 4 },
    'Purple*': { defenseTeams: 4, parent: 'Purple' },
    Yellow:    { defenseTeams: 5 },
    Red:       { defenseTeams: 5 },
    'Red*':    { defenseTeams: 5, parent: 'Red' }
  },

  /* Ladder order used when sorting the RTA Rank column, lowest first.
     Ranks that are not listed sort below the listed ones, alphabetically.
     The rank text itself always comes from master.xlsx and is never
     recalculated — this list only controls sort order. */
  rankOrder: [
    'Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum',
    'Diamond', 'Master', 'Grandmaster', 'Challenger',
    'Champion', 'Warlord', 'Emperor', 'Legend'
  ],

  /* Status values treated as "currently in the guild".
     Anything else (Left, Inactive, Kicked…) is kept but hidden by default. */
  activeStatuses: ['active'],

  /* Ask the browser to skip its cache when fetching data files, so a freshly
     pushed week shows up without a hard refresh. Set to false if you prefer
     GitHub's CDN caching. */
  bustCache: true,

  /* If data/weeks/manifest.json is missing (for example before the GitHub
     Action has ever run), the site probes for W01…W{maxWeek}.xlsx directly.
     This is a safety net for local previews, not the normal path. */
  manifestFallback: { enabled: true, maxWeek: 60 },

  /* Which tab opens when someone lands on the site with no #hash.
     One of: planner, dashboard, overall, players, history. */
  defaultView: 'planner',

  /* =========================================================
     PLANNER
     Everything the placement board needs. The statistics half of
     the site ignores this block entirely.
     ========================================================= */
  planner: {

    /* The roster is read straight out of the repo — no upload needed.
       Drop Member.xlsx next to index.html and it loads on every visit.
       Filenames are case-sensitive on GitHub Pages, so both spellings are
       tried in order. Add more names here if yours differs. */
    rosterFiles: ['Member.xlsx', 'member.xlsx'],

    /* The map image. Each path is tried in order until one loads, so it
       works whether the PNG sits in assets/ or beside index.html. */
    mapImages: [
      'assets/united-front-planner.png',
      'united-front-planner.png',
      'assets/map.png'
    ],

    labelScale:  0.0155,   // node-label size as a fraction of the map's width
    labelFit:    0.88,     // share of a box a name may fill
    exportScale: 2,        // 2 = double-resolution PNG
    exportName:  'holyship-united-front-planner.png',
    storeKey:    'etheria-uf-planner/v3',   // v3: node ids for the 30-box map

    /* ---------------------------------------------------------
       BOX CONFIGURATION  ← EDIT THIS LIST TO MOVE THE ZONES
       One entry per coloured box on the map. All values are
       PERCENTAGES of the image, so the zones scale with it:

         x = distance from the left edge  (0–100)
         y = distance from the top edge   (0–100)
         w = zone width                   (0–100)
         h = zone height                  (0–100)

       To move a zone:  change x / y.
       To resize one:   change w / h.
       To add a box:    append { id:'box-31', x:.., y:.., w:.., h:.. }
                        — ids just have to be unique.
       To remove one:   delete its line. Saved assignments pointing
                        at a missing id are dropped automatically.

       Tick "Outline nodes" on the Planner tab to see every zone drawn
       over the map while you tune these numbers.

       These 30 boxes were measured against
       assets/united-front-planner.png (1601 × 982). If you swap in a
       different map image, re-measure them.

       box-01 … box-03 are the red stack on the top-left node.
       --------------------------------------------------------- */
    boxes: [
      { id: 'box-01', x: 19.86, y:  1.43, w: 9.37, h: 5.19 },   // red
      { id: 'box-02', x: 19.86, y:  7.64, w: 9.37, h: 5.19 },   // red
      { id: 'box-03', x: 19.86, y: 13.85, w: 9.37, h: 5.19 },   // red
      { id: 'box-04', x:  8.62, y: 18.53, w: 9.43, h: 5.60 },
      { id: 'box-05', x:  8.62, y: 24.95, w: 9.43, h: 5.60 },
      { id: 'box-06', x: 31.42, y: 10.69, w: 9.31, h: 5.40 },
      { id: 'box-07', x: 31.48, y: 17.01, w: 9.24, h: 5.60 },
      { id: 'box-08', x: 43.35, y: 15.58, w: 9.56, h: 5.60 },
      { id: 'box-09', x: 55.84, y: 13.95, w: 9.43, h: 5.60 },
      { id: 'box-10', x: 55.84, y: 20.47, w: 9.43, h: 5.60 },
      { id: 'box-11', x:  6.06, y: 36.86, w: 9.56, h: 5.80 },
      { id: 'box-12', x: 44.03, y: 27.80, w: 9.74, h: 5.50 },
      { id: 'box-13', x: 63.96, y: 29.12, w: 9.56, h: 5.80 },
      { id: 'box-14', x: 32.48, y: 34.11, w: 9.68, h: 5.70 },
      { id: 'box-15', x: 22.36, y: 40.53, w: 9.49, h: 5.60 },
      { id: 'box-16', x: 44.10, y: 37.17, w: 9.87, h: 5.60 },
      { id: 'box-17', x: 44.10, y: 43.69, w: 9.87, h: 5.60 },
      { id: 'box-18', x: 55.78, y: 40.73, w: 9.68, h: 5.60 },
      { id: 'box-19', x: 70.14, y: 38.19, w: 9.62, h: 5.50 },
      { id: 'box-20', x: 70.14, y: 44.60, w: 9.62, h: 5.50 },
      { id: 'box-21', x: 12.24, y: 49.29, w: 9.93, h: 5.70 },
      { id: 'box-22', x: 12.24, y: 55.91, w: 9.93, h: 5.60 },
      { id: 'box-23', x: 37.85, y: 53.05, w: 9.12, h: 5.70 },
      { id: 'box-24', x: 80.51, y: 52.65, w: 9.68, h: 5.50 },
      { id: 'box-25', x: 64.77, y: 57.23, w: 9.81, h: 5.60 },
      { id: 'box-26', x: 25.86, y: 60.69, w: 9.68, h: 5.60 },
      { id: 'box-27', x: 51.41, y: 60.29, w: 10.12, h: 5.60 },
      { id: 'box-28', x: 51.41, y: 66.80, w: 10.12, h: 5.70 },
      { id: 'box-29', x: 83.14, y: 69.14, w: 9.56, h: 5.80 },
      { id: 'box-30', x: 68.77, y: 74.34, w: 9.81, h: 5.60 }
    ]
  }
};
