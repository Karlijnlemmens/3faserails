# Productdata in de vergelijker

Stap voor stap, voor wie het op zijn eigen laptop doet. Windows; op een Mac is
alles hetzelfde op de schuine streepjes na.

Deze handleiding gaat over de **productdata**: de catalogus bijwerken als er een
nieuwe prijslijst is, en een familie completer maken met wat er niet in de
prijslijst staat. Wil je de tool zelf veranderen, dan is `README.md` in deze map
het startpunt.

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

## Twee routes

Er zit één export in de repo met **de hele Pragmalux-catalogus** erin:
`vergelijker/data/bron/catalogus.csv`, drie kolommen, ~3600 artikelen. Daaruit
maakt `bouw-data.py` de families zélf — alles vóór de eerste technische opgave
in de omschrijving is de naam, en alle artikelen met dezelfde naam vormen samen
een familie. Je hoeft dus niets te doen om een armatuur in de tool te krijgen.

Dat betekent dat er nog maar twee dingen te doen zijn:

| wat je wilt | route |
|---|---|
| nieuwe prijslijst binnen → alle armaturen bijwerken | **A · Catalogus bijwerken** |
| één familie completer maken (IP, UGR, levensduur, presenter) | **B · Familie verrijken** |

---

## Route A · De catalogus bijwerken

Eén commando, en dan bouwen.

```
python vergelijker\knip-export.py "C:\Users\jij\Downloads\Artikelnaam_codes.xlsx" catalogus
```

Achter de scriptnaam staan twee dingen:

- **het pad naar je Excel**. Staan er spaties in, zet het dan tussen
  aanhalingstekens. Makkelijkste manier: sleep het bestand vanuit Verkenner het
  opdrachtvenster in, dan wordt het pad er vanzelf ingetypt.
- **`catalogus`** — de naam van het bestand dat eruit komt. Voor de hele
  catalogus is dat altijd `catalogus`; die overschrijf je gewoon.

Heb je een **losse lijst met aanvullingen** in plaats van een volledige nieuwe
prijslijst, zet er dan `--aanvullen` achter:

```
python vergelijker\knip-export.py "C:\Users\jij\Downloads\extra.xlsx" catalogus --aanvullen
```

Dan blijft staan wat er al staat en komen alleen artikelcodes erbij die er nog
niet in zaten. Je ziet het in de melding: `3707 artikelen: 3619 stonden er al,
88 toegevoegd`. Staat een artikel er al maar luidt de omschrijving anders, dan
wordt het **niet** aangeraakt — welke van de twee klopt is niet aan het script.

Je krijgt te zien wat er gebeurd is:

```
Artikelnaam_codes.xlsx → data/bron/catalogus.csv  (3619 artikelen)
   weggelaten kolommen (5): bruto prijs, netto inkoop, marge %, status, barcode 1
```

**Lees die tweede regel echt.** Alles behalve artikelcode, merk en omschrijving
wordt weggeknipt, en dat moet ook: deze repo staat openbaar op internet en een
prijslijstexport heeft inkoopprijzen, staffels en marges aan boord.

Ga daarna door naar **Bouwen** hieronder.

### Wat de tool uit de omschrijving haalt

De omschrijving is één regel waar alles in staat. Deze bijvoorbeeld:

```
Pragmalux  LED Inbouw/Opbouw Downlight Luna G2 IP44 12W/18W 3000K-6000K 3-CCT
1400-2050lm Ø217 Buitenmaat - Gatmaat Ø65-185 incl. LED Driver
```

wordt dit op het blad:

| rij op het blad | wat erin komt | waar het vandaan komt |
|---|---|---|
| Leverancier | Pragmalux | kolom `Merk` |
| Type | LED Inbouw/Opbouw Downlight Luna G2 | alles vóór de eerste technische opgave |
| Artikelnummer | 1047515 | kolom `Artikelcode` |
| Omschrijving | de hele regel | kolom `Omschrijving` |
| Vermogen | 12-18W | `12W/18W` — twee standen, dus een onder- en een bovengrens |
| Kleurtemperatuur | 3000K-6000K 3-CCT | letterlijk overgenomen, mét het aantal standen |
| Nuttige lichtstroom | 1400-2050lm | |
| Afmetingen | Ø217 Buitenmaat - Gatmaat Ø65-185 | letterlijk, dus de reeks blijft staan |
| IP-klasse | IP44 | |
| Montage | Inbouw, opbouw | `Inbouw/Opbouw` noemt er twee, dus wordt er geen gekozen |

**Wat er niet in staat, wordt niet verzonnen.** Staat de lichtstroom er als
`900-1400ml` (een typefout in de prijslijst), dan blijft die rij leeg en meldt
`controleer-data.py` het. Dat is de bedoeling: liever een lege rij dan een
verkeerd getal op een blad dat naar een klant gaat.

### Wat er níét in komt

Frames, montagebeugels, opvulringen, noodmodules, afstandsbedieningen en losse
LED-modules gaan er automatisch uit — dat zijn geen armaturen en dus geen
alternatief voor een armatuur. De regel is: staat er zo'n woord in de naam, of
noemt de regel géén lichtstroom én géén vermogen, dan valt hij af.

Vier woorden liggen lastiger, omdat ze ook de optiek van een armatuur
beschrijven: **reflector, lens, kap en driver**. "Railspot Piccolo 15W 24D
Reflector" is een losse reflector, maar "Bandrasterarmatuur Optic matte
reflector 147x1570mm 26-36W 3550-4700lm" is een armatuur. Die vallen daarom
alleen af als de regel niet zowel een lichtstroom als een vermogen noemt — een
armatuur noemt allebei, een onderdeel hooguit één.

Je ziet bij het bouwen hoeveel regels er zijn afgevallen. Valt er iets uit dat
wél een lichtstroom noemt, dan wordt dat regel voor regel gemeld — dat is precies
het geval dat je wilt nakijken.

---

## Route B · Een familie verrijken

De prijslijst zegt niets over IP-klasse als die niet in de omschrijving staat,
en al helemaal niets over IK, UGR, kleurweergave, levensduur of welk
familieblad erbij hoort. Dat is de handgeschreven laag: een blok in
`vergelijker\data\families.json` dat je **over** een of meer gevonden families
heen legt.

Open dat bestand in Kladblok of VS Code. Het is een lijst van blokken tussen `[`
en `]`. Zet jouw blok onderaan, **vóór** de sluitende `]`, met een komma achter
het blok dat er nu als laatste staat.

```json
{
  "id": "mondial-downlight",
  "naam": "LED Downlight Mondial",
  "namen": ["LED Downlight Mondial", "LED Downlight Mondial COB"],
  "lijn": "Premium",
  "ip": "IP54",
  "ik": "IK03",
  "ugr": "<19",
  "cri_min": 90,
  "levensduur": "100.000 L90B10 Ta25",
  "garantie_jaar": 5,
  "presenter": "ag25"
}
```

`namen` is het enige dat echt moet kloppen: dat zijn de familienamen **zoals de
tool ze uit de catalogus heeft gehaald**. Hoe je die te weten komt:

```
cd vergelijker
python bouw-data.py
```

en zoek in `data\armaturen.json` op een woord uit de naam, of open
`vergelijking.html` en typ het in de zoekbalk. Je ziet daar precies hoe een
familie heet.

Dekt je blok meerdere families, dan krijgen ze allemaal die IP, UGR en
presenter, maar houdt elke familie zijn eigen naam — anders zouden een 30x120 en
een 60x60 paneel na afloop hetzelfde heten. Het script zegt erbij hoeveel
families je blok geraakt heeft, en klaagt als het er nul zijn.

