# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained HTML file (`index.html`) implementing an internal knowledge/sales tool ("Distrilight") for the Pragmalux **PRX 3-Fase Rail** lighting track system, in Dutch. It's aimed at inside-sales staff fielding questions from installers: wiring/polarity reference, parts catalog, mounting specs, troubleshooting guide, article lookup, and — the largest piece — an interactive **Railconfigurator** that lets a user draw a track layout and auto-derives the full bill of materials.

There is no build system, package manager, or test suite. Everything — HTML, CSS, and JS — lives in one `<style>` and one `<script>` block in `index.html`. Open the file directly in a browser to run/preview it; there is nothing to compile or install.

`DesignTool` (no extension) is a stale duplicate/backup of an earlier version of `index.html`, kept in the repo root. Don't treat it as a source file to edit — changes belong in `index.html`.

### The rest of the suite

`index.html` is one tab of a small suite of standalone pages that share a header: a Distrilight logo plus a row of `.badge` links (`armaturenboek.html`, `presenters.html`, `dlc.html`, `vergelijking.html`, `index.html`, `bandrasters.html`, and the still-empty `lichtlijn.html` / `intake.html` / `snoerenplan.html`). Each page carries its own copy of that markup with `class="badge active"` on itself, so **adding a page means editing the badge row in every other page** — there is no shared include.

`armaturenboek.html` is the **Armaturenboek** tool: pick the fixtures for a project and it composes the book — cover, an Armaturen chapter page, the armaturenlijst table, and one externally-supplied Pragmalux presenter per recognised type, spliced in by `assembleArmaturenboekPdf()`. Unlike `index.html` that splicing needs no page-index bookkeeping: every own page is copied first, then the presenters are appended, so inserting a page changes nothing else.

**Soort opdracht** decides the wording of the **briefing page "Introductie"**, which sits directly behind the cover in both cases. `st.soort` is `'lichtberekening'` (the default) or `'vergelijking'`; `briefInhoud()` returns that variant's text, and one renderer draws it. The lichtberekening promises a light design against NEN-EN 12464-1:2021 and carries no disclaimer; the vergelijking carries the four disclaimer paragraphs of `BRIEF_DISCLAIMER` instead, split into segments so the bold fragments survive line-breaking.

The page is a redrawing of the supplied design (`AB Briefing vergelijking.pdf`): the measurements in the `BRIEF` table were read out of that document rather than eyeballed. Every gap in `BRIEF.gaten` is the distance to the **top of the previous line**, which is how they were measured, so a block only has to name which gap precedes it. Three fields feed the text: the project name from the field that was already there, `st.documenten` (the bestek — used by both variants) and `st.tekeningen` (the technical drawings — lichtberekening only), each one name per line. Empty fields fall back to the design's own `[projectnaam]` / `[naam documenten]` / `[naam tekeningen]` placeholders, and both the panel and the pre-export alert warn when that is about to happen. The grey quote block grows if the document list needs more room, and "het document" becomes "de documenten" when there is more than one — otherwise the sentence does not run.

Three things about that page are worth knowing before changing it. `rijkeRegels()`/`tekenRegel()` are a small rich-text wrapper — words carry a bold flag and a word that follows without a space (the full stop after a bold project name) stays glued to it, so wrapping happens on real text width across the bold boundaries. The bullet is drawn as a circle, not typed: `pdfTxt()` does not know `•` and would render a question mark. And the page title goes through `paginaKop()`, which upper-cases — so it reads `INTRODUCTIE`, matching `ARMATURENLIJST` elsewhere in the same book rather than the supplied document's title case.

`presenters.html` is the **Presenters** tool: pick a product family and it composes a product sheet from the data — heading, an at-a-glance spec bar, sales text, images, a spec table and the assortment. Its live preview on the right is not an HTML mock-up of the sheet but **the real PDF** in an iframe, regenerated (debounced) on every change, so the preview cannot drift from the export. Settings are kept per family in `localStorage`.

