# Armatuurvergelijker

Interne tool voor het projectbureau: referentie-armatuur van de installateur naast
het Distrilight-alternatief, per bestekpositie.

## Openen

Dubbelklik `vergelijking.html` in de hoofdmap, of klik in een van de andere
tools op de badge **Vergelijking**. Verder niets nodig — geen server, geen
installatie.

De tool draait als tabblad van de Distrilight tools-suite. Daarom staat het
werkende bestand in de hoofdmap (naast `index.html`, en met de koptekst en het
logo van de suite) en staat alles waarmee het gemaakt wordt in deze map.

## Familie toevoegen

Drie stappen, daarna is de familie beschikbaar in de tool.

**1 · Zet de prijslijstexport in `data/bron/`**

Een `.xlsx` met minimaal de kolommen `Artikelcode` en `Omschrijving`.
`Status` en `Barcode 1` worden meegenomen als ze er zijn.

**2 · Voeg een blok toe aan `data/families.json`**

```json
{
  "id": "mondial-downlight",
  "naam": "LED Downlight Mondial",
  "merk": "Pragmalux",
  "lijn": "Premium",
  "armatuurtype": "downlight",
  "montagewijzen": ["inbouw"],
  "balvast": false,
  "look": ["strak"],
  "zoektermen": ["mondial", "downlight", "downlighter"],
  "ip": "IP54",
  "ik": "IK03",
  "ugr": "<19",
  "cri_min": 90,
  "cct": [3000, 3500, 4000],
  "levensduur": "100.000 L90B10 Ta25",
  "garantie_jaar": 5,
  "bron_excel": "mondial-downlight.xlsx",
  "alleen_codes_met_prefix": "^W[PV]F\\d{7}"
}
```

`bron_excel` verwijst naar het bestand uit stap 1.
`alleen_codes_met_prefix` is optioneel: filtert losse frames, modules en
accessoires weg, zodat alleen complete armaturen overblijven.

**3 · Draai de twee scripts**

```
cd vergelijker
python bouw-data.py     # leest data/bron/ -> schrijft data/armaturen.json
python bouw-tool.py     # zet armaturen.json in ../vergelijking.html
```

Alleen de tool aangepast en geen nieuwe data? Dan is `bouw-tool.py` genoeg;
`data/armaturen.json` staat in de repo, dus daar heb je de Excel-exports niet
voor nodig.

Pas je alleen een familiegegeven aan (een foto, een cct) terwijl de exports niet
op je schijf staan? Dat kan: staat de export van een familie niet in
`data/bron/`, dan houdt `bouw-data.py` de artikelen aan die al in
`armaturen.json` stonden, en meldt dat. Staat de export er wel, dan wint die —
zo blijft bijwerken gewoon bijwerken.

`bouw-data.py` haalt vermogen, lichtstroom, buiten- en zaagmaat, kleur, uitvoering
en IP uit de omschrijvingstekst. Wat het niet kan lezen, meldt het per artikel —
het raadt nooit. Zolang er meldingen staan, controleer je die eerst.

Heb je nog geen export voor een familie? Zet de varianten dan met de hand onder
`"varianten"` in `families.json` en laat `bron_excel` weg. Het script slaat die
familie dan over en neemt hem ongewijzigd mee. Zo staan Essence G3 en Essence
Classic G3 er nu in.

## Bestanden

| Bestand | Wat het doet |
|---|---|
| `../vergelijking.html` | De tool. Gegenereerd — niet met de hand aanpassen. |
| `index-template.html` | Hier wijzig je de tool zelf. |
| `bouw-data.py` | Excel → `data/armaturen.json` |
| `bouw-tool.py` | `armaturen.json` + template → `../vergelijking.html` |
| `data/families.json` | Handwerk: de familiegegevens die niet in de export staan |
| `data/armaturen.json` | Gegenereerd — niet met de hand aanpassen |
| `data/bron/` | De Excel-exports. Blijven buiten de repo. |

## Suffixen

Driversuffixen worden herkend en als kenmerk opgeslagen:
`-PR` Pragmalux · `-UN` universeel · `-PH` Philips · `-PH-DA` Philips DALI2 ·
`-TC-DA` TCI DALI · `-CA` Casambi.

Uitvoeringssuffixen: `-S` sensor · `-N` noodmodule · `-SN` beide.

Snoersuffixen (`-GST3`, `-EUR`, `-ST3` en varianten) worden overgeslagen.
Wil je die later meenemen, haal ze dan uit de lijst `SNOER` in `bouw-data.py`.

## Variantkeuze

De tool filtert eerst en kiest daarna pas.

1. **Lichtstroom** — de gevraagde waarde moet binnen het instelbereik van de
   variant vallen. Niet de afstand tot het maximum, maar of het bereik het dekt.
2. **Renovatie** — is er een bestaand gat ingevuld, dan valt elke variant af
   waarvan de sierrand dat gat niet afdekt.
