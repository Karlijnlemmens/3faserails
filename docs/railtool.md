# Railtool — `index.html`

> Part of the Distrilight tools suite — start from `CLAUDE.md` in the repo root, which
> holds the hard rules, the map of the repo and how to check a change. This file is
> the depth for one tool: read it before you change `index.html`.

## What it is

A single self-contained HTML file (`index.html`) implementing an internal knowledge/sales tool ("Distrilight") for the Pragmalux **PRX 3-Fase Rail** lighting track system, in Dutch. It's aimed at inside-sales staff fielding questions from installers: wiring/polarity reference, parts catalog, mounting specs, troubleshooting guide, article lookup, and — the largest piece — an interactive **Railconfigurator** that lets a user draw a track layout and auto-derives the full bill of materials.

There is no build system or package manager. The tool's own HTML, CSS, and JS live in one `<style>` and one inline `<script>` block in `index.html`, next to the shared scripts it loads with a plain `<script src>` (see `docs/gedeeld.md`). Open the file directly in a browser to run/preview it; there is nothing to compile or install.

## Structure of `index.html`

**`<style>` (lines ~13–510):** CSS custom properties define the navy/blue Pragmalux theme (`--navy-900`, `--blue`, etc.) at `:root`. All component styling lives here as plain CSS (`.card`, `.wtab`, `.c2-*` for the configurator, etc.) — no CSS modules/scoping, so class names must stay unique by convention.

**`<body>` (lines ~512–942, the `<main>` at ~547–923):** One `<header>` with tab nav (`#tabnav`) and one `<main>` containing a `<section>` per tab, toggled via `.active` class (see Tab Navigation JS). Sections, in DOM/tab order:
- `#overzicht` — product overview
- `#aansluiting` — the three wiring configurations (A/B/C) and the polarity explainer
- `#onderdelen` — searchable parts catalog (cards, click to open modal with article numbers)
- `#montage` — mounting hole spacing and load-capacity tables
- `#troubleshooting` — expandable Q&A cards
- `#zoeker` — full flat article-number lookup table
- `#configurator` — the Railconfigurator (see below); default active tab

The **Onderdelen** and **Artikelzoeker** searches go word by word in any order through `tekstPast()` (“rail wit” and “wit rail” used to find nothing, because the whole input was searched as one piece of text), with `RAIL_SYNONIEMEN` as the one place for trade words (`t-stuk` → T-koppelstuk, `eindstuk` → eindkap, `stekker` → Schuko, English colour names). Onderdelen also searches every article number and variant of a part (`onderdeelTekst()`), so `2000766` finds the Rail card. The Artikelzoeker filters on the beginning of an article number while you type — it is a table that narrows, not a choice that points at an article, so the vergelijker's one-to-one rule does not apply there; a number still never matches from the middle.

**`<script>` (lines ~943–3615):** See below.

## Working in `index.html`

- The file is large (~3600 lines). Use the `<!-- ===== SECTION ===== -->` HTML comments and the `/* =================== NAME =================== */` JS comments to jump to the right area rather than reading linearly.
- PDF export (`buildPdf`, in `index.html`) draws its pages with `vendor/pdf-lib.min.js`, through the shared drawing layer in `pdf-huisstijl.js` — it used to write raw PDF operators by hand, and before that kept its own copy of the drawing code; both are gone. `buildPdf` is `async` and returns real pdf-lib bytes. `pdfTxt()` only transliterates Dutch/special characters now (pdf-lib handles escaping/encoding); extend it if you add new characters rather than assuming UTF-8 works — anything above character code 255 becomes a literal `?` on the page, which is how `≤`/`≥` (`UGR ≤19`, `Ra ≥80`, `SDCM ≤3`) used to print before they were added. See "The exported PDF" below.

## The exported PDF

The installer PDF has two halves: the installation overview (drawing + order data, generated here) and the **armaturenboek** (externally-supplied "presenter" PDFs for the chosen fixtures, spliced in). Final page order:

```
voorblad → Bestelgegevens → Installatieoverzicht (drawing + parts per tekenvlak)
→ hoofdstukblad Armaturen → Armaturenlijst (optional)
→ rail presenter → one presenter per fixture type → achterpaginas
```

`buildPdf()` draws every own page and returns `{bytes, bookGroups, ownPageCount}`; `assembleFinalPdf()` copies all own pages first and then appends the presenters, so no page index has to be corrected for pages spliced in between. `bookGroups` lists the presenters in book order, each with the codes to stamp on it; a mismatch between the expected and the actual page count logs a console warning.

