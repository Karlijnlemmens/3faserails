# Opdracht: de Distrilight-suite gebruiksvriendelijker, foutlozer en efficiënter

*Opgesteld 23-9-2026 op commit `63e00e8`, na een doorlichting van alle tools.
Elk getal hieronder is gemeten, niet geschat; de meetscripts staan onder
"Uitgangsmeting". Geef dit bestand aan een nieuwe sessie met: "Voer
docs/OPTIMALISATIE-OPDRACHT.md uit."*

> **Status: uitgevoerd op 23-9-2026**, in zeven commits op `main` (WP1 `01744ec`,
> WP3 `6553004`, WP4 `185ff1e`, WP2 `1f96293`, WP5 `822c753`, WP6 `911f6f8`, WP7
> de commit die deze regel toevoegde). Dit bestand blijft staan als de opdracht
> zoals hij was; de paden erin zijn die van vóór WP7 (de ontwerp-, verificatie- en
> bronbestanden staan nu in `docs/ontwerp/`, `docs/verificatie/` en `docs/bronnen/`).
> Nog open: WP6.4 (de productdata los laden in de vergelijker) - de gebruiker denkt
> erover na. De Word-template is op verzoek van de gebruiker verwijderd (24-9-2026).

---

## Wie je bent en hoe je werkt

Je werkt in de repo `karlijnlemmens/3faserails`: zes losse HTML-tools voor de
binnendienst van Distrilight (railconfigurator, armaturenboek, presenters, DLC
specials, armatuurvergelijker, bandrasters), gebruikt vanaf schijf en rondgemaild
als opgeslagen projectbestand. **Lees eerst `CLAUDE.md`.**

De gebruiker is binnendienst, geen ontwikkelaar. Ze schrijft Nederlands en wil
resultaat zien, geen verhaal. Wat bij haar werkt, zoals gebleken in eerdere
sessies:

- **Meten, niet raden.** Elke wijziging begint met een meting op de echte data
  (de echte code via `laadUit()` of Playwright) en eindigt met dezelfde meting
  erna. Rapporteer voor → na in getallen.
- **Niets verzinnen.** Wat de prijslijst niet zegt, blijft leeg of komt uit
  `families.json`. Een lege rij is beter dan een verkeerde.
- **Niets stil laten vallen.** Wat een lezer niet kan plaatsen, wordt getoond.
- Elke gevonden regel krijgt een **proef** in de controlescripts, zodat hij niet
  terug kan komen.

---

## Harde randvoorwaarden

1. **`file://`, geen build, geen netwerk, geen npm in de app, geen ES-modules.**
   Zie `CLAUDE.md`.
2. **Runtimebestanden verhuizen of hernoemen niet.** Een opgeslagen projectbestand
   draagt een `<base href>` naar de installatiemap en laadt elk `<script src>` op
   naam vanuit die map (`armaturenboek.html:1005`, `bandrasters.html:2293`,
   `dlc.html:945`, `index.html`). Verhuis je `pdf-huisstijl.js` naar `lib/`, dan
   breekt elk projectbestand dat al rondgemaild is. Dat geldt voor alle `.js`,
   `.css` en `.html` in de hoofdmap, en voor `fonts/`, `merk/`, `presenters/` en
   `vendor/`. **Toevoegen mag, verhuizen niet.** Moet het toch, laat dan op de
   oude plek een stub staan.
3. **De repo is openbaar.** Nooit een ruwe prijslijst. Exports gaan altijd door
   `vergelijker/knip-export.py` (drie kolommen) en je kijkt eerst na dat er geen
   prijskolom meegaat.
4. **`vergelijking.html` is gegenereerd.** Wijzig `vergelijker/index-template.html`
   en draai `python3 vergelijker/bouw-tool.py`.
5. **De git-geschiedenis wordt niet herschreven** (daar zit nog 42 MB `ag44.js` en
   10 MB `TEMPLATE…docx` in, `.git` is 128 MB), tenzij de gebruiker daar
   uitdrukkelijk om vraagt. Collega's hebben de repo en een force-push op een
   gedeelde, openbare repo is niet terug te draaien.
6. **Per wijziging:** alle controlescripts vóór en ná, plus de PDF-regressie
   (`tools/LEESMIJ-pdf-controle.md`). Eén commit per werkpakket, push naar `main`.
   **`release` alleen als de gebruiker dat zegt** — daar werken de collega's mee.