The sheet carries the **Pragmalux** house style, not Distrilight's: every fixture in the data is a Pragmalux product. The layout follows the genuine Pragmalux presenters that are already in the repo (`presenters/ag14.js` is the one for the Essence G2 downlight, the same family the tool generates for) — a deep navy header block with the wordmark, the name set in two weights of Sofia Sans Extra Condensed (fixture type light, product line bold) over a thin rule, light table headers instead of a solid navy bar, and no grey diagonal footer shape (that one is Distrilight's). What the repo does **not** hold is Pragmalux's diamond pattern artwork (`merk/ruitpatroon.png` is Distrilight blue), their icon set (IP/IK/DALI/3CCT badges) or product photography, so the header block stays flat and images come from the user.

**House-style rule for the suite:** everything is Distrilight — the railconfigurator, the armaturenboek and the vergelijker all produce Distrilight documents — **except the presenters**, which are Pragmalux-branded because the fixtures are Pragmalux products. The presenters tool therefore has no theme switch: it calls `zetThema('pragmalux')` and embeds only the Pragmalux logo and heading font (`fonts:'pragmalux'`). `THEMAS` in `pdf-huisstijl.js` still carries both palettes, and `zetThema()` remains available, but nothing else calls it.

**Product photos** live in `armatuur-beelden.js` in the repo root (`window.ARMATUUR_BEELDEN`), as data URIs. They cannot be plain files in a folder: opened over `file://` the browser refuses to read a local image back out of a canvas (`SecurityError: Tainted canvases may not be exported`), so it never reaches the PDF — the same reason the presenters and the brand assets are baked into `.js` files. The presenters tool writes that file itself: add photos in its "Productfoto's" card and press **Beeldbestand opslaan**, then drop the download in the repo root. Keys are matched from specific to general — `artikelcode`, `basiscode`, `<familie-id>--<uitvoering>--<kleur>`, `<familie-id>--<kleur>`, `<familie-id>` — so one photo per visually distinct variant covers a whole series (the Essence G2's 72 articles need six, plus one for the series as a whole).

It reads `armaturen-data.js` in the repo root — the same product data the vergelijker uses, wrapped as `window.ARMATUREN_DATA` because `fetch()` is blocked over `file://` and this page, unlike `vergelijking.html`, is not generated. Regenerate it with `python3 vergelijker/bouw-armaturen-data.py` after every change to `vergelijker/data/armaturen.json`; the file is committed.

What the tool can fill in by itself is limited by the data: there are no prices, no product photography and no accessories in `armaturen.json`, so images and sales copy are supplied by the user (paste with Ctrl+V or pick a file) and prices are left out entirely. The spec catalogue is the `SPECS` table in the page; numeric fields (`reeks`) are summarised into one range across the selected variants — a family with 6, 9, 15 and 21 W reads "6-21W", not four separate values.

`dlc.html` is the **DLC specials** tool: paste a supplier's specification text for a fixture that is *not* in the product data, add photos, and it produces a DLC product sheet. Unlike the rest of the suite this one carries the **DLC** house style, taken from the supplied design (`DLC Productblad.indd`, example Norma Track) — a black header band with the DLC wordmark, Poppins for the headings and Helvetica for the tables. Every measurement in the `M` table at the top of `bouwBlad()` was read out of that PDF rather than eyeballed, and `y` there is a **baseline**, not a box top (`tekst()` converts) — that is what keeps the measured numbers usable as-is.

The header band is a JPEG lifted from the supplied PDF and baked in as `merk/dlc-kopbalk.jpg` → `MERK_BEELDEN.dlcKopbalk`. The catalogue is the fifty fields the suppliers we buy from actually publish, in six groups — the four of the supplied design plus `Algemeen` (brand, category, EAN, packaging, lamp holder) and `Sensoren`. **A field with no value is left off the sheet, and a group whose fields are all empty disappears with its heading**, so a sparse special still comes out looking like the reference. Field groups are fixed (that is what makes the sheet recognisable); within a group fields can be emptied, renamed or added. **An empty field is left off the sheet, and a group whose fields are all empty disappears with its heading.** A special is a one-off, so "Special opslaan" saves it the same way `armaturenboek.html`/`index.html`/`vergelijking.html` save a project: it bakes the current state into a self-contained copy of `dlc.html` itself (`slaSpecialOp()`), which reopens fully filled in when double-clicked — there is no separate "Openen" button or JSON file.

`bandrasters.html` is the **Bandrasters** tool: a per-position intake for bandraster (grid-ceiling) replacement projects — the existing fixture on the left, the Distrilight alternative on the right — that yields two deliverables, a **technical product sheet** for the customer and an **RFQ list** for the manufacturer who has to build the alternatives.

It replaces `Bandraster_Intake_Nieuw_V3.xlsx`. Everything that lived on that workbook's hidden `Datasheet` sheet (the dropdown lists, the lumen table per TL tube × CRI/colour temperature, the optic efficiencies) is now the data tables at the top of the script; the `Formulier` formulas are the calculation layer, and the English `Bestelformulier` columns are the RFQ. The workbook had three fixed intake sheets; here the number of positions is free. Three things deliberately differ from it, each with a comment saying why: **5000K is not offered** (the lumen table only has columns for 2700/3000/4000/6500K per CRI, so 5000K always ran into "Gegevens Ontbreken"); the control/connector dependency is keyed on an explicit `groep` field rather than on the spelling of the control name (the workbook's list said `Aan-uit` while its formulas tested `Aan-Uit`, leaving the connector list empty for two of the five controls); and the RFQ carries the **alternative's** housing colour, where `Bestelformulier!P21` pointed at the existing fixture's.

