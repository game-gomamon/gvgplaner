# Defence Team tab — install

Copy these over your repo, keeping the same folder layout:

```
index.html                      (replaces yours)
js/config.js                    (replaces yours)
js/app.js                       (replaces yours)
js/defence.js                   (new)
css/styles.css                  (replaces yours)
scripts/extract-animus.mjs      (new)
assets/animus/                  (new — unzip animus-portraits.zip at the repo root)
data/team_stat.xlsx             (yours, unchanged)
```

`css/planner.css`, `js/data.js`, `js/charts.js`, `js/planner.js` and
`scripts/build-manifest.mjs` are untouched — keep your copies.

`animus-portraits.zip` already contains the `assets/animus/` prefix, so
unzipping it at the repo root puts the 79 portraits and `index.json` in the
right place. Commit them.

---

## Re-running the portrait extractor

Only needed when the Animus sheet gains new entries or new pictures:

```
node scripts/extract-animus.mjs
```

It reads `data/team_stat.xlsx`, writes `assets/animus/*.png` plus
`assets/animus/index.json`, and deletes portraits for Animus that are no
longer on the sheet. No npm install — it uses only Node built-ins.

Adding a new **week** needs nothing at all: drop a `W014` sheet into the
workbook, push, and the tab picks it up.

---

## Recommended: shrink the workbook

`data/team_stat.xlsx` is 29.65 MB, and `bustCache: true` makes the browser
re-download it on every visit. Almost all of that weight is the pictures in
the `Profile` and `Card` columns.

Once the portraits are extracted and committed, those columns are dead weight
for the website:

1. Run `node scripts/extract-animus.mjs` and commit `assets/animus/`.
2. Open `data/team_stat.xlsx`, delete the `Profile` and `Card` columns on the
   `Animus` sheet, save.
3. Commit.

Measured result: **29.65 MB -> 0.02 MB, with identical output on the tab.**
Keep an unedited copy of the workbook somewhere if you still want the art in
Excel.

If you would rather leave the columns in place, set `defence.bustCache` to
`false` in `js/config.js` so the browser at least caches the download.

---

## Notes

- The tab reads `data/team_stat.xlsx` relative to `index.html`, so it works
  under a GitHub Pages project URL such as
  `https://user.github.io/etheria-restart/`.
- It does not read `master.xlsx` or `data/weeks/`. If those fail to load the
  Defence Team tab still works, exactly like the Planner tab.
- The workbook is fetched once per page load, on the first visit to the tab.