---

## Uitgangsmeting

### Zoeken — hier zit de meeste winst

**Vergelijker, familiezoeker (`zoekFamilies()`).** Elk getypt woord moet in de
tekst van de familie staan (naam, merk, lijn, armatuurtype, zoektermen) of
exact een artikelcode zijn. Sinds "de familie is de reeks" staan G2, 60x60,
DALI en dergelijke niet meer in de familienaam, en daardoor **vindt precies
wat de binnendienst typt niets**:

| getypt | resultaten | verwacht |
|---|---:|---|
| `sigma` | 1 | Sigma ✔ |
| `sigma dali` | **0** | Sigma, DALI-uitvoeringen |
| `sigma 60x60` / `sigma g2` / `sigma zwart` / `sigma 4000k` / `sigma ip65` | **0** | Sigma |
| `mondial facet` / `mondial verdiept` / `mondial zwart dali` | **0** | Mondial |
| `downlight 15w` | **0** | downlights van 15 W |
| `plafonniere` (zonder è) | **0** | 9 families (met è wel) |
| `sigmaa`, `esence`, `essense` | **0** | een suggestie |
| `1043227 TC DA`, `1043227TCDA` | **0** | Sigma, artikel 1043227-TC-DA |
| `1043227-TC-DA` / `1043227` / `104322` | 1 / 1 / 0 | ✔ (een-op-een werkt) |

`sigma dali` is letterlijk het voorbeeld dat de gebruiker in het voorstelveld van
de akkoordronde typt.

**Railtool (`index.html`).** De artikelzoeker en de onderdelenzoeker zoeken de
hele invoer als één stuk tekst:

| waar | getypt | resultaten |
|---|---|---:|
| artikelzoeker | `rail` | 15 |
| artikelzoeker | `rail wit` / `wit rail` | **0** / **0** |
| artikelzoeker | `eindkap wit` | 1 (toevallig de goede volgorde) |
| artikelzoeker | `t-stuk` | **0** (het heet T-koppelstuk) |
| onderdelen | `2000766` (een artikelnummer) | **0** — zoekt niet op code |
| onderdelen | `rail 3m` | **0** |

**Armatuurherkenning (`matchArmGroep()`, armaturenboek en railtool).** Op de 47
catalogusartikelen waarvan de presenter vastligt: **44 goed, 3 fout, 0 leeg
(94%)**. Geen probleem met accenten of variantwoorden (het scoort op woorden in
plaats van alles te eisen), wel:

- `LED Paneel 60x60cm Essence G2 …` → **Downlight** Essence G2 (ag14) in plaats
  van Paneel Essence (ag13): het typewoord *Paneel* verliest van *Essence G2*.
- `esence downlight` → niets, en geen suggestie.

### Presenters in de vergelijker-PDF

De vergelijker splitst alleen een presenter in als `families.json` er met de
hand een noemt. Dat is zo bij **3 van de 209 Pragmalux-families (47 van 3473
artikelen)**. `matchArmGroep()` — dezelfde herkenning die het armaturenboek al
gebruikt — vindt er voor **114 families (1962 artikelen) nog een** in de 110
beschikbare presenterbestanden. Nu eindigt vrijwel elke vergelijkings-PDF met
"Nog geen presenter voor …".

Bovendien een fout in de overlay: het blok `essence-g2-downlight` dekt ook
*LED Downlight Essence PIR* en geeft die **ag14** (Downlight Essence G2), terwijl
**ag17** (Downlight Essence PIR) bestaat.

### Kleine gebruiksproblemen

- `presenters.html` vraagt bij elke keer openen `armatuur-beelden.js` op, dat nog
  niet bestaat → een 404-fout in de console.
- `bandrasters.html` is op telefoonbreedte (390 px) **606 px breed**: het
  intakeformulier steekt eruit. De andere vijf tools passen.
- De tabbladen *Lichtlijn*, *Intake* en *Snoerenplan* zien er in de balk uit als
  echte tools en openen een pagina "Binnenkort beschikbaar".

### Efficiëntie