The calculation is the workbook's, verified against its worked example (project 7633: 1× TL5-35W behind Prisma at 4000K/80+ → 2230 lm existing, 16 W and 2130 lm for a microprismatic alternative): existing lumen = tubes × lumen(tube, CRI+colour temp) × old optic efficiency; then wattage = `floor(lm / new optic efficiency / efficacy)` capped at a maximum, and new lumen = W × efficacy × new optic efficiency. Efficacy (140 lm/W) and the cap (60 W) are **project settings**, not constants, so the tool can move with a better LED generation without a code change.

The right-hand column mirrors the left until you overrule a field — `volgt[id] === false` marks it loose, `rechts()` is the single place that resolves which value applies, and a `↺` button re-couples it. A connector that does not exist in the list belonging to the chosen control counts as *not filled in* rather than being silently cleared, so it cannot slip into the RFQ after a control change or after reopening an older project.

The **product sheet** carries the **DLC** house style (same `M` measurement table as `dlc.html`, same baseline convention) but with field groups of its own — Algemeen, Afmetingen, Lichttechniek, Elektrisch, Vervangt, Project. Empty fields and empty groups drop out, as in `dlc.html`. Instead of a photo it carries a **generated dimension drawing**: two blocks in each other (the housing's l×b×h and the light aperture's l×b), as a top view and a side elevation with dimension lines. `figuurVormen()` computes the shapes once and `figuurSvg()` / `figuurPdf()` render the same list on screen and in the PDF, so the preview cannot drift from the sheet. Dimension arrows flip to the outside when a span is too short to hold them. Which base product a position is built on (`Optic bandraster`, `Flexcore bandraster`, or a typed-in one) is a field; the exact sheet layout is still being worked out.

The **RFQ list** is Distrilight-branded and English, in two forms: a `.xlsx` with the `Bestelformulier` columns for the manufacturer to price, and a PDF (cover-less: header block, summary table, then a spec block per position). `Product Code` and `Unit Price` are editable in the tool as well as in the exported sheet. The `.xlsx` is written by hand — `zipMaak()` builds a store-only (uncompressed) zip so a CRC32 is all the machinery needed, and cells use inline strings so there is no shared-string table. **Don't add a spreadsheet library for this**; the file is one sheet without formulas.

"Project opslaan" uses the same self-baking pattern as `dlc.html`/`armaturenboek.html`: state is baked into a copy of `bandrasters.html` that reopens filled in.

What the tool does **not** carry yet: the 22 in-cell images in the workbook (optic renders and connector photos, resolvable from `xl/richData`) are not baked in — they would be a ~2 MB `bandraster-beelden.js` alongside `armatuur-beelden.js`, for when the sheet layout is settled.

`vergelijking.html` is the **Armatuurvergelijker**: per bestekpositie it puts the installer's reference fixture next to the Distrilight alternative. Unlike the rest of the suite it is *generated*, so don't edit it by hand — the sources live in `vergelijker/` (see `vergelijker/README.md`):

