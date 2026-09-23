# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file is the **map**: what the suite is, the rules that hold everywhere, where things live and how to check a change. The depth per tool is in `docs/` — **read `docs/<tool>.md` before you work on that tool** (table below); `docs/gedeeld.md` covers the shared scripts, the PDF drawing layer and the fixture-type recognition that several tools use.

## What this is

A suite of standalone HTML tools, in Dutch, for Distrilight's inside-sales staff: they field installers' questions and turn a project into documents — a rail layout with its bill of materials, an armaturenboek, product sheets, a comparison against a bestek. Every tool is one self-contained `.html` file in the repo root, opened straight from disk (`file://`) and mailed around as a saved project file.

| tool | file | what it does | read first |
|---|---|---|---|
| 3 fase rail | `index.html` | knowledge base for the Pragmalux PRX 3-Fase Rail plus the **Railconfigurator**: draw a track layout, get the full bill of materials and an installer PDF | `docs/railtool.md` |
| Armaturenboek | `armaturenboek.html` | pick the fixtures of a project and compose the book: cover, briefing, armaturenlijst, one presenter per fixture type | `docs/armaturenboek.md` |
| Presenters | `presenters.html` | a Pragmalux product sheet for a product family, from the product data | `docs/presenters.md` |
| DLC specials | `dlc.html` | a DLC product sheet for a fixture that is not in the product data, from pasted supplier text | `docs/dlc.md` |
| Bandrasters | `bandrasters.html` | per-position intake for grid-ceiling replacement: product sheet for the customer, RFQ for the manufacturer | `docs/bandrasters.md` |
| Vergelijking | `vergelijking.html` | per bestekpositie the reference fixture beside the Distrilight alternative, with a round past the manager; **generated** from `vergelijker/` | `docs/vergelijker.md` |
| (binnenkort) | `lichtlijn.html`, `intake.html`, `snoerenplan.html` | placeholders | — |

`index.html` is one tab of a small suite of standalone pages that share a header: a Distrilight logo plus a row of `.badge` links (`armaturenboek.html`, `presenters.html`, `dlc.html`, `vergelijking.html`, `index.html`, `bandrasters.html`, and the still-empty `lichtlijn.html` / `intake.html` / `snoerenplan.html`). Each page carries its own copy of that markup with `class="badge active"` on itself, so **adding a page means editing the badge row in every other page** — there is no shared include. A tool that does not exist yet carries `class="badge binnenkort"` (dimmed, dashed border, a tooltip — no label, because a label made the row too wide to sit beside the logo on a laptop and pushed the whole page down); `controleer-suite.mjs` treats that class as part of the row, and checks it against the page itself: a tab marked `binnenkort` must open a page that says "Binnenkort beschikbaar", and the other way round — so when one of those tools is built, remove the class in every page.

**House-style rule for the suite:** everything is Distrilight — the railconfigurator, the armaturenboek and the vergelijker all produce Distrilight documents — **except the presenters**, which are Pragmalux-branded because the fixtures are Pragmalux products. The presenters tool therefore has no theme switch: it calls `zetThema('pragmalux')` and embeds only the Pragmalux logo and heading font (`fonts:'pragmalux'`). `THEMAS` in `pdf-huisstijl.js` still carries both palettes, and `zetThema()` remains available, but nothing else calls it.

## Hard rules

- **`file://`, no build, no network, no npm in the app, no ES modules.** A module refuses to load from disk; `fetch()` of a local file is blocked too, which is why data, images and presenters are baked into `.js` files loaded with a plain `<script src>`.
- **Runtime files do not move or get renamed.** A saved project file carries a `<base href>` to the install folder and loads every `<script src>` by name from there, so moving `pdf-huisstijl.js` into a subfolder breaks every project file that has already been mailed around. That holds for every `.js`, `.css` and `.html` in the root and for `fonts/`, `merk/`, `presenters/` and `vendor/`. **Adding is fine, moving is not** — if it must, leave a stub at the old place.
- **The repo is public.** A raw price list (purchase prices, tiers, margins) never goes in. Exports always go through `vergelijker/knip-export.py` (three columns: artikelcode, merk, omschrijving) and you check first that no price column comes along; `.gitignore` keeps `.xlsx`/`.xls` out of `vergelijker/data/bron/`.
- **`vergelijking.html` is generated.** Change `vergelijker/index-template.html` (or the data) and run `python3 vergelijker/bouw-tool.py`; after a change to `vergelijker/data/armaturen.json` also `python3 vergelijker/bouw-armaturen-data.py`. `controleer-suite.mjs` fails when either generated file no longer matches its sources.
- **Never invent data.** A field the source does not state stays empty (“niet vermeld” is not “nee”), and an article number matches one-to-one or not at all — a near miss offered to inside sales is the wrong article quoted.
- **Git history is not rewritten** (it still holds a 42 MB `ag44.js` and a 10 MB `.docx`) unless the user explicitly asks: colleagues have clones, and a force-push on a shared public repo cannot be undone. Work goes to `main`; **`release`** is what the colleagues work from and is only updated when the user says so.

## Where things live

