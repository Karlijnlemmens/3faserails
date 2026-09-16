# Een armatuurfamilie toevoegen aan de vergelijker

Stap voor stap, voor wie het op zijn eigen laptop doet. Windows; op een Mac is
alles hetzelfde op de schuine streepjes na.

Deze handleiding gaat over het **toevoegen van productdata**. Wil je de tool zelf
veranderen, dan is `README.md` in deze map het startpunt.

---

## Eenmalig: je laptop klaarzetten

Drie dingen, één keer.

**1 · Python**

Haal het van [python.org/downloads](https://www.python.org/downloads/). Zet in
het installatievenster het vinkje **"Add python.exe to PATH"** aan — dat is het
vinkje dat mensen overslaan en waardoor later niets werkt.

Controleren: open een opdrachtvenster (zie hieronder) en typ

```
python --version
```

Krijg je een versienummer, dan staat het goed. Krijg je "wordt niet herkend",
probeer dan `py --version`; werkt dát wel, gebruik dan overal in deze
handleiding `py` in plaats van `python`.

**2 · Git**

Haal het van [git-scm.com](https://git-scm.com/download/win). Alle
standaardinstellingen zijn prima; klik door.

**3 · Eén python-pakket**

```
pip install openpyxl
```

Dat is de lezer voor Excel-bestanden. Alleen nodig als je een `.xlsx` voert; met
een `.csv` gaat het zonder.

### Een opdrachtvenster openen in de juiste map

Twee manieren, allebei goed:

- Open de map in Verkenner, klik in de **adresbalk** bovenin, typ `cmd` en druk
  op Enter. Het venster opent meteen in die map.
- Of: rechtermuisknop in de map → **In Terminal openen**.

Waar je bent zie je aan het begin van de regel. Typ je iets en het antwoord is
"kan het bestand niet vinden", dan sta je bijna altijd in de verkeerde map.

---

## Eenmalig: de repo op je laptop zetten

De "repo" is de map met alle tools erin, gekoppeld aan GitHub. Kies een plek waar
je hem terugvindt — bijvoorbeeld `C:\Users\<jij>\Documents`. Open daar een
opdrachtvenster en typ:

```
git clone https://github.com/Karlijnlemmens/3faserails
```

Je hebt nu een map `3faserails`. Daar staat alles in: de tools, de scripts, de
data.

**Elke keer dat je begint**, haal je eerst op wat er sinds vorige keer is
veranderd:

```
cd 3faserails
git pull
```

Sla dat niet over. Doe je het wel, dan loop je het risico dat je werk botst met
wat er intussen op GitHub is bijgekomen.

---

## Per familie: de zes stappen

### 1 · Kijk in de Excel wat erin staat

Open de prijslijstexport gewoon in Excel en kijk naar de kolomkoppen. De tool
gebruikt er **vier**:

| kolom | waarvoor |
|---|---|
| `Artikelcode` | het artikelnummer, en het suffix erachter verraadt de driver |
| `Omschrijving` | hier komt bijna alles uit: wattage, lichtstroom, maten, kleur, IP |
| `Status` | voorraadartikel of bestelartikel |
| `Barcode 1` | de EAN |

Al het andere — bruto, netto inkoop, marge, staffels — wordt in de volgende stap
weggeknipt. **Dat moet ook**, want deze repo staat openbaar op internet.

### 2 · Knip de export uit

```
python vergelijker\knip-export.py "C:\Users\jij\Downloads\prijslijst-mondial.xlsx" mondial-downlight
```

Twee dingen achter de scriptnaam:

- **het pad naar je Excel**. Staan er spaties in, zet het dan tussen
  aanhalingstekens. Makkelijkste manier: sleep het bestand vanuit Verkenner het
  opdrachtvenster in, dan wordt het pad er vanzelf ingetypt.
- **de naam die de familie krijgt**, zonder extensie. Kleine letters en
  streepjes; deze naam gebruik je zo weer.

Je krijgt te zien wat er gebeurd is:

```
prijslijst-mondial.xlsx → data/bron/mondial-downlight.csv  (86 artikelen)
   weggelaten kolommen (3): bruto prijs, netto inkoop, marge %
```

Lees die tweede regel echt. Staat er een kolom bij die je wél had willen houden,
dan klopt er iets niet met de kolomnamen.

Je mag dit commando vanuit elke map draaien — het script schrijft altijd naar
`vergelijker\data\bron\`.

### 3 · Zet het blok in `families.json`

Open `vergelijker\data\families.json` in Kladblok of VS Code. Het is een lijst
van blokken tussen `[` en `]`. Zet jouw blok onderaan, **vóór** de sluitende `]`,
met een komma achter het blok dat er nu als laatste staat.

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
  "presenter": "ag25",
  "bron_excel": "mondial-downlight.csv"
}
```

**Waar die waarden vandaan komen:**

| veld | waar je het haalt |
|---|---|
| `id` | verzin je, kleine letters met streepjes. Moet uniek zijn. |
| `bron_excel` | exact de bestandsnaam uit stap 2, mét `.csv` |
| `ip` `ik` `ugr` `cri_min` `cct` `levensduur` `garantie_jaar` | uit het familieblad van die serie |
| `presenter` | het `ag`-nummer van dat familieblad, te vinden in de map `presenters\` |
| `zoektermen` | de woorden waarop jullie die familie zoeken. Ruim nemen. |
| `montagewijzen` | `inbouw`, `opbouw`, `pendel` — wat er echt bestaat |
| `balvast` `look` `lijn` | jullie eigen indeling |

Staan er in de prijslijst ook losse frames, modules of accessoires? Zet er dan
een regel bij die alleen complete armaturen doorlaat:

```json
  "alleen_codes_met_prefix": "^W[PV]F\\d{7}"
```

**Vier dingen waar JSON op stukgaat:**

1. Een komma **tussen** blokken, en géén komma achter het laatste.
2. Altijd dubbele aanhalingstekens `"`, nooit enkele.
3. `false` en `true` zonder aanhalingstekens; tekst juist wél tussen
   aanhalingstekens.
4. In `alleen_codes_met_prefix` schrijf je een backslash **dubbel**: `\\d`, niet
   `\d`.

Twijfel je of het klopt? Plak de inhoud in [jsonlint.com](https://jsonlint.com) —
die wijst de regel aan waar het misgaat.

### 4 · Bouwen

Vier commando's, in deze volgorde:

```
cd vergelijker
python bouw-data.py
python controleer-data.py
python bouw-tool.py
python bouw-armaturen-data.py
```

Wat ze doen:

| script | van | naar |
|---|---|---|
| `bouw-data.py` | `data/bron/*.csv` + `families.json` | `data/armaturen.json` |
| `controleer-data.py` | *(alleen kijken)* | meldingen op je scherm |
| `bouw-tool.py` | `armaturen.json` + de template | `..\vergelijking.html` |
| `bouw-armaturen-data.py` | `armaturen.json` | `..\armaturen-data.js` |

Dat laatste script wordt makkelijk vergeten: de presenters-tool leest een eigen
kopie van de data, en zonder die stap loopt die achter.

### 5 · Lees de meldingen

Dit is de stap die telt. De twee scripts kijken naar **verschillende** dingen.

**`bouw-data.py` meldt wat hij niet uit de omschrijving kon lezen.** Hij raadt
nooit — liever een leeg veld dan een verzonnen getal. Je krijgt zoiets:

```
  mondial-downlight                    86 artikelen  (4 overgeslagen)

2 punt(en) om na te kijken:
  - [mondial-downlight] WPF1234567: lichtstroom niet gevonden
  - [mondial-downlight] WPF1234890: buitenmaat niet gevonden
```

Bij zo'n melding kijk je in de Excel naar die artikelcode: staat de lichtstroom
er anders geschreven dan `1650lm` of `1400-2450lm`? Dan is de omschrijving in de
prijslijst het probleem, niet het script.

"Overgeslagen" is meestal goed nieuws: dat zijn snoersets en artikelen die je
filter eruit hield.

**`controleer-data.py` kijkt naar wat de tool nódig heeft.** Dat is iets anders.
Een artikel waarvan de buitenmaat wél gevonden is maar de zaagmaat niet, geeft
bij het eerste script geen melding en valt hier wel op — want zonder zaagmaat
kan de tool niet bepalen of het armatuur in een bestaand gat past.

```
3 families gecontroleerd.
Geen kritieke gaten. De punten met een streepje maken alleen een rij in het blad leeg.
```

Zolang er meldingen staan die je niet begrijpt: eerst uitzoeken, dan pas verder.

### 6 · Kijk of het klopt

Dubbelklik `vergelijking.html` in de hoofdmap. Maak een positie aan, typ je
nieuwe familienaam in het zoekveld en kies hem. Controleer in de rechterkolom:

- staan vermogen, lichtstroom en kleurtemperatuur er?
- klopt de IP-klasse met het familieblad?
- vult hij een afmeting in?

Klopt er iets niet, dan zit het bijna altijd in `families.json` (typefout) of in
de omschrijvingen in de prijslijst.

---

## Wegzetten

Eerst naar `main` — dat is jouw werkbranch; je collega's merken hier niets van.

```
cd ..
git add .
git commit -m "Vergelijker: familie Mondial toegevoegd"
git push
```

Dan, wanneer je zegt "dit is af", naar `release` — dát is wat je collega's zien
via de vaste link:

```
git checkout release
git merge main
git push
git checkout main
```

Die laatste regel is belangrijk: daarmee sta je weer op je werkbranch. Vergeet je
die, dan komt je volgende wijziging per ongeluk meteen bij je collega's terecht.

---

## Als het misgaat

| wat je ziet | wat het is |
|---|---|
| `'python' wordt niet herkend` | Python staat niet in PATH. Probeer `py`, of installeer opnieuw mét dat vinkje. |
| `No module named openpyxl` | `pip install openpyxl` |
| `Expecting ',' delimiter` | Komma vergeten of er één te veel in `families.json`. Het regelnummer staat erbij. |
| `bronbestand niet gevonden` | De naam bij `bron_excel` komt niet overeen met het bestand in `data\bron\`. |
| `kolom 'artikelcode' niet gevonden` | De Excel heeft andere kolomkoppen. Het script laat zien welke hij wél zag. |
| `export ... niet gevonden; de N artikelen blijven staan` | Geen fout: hij houdt de bestaande data aan omdat de export ontbreekt. |
| `Updates were rejected` bij `git push` | Er staat nieuwer werk op GitHub. Doe `git pull` en probeer opnieuw. |

Kom je er niet uit: niets is stuk zolang je niet gepusht hebt. `git checkout .`
gooit al je lokale wijzigingen weg en je begint schoon opnieuw.

---

## Wat je nooit met de hand aanpast

- `vergelijking.html` — wordt gegenereerd; je wijziging is weg na de volgende bouw
- `vergelijker/data/armaturen.json` — idem
- `armaturen-data.js` — idem

Die drie komen alle drie uit de scripts. Wil je iets aan de tool zelf veranderen,
dan is dat `vergelijker/index-template.html`.
