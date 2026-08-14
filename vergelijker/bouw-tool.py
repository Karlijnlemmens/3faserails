#!/usr/bin/env python3
"""bouw-tool.py — zet data/armaturen.json in index-template.html en schrijft ../vergelijking.html.

De tool draait als tabblad van de Distrilight tools-suite en staat daarom in de
hoofdmap, naast index.html: de koptekst verwijst naar de andere pagina's en naar
merk/Distrilight logo donker.png.
"""
import json, sys
from pathlib import Path

HIER = Path(__file__).parent
TPL  = HIER / "index-template.html"
DATA = HIER / "data" / "armaturen.json"
UIT  = HIER.parent / "vergelijking.html"
MERK = "/*__ARMATUREN_DATA__*/ null"
NOTITIE = ("<!-- Gegenereerd door vergelijker/bouw-tool.py — niet met de hand aanpassen.\n"
           "     Aanpassen doe je in vergelijker/index-template.html; draai daarna opnieuw. -->")

if not DATA.exists():
    sys.exit("data/armaturen.json ontbreekt. Draai eerst: python bouw-data.py")

html = TPL.read_text(encoding="utf-8")
if MERK not in html:
    sys.exit(f"Plaatshouder niet gevonden in {TPL.name}. Is het bestand aangepast?")

data = json.loads(DATA.read_text(encoding="utf-8"))
n = sum(len(f.get("varianten", [])) for f in data.get("families", []))

import re
html = html.replace(MERK, json.dumps(data, ensure_ascii=False))
html = re.sub(r"\n*<!--SJABLOON-->.*?<!--/SJABLOON-->\n*", "\n", html, flags=re.S)   # sjabloontekst weg
html = re.sub(r"<title>.*?</title>", "<title>Armatuurvergelijker \u2014 Distrilight</title>", html, flags=re.S)
html = html.replace("<head>", "<head>\n" + NOTITIE, 1)
UIT.write_text(html, encoding="utf-8")
print(f"{UIT.name} geschreven — {len(data.get('families', []))} families, {n} artikelen, {UIT.stat().st_size//1024} kB")
