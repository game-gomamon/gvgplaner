# United Front Planner — Etheria Restart

A static planner for assigning guild members to United Front nodes. Pure HTML, CSS and vanilla JS — no build step, no backend.

```
/
├── index.html
├── style.css
├── script.js
├── Member.xlsx               (your roster — the page reads this on load)
└── assets/
    └── united-front-planner.png   (your map, already in place)
```

## The map

`assets/united-front-planner.png` has **30 nodes**: a three-box red stack top-left, then the purple, teal and gold groups. The roster shipped here has 30 members, so a full board fills every node exactly.

## The roster

`Member.xlsx` sits in the repo next to `index.html` and the page reads it automatically on every visit — there's nothing to upload. To change the roster, replace that file and push; the next refresh picks it up (the fetch bypasses the cache, so you won't be stuck on an old copy).

The file shipped here is filler data. Overwrite it with your guild's real one, keeping the columns `ID`, `RTA Score`, `Rank`.

Filenames are case-sensitive on GitHub Pages. The page tries `Member.xlsx` then `member.xlsx`; if yours is spelled differently, add it to `ROSTER_FILES` at the top of `script.js`.

If the file can't be read, the header says so and offers a one-off file picker as a fallback.

## Running it

Opening `index.html` straight off your disk **won't work** any more — browsers block `fetch` on `file://`, so the roster can't load (and the PNG export is blocked for the same reason). Serve the folder instead:

```bash
cd united-front-planner
python3 -m http.server 8000
# then open http://localhost:8000
```

On GitHub Pages everything works with no caveats.

## Publishing to GitHub Pages

1. Create a repository and push these files to the root of the `main` branch (keep `assets/` alongside `index.html`).
2. Repo → **Settings** → **Pages**.
3. Under **Source**, choose **Deploy from a branch**; branch `main`, folder `/ (root)`. Save.
4. Wait ~1 minute, then open `https://<your-user>.github.io/<repo>/`.

All paths are relative and both CDN scripts are HTTPS, so it works from a subfolder URL too.

## Using it

1. The roster loads by itself. The first worksheet is read in-browser; it needs an `ID` column, and `RTA Score` / `Rank` are used if present. Header matching ignores case and spacing, so `rta score`, `RTA_Score` and `RTAScore` all match.
2. Members sort by **Rank ascending** — rank 1 at the top. Ties break on the higher RTA score. If there's no Rank column, the sheet order is kept.
3. **Assign**: drag a name onto a node, or tap the name then tap the node. On a touch screen, press and hold a name for a moment and it lifts off, then drag it where you want it.
4. **Move**: drag or tap the member onto a different node. Their old node clears.
5. **Swap**: drop an already-placed member onto an occupied node and the two trade places. Dropping an *unplaced* member onto an occupied node asks first.
6. **Unassign**: press the `×` on a node, drag the name back onto the roster panel, or focus a node and press Delete.
7. **Reset** clears the board (with confirmation). **Clear saved data** wipes the saved assignments from this browser and re-reads `Member.xlsx` straight away.
8. **Export image** downloads `holyship-united-front-planner.png` — the map plus the names, at double resolution, with no panels or buttons.

Assignments are saved to `localStorage` under each member's ID (key `etheria-uf-planner/v3`), so a refresh restores where you left off — and editing the spreadsheet's row order won't scramble the board. If you remove someone from the roster, their node simply frees up.

## If the map doesn't appear

The frame will say **Map image didn't load** and list the paths it tried. Work through these:

- Is the image actually in the repo? Open `https://<user>.github.io/<repo>/assets/united-front-planner.png` directly — a 404 means it never got pushed. `git status` in the folder will show if it's untracked or ignored.
- Does the name match **exactly**? GitHub Pages is case-sensitive even though Windows and macOS aren't, so `Assets/`, `United-Front-Planner.png`, or a stray `.PNG` will 404 on Pages while working fine on your laptop.
- Did the file get renamed on download? Browsers sometimes append ` (1)` or save it as `.jpg`.
- Different name on purpose? Add it to `MAP_IMAGES` at the top of `script.js` — the first path that loads wins.

The **Pick the image from this device** button gets you a working board immediately, but it's session-only and the PNG export won't work with it (a local file taints the canvas). Push the image to fix it properly.

## Adjusting the node positions

Everything lives in the `BOXES` array at the top of `script.js`:

```js
const BOXES = [
  { id: "box-01", x: 19.86, y: 1.43, w: 9.37, h: 5.19 },
  ...
];
```

`box-01` … `box-03` are the three red boxes on the top-left node; the rest run through the map roughly top to bottom.

`x`, `y`, `w`, `h` are **percentages of the image**, so the zones scale with the map at any screen size. Change `x`/`y` to move a zone, `w`/`h` to resize it, add a line to add a node, delete a line to remove one. Assignments pointing at a deleted id are discarded automatically.

Tick **Outline nodes** in the header to draw every zone over the map while you tune the numbers.

The 30 boxes shipped here were measured against the supplied 1601 × 982 map. If you swap in a different image, replace `assets/united-front-planner.png` (keep the filename, or update the `src` in `index.html`) and re-measure.

## Other things you might want to change

| What | Where |
|---|---|
| Name size on the map | `LABEL_SCALE` in `script.js` (fraction of map width) |
| Export resolution | `EXPORT_SCALE` in `script.js` (2 = double) |
| Export filename | `EXPORT_NAME` in `script.js` |
| Roster filename(s) | `ROSTER_FILES` in `script.js` |
| Map filename / location | `MAP_IMAGES` in `script.js` |
| Colours, fonts, spacing | the `:root` tokens at the top of `style.css` |

The map image itself is never modified — names are DOM overlays on screen, and are painted onto a fresh canvas at export time. Box colours stay exactly as they are in the artwork.