| wat | gemeten |
|---|---|
| laadtijd per tool | 65–330 ms — geen probleem |
| productdata | staat **drie keer** in de repo: `armaturen.json` 2,5 MB, `armaturen-data.js` 1,7 MB, ingebakken in `vergelijking.html` 1,8 MB |
| opgeslagen vergelijkerproject | **1,8 MB per project**, omdat de hele catalogus erin zit |
| `presenters/` | 63 MB, grootste `ag58.js` 3,0 MB |
| `merk/merk-data.js` | 3,9 MB (lui geladen, alleen bij PDF) |
| `CLAUDE.md` | **81 kB / 13.000 woorden** — gaat bij elke sessie volledig mee in de context |
| controlescripts | zeven losse commando's, elk met de hand |

Verouderde getallen in `CLAUDE.md`: "~400 families out of ~2900 articles" (is
219 / 3524), "`index.html` ~2550 lines" en "lines ~845–3085" (is 3568 regels).

### Bestanden

In de hoofdmap staan 30 bestanden. Hiervan is **niet runtime** en verwijst er
geen code naar:

| bestand | grootte | status |
|---|---:|---|
| `TEMPLATE Distrilight project-armatuurboek.docx` | 10,5 MB | nergens naar verwezen |
| `AB Briefing vergelijking.docx` | 83 kB | nergens; de `.pdf` is de ontwerpbron |
| `PCODES LCODES.xlsx` | 17 kB | nergens |
| `AB Briefing vergelijking.pdf` | 68 kB | alleen in `CLAUDE.md` |
| `railconfigurator-logica.docx` | 20 kB | alleen in `CLAUDE.md` |
| `verificatievel-montagepunten.docx` | 110 kB | alleen in `CLAUDE.md` |
| `verificatievel-t-koppelstukken.docx` | 96 kB | alleen in `CLAUDE.md` |
| `Bandraster_Intake_Nieuw_V3.xlsx` | 3,9 MB | bron voor `tools/maak-bandraster-beelden.mjs` |
| `merk/afbarmaturen.jpg` | — | nergens; de `.png` wordt gebruikt |

---

## Werkpakketten, in volgorde van opbrengst

### WP1 — De familiezoeker van de vergelijker vindt wat er getypt wordt

**Probleem:** zie de tabel. Elk variantwoord (dali, 60x60, g2, zwart, 4000k,
facet, verdiept, 15w) maakt de uitkomst leeg.

**Aanpak:**

1. **Zoeken op twee niveaus.** Een familie komt in de lijst als **één artikel** in
   die familie alle woorden dekt — elk woord in de familietekst óf in de velden en
   de omschrijving van dat artikel. Niet woorden die over verschillende artikelen
   verspreid staan: `sigma zwart dali` mag alleen passen als er een zwart
   DALI-artikel is.
2. **De treffers sturen de keuze.** Staat er na de familie precies één artikel
   over, kies dat (en zet `handmatig`, zoals `artikelVoorWoord()` al doet). Zijn
   het er meer, zet de `KENMERKEN`-filters vast op wat getypt is. De regel in de
   keuzelijst zegt hoeveel artikelen passen: "LED Paneel Sigma — 12 DALI-artikelen".
3. **Normaliseren voor het vergelijken:** kleine letters, accenten eraf (NFD),
   witruimte samenvoegen, eenheden gelijk trekken (`60x60cm` ≈ `60x60`,
   `4000k` ≈ `4000 k`).
4. **Artikelnummers blijven een-op-een**, maar op een genormaliseerde sleutel:
   spaties, streepjes en punten eruit aan beide kanten, dus `1043227 TC DA` en
   `1043227TCDA` vinden `1043227-TC-DA`. Een half nummer (`104322`) blijft niets
   vinden — dat is de hele regel.
5. **Tikfouten: nooit stil laten passen.** Geeft een zoekopdracht niets, toon dan
   "Bedoelde je: **Sigma**?" (bewerkingsafstand ≤ 2 op serienamen), klikbaar.
   Nooit op artikelnummers: een bijna-treffer is het verkeerde artikel.

**Klaar als:** de tabel uit de uitgangsmeting als proeftabel in
`tools/controleer-logica.mjs` staat en groen is, met in elk geval: `sigma dali` →
Sigma met alleen DALI-artikelen, `plafonniere` = `plafonnière`,
`1043227 TC DA` → dat ene artikel, `104322` → 0, `sigmaa` → 0 met suggestie Sigma.

### WP2 — Een presenter achter elke vergelijking die er een heeft

**Aanpak:**

1. Valt `fam.presenter` leeg, gebruik dan `matchArmGroep()` op de familienaam (en
   anders op de omschrijving van het gekozen artikel) — maar **alleen als de soort
   klopt**: een paneelfamilie krijgt nooit een downlightpresenter. Leg daarvoor
   een soort bij elke `ARM_GROEPEN`-groep vast of leid hem af uit de naam.
