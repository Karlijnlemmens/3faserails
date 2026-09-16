#!/usr/bin/env python3
"""
controleer-data.py — kijkt of data/armaturen.json compleet genoeg is voor de tool.

bouw-data.py meldt wat het niet uit de omschrijving kón lezen. Dat is niet
hetzelfde als wat de tool nódig heeft: een artikel waarvan de buitenmaat wel
gevonden is maar de gatmaat niet, levert daar geen melding op en valt hier wel op.

Draaien: python controleer-data.py
Afsluitcode 1 als er kritieke gaten zijn, zodat je het in een controle kunt hangen.
"""

import importlib.util, json, sys
from pathlib import Path

HIER = Path(__file__).parent
DATA = HIER / "data" / "armaturen.json"
TOON = 6          # zoveel artikelcodes per punt, daarna "... en nog N"


def maat(v):
    """Waar de tool 'de kleinste behuizing' aan afleest."""
    return v.get("buitenmaat_mm") or v.get("afmetingen_mm") or v.get("lengte_cm")


def heeft_gat(v):
    """Alleen inbouw heeft een gatmaat; opbouw en pendel niet."""
    u = str(v.get("uitvoering") or "").lower()
    if u in ("opbouw", "pendel"):
        return False
    montage = str(v.get("omschrijving") or "").lower()
    return u in ("inbouw", "verdiept", "standaard") or "inbouw" in montage


def codes(lijst):
    namen = [v.get("artikelcode", "?") for v in lijst[:TOON]]
    rest = len(lijst) - len(namen)
    return ", ".join(namen) + (f" ... en nog {rest}" if rest > 0 else "")


def controleer_familie(fam):
    """Geeft (kritiek, aandacht) — twee lijsten regels."""
    varianten = fam.get("varianten", [])
    kritiek, aandacht = [], []

    if not varianten:
        kritiek.append("geen varianten — staat het Excel-bestand in data/bron/ en klopt bron_excel?")
        return kritiek, aandacht

    # --- familievelden die in het vergelijkingsblad terechtkomen ---
    if not fam.get("naam"):
        kritiek.append("familie heeft geen naam — de keuzelijst in de tool blijft leeg")
    if not fam.get("cct"):
        aandacht.append("geen cct — de rij Kleurtemperatuur blijft leeg")
    if not fam.get("zoektermen"):
        aandacht.append("geen zoektermen — de familie is straks niet te vinden op trefwoord")

    # --- per variant ---
    zonder_lm = [v for v in varianten if not v.get("lichtstroom_lm")]
    zonder_maat = [v for v in varianten if not maat(v)]
    zonder_w = [v for v in varianten if not v.get("vermogen_w")]
    zonder_gat = [v for v in varianten if heeft_gat(v) and not v.get("zaagmaat_mm")]
    zonder_dim = [v for v in varianten if v.get("driver") and not v.get("dimprotocol")]
    zonder_oms = [v for v in varianten if not v.get("omschrijving")]

    if zonder_lm:
        kritiek.append(f"{len(zonder_lm)}x geen lichtstroom — de tool kan hier niet op filteren: {codes(zonder_lm)}")
    if zonder_maat:
        kritiek.append(f"{len(zonder_maat)}x geen afmeting — 'kleinste behuizing wint' werkt niet: {codes(zonder_maat)}")
    if zonder_gat:
        aandacht.append(f"{len(zonder_gat)}x inbouw zonder gatmaat — geen melding over het bestaande gat: {codes(zonder_gat)}")
    if zonder_w:
        aandacht.append(f"{len(zonder_w)}x geen vermogen — de rij Vermogen blijft leeg: {codes(zonder_w)}")
    if zonder_dim:
        aandacht.append(f"{len(zonder_dim)}x driver zonder dimprotocol — de rij Dimbaar blijft leeg: {codes(zonder_dim)}")
    if zonder_oms:
        aandacht.append(f"{len(zonder_oms)}x geen omschrijving: {codes(zonder_oms)}")

    # Een ondergrens die ontbreekt is geen fout: bij 'max. 1650lm' hangt de
    # ondergrens van de driver af. Wel goed om te weten dat er dan niets
    # wegvalt omdat een armatuur te groot zou zijn.
    open_onder = [v for v in varianten
                  if v.get("lichtstroom_lm") and v["lichtstroom_lm"].get("min") is None]
    if open_onder and len(open_onder) == len(varianten):
        aandacht.append("alle varianten hebben alleen een bovengrens voor lichtstroom — "
                        "er valt niets af omdat het te ruim bemeten is, de kleinste wint")

    return kritiek, aandacht