**The armaturenboek part works exactly like `armaturenboek.html`**, because both use `armatuur-rij.js` (see `docs/gedeeld.md`): which presenter a row gets (an uploaded PDF on any row wins, then a manual choice such as the Mondial choice in the label, then the name), the upload button for a type the tool does not know, the stamp in two styles at the measured spot, the ↑/↓ arrows, and the armaturenlijst with the armaturenboek's columns (Code, Artikelcode, Omschrijving, Aantal; Code drops when no row has one) in the order of the rows. The list is optional (`st.toonLijst`, the "Armaturenlijst in de PDF" tick under the fixtures); only that page drops. Rows without a presenter stay in the list and are warned about before the PDF is made, not in the document itself. **An introduction page with the contact persons** comes directly after the cover when at least one is chosen (three selects under the project data, `st.projectuitwerker` / `st.accountmanager` / `st.binnendienst`): "Contactgegevens" and, for a projectuitwerker with a personal note, "Onze specialist" — the same block as under the armaturenboek's briefing, drawn by the same `tekenContactpersonen()` from `contactpersonen.js`, starting where the armaturenboek puts "Briefing" (`CONTACT.boven`). The railtool has no briefing text, so the page carries only those two blocks; with nobody chosen there is no extra page and the PDF is exactly what it was. The page sets the section name to Introductie and puts it back to Installatieoverzicht afterwards, because a continuation page takes the last section name into its header. "Alles wissen" empties the three choices. `herstelProject()` now rebuilds the fixture rows, the adapters, the contact selects and the DALI buttons: "Verder waar je gebleven was" used to leave the fixture rows empty on screen, and whatever was typed into them afterwards went into a stale copy and was lost (measured before fixing). Two things are the railtool's own: a row only counts with a quantity above zero (the same rows feed Bestelgegevens), and the DALI code beside the standard one — which is why `verplaatsArmRij()` will not move a row with a DALI code past the five DALI slots (arm01–arm05), where that code would disappear from view in DALI mode.

### Preview

`maakPdfBytes()` is the shared path (validation → warnings → bytes) behind both `exportPdf()` (downloads) and `previewPdf()` (shows the PDF in an in-page overlay, `#pdfPreviewBg`, via a blob URL in an iframe). `sluitVoorbeeld()` revokes that URL — don't drop it, the blobs are multi-MB.

## The Railconfigurator (the core feature)

Defined in the second half of the script inside an IIFE (`/* =================== RAILCONFIGURATOR =================== */`, from ~line 1281; `CONFIGURATOR V2` is the matching block in the `<style>`). This is a small CAD-like tool: the user draws a top-down floor-plan shape (drag endpoints, add segments, pick a power feed point), and the tool derives every downstream detail deterministically. **Read `docs/verificatie/railconfigurator-logica.docx` before changing any of the derivation logic** — it's the design/verification doc for this feature and documents rules that are *not* obvious from the code alone.

The pipeline runs in four layers, each consuming the previous layer's output:

1. **Drawing** — a graph of `st.nodes` (points, in cm, grouped by `sheet`/`s` for multiple independent figures) and `st.edges` (straight segments between two nodes). Built/edited via `SHAPES` presets (`rechte-lijn`, `l-vorm`, `t-vorm`, `u-vorm`, `h-vorm`, grid-based `rechthoek`/`8-vorm`/`88-vorm`, or free `andere-vorm`) and free-hand editing on the SVG canvas (`renderCanvas`, `bindCanvas`).
2. **Topology** (`nodeType`) — purely geometric: how many edges meet at a node determines the part: 1 edge = Aansluitstuk (feed point) or Eindkap (end cap), 2 edges at a right angle = 90° Bocht, 3 = T-Koppelstuk, 4 = Kruis, or Middenvoeding if the user picks a point mid-edge as the feed.
3. **Polarity** (`propagate`) — from the chosen feed point, a "line side" (which physical side of the profile the red polarity line runs on) is propagated outward through the graph. This mechanically determines each node's exact variant (e.g. Bocht Binnen vs. Buiten, T Rechts/Links × Type 1/2). A loop that returns a conflicting side on an already-assigned segment is flagged as "Niet compatibel" (`validateFeeds`). The T-piece Rechts/Links/Type1/Type2 → article-number mapping was verified 2026-07-17 against `docs/verificatie/verificatievel-t-koppelstukken.docx` — see the `Geverifieerd 17-7-2026` comments near `nodeVariants` and the `tkoppel` entries in `LCODES`.
4. **Bill of materials** (`computeBOM`, `railFor`) — each drawn segment length (whole meters) is split into deliverable rail lengths with priority 3 m → 2 m → 1 m (4 m only if the "ook 4m" option is checked), with an electrical coupler (`elkoppel`) per seam. The *drawn* length is the orderable rail length; real-world installed length additionally includes the visible mounting depth of the parts at each end (`MM` constants, e.g. Aansluitstuk 66 mm, T-steel 66 mm, Kruis 50 mm/arm) — shown separately in the parts list for on-site measuring. Mounting-point count (`computeMounts`) follows the rule verified in `docs/verificatie/verificatievel-montagepunten.docx`: one point per whole meter along each segment including both ends, with corner/T/cross points shared (not doubled).

