#!/usr/bin/env python3
"""
controleer-data.py — kijkt of data/armaturen.json compleet genoeg is voor de tool.

bouw-data.py meldt wat het niet uit de omschrijving kón lezen. Dat is niet
hetzelfde als wat de tool nódig heeft: een artikel waarvan de buitenmaat wel
gevonden is maar de gatmaat niet, levert daar geen melding op en valt hier wel op.

Draaien: python controleer-data.py
Afsluitcode 1 als er kritieke gaten zijn, zodat je het in een controle kunt hangen.
"""

import json, sys
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


def main():
    if not DATA.exists():
        sys.exit(f"{DATA.relative_to(HIER)} ontbreekt. Draai eerst: python bouw-data.py")

    data = json.loads(DATA.read_text(encoding="utf-8"))
    families = data.get("families", [])
    totaal_kritiek = 0

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