- `vergelijker/index-template.html` — the tool itself; this is what you change.
- `vergelijker/data/armaturen.json` — the product data, injected into the template at the `/*__ARMATUREN_DATA__*/ null` placeholder.
- `python3 vergelijker/bouw-tool.py` regenerates `vergelijking.html` from those two. `bouw-data.py` only needs re-running when new Excel price-list exports land in the gitignored `vergelijker/data/bron/`; `armaturen.json` is committed, so the tool can be rebuilt without them.

**`spec-lezer.js`** holds the paste-and-parse machinery shared by the vergelijker and the DLC tool (`SpecLezer.maak({veldmap, sectie, kop, eenheidUitLabel})` → `lees(tekst)` → `{uit, herkend, onbekend}`). It handles `Label: waarde`, a label with its value on the next line, `Groep: Label: waarde` from bestekteksten, comma-separated one-liners, HTML entities, and units carried in the label. It never guesses: anything it cannot place lands in `onbekend` so the tool can show it. A second pass, `vrijeTekst`, handles suppliers who send a sales paragraph instead of a table ("… Vijf jaar garantie. 13w 4000k 1900lm; lengte 600mm; Diameter 60; 0,5kg ; DALI"): there the **unit is the anchor**, not the label — `lm` can only be luminous flux, `kg` only weight — so a bare number without a unit is deliberately left alone rather than guessed at. It only fills fields the first pass did not, and when it finds something the prose lines are dropped from `onbekend` (a sales text is expected to be prose; only lines with a colon are a visible attempt at a label). `eenheidUitLabel:false` switches off the unit-append rule for sheets whose labels already carry the unit.

Like everything else here it stays a single self-contained file that runs from `file://` — the Python scripts are data prep, not a build step for the suite.

`vergelijking.html` also generates its own PDF ("PDF-voorbeeld" in the top bar), in the order: cover → one page per bestekpositie → ARMATUREN divider → presenter per used family → `achterpaginas`. It reuses the house-style measurements of the installer PDF described below — the cover, the ARMATUREN divider page, the blue header band with `ruitpatroon`, the grey diagonal footer shape — and since the `pdf-huisstijl.js` refactor it draws with that same shared layer (see "Drawing layer" below); only the page composition is its own. Which presenter belongs to a family is a `presenter` field (an `ag..` id) in `vergelijker/data/families.json`, not name-matching as in `index.html`. It lazy-loads `vendor/pdf-lib.min.js`, `vendor/fontkit.umd.min.js`, `merk/merk-data.js` and `presenters-data.js` on first use, so opening the tool stays fast.

## Working in this codebase

- There is no linter, formatter, or test runner configured. Verify changes by opening `index.html` in a browser and exercising the relevant tab manually.
- Everything is vanilla JS/CSS — no frameworks, no npm dependencies, no CDN scripts except Google Fonts. Keep it that way; don't introduce a build step or external libraries for a change that doesn't need one. **One deliberate exception:** `vendor/pdf-lib.min.js` (loaded via a local `<script src>`, not a CDN) is used solely to merge externally-supplied "presenter" PDFs into the generated installation-overview PDF at export time — see below. Don't remove it and don't add further dependencies without similarly strong justification.
- The file is large (~2550 lines). Use the `<!-- ===== SECTION ===== -->` HTML comments and the `/* =================== NAME =================== */` JS comments to jump to the right area rather than reading linearly.
- PDF export (`buildPdf`, in `index.html`) draws its pages with `vendor/pdf-lib.min.js`, through the shared drawing layer in `pdf-huisstijl.js` — it used to write raw PDF operators by hand, and before that kept its own copy of the drawing code; both are gone. `buildPdf` is `async` and returns real pdf-lib bytes. `pdfTxt()` only transliterates Dutch/special characters now (pdf-lib handles escaping/encoding); extend it if you add new characters rather than assuming UTF-8 works. See "The exported PDF" below.

## The exported PDF

The installer PDF has two halves: the installation overview (drawing + order data, generated here) and the **armaturenboek** (externally-supplied "presenter" PDFs for the chosen fixtures, spliced in). Final page order:

```
Bestelgegevens → rail presenter → Montage + tekenvlakken
→ Armaturenboek index → per type: tabbladpagina + that type's presenter
```

