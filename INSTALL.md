# Defence Team + Opponent Team tabs — install

Copy these over your repo, keeping the same folder layout:

```
index.html                      (replaces yours — Attack Team removed, Opponent Team added)
js/config.js                    (replaces yours — `attack` block removed, `opponent` block added)
js/app.js                       (replaces yours — routes #/opponent instead of #/attack)
js/defence.js                   (replaces yours — now drives Defence Team + Opponent Team)
css/styles.css                  (replaces yours — #view-attack rules now #view-opponent)
data/opponent_team.xlsx         (new — the opponent's defence stats)
```

Then **delete `data/atk_stat.xlsx`** from the repo — nothing reads it any more.

`css/planner.css`, `js/data.js`, `js/charts.js`, `js/planner.js`,
`scripts/build-manifest.mjs` and `scripts/extract-animus.mjs` are untouched —
keep your copies. `assets/animus/` is unchanged too; both tabs share it.

---

## Opponent Team tab

Sits right after Defence Team in the nav. Same board, reading
`data/opponent_team.xlsx`:

| Sheet           | Columns                                          |
|-----------------|--------------------------------------------------|
| `Animus`        | `Animus`, `Profile`                              |
| `Opponent_Team` | `Data`, `Team_name`, `Server`                    |
| `W019`, `W020`… | `Animus_A`, `Animus_B`, `Animus_C`, `Def_Win`    |

The `Opponent_Team` sheet names who you faced each week. The tab title follows
the week picked in the dropdown:

- **One week** -> "Strongest defence teams of 火 Gokai", eyebrow "Opponent · Global"
- **Overall** -> the opponent's name if every week was against the same guild,
  otherwise "Strongest defence teams of all opponents"

The dropdown shows each week with its opponent: `W019 · 火 Gokai`.

Weeks are matched by number, so a `W19` row still names the `W019` sheet. If
the `Opponent_Team` sheet is missing, the tab still works and just shows the
plain title.

### Adding a week

1. Add a `W020` sheet with the opponent's teams and `Def_Win`.
2. Add a row to `Opponent_Team`: `W020 | <their name> | <server>`.
3. Push. Nothing else to change.

---

## Recommended: shrink the workbook

`opponent_team.xlsx` is about 5 MB because the `Animus` sheet carries the in-cell
Profile pictures. The tab never reads them — portraits come from
`assets/animus/` — so you can delete the `Profile` column from the `Animus`
sheet (keep the `Animus` names column) and the file drops to a few KB.

If an opponent uses an Animus that isn't in `assets/animus/` yet, add it to the
`Animus` sheet of `data/def_stat.xlsx` with its picture and re-run
`node scripts/extract-animus.mjs`. Until then that slot shows the Animus's
initials.

---

## Notes

- Paths are relative to `index.html`, so it works under a GitHub Pages project
  URL such as `https://user.github.io/etheria-restart/`.
- GitHub Pages is case-sensitive: the file must be `data/opponent_team.xlsx`
  (the tab also tries `Opponent_team.xlsx` and `Opponent_Team.xlsx`).
- Script tags carry `?v=20261011`, so browsers pick up the new JS without a hard
  refresh. Old `#/attack` bookmarks just land on the default tab.
