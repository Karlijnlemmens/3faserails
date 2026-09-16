#!/usr/bin/env python3
"""
knip-export.py — snijdt uit een ruwe prijslijstexport de drie kolommen die de
tool gebruikt, en schrijft die als .csv in data/bron/.

Waarom dit bestaat: de repo is openbaar. Een prijslijstexport heet niet voor
niets zo — daar staan inkoop- en brutoprijzen, staffels en marges in, kolommen
waar bouw-data.py niets mee doet maar die wel mee de repo in zouden gaan. Dit
script houdt alleen over wat de tool echt leest:

    artikelcode · merk · omschrijving

Meer is er niet nodig. De artikelcode is het artikelnummer (en het suffix
erachter verraadt de driver), het merk is de leverancier op het
vergelijkingsblad, en in de omschrijving staat op één regel de hele technische
opgave — vermogen, kleurtemperatuur, lichtstroom, maten, IP — die bouw-data.py
eruit leest. Status en barcode stonden hier eerder ook in; geen enkele tool in
de suite deed er iets mee.

Daarmee is de opbouw van armaturen.json reproduceerbaar zonder dat er één
prijsgegeven het pand verlaat. Dat het .csv wordt en geen .xlsx is geen detail:
git laat bij een tekstbestand zien wélke regels er tussen twee prijslijstrondes
veranderd zijn, bij een .xlsx alleen dat het bestand anders is.

Gebruik, vanuit de map vergelijker/:

    python knip-export.py ~/Downloads/Artikelnaam_codes.xlsx catalogus
    python knip-export.py ~/Downloads/extra.xlsx catalogus --aanvullen
    python knip-export.py ~/Downloads/*.xlsx          # naam uit de bestandsnaam

Met --aanvullen blijft staan wat er al staat en worden alleen artikelcodes
toegevoegd die er nog niet in zitten. Zonder die vlag wordt het bestand
overschreven.

De tweede waarde is de naam die in families.json bij "bron_excel" staat; de
extensie mag je weglaten. Laat je hem weg, dan wordt de naam van het
bronbestand gebruikt.

Vereist: pip install openpyxl (alleen voor .xlsx; een .csv gaat zonder).
"""

import csv
import sys
from pathlib import Path

HIER = Path(__file__).parent
BRON = HIER / "data" / "bron"

# Precies de kolommen die bouw-data.py opzoekt. Per kolom staan de namen waaronder
# hij in een export kan staan; de eerste is de naam die we wegschrijven.
KOLOMMEN = [
    ("artikelcode",  ("artikelcode", "artikel", "artikelnummer", "item number", "sku")),
    ("merk",         ("merk", "brand", "fabrikant", "leverancier", "supplier", "manufacturer")),
    ("omschrijving", ("omschrijving", "description", "productomschrijving")),
]


def lees(pad):
    """De rijen van een ruwe export, als lijst van tuples met de koprij vooraan."""
    if pad.suffix.lower() == ".csv":
        with pad.open(newline="", encoding="utf-8-sig") as f:
            monster = f.read(4096)
            f.seek(0)
            try:
                scheiding = csv.Sniffer().sniff(monster, delimiters=",;\t").delimiter
            except csv.Error:
                scheiding = ";" if monster.count(";") > monster.count(",") else ","
            return [tuple(r) for r in csv.reader(f, delimiter=scheiding)]
    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl ontbreekt en dit is een .xlsx.\n"
                 "Draai eerst: pip install openpyxl")
    ws = openpyxl.load_workbook(pad, read_only=True, data_only=True).worksheets[0]
    return list(ws.iter_rows(values_only=True))


def bestaande(uit):
    """De regels die al in data/bron/<naam>.csv staan, op artikelcode."""
    if not uit.exists():
        return {}, []
    with uit.open(newline="", encoding="utf-8-sig") as f:
        rijen = list(csv.reader(f))
    if not rijen:
        return {}, []
    return {r[0]: r for r in rijen[1:] if r and r[0]}, rijen[0]