3. **Kiezen** — van wat overblijft wint de kleinste behuizing.

Past het armatuur niet in het bestaande gat, dan wordt gemeld dat het gat
vergroot moet worden. Dekt geen enkele variant de gevraagde lichtstroom, dan
zegt de tool dat, in plaats van iets voor te stellen dat niet past.

Elke automatisch ingevulde waarde is te overschrijven; overschreven velden
kleuren oranje en zijn met één klik te herstellen.

## Foto's

Het vergelijkingsblad begint met een rij **Foto**: links het armatuur van de
installateur, rechts dat van ons.

Beide vakken werken hetzelfde: **Bestand kiezen**, een bestand erheen slepen,
of Ctrl+V. Plakken luistert op de hele pagina en vult het vak met het
`Ctrl+V`-merkje; klik een vak aan om dat te verplaatsen. Tekst plakken raakt de
foto's niet — er wordt alleen ingegrepen als er echt een afbeelding op het
klembord staat.

De afbeelding wordt verkleind tot 1000 px op de langste zijde en als data-URI
in de positie bewaard, dus hij gaat mee met **Project opslaan** en is er straks
nog bij de PDF-stap. Een verwijzing naar een bestand op de schijf van de
gebruiker zou dat niet overleven. Png blijft png, zodat een doorzichtige
achtergrond niet verloren gaat; de rest wordt jpeg op wit.

**Rechts** staat de foto uit de productdata voorgevuld, met «uit de
productdata» eronder. Plak of kies je er zelf een, dan wint die voor deze
positie; met **Terug naar productdata** haal je de vaste foto terug. Zet het
pad in `families.json`:

```json
{ "id": "essence-g3-paneel", "naam": "LED Paneel Essence G3",
  "foto": "merk/armaturen/paneel-essence-g3.jpg" }
```

Het pad is relatief aan `vergelijking.html` in de hoofdmap. Een `foto` bij een
variant gaat vóór die van de familie, voor het geval één uitvoering er echt
anders uitziet. Een data-URI mag ook, maar een pad houdt het bestand klein.

## PDF

**PDF-voorbeeld** in de bovenbalk maakt het vergelijkingsblad zoals het op
papier komt: één pagina per positie, met de blauwe kopbalk en ruitpatroon, de
foto's naast elkaar, de velden eronder en de lichtgrijze schuine voet. Dezelfde
opmaak en maten als de installateur-PDF van de 3-fase railtool, zodat de twee
documenten als één set ogen. In het voorbeeld zit een knop **Downloaden**.

De PDF wordt met `vendor/pdf-lib.min.js` getekend, met de huisstijl­lettertypen
en het ruitpatroon uit `merk/merk-data.js`. Die drie bestanden zijn samen ruim
vier megabyte en worden pas opgehaald bij de eerste klik op de knop — het
openen van de tool blijft daardoor even snel.

Foto's die geplakt of ingeladen zijn gaan zo mee. Een foto die via een **pad**
in `families.json` staat, kan de browser niet insluiten zolang de tool vanaf
schijf draait; dat meldt het voorbeeld dan boven de pagina. Wordt de tool via
een webserver aangeboden, dan werkt ook dat pad.

## Specificaties plakken

Het plakvak leest de specificatietabel van de leverancier uit. Drie vormen
worden herkend:

| Vorm | Voorbeeld |
|---|---|
| Label en waarde op één regel | `Systeem wattage: 19,5 W` |
| Label boven de waarde | `IP degree` op de ene regel, `IP20` op de volgende |
| Bestektekst op één regel | `..., Elektrisch: Systeem wattage: 1W, Luminous flux: 80lm, ...` |

Bij de bestekvorm wordt alleen geknipt waar na de komma een nieuw `Label:`
begint, zodat `Reflector, spot` en `L70/B50>50,000` heel blijven. Groepsnamen
(`Elektrisch:`, `Materiaal en afwerking:`) worden herkend als kop en niet als
veld — die staan in `SECTIE` in de template.

Labelnamen staan in `VELDMAP`. Bij het opzoeken vervalt een eenheid of
vraagteken achter het label (`Maximum bulb wattage (W)`, `Dimmable?`), en staat
de eenheid in het label bij een kale waarde, dan wordt hij eraan geplakt: `60`
uit `Maximum bulb wattage (W)` wordt `60W`.

Wat niet herkend wordt, staat onder het voorbeeld onder «regels niet herkend».
Komt daar iets in te staan dat je vaker tegenkomt, voeg het label dan toe aan
`VELDMAP` in `index-template.html` en draai `bouw-tool.py` opnieuw.

## Nog niet gebouwd

Inlezen van het armaturenboek van de installateur, de vergelijkings-PDF,
het armaturenboek en de Excel-export. De opzet houdt daar rekening mee:
projecten worden als JSON opgeslagen, wat straks de invoer voor de PDF-stap is.