`buildPdf()` returns `{bytes, bgPageCount, bookStart, bookIndexEnd, bookGroups, ownPageCount}`. Those are page-index checkpoints for `assembleFinalPdf()`, which does the splicing: `bgPageCount` = end of Bestelgegevens (rail presenter goes here), `bookStart` = first armaturenboek page, `bookIndexEnd` = end of the index, and `bookGroups` lists the group ids in book order — divider page `bookIndexEnd + i` is followed by presenter `bookGroups[i]`. If you add or reorder pages in `buildPdf`, keep these checkpoints in sync or the presenters land in the wrong place.

`assembleFinalPdf()` loads every needed presenter **first**, because the footer's page number has to account for pages that get spliced in later: it passes `presenterPages` (`{id: pageCount}`) into `buildPdf`, which keeps a running `extra` offset, bumped at each splice point. It then runs `buildPdf` **twice** — once to count, once to render with `"pagina X van Y"` — which is safe because `buildPdf` only reads state. A mismatch between predicted and actual page count logs a console warning. The loaded presenter documents are reused for the merge, not parsed twice.

### Drawing layer

The drawing layer lives in **`pdf-huisstijl.js`** and is shared by all three PDF-producing tools (`index.html`, `armaturenboek.html`, and the vergelijker template). It used to be copy-pasted into each of them. Anything that has no knowledge of what goes on the page belongs here: the primitives, the house-style colours and fonts, and the fixed page furniture (cover, blue header band, grey diagonal footer, table layout). Composing the pages stays with each tool.

It is a plain `<script src="pdf-huisstijl.js">`, not an ES module — modules refuse to load over `file://`, which is how these tools are normally opened. The file is small and holds no image or font data, so loading it up front costs nothing; the heavy files (pdf-lib, `merk-data.js`, the presenters) still load on demand.

`PdfHuisstijl.tekenaar(doc, opt)` builds the layer for one document. The tool passes `haalY/zetY/haalPg/zetPg` so that `y` and `pg` stay its own variables — that is what lets the page code keep writing plain `y += 12` while `beginPage()` and `need()` move the write position. `opt.fonts` picks `'volledig'` (both heading fonts, for documents that carry the Pragmalux house style too) or `'distrilight'`; `opt.logos` and `opt.beelden` say which brand assets to embed. `omslag(project)` wants `project.datum` as ready-made text — the tools format dates differently.

All page content goes through `text/line/rect/circle/poly/dots`. They take **y from the top** of the page and convert to pdf-lib's bottom-left origin internally — keep that convention if you add primitives. `text()` uses real font metrics (`widthOfTextAtSize`) for centre/right alignment, and `pushOperators` for character squeeze (condensed caps) and letter spacing, which pdf-lib's `drawText` doesn't expose. Colours accept `'#RRGGBB'` or legacy `'r g b'` (0–1) strings via `col()`. Two wrap helpers exist and are not interchangeable: `wrapBreedte()` breaks on real text width, `wrapTekens()` on a character count.

There is no test runner, so **before and after changing anything in this layer, run the regression check in `tools/`** — it makes each tool produce a PDF in a headless browser and compares them on content rather than bytes. See `tools/LEESMIJ-pdf-controle.md`.

Only the 14 standard PDF fonts are available; embedding a brand font needs `@pdf-lib/fontkit` vendored alongside pdf-lib. Raster logos (PNG/JPEG) work today via `doc.embedPng` / `embedJpg` — no extra dependency.

### Preview

`maakPdfBytes()` is the shared path (validation → warnings → bytes) behind both `exportPdf()` (downloads) and `previewPdf()` (shows the PDF in an in-page overlay, `#pdfPreviewBg`, via a blob URL in an iframe). `sluitVoorbeeld()` revokes that URL — don't drop it, the blobs are multi-MB.

### Fixture types and their presenters

A presenter belongs to a fixture **type**, not a variant: colour, wattage, light colour and dim protocol all share one presenter, and rows of the same type merge into a single chapter (`armaturenboek()` groups them). Types are `ARM_GROEPEN`; each has one presenter keyed by its id (`ag01`…`ag12`, plus `rail`).

