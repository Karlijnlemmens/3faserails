# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained HTML file (`index.html`) implementing an internal knowledge/sales tool ("Distrilight") for the Pragmalux **PRX 3-Fase Rail** lighting track system, in Dutch. It's aimed at inside-sales staff fielding questions from installers: wiring/polarity reference, parts catalog, mounting specs, troubleshooting guide, article lookup, and — the largest piece — an interactive **Railconfigurator** that lets a user draw a track layout and auto-derives the full bill of materials.

There is no build system, package manager, or test suite. Everything — HTML, CSS, and JS — lives in one `<style>` and one `<script>` block in `index.html`. Open the file directly in a browser to run/preview it; there is nothing to compile or install.

`DesignTool` (no extension) is a stale duplicate/backup of an earlier version of `index.html`, kept in the repo root. Don't treat it as a source file to edit — changes belong in `index.html`.

## Working in this codebase

- There is no linter, formatter, or test runner configured. Verify changes by opening `index.html` in a browser and exercising the relevant tab manually.
- Everything is vanilla JS/CSS — no frameworks, no npm dependencies, no CDN scripts except Google Fonts. Keep it that way; don't introduce a build step or external libraries for a change that doesn't need one.
- The file is large (~2440 lines). Use the `<!-- ===== SECTION ===== -->` HTML comments and the `/* =================== NAME =================== */` JS comments to jump to the right area rather than reading linearly.
- Even PDF export (`buildPdf`) is hand-rolled: it writes raw PDF operators/objects as strings (no library like jsPDF). `pdfTxt()` transliterates Dutch/special characters and escapes PDF string syntax — extend that function if you add new characters to PDF output rather than assuming UTF-8 works.

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

**`<script>` (lines ~821–2441):** See below.

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
