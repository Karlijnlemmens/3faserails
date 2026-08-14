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

## Nog niet gebouwd

Inlezen van het armaturenboek van de installateur, de vergelijkings-PDF,
het armaturenboek en de Excel-export. De opzet houdt daar rekening mee:
projecten worden als JSON opgeslagen, wat straks de invoer voor de PDF-stap is.