`matchArmGroep()` recognises the type from the free-text fixture name by token matching: it strips noise (colours, wattages, article codes — `ARM_STOPWOORDEN` / `ARM_GETAL` / `ARM_CODE`), then scores each group's name and `zoektermen`, requiring the distinctive first word and refusing ambiguous ties. So "Punto 15W zwart 3000K" resolves to Punto. Words appearing in any group name are never stripped as noise (that's what keeps "GU10" alive). Each row also has a dropdown to override the detection explicitly, or set "Geen presenter"; `armGroepVan()` applies that precedence. `exportPdf()` warns (but still proceeds) about rows with a qty but no type, and about types whose presenter file is missing.

### Adding presenter PDFs

Presenters are large (~2 MB each), so they load **on demand at export time**, not at startup — `presenters/<id>.js` per presenter, listed in `window.PRESENTER_FILES` (`presenters-data.js`) so availability is known without downloading. `presenterData()` fetches via a dynamically injected `<script>` (works over `file://`, unlike `fetch`); `presenterAanwezig()` is the sync availability check. Inlining a blob directly in `window.PRESENTER_DATA` still works and takes precedence, but is loaded eagerly.

Don't hand-encode these. Drop the PDFs in `presenters-bron/` named by group id or name (`ag01.pdf`, `Punto.pdf`, `rail.pdf`) and run `node tools/maak-presenters.mjs`, which regenerates `presenters/` and `presenters-data.js`. That script is a data-prep utility, not a build step — the app still runs by opening `index.html` directly. `presenters-bron/` is gitignored; the generated `presenters/*.js` is committed. Keep the `GROEPEN` table in that script in sync with `ARM_GROEPEN`.

Presenter PDFs are typically 0.5–4+ MB each of high-resolution product photography, and `assembleFinalPdf()` always includes `rail` + `achterpaginas` plus one presenter per used fixture type — a project with several types can easily push the downloaded PDF past a mailable size. `pdf-lib` can't downsample images already embedded in a copied page, so any size reduction has to happen on the source PDF before baking. Run `node tools/comprimeer-presenters.mjs` (needs Ghostscript on PATH — `winget install --id ArtifexSoftware.Ghostscript -e` or `choco install ghostscript`) before `maak-presenters.mjs` when adding or replacing a presenter; it recompresses images in `presenters-bron/*.pdf` in place (keeping a pristine copy in `presenters-bron/origineel/`) and reports the size saved per file.

## Structure of `index.html`

**`<style>` (lines ~9–449):** CSS custom properties define the navy/blue Pragmalux theme (`--navy-900`, `--blue`, etc.) at `:root`. All component styling lives here as plain CSS (`.card`, `.wtab`, `.c2-*` for the configurator, etc.) — no CSS modules/scoping, so class names must stay unique by convention.

**`<body>` (lines ~451–820):** One `<header>` with tab nav (`#tabnav`) and one `<main>` containing a `<section>` per tab, toggled via `.active` class (see Tab Navigation JS). Sections, in DOM/tab order:
- `#overzicht` — product overview
- `#aansluiting` — the three wiring configurations (A/B/C) and the polarity explainer
- `#onderdelen` — searchable parts catalog (cards, click to open modal with article numbers)
- `#montage` — mounting hole spacing and load-capacity tables
- `#troubleshooting` — expandable Q&A cards
- `#zoeker` — full flat article-number lookup table
- `#configurator` — the Railconfigurator (see below); default active tab

**`<script>` (lines ~845–3085):** See below.

## The Railconfigurator (the core feature)

Defined in the second half of the script inside an IIFE (`/* ---------- CONFIGURATOR V2 ---------- */`, from ~line 1132). This is a small CAD-like tool: the user draws a top-down floor-plan shape (drag endpoints, add segments, pick a power feed point), and the tool derives every downstream detail deterministically. **Read `railconfigurator-logica.docx` before changing any of the derivation logic** — it's the design/verification doc for this feature and documents rules that are *not* obvious from the code alone.

The pipeline runs in four layers, each consuming the previous layer's output:

