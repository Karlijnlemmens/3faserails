#!/usr/bin/env python3
"""
controleer-data.py — kijkt of data/armaturen.json compleet genoeg is voor de tool.

bouw-data.py meldt wat het niet uit de omschrijving kón lezen. Dat is niet
hetzelfde als wat de tool nódig heeft: een artikel waarvan de buitenmaat wel
gevonden is maar de gatmaat niet, levert daar geen melding op en valt hier wel op.

Draaien: python controleer-data.py
Afsluitcode 1 als er kritieke gaten zijn, zodat je het in een controle kunt hangen.

    python controleer-data.py --hoogstens 14

laat een bekend aantal punten toe en slaat alleen alarm als het er meer worden.
Zo draait tools/controleer-alles.mjs hem: de huidige catalogus heeft 14 families
waarvan de prijslijst nergens een lichtstroom noemt (LED-strips, een paar
modules en spots). Dat valt niet op te lossen zonder gegevens te verzinnen,
maar een vijftiende punt hoort wel op te vallen.
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
    # De kleurtemperatuur mag ook per artikel uit de omschrijving komen; dan is
    # het familieveld niet nodig en zegt de rij nog steeds iets.
    if not fam.get("cct") and not any(v.get("cct_tekst") for v in varianten):
        aandacht.append("geen cct — de rij Kleurtemperatuur blijft leeg")
    # De zoekbalk kijkt naar naam, merk, lijn, armatuurtype én zoektermen; alleen
    # als er van dat alles niets is valt een familie echt niet te vinden.
    if not fam.get("zoektermen") and not fam.get("armatuurtype") and not fam.get("lijn"):
        aandacht.append("geen zoektermen of armatuurtype — alleen op de naam te vinden")

    # --- per variant ---
    zonder_lm = [v for v in varianten if not v.get("lichtstroom_lm")]
    zonder_maat = [v for v in varianten if not maat(v)]
    zonder_w = [v for v in varianten if not v.get("vermogen_w")]
    zonder_gat = [v for v in varianten if heeft_gat(v) and not v.get("zaagmaat_mm")]
    zonder_dim = [v for v in varianten if v.get("driver") and not v.get("dimprotocol")]
    zonder_oms = [v for v in varianten if not v.get("omschrijving")]

    # Een enkel artikel zonder lichtstroom is een gat in die ene omschrijving;
    # de familie blijft bruikbaar. Staat er bij géén van de artikelen een
    # lichtstroom, dan valt er met deze familie niets te vergelijken.
    if zonder_lm and len(zonder_lm) == len(varianten):
        kritiek.append(f"geen enkel artikel noemt een lichtstroom — de tool kan hier "
                       f"niet op filteren: {codes(zonder_lm)}")
    elif zonder_lm:
        aandacht.append(f"{len(zonder_lm)}x geen lichtstroom — die artikelen vallen weg "
                        f"bij het filteren: {codes(zonder_lm)}")
    # Geen afmeting is geen blokkade: de tool kiest dan gewoon niet op "kleinste
    # behuizing wint". Zonder lichtstroom kan hij helemaal niet kiezen, en dat
    # is wél een uitroepteken.
    if zonder_maat:
        aandacht.append(f"{len(zonder_maat)}x geen afmeting — 'kleinste behuizing wint' werkt hier niet: {codes(zonder_maat)}")
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
    # De prijslijst zet de eenheid soms achter allebei de getallen van een
    # bereik. Zonder dat te kennen werd "8W-18W" gelezen als "tot 8W".
    ("Pragmalux LED Bulkhead Venus G2 DALI2 IP65 5,5W-19,5W 3000K-5000K 3-CCT "
     "550-2250lm \u00d8300 (450mA)", "Pragmalux",
     {"vermogen_w": {"min": 5.5, "max": 19.5},
      "lichtstroom_lm": {"min": 550, "max": 2250},
      "dimprotocol": "dali2"}),

    # De prijslijst schrijft een dipswitch-bereik van hoog naar laag. Zonder
    # sorteren werd min groter dan max en leverde het filteren op lichtstroom
    # niets meer op - dat gold voor 655 artikelen.
    ("Pragmalux PRX Uniline LED-module HO 1528mm 75-22W 13000-3800lm 5000K 30D", "Pragmalux",
     {"vermogen_w": {"min": 22.0, "max": 75.0},
      "lichtstroom_lm": {"min": 3800, "max": 13000}}),

    # De Mondial. De artikelcode bevestigt de lezing onafhankelijk:
    # WVF = Wit Verdiept Facet, ZSGH = Zwart Standaard hoogGlans Hoogglans.
    ("Pragmalux LED Downlight Mondial IP54 hoogglans zwart verdiept 16W 1800lm "
     "3000K-3500K-4000K 3-CCT CRI>90 UGR<19 60D", "Pragmalux",
     {"uitvoering": "verdiept", "optiek": "Hoogglans", "kleur": "zwart"}),
    ("Pragmalux LED Downlight Mondial IP54 facet wit plat 16W 1800lm 3000K-3500K-4000K",
     "Pragmalux", {"uitvoering": "plat", "optiek": "Facet", "kleur": "wit"}),
    ("Pragmalux LED Downlight Mondial IP54 facet wit 3 fase track 19,5W 2450lm 3000K",
     "Pragmalux", {"uitvoering": "3-fase track", "optiek": "Facet"}),

    # Twee schrijfwijzen van de kleurtemperatuur die eerder misgingen: de K maar
    # een keer aan het eind, en de duizendpunt.
    ("Pragmalux LED Inlegarmatuur Modul 15x150cm 30W 3000-4000K 2-CCT UGR<16 wit RAL9003",
     "Pragmalux", {"cct_tekst": "3000-4000K 2-CCT"}),
    ("LED Dream Sirius 42W 3.000/4.000/5.700K 800mm zwart", "Interlight",
     {"cct_tekst": "3.000/4.000/5.700K", "type": "LED Dream Sirius"}),

    ("Essence Classic G3 IP66 60cm 11-19W 1400-2450lm 3CCT 3x2,5mm Doorvoerbedrading (2x18W)",
     "Pragmalux",
     {"type": "Essence Classic G3", "lengte_cm": 60, "ip": 66,
      "afmetingen_tekst": None, "cct_tekst": None}),
]


def controleer_merkvoorrang(mod):
    """merkVoorrang() gooit alleen ECHTE dubbelen weg: dezelfde omschrijving op
       het merkwoord na. Twee merken die een productnaam delen zijn geen
       dubbelen, en dat is niet met data te toetsen - er staat op dit moment
       geen enkel paar in de catalogus - dus wordt de functie zelf getoetst."""
    sleutel = lambda x: x["sleutel"]
    rijen = [
        # Dezelfde spot onder twee labels: Pragmalux wint.
        {"artikelcode": "4600000", "merk": "Pragmalux",   "sleutel": "inbouwspot orion wit",
         "omschrijving": "Pragmalux Inbouwspot Orion Rond Kantelbaar wit RAL9003"},
        {"artikelcode": "260001",  "merk": "White Label", "sleutel": "inbouwspot orion wit",
         "omschrijving": "White Label Inbouwspot Orion Rond Kantelbaar wit RAL9003"},
        # Alleen de naam gedeeld, andere omschrijving: allebei blijven staan.
        {"artikelcode": "4600017", "merk": "Pragmalux",   "sleutel": "inbouwspot orion kantelbaar",
         "omschrijving": "Pragmalux Inbouwspot Orion Rond Kantelbaar Zwart RAL9004"},
        {"artikelcode": "4375201", "merk": "Interlight",  "sleutel": "3-fase track orion 55w",
         "omschrijving": "Interlight LED 3-Fase Track L Orion 55W 3000K CRI>80 5550lm Zwart"},
        # Een merk dat niet in MERK_VOORRANG staat wint van een ander zulk merk
        # op alfabet, zodat de uitkomst niet van de volgorde in het bestand afhangt.
        {"artikelcode": "S1", "merk": "SLV", "sleutel": "spot x", "omschrijving": "SLV Spot X"},
        {"artikelcode": "D1", "merk": "DLC", "sleutel": "spot x", "omschrijving": "DLC Spot X"},
    ]
    houd, meldingen = mod.merkVoorrang(rijen, sleutel)
    codes = sorted(x["artikelcode"] for x in houd)
    mis = 0
    for wat, gekregen, verwacht in [
        ("wat er overblijft", codes, ["4375201", "4600000", "4600017", "D1"]),
        ("aantal meldingen", len(meldingen), 2),
    ]:
        if gekregen != verwacht:
            mis += 1
            print(f"     ! merkvoorrang, {wat}: {gekregen!r}, verwacht {verwacht!r}")
    print(f"\n{'FOUT ' if mis else 'goed '} merkvoorrang  (2 proeven)")
    if not mis:
        print("       dubbelen weg, verschillende armaturen blijven staan")
    return mis


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
    lees_mod = importlib.util.module_from_spec(
        importlib.util.spec_from_file_location("bouwdata2", HIER / "bouw-data.py"))
    lees_mod.__spec__.loader.exec_module(lees_mod)
    totaal_kritiek = controleer_lezer() + controleer_merkvoorrang(lees_mod)

    # Met een catalogus zijn het er honderden; alleen wat iets te melden heeft
    # komt in beeld, anders staat het antwoord onder een scherm vol "goed".
    schoon = 0
    for fam in families:
        kritiek, aandacht = controleer_familie(fam)
        totaal_kritiek += len(kritiek)
        if not kritiek and not aandacht:
            schoon += 1
            continue
        n = len(fam.get("varianten", []))
        vlag = "FOUT " if kritiek else "kijk "
        print(f"\n{vlag} {fam.get('id','?')}  ({n} artikelen)")
        for r in kritiek:
            print(f"     ! {r}")
        for r in aandacht:
            print(f"     - {r}")

    print(f"\n{len(families)} families gecontroleerd, {schoon} zonder opmerking.")
    hoogstens = 0
    if "--hoogstens" in sys.argv:
        hoogstens = int(sys.argv[sys.argv.index("--hoogstens") + 1])
    if totaal_kritiek:
        print(f"{totaal_kritiek} punt(en) met een uitroepteken: die moeten eerst opgelost, "
              f"anders kiest de tool daar niet betrouwbaar.")
        if totaal_kritiek > hoogstens:
            if hoogstens:
                print(f"Dat zijn er meer dan de {hoogstens} die al bekend waren.")
            sys.exit(1)
        print(f"Niet meer dan de {hoogstens} die al bekend waren.")
        return
    print("Geen kritieke gaten. De punten met een streepje maken alleen een rij in het blad leeg.")


if __name__ == "__main__":
    main()
