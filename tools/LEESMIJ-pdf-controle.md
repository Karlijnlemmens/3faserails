# PDF-regressiecontrole

Hulpmiddelen om te controleren dat een wijziging in de PDF-code niets aan de
uitvoer verandert. Er is geen testrunner in dit project; dit is het vangnet dat
daarvoor in de plaats komt bij het verbouwen van `pdf-huisstijl.js` en de tools
die hem gebruiken.

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