| path | what |
|---|---|
| `*.html` (root) | the tools, one file each |
| `suite-stijl.css`, `fonts/` | palette, badge row, focus ring; the screen fonts |
| `pdf-huisstijl.js` | the PDF drawing layer shared by the three PDF tools |
| `armatuur-groepen.js` | fixture types (`ARM_GROEPEN`) and their recognition (`matchArmGroep`) |
| `zoeken.js`, `spec-lezer.js`, `info-teken.js`, `melding.js`, `project-opslag.js` | shared search, paste-and-parse, info icon, notes, project save/restore |
| `presenters/`, `presenters-data.js` | the Pragmalux presenter PDFs as `.js`, and the list of which exist (generated by `tools/maak-presenters.mjs`) |
| `armaturen-data.js`, `armatuur-beelden.js`, `bandraster-beelden.js`, `rail-figuren.js` | baked data and images (generated — see the tool docs) |
| `merk/`, `vendor/` | brand assets (`merk-data.js`); `pdf-lib` and `fontkit` |
| `vergelijker/` | the vergelijker's sources: template, product data (`data/`), the Python data pipeline and its checks |
| `tools/` | check scripts and data-prep utilities (Node/Python on a dev machine, never loaded by the app) |
| `docs/` | the per-tool documentation and the design/verification documents |

## Working in this codebase

- There is no linter, formatter, or test runner configured, but there are **check scripts in `tools/` and `vergelijker/`, run together with `node tools/controleer-alles.mjs`** (add `--pdf` for the PDF regression against the last commit) — run them before and after a change (see `tools/LEESMIJ-pdf-controle.md`): `controleer-logica.mjs` (the calculating core: fixture-type recognition and the bandraster calculation against the workbook's own worked example), `controleer-suite.mjs` (what has to stay identical across files: the fixture table, the badge row, the palette, no network requests, shared scripts loaded where they're used), `controleer-presenters.mjs` (blank pages, size outliers, list and folder out of step) and the PDF regression check. The product data has two more, `vergelijker/controleer-families.py` and `vergelijker/controleer-data.py`. Each exits 1 on a finding. `controleer-logica.mjs` runs the tools' **real** code: it cuts the declarations it needs out of the HTML file and imports them as a module through a `data:` URL, so nothing about the tools has to change to make them testable and the test can't drift from a copy. Verify anything visual by opening the page in a browser as well.
- **The screen fonts live in the repo** (`fonts/`, with `fonts/schermfonts.css` as the one `<link>` every page carries). They used to come from `fonts.googleapis.com`, render-blocking in the `<head>`: with that host unreachable — a laptop with no connection, a saved project file opened elsewhere, a network that blocks Google — the browser sat out its full timeout first. Measured on `index.html`: **12.8 s** to the first content against **0.07 s** now, and the layout no longer falls back to a system font. Refresh or extend the set with `node tools/haal-schermfonts.mjs` (only the weights the tools actually use: Nunito Sans 400/600/700/800 and JetBrains Mono 500/600, subsets latin and latin-ext); a weight that isn't in that file gets stretched from the nearest one by the browser. Don't add a network `<link>` back — these tools are opened from disk and mailed around as saved project files.
- **`suite-stijl.css` carries what every tool shares**: the palette, the badge row and the focus ring. Each page used to keep its own copy — six chances to drift, and it had drifted: the vergelijker wore a different blue (#0E6FB0 against #3E8EDE), ink and orange. Load it *before* the page's own `<style>` so a tool can still override a rule. The vergelijker keeps its own variable names (`--line`, `--muted`, `--bg`) but takes their values from the shared tokens. Anything that concerns one tool only does not belong in that file; `node tools/controleer-suite.mjs` checks that it stays that way, and that every `var(--x)` without a fallback is actually defined somewhere.
- **`melding.js` replaces the blocking `alert()`** for anything that isn't a dead end: `Melding.goed/letop/fout(tekst, {bij})` drops a short note bottom-right, and `bij` focuses the field it is about and rings it in red while the note stands. What stays an alert: the tool cannot go on (saving failed, the PDF didn't come out) and the list of points before an export — you read that one on purpose before something goes to a customer. Saving a project now confirms itself, which it never did.
- **Ctrl+S saves the project** in all five project tools: `ProjectOpslag.koppel({bewaar})` binds it centrally, so the browser no longer offers to save the HTML page itself.
- Everything is vanilla JS/CSS — no frameworks, no npm dependencies, nothing loaded off the network at all. Keep it that way; don't introduce a build step or external libraries for a change that doesn't need one. **One deliberate exception:** `vendor/pdf-lib.min.js` (loaded via a local `<script src>`, not a CDN) draws the PDFs of the railtool, the armaturenboek and the vergelijker and merges the externally-supplied "presenter" PDFs into them at export time — see `docs/railtool.md` and `docs/gedeeld.md`. Don't remove it and don't add further dependencies without similarly strong justification.
- Measure before and after on the real data, and put the proof in a check script: a count with a lower bound that may only go up, or a concrete case. A check that cannot fail proves nothing — make it fail once on purpose.
