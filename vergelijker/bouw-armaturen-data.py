#!/usr/bin/env python3
"""bouw-armaturen-data.py — zet data/armaturen.json om in ../armaturen-data.js.

Waarom een omweg via javascript: de tools worden rechtstreeks vanaf schijf
geopend (file://) en de browser weigert daar fetch() naar een los bestand. Een
<script src> mag wel. De vergelijker lost dat op door de data in zijn eigen
pagina te bakken (bouw-tool.py); presenters.html is geen gegenereerde pagina en
laadt dit bestand.

Draaien na elke wijziging in data/armaturen.json:

    python3 vergelijker/bouw-armaturen-data.py
"""
import hashlib, json, sys
from pathlib import Path

HIER = Path(__file__).parent
DATA = HIER / "data" / "armaturen.json"
FAM  = HIER / "data" / "families.json"
UIT  = HIER.parent / "armaturen-data.js"

if not DATA.exists():
    sys.exit("data/armaturen.json ontbreekt. Draai eerst: python bouw-data.py")

data = json.loads(DATA.read_text(encoding="utf-8"))

# families.json draagt de gegevens die niet uit de prijslijst komen (presenter-id,
# zoektermen, montagewijzen). bouw-data.py voegt ze al samen in armaturen.json;
# ontbreekt daar iets, dan vullen we het hier alsnog aan zodat beide bestanden
# hetzelfde beeld geven.
if FAM.exists():
    extra = {f["id"]: f for f in json.loads(FAM.read_text(encoding="utf-8"))}
    for fam in data.get("families", []):
        bron = extra.get(fam.get("id"))
        if not bron:
            continue
        for sleutel, waarde in bron.items():
            if sleutel != "varianten" and sleutel not in fam:
                fam[sleutel] = waarde

def vinger(pad):
    """Vingerafdruk van een bronbestand, zodat tools/controleer-suite.mjs kan zien
       of dit bestand nog bij zijn bron hoort. Regeleinden gelijkgetrokken: git zet
       ze op Windows om, en dat maakt de data niet anders."""
    if not pad.exists():
        return "-"
    tekst = pad.read_text(encoding="utf-8").replace("\r\n", "\n")
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()[:16]

n = sum(len(f.get("varianten", [])) for f in data.get("families", []))
UIT.write_text(
    "/* Gegenereerd door vergelijker/bouw-armaturen-data.py - niet met de hand aanpassen.\n"
    "   Bron: vergelijker/data/armaturen.json (+ families.json). */\n"
    f"/* bron-vingerafdruk armaturen.json={vinger(DATA)} families.json={vinger(FAM)} */\n"
    "window.ARMATUREN_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
    encoding="utf-8")
print(f"{UIT.name} geschreven - {len(data.get('families', []))} families, {n} artikelen, "
      f"{UIT.stat().st_size//1024} kB")