def knip(pad, naam, aanvullen=False):
    rijen = lees(pad)
    if not rijen:
        sys.exit(f"{pad.name} is leeg.")
    kop = [str(c or "").strip().lower() for c in rijen[0]]

    gekozen, ontbreekt = [], []
    for uitnaam, namen in KOLOMMEN:
        i = next((kop.index(n) for n in namen if n in kop), None)
        if i is None:
            ontbreekt.append(uitnaam)
        gekozen.append((uitnaam, i))

    # Zonder deze twee valt er niets te bouwen; het merk mag ontbreken - dan valt
    # de tool terug op het merk dat in families.json bij de familie staat.
    for verplicht in ("artikelcode", "omschrijving"):
        if verplicht in ontbreekt:
            sys.exit(f"{pad.name}: kolom '{verplicht}' niet gevonden.\n"
                     f"Gevonden kolommen: {', '.join(k for k in kop if k)}")

    uit = BRON / (naam + ".csv")
    uit.parent.mkdir(parents=True, exist_ok=True)

    # Met --aanvullen blijft staan wat er al staat: een tweede export vult de
    # catalogus aan in plaats van hem te vervangen. Regels die er al zijn worden
    # niet aangeraakt - ook niet als de omschrijving inmiddels anders luidt, want
    # dan is het aan jou om te zeggen welke van de twee klopt.
    al, oudekop = ({}, [])
    if aanvullen:
        al, oudekop = bestaande(uit)
        if oudekop and oudekop != [n for n, _ in gekozen]:
            sys.exit(f"{uit.name} heeft andere kolommen ({', '.join(oudekop)}).\n"
                     f"Aanvullen kan alleen op een bestand met dezelfde kolommen.")

    geschreven = nieuwe = overgeslagen = 0
    with uit.open("w", newline="", encoding="utf-8") as f:
        schrijver = csv.writer(f)
        schrijver.writerow([n for n, _ in gekozen])
        for r in al.values():           # eerst wat er al stond, in dezelfde volgorde
            schrijver.writerow(r)
            geschreven += 1
        for r in rijen[1:]:
            if not r:
                continue
            waarden = [("" if i is None or i >= len(r) or r[i] is None else str(r[i]).strip())
                       for _, i in gekozen]
            if not waarden[0]:          # geen artikelcode: geen artikel
                continue
            if waarden[0] in al:
                overgeslagen += 1
                continue
            schrijver.writerow(waarden)
            geschreven += 1
            nieuwe += 1

    weggelaten = [k for k in kop if k and k not in [n for n, i in gekozen if i is not None]]
    if aanvullen:
        print(f"{pad.name} → data/bron/{uit.name}  ({geschreven} artikelen: "
              f"{len(al)} stonden er al, {nieuwe} toegevoegd)")
        if overgeslagen:
            print(f"   {overgeslagen} regels stonden er al en zijn gelaten zoals ze waren")
    else:
        print(f"{pad.name} → data/bron/{uit.name}  ({geschreven} artikelen)")
    if ontbreekt:
        print(f"   niet gevonden, blijft leeg: {', '.join(ontbreekt)}")
    if weggelaten:
        print(f"   weggelaten kolommen ({len(weggelaten)}): {', '.join(weggelaten)}")


def main():
    argumenten = [a for a in sys.argv[1:] if not a.startswith("--")]
    aanvullen = "--aanvullen" in sys.argv[1:]
    if not argumenten:
        sys.exit(__doc__.strip())
    pad = Path(argumenten[0]).expanduser()
    if not pad.exists():
        sys.exit(f"Niet gevonden: {pad}")
    naam = (argumenten[1] if len(argumenten) > 1 else pad.stem)
    knip(pad, Path(naam).stem, aanvullen)


if __name__ == "__main__":
    main()
