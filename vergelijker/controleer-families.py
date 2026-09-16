#!/usr/bin/env python3
"""
controleer-families.py — kijkt of de indeling in families klopt.

bouw-data.py leidt de families af uit de omschrijvingen. Dat gaat mis zodra een
variant-kenmerk in de naam staat ("Venus G2 DALI2" naast "Venus G2") of zodra
dezelfde maat op twee manieren geschreven is ("11x120cm opbouw" naast
"1195x110mm opbouw"). Dit script maakt dat zichtbaar op twee manieren:

  1. PROEVEN - een lijst gevallen waarvan we weten hoe ze horen uit te vallen.
     Die zijn met de hand nagekeken in de prijslijst; een verandering in de
     lezer die er een breekt is een regressie, geen smaakverschil.
  2. VERDELING - hoeveel families er zijn en hoe klein ze zijn. Een familie van
     een enkel artikel is niet per se fout (een bandrasterarmatuur wordt op maat
     gemaakt), maar hoort de uitzondering te zijn.

Draaien: python controleer-families.py
Afsluitcode 1 als een proef faalt.
"""

import collections, json, sys
from pathlib import Path

HIER = Path(__file__).parent
DATA = HIER / "data" / "armaturen.json"

# Gevallen die met de hand in de prijslijst zijn nagekeken. Per proef: een woord
# dat in de omschrijving moet staan, hoeveel families dat hoort op te leveren,
# en waarom.
PROEVEN = [
    ("bulkhead venus g2", 1,
     "Venus G2 is een armatuur. DALI2 is een uitvoering ervan (code -DA), "
     "geen eigen familie."),
    ("inlegarmatuur modul 30x120cm", 1,
     "Een reeks met vier drivervarianten; '18,5-30W' is een vermogen en hoort "
     "niet in de naam."),
    ("downlight mado 240 mat", 1,
     "'Matt' is een typefout voor 'Mat' en mag geen tweede familie maken."),
    ("downlight essence g2", 2,
     "De gewone en de PIR-uitvoering; die laatste is een ander armatuur met een "
     "eigen familieblad (ag17)."),
    ("paneel 30x120cm sigma g2", 1,
     "Een maat en een reeks samen zijn de familie; IP65 en CRI>90 zijn "
     "uitvoeringen."),
    ("plafonniere / wandarmatuur lumio", 3,
     "Lumio-S, -M en -L zijn drie armaturen van verschillend formaat."),
    ("richtspot adjusto g2", 1,
     "De prijslijst schrijft dezelfde reeks met en zonder 'LED' ervoor."),
    ("waterdicht armatuur typhoon", 2,
     "Typhoon en Typhoon G2 zijn twee generaties; de hoofdletters in "
     "'LED TL waterdicht armatuur typhoon' maken geen derde."),
]

# Paren die in DEZELFDE familie horen te vallen. Dat is iets anders dan een
# aantal: twee schrijfwijzen kunnen allebei een familie opleveren en toch twee
# verschillende zijn. Ook met de hand nagekeken in de prijslijst.
SAMEN = [
    ("11x120cm opbouw", "1195x110mm opbouw",
     "Dezelfde bandrasterarmatuur, de ene regel in centimeters en de andere in "
     "millimeters."),
    ("venus g2 dali2", "venus g2 ip65",
     "De DALI-uitvoering hoort bij Venus G2 (code -DA naast de kale code)."),
    ("mado 240 matt", "mado 240 mat",
     "'Matt' is een typefout."),
]


def families(data):
    return data.get("families", [])


def proef(fams, woord, verwacht):
    """De families waarin minstens een artikel dit woord in de omschrijving heeft."""
    raak = []
    for f in fams:
        for v in f.get("varianten", []):
            oms = " ".join(str(v.get("omschrijving") or "").lower().split())
            oms = oms.replace("è", "e").replace("é", "e")
            if woord in oms:
                raak.append(f)
                break
    return raak


def main():
    if not DATA.exists():
        sys.exit(f"{DATA.name} ontbreekt. Draai eerst: python bouw-data.py")
    fams = families(json.loads(DATA.read_text(encoding="utf-8")))

    print(f"{len(fams)} families, "
          f"{sum(len(f.get('varianten', [])) for f in fams)} artikelen\n")

    mis = 0
    for woord, verwacht, waarom in PROEVEN:
        raak = proef(fams, woord, verwacht)
        goed = len(raak) == verwacht
        mis += not goed
        print(f"{'goed ' if goed else 'FOUT '} \"{woord}\"  "
              f"{len(raak)} famili{'e' if len(raak)==1 else 'es'}, verwacht {verwacht}")
        if not goed:
            print(f"       {waarom}")
            for f in raak[:8]:
                print(f"       - {f['naam']}  ({len(f.get('varianten', []))} art.)")
            if len(raak) > 8:
                print(f"       ... en nog {len(raak)-8}")

    for a, b, waarom in SAMEN:
        fa, fb = proef(fams, a, 0), proef(fams, b, 0)
        ids_a = {f["id"] for f in fa}
        ids_b = {f["id"] for f in fb}
        goed = bool(ids_a) and bool(ids_b) and ids_a == ids_b
        mis += not goed
        print(f"{'goed ' if goed else 'FOUT '} \"{a}\" en \"{b}\" "
              f"{'in dezelfde familie' if goed else 'vallen uit elkaar'}")
        if not goed:
            print(f"       {waarom}")
            print(f"       links : {', '.join(f['naam'] for f in fa) or '(niets gevonden)'}")
            print(f"       rechts: {', '.join(f['naam'] for f in fb) or '(niets gevonden)'}")

    n = collections.Counter(len(f.get("varianten", [])) for f in fams)
    klein = sum(v for k, v in n.items() if k <= 2)
    print(f"\nverdeling: {n[1]} families met 1 artikel, {n[2]} met 2, "
          f"{sum(v for k, v in n.items() if k > 2)} met meer")
    print(f"           {klein} van de {len(fams)} families "
          f"({100*klein//max(len(fams),1)}%) heeft hoogstens 2 artikelen")

    if mis:
        print(f"\n{mis} proef(en) gefaald.")
        sys.exit(1)
    print("\nAlle proeven goed.")


if __name__ == "__main__":
    main()