2. Toon in de tool welke presenter er achter de positie komt, met een keuzelijst
   om hem te overrulen of "Geen presenter" te kiezen — hetzelfde patroon als het
   armaturenboek.
3. Herstel de overlay: *LED Downlight Essence PIR* krijgt ag17, niet ag14.

**Klaar als:** de dekking gemeten is (nu 3 families, verwacht ruim 100), met een
proef dat geen paneelfamilie een downlightpresenter krijgt, en de PDF-regressie
alleen verschilt op de pagina's die er bewust bij komen.

### WP3 — Zoeken in de railtool

1. **Artikelzoeker:** per woord zoeken (alle woorden moeten passen, in willekeurige
   volgorde), dezelfde normalisatie als WP1, en een kleine lijst synoniemen uit
   het vak (`t-stuk` → T-koppelstuk, `eindstuk` → eindkap, `hoek` → bocht,
   `voeding` → aansluitstuk). Zet die lijst op één plek.
2. **Onderdelen:** zoek ook op de artikelnummers van het onderdeel.
3. De normalisatie uit WP1 en deze zoekfunctie mogen in een **nieuw** gedeeld
   bestand in de hoofdmap (toevoegen mag); laad het in elke tool die het gebruikt
   en laat `controleer-suite.mjs` nakijken dat geen tool er een eigen kopie van
   houdt.

**Klaar als:** `rail wit`, `wit rail`, `t-stuk` en `2000766` (in Onderdelen) iets
vinden, als proeftabel in `controleer-logica.mjs`.

### WP4 — `matchArmGroep()` scherper

1. Het typewoord wint als het de soort van de groep tegenspreekt: *Paneel … Essence
   G2* is geen downlight.
2. Geeft het niets, een suggestie in het armaturenboek zoals in WP1.
3. **Maak de meting groter:** na WP2 is voor ruim 100 families bekend welke
   presenter erbij hoort. Draai `matchArmGroep()` over al hun artikelen en zet
   het percentage in de controle, met een ondergrens die niet mag zakken.

### WP5 — Kleine gebruiksproblemen

Kijk bij elk punt eerst met een schermafdruk (1280 en 390 px breed) voordat je
iets wijzigt, en erna nog een keer.

- `presenters.html`: geen 404 meer op `armatuur-beelden.js`. Laad het zo dat een
  ontbrekend bestand geen fout geeft (een `onerror` op de script-tag, of dynamisch
  laden zoals `presenterData()` doet). Lever **geen** lege versie mee in de repo:
  de tool schrijft dat bestand zelf en de gebruiker zet het in de hoofdmap, en
  een meegeleverde lege versie zou daarmee concurreren.
- `bandrasters.html` op 390 px: vind wat uitsteekt (het intakeformulier, labels
  `.vl`) en laat het meevouwen, zonder de schermweergave op laptop te veranderen.
- Tabbladen van tools die er nog niet zijn: zichtbaar als "binnenkort" (gedimd of
  met een label), in **elke** pagina — de tabbladenrij staat in elk bestand apart
  en `controleer-suite.mjs` kijkt na dat ze gelijk blijven.
- Akkoordronde: staat er in de reactie van de manager een familienaam, bied dan
  aan die familie met één klik in de zoeker te zetten.

### WP6 — Efficiëntie

1. **Eén commando voor alle controles:** `tools/controleer-alles.mjs` draait
   `controleer-logica`, `-suite`, `-presenters`, `controleer-families.py` en
   `controleer-data.py`, met één samenvatting en één afsluitcode; `--pdf` doet de
   PDF-regressie erbij. Werk `tools/LEESMIJ-pdf-controle.md` bij.
2. **Controle dat de productdata overal gelijk is:** laat `controleer-suite.mjs`
   nakijken dat `armaturen-data.js` en `vergelijking.html` uit de huidige
   `armaturen.json` gebouwd zijn (een hash in beide). Vergeten om
   `bouw-armaturen-data.py` te draaien gaat nu stil.