1. **Drawing** — a graph of `st.nodes` (points, in cm, grouped by `sheet`/`s` for multiple independent figures) and `st.edges` (straight segments between two nodes). Built/edited via `SHAPES` presets (`rechte-lijn`, `l-vorm`, `t-vorm`, `u-vorm`, `h-vorm`, grid-based `rechthoek`/`8-vorm`/`88-vorm`, or free `andere-vorm`) and free-hand editing on the SVG canvas (`renderCanvas`, `bindCanvas`).
2. **Topology** (`nodeType`) — purely geometric: how many edges meet at a node determines the part: 1 edge = Aansluitstuk (feed point) or Eindkap (end cap), 2 edges at a right angle = 90° Bocht, 3 = T-Koppelstuk, 4 = Kruis, or Middenvoeding if the user picks a point mid-edge as the feed.
3. **Polarity** (`propagate`) — from the chosen feed point, a "line side" (which physical side of the profile the red polarity line runs on) is propagated outward through the graph. This mechanically determines each node's exact variant (e.g. Bocht Binnen vs. Buiten, T Rechts/Links × Type 1/2). A loop that returns a conflicting side on an already-assigned segment is flagged as "Niet compatibel" (`validateFeeds`). The T-piece Rechts/Links/Type1/Type2 → article-number mapping was verified 2026-07-17 against `verificatievel-t-koppelstukken.docx` — see the `Geverifieerd 17-7-2026` comments near `nodeVariants` and the `tkoppel` entries in `LCODES`.
4. **Bill of materials** (`computeBOM`, `railFor`) — each drawn segment length (whole meters) is split into deliverable rail lengths with priority 3 m → 2 m → 1 m (4 m only if the "ook 4m" option is checked), with an electrical coupler (`elkoppel`) per seam. The *drawn* length is the orderable rail length; real-world installed length additionally includes the visible mounting depth of the parts at each end (`MM` constants, e.g. Aansluitstuk 66 mm, T-steel 66 mm, Kruis 50 mm/arm) — shown separately in the parts list for on-site measuring. Mounting-point count (`computeMounts`) follows the rule verified in `verificatievel-montagepunten.docx`: one point per whole meter along each segment including both ends, with corner/T/cross points shared (not doubled).

Other things worth knowing before editing this section:

- **Two unrelated, identically-named data structures**: the top-level `parts` array (used by the Onderdelen/Artikelzoeker tabs) has per-part `LCODES:[...]` fields holding standard Pragmalux article numbers (e.g. `2000766`). Inside the configurator IIFE, a *different*, module-scoped `const LCODES = {...}` holds a distributor-specific code scheme (e.g. `KKT301158`) actually used to build the configurator's BOM. A third table, `PCODES`, defines Pragmalux-style numbers for the same configurator parts but **is currently unused dead code**. When grepping for "LCODES" or wiring up article numbers, check which of these three you actually landed in.
- State lives in a single `st` object (color, power config, shape, nodes/edges/feeds, adapters, mount type, etc.) plus `hist`/`hIdx` for undo/redo (`snap`/`restore`, JSON-cloned). There's one global mutable `view` for pan/zoom. No reactive framework — every mutation is followed by an explicit `refresh()` call that recomputes and re-renders.
- `refresh()` is the central re-render entrypoint: recomputes propagation/BOM and rewrites the canvas, sheets bar, warnings, summary panel, and step UI. If you add new state, make sure it's covered by `refresh()`, `snap()`/`restore()`, and `c2ResetAll`'s reset list.
- The 5-step wizard (`Kleur → Voeding → Vorm → Tekening & maten → Stuklijst`) is UI sequencing only (`goStep`, `c2Steps`); none of the derivation logic is step-gated.

## Product domain notes (for correctness, not just code structure)

- Wiring configurations A/B/C (tab `#aansluiting`) are: **A** = 1-phase, 3 circuits sharing one phase (combined N ≤ 16A); **B** = 3-phase, 3 independent circuits one per phase (each phase ≤ 16A); **C** = 3-phase "3-phase adapters" that each pick their own phase on what looks like one continuous run (1.1 kVA, lower because it's one adapter's current per phase, not three parallel circuits).
- The rail has 4 conductors (L1, L2, L3, N) + earth, plus a physical **polarity rib** on one side of the profile that keeps the phase order consistent as pieces are joined (`#polaritySvg`). Every joinable part exists in Left/Right (and, for T-pieces, Type 1/2) mirror variants for exactly this reason.
- Recommended mounting spacing is 1000 mm (max 5 kg/point); at 2000 mm spacing with intermediate points every 100–200 mm, capacity drops to 1 kg/point.