# --- de lezer zelf -----------------------------------------------------------
# lees_omschrijving() in bouw-data.py is de spil: elke familie die erbij komt
# hangt ervan af. Hier staan de vormen waarvan we weten dat ze voorkomen, plus
# de twee die er juist géén maat uit mogen maken.
LEESPROEVEN = [
    ("Pragmalux  LED Inbouw/Opbouw Downlight Luna G2 IP44 12W/18W 3000K-6000K 3-CCT "
     "1400-2050lm \u00d8217 Buitenmaat - Gatmaat \u00d865-185 incl. LED Driver", "Pragmalux",
     {"type": "LED Inbouw/Opbouw Downlight Luna G2",
      "vermogen_w": {"min": 12.0, "max": 18.0},
      "cct_tekst": "3000K-6000K 3-CCT",
      "lichtstroom_lm": {"min": 1400, "max": 2050},
      "afmetingen_tekst": "\u00d8217 Buitenmaat - Gatmaat \u00d865-185",
      "zaagmaat_mm": 65, "buitenmaat_mm": 217, "ip": 44,
      # "Inbouw/Opbouw" noemt er twee: dan zegt de omschrijving niet welke.
      "uitvoering": None}),

    ("Pragmalux LED Downlight Essence G2 IP54 wit opbouw max. 15W 3000K-6000K 3-CCT "
     "max. 1650lm 100D \u00d8150x80(H) Buitenmaat excl. LED Driver", "Pragmalux",
     {"type": "LED Downlight Essence G2",
      "cct_tekst": "3000K-6000K 3-CCT",
      "afmetingen_tekst": "\u00d8150x80(H) Buitenmaat",
      "uitvoering": "opbouw", "kleur": "wit"}),

    ("Paneel Essence G3 25-34W 600 3000K-6000K 3-CCT UGR<19 DALI2,0/1-10V,Push-dim", "Pragmalux",
     {"type": "Paneel Essence G3",
      "vermogen_w": {"min": 25.0, "max": 34.0},
      "cct_tekst": "3000K-6000K 3-CCT",
      # Een kale "600" is geen maat: dat kan alles zijn.
      "afmetingen_tekst": None}),

    # De doorvoerbedrading (3x2,5mm) en het aantal buizen (2x18W) zijn geen
    # afmetingen. Daarom eist een lxbxh per getal minstens twee cijfers.
    ("Essence Classic G3 IP66 60cm 11-19W 1400-2450lm 3CCT 3x2,5mm Doorvoerbedrading (2x18W)",
     "Pragmalux",
     {"type": "Essence Classic G3", "lengte_cm": 60, "ip": 66,
      "afmetingen_tekst": None, "cct_tekst": None}),
]


def lezer():
    spec = importlib.util.spec_from_file_location("bouwdata", HIER / "bouw-data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.lees_omschrijving


def controleer_lezer():
    """Geeft het aantal misslagen; drukt alleen af wat er misgaat."""
    lees = lezer()
    mis = 0
    for tekst, merk, verwacht in LEESPROEVEN:
        gekregen, _ = lees(tekst, merk)
        for veld, waarde in verwacht.items():
            echt = gekregen.get(veld)
            if echt != waarde:
                mis += 1
                print(f"     ! {veld}: {echt!r}, verwacht {waarde!r}")
                print(f"       in: {tekst[:70]}...")
    print(f"\n{'FOUT ' if mis else 'goed '} omschrijvingen lezen  "
          f"({len(LEESPROEVEN)} proeven)")
    if not mis:
        print("       alles gelezen zoals bedoeld")
    return mis


def main():
    if not DATA.exists():
        sys.exit(f"{DATA.relative_to(HIER)} ontbreekt. Draai eerst: python bouw-data.py")

    data = json.loads(DATA.read_text(encoding="utf-8"))
    families = data.get("families", [])
    totaal_kritiek = controleer_lezer()

    for fam in families:
        kritiek, aandacht = controleer_familie(fam)
        totaal_kritiek += len(kritiek)
        n = len(fam.get("varianten", []))
        vlag = "FOUT " if kritiek else ("kijk " if aandacht else "goed ")
        print(f"\n{vlag} {fam.get('id','?')}  ({n} artikelen)")
        for r in kritiek:
            print(f"     ! {r}")
        for r in aandacht:
            print(f"     - {r}")
        if not kritiek and not aandacht:
            print("       niets te melden")

    print(f"\n{len(families)} families gecontroleerd.")
    if totaal_kritiek:
        print(f"{totaal_kritiek} punt(en) met een uitroepteken: die moeten eerst opgelost, "
              f"anders kiest de tool daar niet betrouwbaar.")
        sys.exit(1)
    print("Geen kritieke gaten. De punten met een streepje maken alleen een rij in het blad leeg.")


if __name__ == "__main__":
    main()