3. **`CLAUDE.md` opsplitsen.** Houd `CLAUDE.md` als kaart — wat de suite is, de
   randvoorwaarden, waar alles staat, hoe je controleert — van hooguit ~15 kB.
   Zet de diepgang per tool in `docs/<tool>.md` (`docs/vergelijker.md`,
   `docs/bandrasters.md`, …) en verwijs ernaar vanuit `CLAUDE.md`, met de regel
   "lees `docs/<tool>.md` voordat je aan die tool werkt". Verlies geen enkele
   regel: elke zin uit de huidige `CLAUDE.md` komt terug in de kaart of in een
   van de toolbestanden. Herstel meteen de verouderde getallen.
4. **Niet zelf beslissen, wel voorleggen:** de vergelijker kan de productdata ook
   via `<script src="armaturen-data.js">` laden in plaats van hem in te bakken.
   Dan wordt `vergelijking.html` ~100 kB en een opgeslagen project geen 1,8 MB
   meer. **Maar** een opgeslagen project toont dan de *huidige* catalogus in
   plaats van die van het moment van opslaan. Leg die afweging aan de gebruiker
   voor voordat je iets bouwt.
5. **Presenters (63 MB):** meet welke boven 1,5 MB zitten en rapporteer die.
   Comprimeren kan alleen met Ghostscript en de bron-PDF's, en die staan niet in
   de repo — niet zelf doen.

### WP7 — Mappenstructuur

Regel: **runtimebestanden blijven waar ze zijn** (randvoorwaarde 2). Wat geen
runtime is, mag verhuizen, en in dezelfde commit werk je elke verwijzing bij
(`grep -rn` op de bestandsnaam in alle bestanden, ook `CLAUDE.md`, commentaar in
de HTML en de scripts in `tools/`).

Voorstel:

```
docs/
  OPTIMALISATIE-OPDRACHT.md      (dit bestand)
  <tool>.md                      (uit WP6)
  ontwerp/                       AB Briefing vergelijking.pdf + .docx
  verificatie/                   railconfigurator-logica.docx
                                 verificatievel-montagepunten.docx
                                 verificatievel-t-koppelstukken.docx
  bronnen/                       PCODES LCODES.xlsx
                                 Bandraster_Intake_Nieuw_V3.xlsx
                                   → tools/maak-bandraster-beelden.mjs bijwerken
```

**Weggooien:**

- `merk/afbarmaturen.jpg` — nergens naar verwezen, de `.png` wordt gebruikt. Mag weg.
- `TEMPLATE Distrilight project-armatuurboek.docx` (10,5 MB) — **eerst vragen.**
  Nergens naar verwezen is niet hetzelfde als niet nodig: het kan de Word-bron
  zijn waar het armaturenboek op gebaseerd is. Weggooien uit de werkmap scheelt
  niets in `.git` (zit in de geschiedenis), dus alleen doen als de gebruiker hem
  kwijt wil; anders naar `docs/ontwerp/`.

Na afloop staan in de hoofdmap alleen nog de runtimebestanden, `CLAUDE.md` en
`.gitignore`.

---

## Werkwijze per pakket

1. **Meten** — een script in de scratchpad dat de echte code draait (`laadUit()`
   zoals in `controleer-logica.mjs`, of Playwright voor wat op het scherm gebeurt).
2. **Wijzigen.**
3. **Controleren** — alle controlescripts en de PDF-regressie.
4. **Opnieuw meten** en voor → na noteren.
5. **Vastleggen in een proef**, zodat het niet terug kan komen.
6. **`CLAUDE.md` / `docs/` bijwerken** — het waarom, met het gemeten getal erbij.
7. **Committen** per pakket, Nederlandse commitboodschap met het waarom en het
   gemeten effect. Push naar `main`.

Begin met WP1: daar zit de meeste dagelijkse ergernis, en WP3 en WP4 bouwen op
dezelfde normalisatie.

## Wat je niet doet

- Artikelnummers ongeveer laten passen. Een-op-een blijft de regel.
- De git-geschiedenis herschrijven.
- Runtimebestanden verhuizen of hernoemen.
- Nieuwe bibliotheken of een buildstap toevoegen.
- Gegevens verzinnen die niet in de prijslijst of `families.json` staan.
- Ontwerpdocumenten weggooien zonder het te vragen.
- `release` bijwerken zonder dat de gebruiker het zegt.

## Eindrapport

Eén tabel per werkpakket: gemeten vóór → na, wat er nog ligt, en wat een
beslissing van de gebruiker nodig heeft (in elk geval: de ingebakken productdata
uit WP6.4 en het Word-sjabloon uit WP7).
