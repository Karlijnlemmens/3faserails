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
    ("plafonniere / wandarmatuur lumio", 1,
     "Lumio-S, -M en -L zijn drie formaten van dezelfde reeks: één familie, "
     "het formaat is een keuze."),
    # De aanleiding voor de reeks-sleutel: "sigma" gaf zes families die allemaal
    # Sigma heetten - drie maten maal twee generaties. Nu één, met de maat en de
    # generatie als keuze erachter.
    ("paneel 30x120cm sigma", 1,
     "Alle Sigma-panelen vallen onder Sigma; maat en generatie zijn keuzes."),
    ("paneel 60x60cm sigma", 1,
     "Idem - en het moet dezelfde familie zijn als de 30x120 (zie SAMEN)."),
    ("richtspot adjusto g2", 1,
     "De prijslijst schrijft dezelfde reeks met en zonder 'LED' ervoor."),
    # De Mondial is EEN armatuur met opties, geen reeks losse families: de
    # inbouwdiepte, de reflector, de kleur en DALI staan allemaal achter de
    # IP-klasse en horen dus bij het artikel. Alleen PIR en COB zijn eigen
    # families - die hebben een eigen familieblad.
    ("downlight mondial", 3,
     "Mondial, Mondial PIR en Mondial COB. Verdiept/standaard/plat, facet/"
     "hoogglans, wit/zwart en DALI zijn uitvoeringen van dezelfde Mondial."),
    ("frame paneel conto", 1,
     "Een paneel MET frame is een armatuur; de 30x120 en de 60x60 zijn twee "
     "maten van dezelfde reeks. Een LOS frame noemt geen lichtstroom en valt "
     "daar al op af."),
    ("essence g2 licht verdiepte frame", 0,
     "Een los frame is geen armatuur."),
    ("waterdicht armatuur typhoon", 1,
     "Typhoon en Typhoon G2 zijn twee generaties van dezelfde reeks: één "
     "familie, de generatie is een keuze."),
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
    ("paneel 30x120cm sigma", "paneel 60x60cm sigma",
     "Twee maten van dezelfde reeks horen in dezelfde familie."),
    ("mado 195 darklight", "mado 240 mat",
     "Diameter en optiek zijn uitvoeringen van de Mado, geen eigen families."),
]

# Wat juist NIET mag samenvallen doordat de sleutel de reeks werd. Een kaal
# getal in de naam gaat alleen weg als het artikel diezelfde maat ook noemt;
# de 5 en de 7 hieronder zijn het armatuur waar de module in past.
APART = [
    ("ridi-vlsg-5", "ridi-vlsg-7",
     "Twee Retroline-modules voor verschillende originele armaturen."),
    ("t5/t8 2-voudig", "t5/t8 4-voudig",
     "Een re-light kit met twee buizen is niet die met vier."),
]

# Woorden die na de merkvoorrang uit de data horen te zijn verdwenen: hetzelfde
# artikel onder twee merken levert er één op, en Pragmalux gaat voor.
WEG = [
    ("white label", "Dezelfde spots staan onder Pragmalux in de lijst; "
                    "MERK_VOORRANG laat die winnen."),
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

    for a, b, waarom in APART:
        ids_a = {f["id"] for f in proef(fams, a, 0)}
        ids_b = {f["id"] for f in proef(fams, b, 0)}
        goed = bool(ids_a) and bool(ids_b) and not (ids_a & ids_b)
        mis += not goed
        print(f"{'goed ' if goed else 'FOUT '} \"{a}\" en \"{b}\" "
              f"{'in aparte families' if goed else 'zitten in dezelfde familie'}")
        if not goed:
            print(f"       {waarom}")
            print(f"       links : {', '.join(f['naam'] for f in proef(fams,a,0)) or '(niets gevonden)'}")
            print(f"       rechts: {', '.join(f['naam'] for f in proef(fams,b,0)) or '(niets gevonden)'}")

    for woord, waarom in WEG:
        raak = proef(fams, woord, 0)
        mis += bool(raak)
        print(f"{'goed ' if not raak else 'FOUT '} \"{woord}\" "
              f"{'komt niet meer voor' if not raak else 'staat er nog in'}")
        if raak:
            print(f"       {waarom}")
            for f in raak[:4]:
                print(f"       - {f['naam']}  ({len(f.get('varianten', []))} art.)")

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