| veld | waar je het haalt |
|---|---|
| `id` | verzin je, kleine letters met streepjes. Moet uniek zijn. |
| `namen` | exact de familienamen uit de catalogus |
| `ip` `ik` `ugr` `cri_min` `levensduur` `garantie_jaar` | uit het familieblad van die serie |
| `presenter` | het `ag`-nummer van dat familieblad, te vinden in de map `presenters\` |
| `zoektermen` | extra woorden waarop jullie die familie zoeken |
| `cct` | alleen nodig als de omschrijvingen geen kleurtemperatuur noemen |

**Vier dingen waar JSON op stukgaat:**

1. Een komma **tussen** blokken, en géén komma achter het laatste.
2. Altijd dubbele aanhalingstekens `"`, nooit enkele.
3. `false` en `true` zonder aanhalingstekens; tekst juist wél tussen
   aanhalingstekens.
4. Een backslash schrijf je **dubbel**: `\\d`, niet `\d`.

Twijfel je of het klopt? Plak de inhoud in [jsonlint.com](https://jsonlint.com) —
die wijst de regel aan waar het misgaat.

---

## Bouwen

Vier commando's, in deze volgorde — bij allebei de routes hetzelfde:

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
| `bouw-data.py` | `data/bron/catalogus.csv` + `families.json` | `data/armaturen.json` |
| `controleer-data.py` | *(alleen kijken)* | meldingen op je scherm |
| `bouw-tool.py` | `armaturen.json` + de template | `..\vergelijking.html` |
| `bouw-armaturen-data.py` | `armaturen.json` | `..\armaturen-data.js` |

Dat laatste script wordt makkelijk vergeten: de presenters-tool leest een eigen
kopie van de data, en zonder die stap loopt die achter.

## Lees de meldingen

Dit is de stap die telt. De twee scripts kijken naar **verschillende** dingen.

**`bouw-data.py` meldt wat er niet klopte aan de bron.** Je krijgt zoiets:

```
  catalogus.csv       2867 artikelen in 399 families (752 overgeslagen: toebehoren, frames, drivers)

3 punt(en) om na te kijken:
  - overgeslagen maar noemt wel een lichtstroom: 9172508 — ...Railspot Alto SF Driver 29W...
  - [essence-g2-downlight] dekt 2 families: LED Downlight Essence G2, LED Downlight Essence G2 PIR
```

De eerste soort melding is de belangrijkste: daar viel iets weg dat misschien
tóch een armatuur was. De tweede vertelt alleen wat je blok geraakt heeft.

**`controleer-data.py` kijkt naar wat de tool nódig heeft.** Alleen families met
iets te melden komen in beeld; de rest wordt geteld.

```
399 families gecontroleerd, 31 zonder opmerking.
27 punt(en) met een uitroepteken: ...
```

Een uitroepteken betekent: van deze familie noemt **geen enkel** artikel een
lichtstroom, dus daar valt niets mee te vergelijken. Dat komt bijna altijd
doordat de omschrijving in de prijslijst incompleet is. Een streepje is een rij
die leeg blijft — vervelend, niet stuk.

## Kijk of het klopt

Dubbelklik `vergelijking.html` in de hoofdmap. Maak een positie aan, typ de
familienaam in het zoekveld en kies hem. Controleer in de rechterkolom:

- staan vermogen, lichtstroom en kleurtemperatuur er?
- klopt de IP-klasse?
- vult hij een afmeting in?

Klopt er iets niet, dan zit het in `families.json` (typefout in `namen`) of in de
omschrijving in de prijslijst.

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
| `kolom 'artikelcode' niet gevonden` | De Excel heeft andere kolomkoppen. Het script laat zien welke hij wél zag. |
| `niet gevonden, blijft leeg: merk` | Geen fout: er is geen merkkolom. De tool gebruikt dan het `merk` uit `families.json`. |
| `geen enkele familie in de catalogus heet '...'` | De `namen` in je blok komen niet overeen. Zoek de familie op in `vergelijking.html` en neem de naam letterlijk over. |
| `dekt N families: ...` | Geen fout: je blok raakt er meer dan één. Klopt dat rijtje, dan is het goed. |
| `overgeslagen maar noemt wel een lichtstroom` | Een regel viel weg als toebehoren terwijl er een lichtstroom in staat. Kijk na of het toch een armatuur is. |
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
