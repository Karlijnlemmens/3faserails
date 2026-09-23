# Controles

Er is geen testrunner in dit project. In plaats daarvan staan hier scripts die
samen vangen wat anders pas opvalt als een collega het meldt. Ze eindigen allemaal
met afsluitcode 1 als er iets mis is. **Draai ze in één keer:**

```
node tools/controleer-alles.mjs          # de vijf controles, ongeveer een minuut
node tools/controleer-alles.mjs --pdf    # plus de PDF-regressie tegen de laatste commit
```

Dat geeft per controle één regel en onderaan één uitslag; wat misgaat krijgt zijn
volledige uitvoer eronder (`--uitgebreid` laat ook de rest zien). `--pdf` zet de
laatste commit in een tijdelijke git-worktree, laat daar én in de werkmap elke tool
een PDF maken en vergelijkt die op inhoud - het vangnet hieronder, zonder dat je
zelf een "voor"-map hoeft te maken. Met `--pdf-tegen <map>` vergelijk je in plaats
daarvan met een map die je eerder met `pdfbaseline.mjs` maakte.

| script | wat het nakijkt |
|---|---|
| `node tools/controleer-logica.mjs` | de rekenkern: armatuurherkenning, de bandrasterberekening tegen het voorbeeld uit de werkmap, het uitlezen van geplakte specificaties, de zoekers en de presenterkeuze van de vergelijker |
| `node tools/controleer-suite.mjs` | wat over meerdere bestanden gelijk moet blijven: armatuurtabel, tabbladenrij, palet, geen netwerkverzoeken, gedeelde scripts, en dat de ingebakken productdata bij `armaturen.json` hoort |
| `node tools/controleer-presenters.mjs` | de ingebakken presenters: lege pagina's, uitschieters in grootte, lijst en map uit de pas |
| `python3 vergelijker/controleer-families.py` | dat de productdata in de juiste families valt: nagekeken gevallen, en hoeveel families er uit één artikel bestaan |
| `python3 vergelijker/controleer-data.py` | of `armaturen.json` compleet genoeg is om op te kiezen. Er zijn 14 bekende punten - families waarvan de prijslijst nergens een lichtstroom noemt - dus `controleer-alles` draait hem met `--hoogstens 14`: een vijftiende maakt het rood |
| `node tools/pdfbaseline.mjs` + `vergelijk.mjs` | dat een wijziging niets aan de PDF's verandert (hieronder) |

`controleer-logica.mjs` draait de échte code van de tools: het snijdt de declaraties
die het nodig heeft uit het HTML-bestand en importeert die als module via een
`data:`-URL. Er hoeft dus niets aan de tools zelf te veranderen om ze te kunnen
testen, en de test kan niet uit de pas lopen met een kopie.

## PDF-regressiecontrole

Hulpmiddelen om te controleren dat een wijziging in de PDF-code niets aan de
uitvoer verandert. Dit is het vangnet bij het verbouwen van `pdf-huisstijl.js` en de
tools die hem gebruiken.

Nodig: Node en Playwright met Chromium (staat op de ontwikkelmachine onder
`/opt/pw-browsers`; pas het pad in `pdfbaseline.mjs` aan als het ergens anders
staat).

## Werkwijze

```
# 1 - vastleggen hoe het NU is (vóór je iets wijzigt)
node tools/pdfbaseline.mjs /tmp/pdf-voor

# 2 - wijzigen ...

# 3 - opnieuw maken en vergelijken
node tools/pdfbaseline.mjs /tmp/pdf-na
node tools/vergelijk.mjs /tmp/pdf-voor /tmp/pdf-na
```

`pdfbaseline.mjs` opent elke tool in een verborgen browser, laat hem een PDF
maken en schrijft die weg. Eén tool tegelijk kan met
`ALLEEN=vergelijker node tools/pdfbaseline.mjs /tmp/pdf-na`
(namen: `railconfigurator`, `armaturenboek`, `vergelijker`).

`vergelijk.mjs` vergelijkt op INHOUD, niet op bytes: per pagina de gedecodeerde
tekenopdrachten plus de ingesloten beelden en lettertypen. Wat pdf-lib zelf
verzint - objectnummers, resource-namen als `/Image-7264808453`, de datum in de
metagegevens - blijft daarbij buiten beeld, want dat hangt af van de volgorde
van insluiten en niet van wat er op de pagina staat.

## Als er een verschil uitkomt

`dumpstream.mjs` schrijft de tekenopdrachten van één pagina naar een tekstbestand:

```
node tools/dumpstream.mjs /tmp/pdf-voor/vergelijker.pdf 2 /tmp/p2-voor.txt
node tools/dumpstream.mjs /tmp/pdf-na/vergelijker.pdf  2 /tmp/p2-na.txt
diff /tmp/p2-voor.txt /tmp/p2-na.txt
```

`leestekst.mjs` zet de glyph-codes van een pagina terug om naar leesbare tekst,
zodat je ziet wélke tekst veranderd is:

```
node tools/leestekst.mjs /tmp/pdf-na/vergelijker.pdf 2
node tools/leestekst.mjs /tmp/pdf-na/vergelijker.pdf 2 458   # alleen rond y=458
```