Other things worth knowing before editing this section:

- **`ADAPTERS_OVERIG` carries its own documentation.** Each entry has an `uitleg` and, through `rail-figuren.js`, the technical drawing from the presenter; `buildProdList()` puts both behind an information icon after the product name. The drawings are cut out of `presenters/rail.js` — the presenter that is already in the repo, so no separate PDF is needed — by **`node tools/maak-rail-figuren.mjs`**. Its `KADERS` table holds one box per article, measured on a scale-2 view of that presenter (version 24062026); a box only has to contain the drawing and none of its neighbours, because the script trims the surrounding white itself. That script needs `pdfjs-dist` (`npm install --global pdfjs-dist`) on top of the Playwright the other `tools/` scripts use — a dev-machine tool, nothing the app itself loads. `ao07` (DALI Rail Adapter) has no drawing: it does not appear in this presenter, so it shows text only. **The `uitleg` texts are written in Distrilight's own voice** — no "jullie", no citing the presenter, no source attribution in the visible text. What they claim still has to hold up, because inside sales reads it out to installers: a description Distrilight already has comes from the `parts` array of the Onderdelen tab, and what the manufacturer requires (the strain relief with the 70 mm adapter) is stated as a requirement. Where the answer has not been established, the text says "Nog vast te leggen: …" instead of an assumption that reads as fact; replace such a line with the settled wording rather than deleting it. Note that the presenter itself carries no descriptions for the accessories — only names, codes, drawings and that one warning — so it cannot settle an open point on its own.
- **Two unrelated, identically-named data structures**: the top-level `parts` array (used by the Onderdelen/Artikelzoeker tabs) has per-part `LCODES:[...]` fields holding standard Pragmalux article numbers (e.g. `2000766`). Inside the configurator IIFE, a *different*, module-scoped `const LCODES = {...}` holds a distributor-specific code scheme (e.g. `KKT301158`) actually used to build the configurator's BOM. A third table, `PCODES`, defines Pragmalux-style numbers for the same configurator parts and is **live**: `activeP()` reads it (or `PCODES_DALI`) for the `art` field of every BOM item, which feeds the parts list and the `<title>` tooltip on the drawing, while `artL` from `LCODES` is what the PDF legend prints. (This file used to call `PCODES` dead code; it isn't.) When grepping for "LCODES" or wiring up article numbers, check which of these three you actually landed in. The pairing of Pragmalux code, supplier code (`KKT…`) and barcode that these tables carry comes from `docs/bronnen/PCODES LCODES.xlsx`.
- State lives in a single `st` object (color, power config, shape, nodes/edges/feeds, adapters, mount type, etc.) plus `hist`/`hIdx` for undo/redo (`snap`/`restore`, JSON-cloned). There's one global mutable `view` for pan/zoom. No reactive framework — every mutation is followed by an explicit `refresh()` call that recomputes and re-renders.
- `refresh()` is the central re-render entrypoint: recomputes propagation/BOM and rewrites the canvas, sheets bar, warnings, summary panel, and step UI. If you add new state, make sure it's covered by `refresh()`, `snap()`/`restore()`, and `c2ResetAll`'s reset list.
- The 5-step wizard (`Kleur → Voeding → Vorm → Tekening & maten → Stuklijst`) is UI sequencing only (`goStep`, `c2Steps`); none of the derivation logic is step-gated.

## Product domain notes (for correctness, not just code structure)

- Wiring configurations A/B/C (tab `#aansluiting`) are: **A** = 1-phase, 3 circuits sharing one phase (combined N ≤ 16A); **B** = 3-phase, 3 independent circuits one per phase (each phase ≤ 16A); **C** = 3-phase "3-phase adapters" that each pick their own phase on what looks like one continuous run (1.1 kVA, lower because it's one adapter's current per phase, not three parallel circuits).
- The rail has 4 conductors (L1, L2, L3, N) + earth, plus a physical **polarity rib** on one side of the profile that keeps the phase order consistent as pieces are joined (`#polaritySvg`). Every joinable part exists in Left/Right (and, for T-pieces, Type 1/2) mirror variants for exactly this reason.
- Recommended mounting spacing is 1000 mm (max 5 kg/point); at 2000 mm spacing with intermediate points every 100–200 mm, capacity drops to 1 kg/point.
