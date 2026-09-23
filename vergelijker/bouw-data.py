#!/usr/bin/env python3
"""
bouw-data.py — bouwt data/armaturen.json uit de exports in data/bron/.

Werkwijze:
  1. Zet de export van een familie in data/bron/, als .csv of als .xlsx
  2. Voeg een blokje voor die familie toe aan data/families.json
  3. python bouw-data.py

Het script leest per artikel de omschrijving en haalt daar de technische
gegevens uit. Wat het niet kan lezen wordt gemeld, niet geraden.

Over .csv tegenover .xlsx: van een ruwe prijslijst worden maar vier kolommen
gebruikt (artikelcode, omschrijving, status, barcode). knip-export.py snijdt die
eruit en schrijft een .csv, en díe gaat de repo in - zonder prijzen, en als
tekstbestand, zodat git laat zien wat er tussen twee prijslijstrondes veranderd
is. Een .xlsx blijft gewoon werken voor wie hem zo bij de hand heeft.

Vereist: alleen de standaardbibliotheek voor .csv; openpyxl voor .xlsx.
"""

import collections, json, re, sys
from pathlib import Path

HIER   = Path(__file__).parent
BRON   = HIER / "data" / "bron"
FAMDEF = HIER / "data" / "families.json"
UIT    = HIER / "data" / "armaturen.json"

# Suffixen die een driver aanduiden. Snoersuffixen laten we bewust liggen.
DRIVERS = {
    "":        {"driver": None,        "dimprotocol": None,      "driver_inbegrepen": False},
    "-PR":     {"driver": "Pragmalux", "dimprotocol": "geen",    "driver_inbegrepen": True},
    "-UN":     {"driver": "Universeel","dimprotocol": "dali2/1-10v/push-dim", "driver_inbegrepen": True},
    "-PH":     {"driver": "Philips",   "dimprotocol": "geen",    "driver_inbegrepen": True},
    "-PH-DA":  {"driver": "Philips DALI2", "dimprotocol": "dali2/push-dim", "driver_inbegrepen": True},
    "-TC-DA":  {"driver": "TCI DALI",  "dimprotocol": "dali",    "driver_inbegrepen": True},
    "-CA":     {"driver": "Casambi",   "dimprotocol": "casambi", "driver_inbegrepen": True},
    # De prijslijst schrijft "+Osram Driver" en "+Philips Driver" net zo goed
    # achter deze suffixen; zonder deze vier regels bleef het veld Driver leeg
    # bij 140 artikelen, waaronder de 45 Osram-uitvoeringen van de Sigma.
    # De drie Philips-vormen noemen de stroomsterkte van de driver (350mA,
    # 700mA) en zijn verder dezelfde uitvoering als -PH.
    "-OS":     {"driver": "Osram",     "dimprotocol": "geen",    "driver_inbegrepen": True},
    "-PH-350": {"driver": "Philips",   "dimprotocol": "geen",    "driver_inbegrepen": True},
    "-PH-700": {"driver": "Philips",   "dimprotocol": "geen",    "driver_inbegrepen": True},
    "-PH30-700": {"driver": "Philips", "dimprotocol": "geen",    "driver_inbegrepen": True},
}
SNOER = ("-GST3", "-GST3S", "-EUR", "-ST3", "-ST3S", "-ST5", "-ST5S")

# Suffixen die een uitvoeringskenmerk aanduiden (waterdichte armaturen).
EXTRA = {"-S": {"sensor": True}, "-N": {"noodverlichting": "3u"},
         "-SN": {"sensor": True, "noodverlichting": "3u"}}


def getal(s):
    return float(str(s).replace(",", ".")) if s is not None else None


# --- De omschrijving ---------------------------------------------------------
# In de prijslijst staat de hele technische opgave op één regel:
#
#   Pragmalux  LED Inbouw/Opbouw Downlight Luna G2 IP44 12W/18W 3000K-6000K
#   3-CCT 1400-2050lm Ø217 Buitenmaat - Gatmaat Ø65-185 incl. LED Driver
#
# Daar komen de naam, het vermogen, de kleurtemperatuur, de lichtstroom en de
# maten uit. Alles hieronder leest; niets raadt.

# Een maatdeel. Vier vormen: een Ø-maat (eventueel een reeks, eventueel met de
# hoogte erachter), een lxbxh, een maatwoord, en een losse eenheid als vervolg
# ("600x600 mm"). De lxbxh eist per getal minstens twee cijfers, want anders
# leest "3x2,5mm Doorvoerbedrading" als een afmeting en "(2x18W)" als een maat.
MAATDEEL = re.compile(
    r"Ø\s*\d+(?:[,.]\d+)?(?:\s*[-–]\s*\d+(?:[,.]\d+)?)?"
    r"(?:\s*[x×]\s*\d+(?:[,.]\d+)?)*(?:\s*\(\s*[A-Za-z]\s*\))?"
    r"|\b\d{2,}\s*[x×]\s*\d{2,}(?:\s*[x×]\s*\d{2,})*(?:\s*\(\s*[A-Za-z]\s*\))?"
    r"|\b(?:buitenmaat|gatmaat|zaagmaat|inbouwmaat|inbouwdiepte|uitsparing|afmetingen?|maat)\b"
    r"|\bB\s*-\s*G\b|\bZ:"
    r"|\b(?:mm|cm)\b",
    re.I)
# Een maatzone telt alleen als er een Ø, een lxbxh of een maatwoord in staat;
# een losse "mm" is een restje van iets anders (de doorvoerbedrading).
MAATKERN = re.compile(r"Ø|\d\s*[x×]\s*\d|buitenmaat|gatmaat|zaagmaat|inbouwmaat"
                      r"|inbouwdiepte|uitsparing|afmeting|maat|B\s*-\s*G|Z:", re.I)

# De kleurtemperatuur zoals de prijslijst hem schrijft: "4000K", "3000K-6000K",
# "3000K/4000K/6000K", met daarachter soms het aantal standen ("3-CCT").
_CCT_GETAL = r"\d{1,2}[.]?\d{3}"
CCT_TEKST = re.compile(
    rf"(?:{_CCT_GETAL}\s*K?\s*[-–/]\s*)*{_CCT_GETAL}\s*K"
    r"(?:\s*\d?\s*-?\s*CCT)?", re.I)

# Waar de naam ophoudt en de opgave begint. Alles hierachter gaat niet meer over
# wélk armatuur het is. "Inbouw/Opbouw" blijft er dus in, "IP44 12W/18W" niet.
TYPE_STOP = re.compile(
    # UGR, CRI en Ra zijn alleen een opgave als er een getal of een vergelijking
    # achter staat. "Essence G2/UGR LED Driver" is een productaanduiding, en
    # zonder deze eis knipt de naam daar af tot "Essence G2/".
    r"\bIP\s*\d{2}|\bIK\s*\d{2}|\bSDCM\b"
    r"|\b(?:UGR|CRI|Ra)\s*[<>=\u2264\u2265]?\s*\d"
    r"|\b(?:max|min|incl|excl|ca)\.|\b(?:max|min|incl|excl)\b"
    # \b vóór het getal: zonder dat knipt "LED Paneel 30x120cm Easy G2" bij de
    # "120cm" middenin de maat, en houdt de familie "LED Paneel 30x" over.
    r"|\b\d+(?:[,.]\d+)?\s*(?:W|lm|K|V|mm|cm|D)\b"
    # De decimale komma hoort bij het getal: zonder (?:[,.]\d+)? knipt
    # "18,5-30W" pas bij de "5-30" en blijft de "18" in de naam staan.
    r"|\b\d+(?:[,.]\d+)?\s*[-–/]\s*\d+"
    r"|\d?\s*-?CCT\b"
    r"|\bwit\b|\bzwart\b|\bgrijs\b|\bRAL\b"
    r"|Ø|\+|\(", re.I)


# Twee schrijfwijzen van een maat die de naamzone anders onderuit halen. Een
# haakje is normaal een stopteken - "(2x28W)" is een opgave - maar een haakje
# dat alleen zegt wélke maat volgt ("(LxW)", "(Width X Length)") hoort weg,
# anders valt de maat erachter buiten de naam en belanden alle bandraster-
# armaturen in één kale familie. En "1545mm length x 165mm width" is dezelfde
# maat als "1545x165mm", alleen uitgeschreven.
MAATLABEL = re.compile(r"\(\s*(?:[lwbh]\s*[x×]\s*[lwbh]|"
                       r"(?:width|length|breedte|lengte)(?:\s*[x×]\s*"
                       r"(?:width|length|breedte|lengte))?)\s*\)", re.I)
MAAT_UITGESCHREVEN = re.compile(
    r"\b(\d+(?:[,.]\d+)?)\s*(mm|cm)\s*(?:length|lengte|width|breedte|hoogte|height)\s*"
    r"[x×]\s*(\d+(?:[,.]\d+)?)\s*(mm|cm)?\s*(?:length|lengte|width|breedte|hoogte|height)?", re.I)


# De aansturing zoals de prijslijst hem schrijft. Volgorde telt: het specifiekste
# eerst, want "DALI2" bevat "DALI". De waarden zijn de sleutels die de tool in
# DIMNAMEN omzet naar de schrijfwijze van een installateur.
DIM_IN_TEKST = [
    (r"\bdali[\s-]?2\b|\bdali2,0\b",          "dali2"),
    (r"\bd4i\b",                               "d4i"),
    (r"\bcasambi\b",                           "casambi"),
    (r"\bzigbee\b",                            "zigbee"),
    (r"\bdali\b",                              "dali"),
    (r"\b0\s*-\s*10\s*v\b",                   "0-10v"),
    (r"\b1\s*-\s*10\s*v\b",                   "1-10v"),
    (r"\btriac\b",                             "triac"),
    (r"\bpush[\s-]?dim\b",                     "push-dim"),
    (r"\bdim\s*to\s*warm\b",                  "dim-to-warm"),
    (r"\bniet\s+dimbaar\b",                    "geen"),
]


# De optiek. Bij de Mondial is dit hét onderscheid: dezelfde downlight bestaat
# met een facet- en met een hoogglansreflector, allebei in wit en zwart en
# allebei in DALI. Die woorden staan achter de IP-klasse en vallen dus buiten de
# naam - ze horen bij het artikel, niet bij de familie, en horen daarom in de
# keuzebalk te staan waarmee je het juiste artikel opzoekt.
# Volgorde telt: het specifiekste eerst ("matte reflector" voor "mat").
OPTIEK = [
    (r"\bfacet\b",                        "Facet"),
    (r"\bhoogglans\w*\b",                 "Hoogglans"),
    (r"\bmat(?:te)?\s+reflector\b|\bmat(?:te)?\b", "Mat"),
    (r"\bzwarte?\s+reflector\b",          "Zwarte reflector"),
    (r"\bmicroprism\w*\b",                "Microprismatisch"),
    (r"\bspiegel\w*\b",                   "Spiegeloptiek"),
    (r"\bopaal\b",                        "Opaal"),
    (r"\bprisma\w*\b",                   "Prisma"),
    (r"\bdarklight\b",                    "Darklight"),
    (r"\bkruis\s*rooster\b",              "Kruisrooster"),
    (r"\blouvre\b",                       "Louvre"),
]


def normaliseerOmschrijving(o):
    """De omschrijving zoals de rest van het script hem leest."""
    t = MAATLABEL.sub(" ", o)
    t = MAAT_UITGESCHREVEN.sub(lambda m: f"{m.group(1)}x{m.group(3)}{m.group(4) or m.group(2)}", t)
    return " ".join(t.split())


def maatzone(o):
    """De aaneengesloten maatopgave uit de omschrijving, letterlijk zoals hij er
       staat: "Ø217 Buitenmaat - Gatmaat Ø65-185". Losse stukken die alleen door
       spaties of een streepje gescheiden worden horen bij elkaar; alles ertussen
       breekt de reeks af."""
    delen = list(MAATDEEL.finditer(o))
    zones, begin, eind = [], None, None
    for m in delen:
        if begin is not None and re.fullmatch(r"[\s\-–—]*", o[eind:m.start()]):
            eind = m.end()
            continue
        if begin is not None:
            zones.append((begin, eind))
        begin, eind = m.start(), m.end()
    if begin is not None:
        zones.append((begin, eind))
    zones = [o[a:b].strip() for a, b in zones]
    zones = [z for z in zones if MAATKERN.search(z)]
    return max(zones, key=len) if zones else None


def naamzone(o, merk=None):
    """De naam van het armatuur: wat er voor de eerste technische opgave staat,
       zonder het merk dat er soms voor staat. "Pragmalux LED Inbouw/Opbouw
       Downlight Luna G2 IP44 ..." geeft "LED Inbouw/Opbouw Downlight Luna G2"."""
    t = " ".join(o.split())
    if merk:
        t = re.sub(r"^" + re.escape(str(merk).strip()) + r"\b[\s,\-]*", "", t, flags=re.I)
    m = TYPE_STOP.search(t)
    if m:
        t = t[: m.start()]
    elif len(t) > 60:
        # Geen enkele opgave gevonden en het is een lange regel: dan is dit geen
        # naam maar een zin, en raden we liever niet.
        return None
    t = t.strip(" -–—,;:/")
    return t if 2 <= len(t) <= 60 else None


def lees_omschrijving(o, merk=None):
    """Haal technische gegevens uit de omschrijvingstekst. Geeft (velden, ontbrekend)."""
    v, mist = {}, []

    # W? achter het eerste getal: de prijslijst schrijft zowel "8-18W" als
    # "8W-18W", en zonder die W werd dat laatste gelezen als "tot 8W".
    m = re.search(r"(\d+[,.]?\d*)\s*W?\s*[-–]\s*(\d+[,.]?\d*)\s*W\b", o, re.I)
    if m:
        a, b = sorted([getal(m.group(1)), getal(m.group(2))])
        v["vermogen_w"] = {"min": a, "max": b}
    else:
        # "12W/18W" en "12/18W" zijn een schakelbaar armatuur: twee standen, dus
        # een ondergrens en een bovengrens - geen enkel vermogen met een noot.
        m = re.search(r"((?:\d+(?:[,.]\d+)?\s*W?\s*/\s*)+\d+(?:[,.]\d+)?\s*W)\b", o, re.I)
        if m:
            n = [getal(x) for x in re.findall(r"\d+(?:[,.]\d+)?", m.group(1))]
            v["vermogen_w"] = {"min": min(n), "max": max(n)}
        else:
            m = (re.search(r"max\.?\s*(\d+[,.]?\d*)\s*W\b", o, re.I)
                 or re.search(r"\b(\d+[,.]?\d*)\s*W\b", o, re.I))
            if m:
                v["vermogen_w"] = {"min": None, "max": getal(m.group(1)),
                                   "opmerking": "ondergrens afhankelijk van gekozen driver"}
            else:
                mist.append("vermogen")

    m = re.search(r"(\d+)\s*(?:lm)?\s*[-–]\s*(\d+)\s*lm\b(?!\s*/)", o, re.I)
    if m:
        a, b = sorted([int(m.group(1)), int(m.group(2))])
        v["lichtstroom_lm"] = {"min": a, "max": b}
    else:
        m = (re.search(r"max\.?\s*(\d+)\s*lm\b(?!\s*/)", o, re.I)
             or re.search(r"\b(\d+)\s*lm\b(?!\s*/)", o, re.I))
        if m:
            v["lichtstroom_lm"] = {"min": None, "max": int(m.group(1))}
        else:
            mist.append("lichtstroom")

    # De kleurtemperatuur staat ook bij de familie, maar die geldt voor de hele
    # serie; wat hier staat gaat over dit ene artikel, inclusief het aantal
    # standen. Zo letterlijk mogelijk overnemen: "3000K-6000K 3-CCT".
    m = CCT_TEKST.search(o)
    if m:
        v["cct_tekst"] = " ".join(m.group(0).split())

    # UGR en kleurweergave staan gewoon in de omschrijving - "UGR<19 CRI>90" -
    # maar werden nergens gelezen. Die twee rijen op het vergelijkingsblad kwamen
    # dus alleen uit de handgeschreven overlay, en dus alleen bij de families die
    # daar een blok hebben: de Sigma noemt op elke regel UGR<19 en had de rij
    # toch leeg. Gemeten op deze catalogus noemen 2211 van de 5062 regels een UGR
    # en 1449 een CRI.
    #
    # Het teken hoort erbij en wordt overgenomen zoals het er staat: "<19" is
    # niet hetzelfde als "19", en ">90" niet hetzelfde als ">=90". Allebei in
    # dezelfde vorm als het familieveld ugr, zodat de tool ze gelijk behandelt.
    m = re.search(r"\bUGR\s*([<>]?=?)\s*(\d{1,2})\b", o, re.I)
    if m:
        v["ugr"] = (m.group(1) or "") + m.group(2)
    m = re.search(r"\b(?:CRI|Ra)\s*([<>]?=?)\s*(\d{2,3})\b", o, re.I)
    if m:
        v["cri"] = (m.group(1) or "") + m.group(2)

    # "Buitenmaat - Gatmaat Ø90" is de gebruikelijke schrijfwijze, maar in de
    # prijslijst staat het soms afgekort als "B - G Ø150". Beide meenemen,
    # anders blijft de gatmaat leeg zonder dat er een melding komt: de
    # buitenmaat is dan immers wel gevonden.
    m = re.search(r"(?:Gatmaat|Z:|\bB\s*-\s*G)\s*Ø\s*(\d+)", o)
    if m:
        v["zaagmaat_mm"] = int(m.group(1))
    m = re.search(r"Ø\s*(\d+)", o)
    if m:
        v["buitenmaat_mm"] = int(m.group(1))
    # De hele maatopgave zoals hij er staat. De losse getallen hierboven zijn wat
    # de tool rekent (past het in het bestaande gat?); dit is wat op het
    # vergelijkingsblad hoort, mét de reeks erin: "Gatmaat Ø65-185".
    z = maatzone(o)
    if z:
        v["afmetingen_tekst"] = z
    if "zaagmaat_mm" not in v and "buitenmaat_mm" not in v:
        m = re.search(r"\b(\d{2,3})\s*cm\b", o)
        if m:
            v["lengte_cm"] = int(m.group(1))
        elif not z:
            mist.append("afmeting")

    naam = naamzone(o, merk)
    if naam:
        v["type"] = naam

    for k in ("wit", "zwart", "grijs"):
        if re.search(r"\b" + k + r"\b", o, re.I):
            v["kleur"] = k
            break
    # "plat" hoort erbij: bij de Mondial is dat de derde inbouwdiepte naast
    # standaard en verdiept.
    # De uitvoering: bij de Mondial vier inbouwdieptes/montagewijzen naast
    # elkaar - standaard, verdiept, plat, opbouw - plus een 3-fase track-versie.
    UITVOERINGEN = [("standaard", r"\bstandaard\w*"), ("verdiept", r"\bverdiept\w*"),
                    ("plat", r"\bplat(te)?\b"), ("opbouw", r"\bopbouw\w*"),
                    ("3-fase track", r"\b3[\s-]?fase\s+track\b"),
                    ("inbouw", r"\binbouw\w*"), ("pendel", r"\bpendel\w*")]
    for k, patroon in UITVOERINGEN:
        if re.search(patroon, o, re.I):
            v["uitvoering"] = k
            break

    m = GENERATIE.search(o)
    if m:
        v["generatie"] = m.group(0).upper().replace(" ", "")

    for patroon, naam in OPTIEK:
        if re.search(patroon, o, re.I):
            v["optiek"] = naam
            break
    # "Inbouw/Opbouw" noemt er twee: dan zegt de omschrijving niet welke van de
    # twee dit artikel is, en blijft de lijst van de familie staan.
    if v.get("uitvoering") in ("opbouw", "inbouw", "pendel") and sum(
            1 for k in ("opbouw", "inbouw", "pendel")
            if re.search(r"\b" + k + r"\w*\b", o, re.I)) > 1:
        v.pop("uitvoering")

    # De aansturing staat in de omschrijving: "Venus G2 DALI2", "... Casambi",
    # "... niet dimbaar". Dat is de betrouwbare bron - het codesuffix kent 196
    # vormen waarvan de tabel er dertien dekt, en de tekst zegt hetzelfde.
    # Zonder dit zou DALI verdwenen zijn toen het uit de familienaam ging.
    for patroon, waarde in DIM_IN_TEKST:
        if re.search(patroon, o, re.I):
            v["dimprotocol"] = waarde
            break

    m = re.search(r"IP\s*(\d{2})", o)
    if m:
        v["ip"] = int(m.group(1))
    if re.search(r"\bPIR\b|bewegingssensor", o, re.I):
        v["sensor"] = True
    if re.search(r"noodmodule|noodverlichting", o, re.I):
        v.setdefault("noodverlichting", "3u")
    return v, mist


# --- Catalogus ---------------------------------------------------------------
# Eén export met de hele catalogus erin, in plaats van één export per familie.
# De families komen dan uit de omschrijvingen zelf: alles vóór de eerste
# technische opgave is de naam, en alle artikelen met dezelfde naam vormen samen
# een familie. Wat in families.json staat blijft leidend — dat is de laag met de
# gegevens die niet in de prijslijst staan (IP, IK, UGR, levensduur, presenter) —
# en wordt over de gevonden families heen gelegd.
CATALOGUS = "catalogus"

# Wat geen armatuur is. Deze woorden worden in de NAAM gezocht, niet in de hele
# omschrijving: "incl. LED Driver" staat achter de opgave en hoort bij een echt
# armatuur, terwijl "LED Driver CV 24V" de naam zelf is.
#
# Twee lijsten, omdat de woorden niet even hard zijn. HARD is nooit een armatuur.
# ZACHT beschrijft óók de optiek of de opbouw van een armatuur: "Railspot
# Piccolo 15W 24D Reflector" is een losse reflector, maar "Bandrasterarmatuur
# Optic matte reflector 147x1570mm 26-36W 3550-4700lm" is een armatuur. Het
# verschil is dat een armatuur zowel een lichtstroom als een vermogen noemt en
# een onderdeel hooguit één van de twee.
TOEBEHOREN_HARD = re.compile(
    r"\b(accessoire\w*|reserveonderdeel\w*|onderdeel|component|"
    r"opbouwset|montageset|ophangset|schroefset|inbouwklemmen|"
    r"[a-z]*profiel|[a-z]*beugel|"
    r"afscherming|grill|muursteun|steun|afstandsbediening|daglichtsensor|"
    r"veiligheidskabel|voeding|snoerset|adapter|eindkap|verbinder|"
    r"opvulring|ring|blindplaat|fitting|noodmodule|schakelaar)\b", re.I)
# "frame" hoort hier en niet bij HARD: een los frame noemt geen lichtstroom en
# geen vermogen en valt daar al op af, maar "LED Frame Paneel Conto 30x120cm
# 20-40W 2300-5000lm" is een paneel mét frame - 72 armaturen die anders wegvallen.
TOEBEHOREN_ZACHT = re.compile(r"\b(reflector|lens|kap|driver)\b|[a-z]*frame\b", re.I)

# Het soort armatuur en de montagewijze staan in de naam. Ze worden nergens uit
# gerekend, maar de zoekbalk van de tool zoekt erop mee: wie "downlight" typt
# hoort ze te vinden zonder de familienaam te kennen.
SOORTEN = [
    ("downlight", r"downlight"), ("paneel", r"paneel|panel"),
    ("inlegarmatuur", r"inlegarmatuur"), ("opbouwarmatuur", r"opbouwarmatuur"),
    ("bandrasterarmatuur", r"bandraster"), ("railspot", r"railspot|3-?fase"),
    ("spot", r"\bspot\b|inbouwspot|richtspot|halve-?inbouwspot|spotlight"),
    ("wandarmatuur", r"wandarmatuur|wandlamp"), ("plafonnière", r"plafonni"),
    ("pendelarmatuur", r"pendelarmatuur|pendel"), ("bulkhead", r"bulkhead"),
    ("highbay", r"highbay"), ("gevelarmatuur", r"gevelarmatuur"),
    ("waterdicht armatuur", r"waterdicht"), ("lichtlijn", r"lichtlijn|line\b"),
    ("led-strip", r"\bstrip\b"), ("led-module", r"\bmodule\b"),
    ("sporthalarmatuur", r"sporthal|balvast"),
    ("straatarmatuur", r"streetlight|straatverlichting|area\b"),
    ("portiekarmatuur", r"portiek"), ("noodverlichting", r"noodverlichting|vluchtweg"),
    # Soorten die de prijslijst wel noemt maar die hier ontbraken: wie "batten"
    # of "spiegelarmatuur" typt vond ze niet, en ze telden ook niet mee als
    # bewijs dat een regel een armatuur is (zie de toebehorentoets hieronder).
    ("batten", r"\bbatten\b"), ("wallwasher", r"wallwasher|wall.?washer"),
    ("spiegelarmatuur", r"spiegelarmatuur|spiegellamp"),
    ("breedstraler", r"breedstraler|floodlight"), ("lowbay", r"lowbay"),
    ("montagebalk", r"montagebalk"),
]
MONTAGE = [("inbouw", r"inbouw"), ("opbouw", r"opbouw"), ("pendel", r"pendel"),
           ("wand", r"wandarmatuur|gevelarmatuur"), ("inleg", r"inleg")]


# --- De familiesleutel -------------------------------------------------------
# De naam zoals hij in de prijslijst staat is niet de sleutel waarop artikelen
# samenkomen. Dezelfde reeks wordt daar op vier manieren anders geschreven, en
# elk van die vier maakte een eigen familie:
#
#   hoofdletters   "LED TL waterdicht armatuur typhoon" naast "... Typhoon"
#   taal           "110x1195mm recessed" naast "1195x110mm inbouw"
#   eenheid        "11x120cm opbouw" naast "1195x110mm opbouw"
#   typefout       "Mado 240 Matt" naast "Mado 240 Mat"
#
# En er staan kenmerken in die over het artikel gaan en niet over de reeks:
# "Venus G2 DALI2" is de DALI-uitvoering van Venus G2 - de artikelcode zegt het
# ook, 1000152-DA naast 1000152 - en hoort dus in dezelfde familie te vallen.
# De omschrijving noemt die uitvoering nog steeds, dus er gaat niets verloren.

# Kenmerken die het artikel beschrijven en niet de reeks. Bewust kort gehouden:
# alles wat een ander armatuur maakt (een andere optiek, een andere diameter,
# een ingebouwde sensor) hoort juist wel een eigen familie te zijn.
VARIANTWOORDEN = re.compile(
    r"\b(dali2?|d4i|casambi|sf\s+driver|\d?-?step[- ]dim|"
    r"\d+\s*-\s*\d+\s*v\s*(ac/dc|ac|dc)?)\b"
    r"|\d+\s*°", re.I)

# Engelse schrijfwijzen die de prijslijst door elkaar gebruikt met de Nederlandse.
VERTAAL = [
    (r"\bsurface\s+mounted\b", "opbouw"), (r"\brecessed\b", "inbouw"),
    (r"\bsuspended\b", "pendel"), (r"\bluminaire\b", ""),
    (r"\bmatt\b", "mat"),          # typefout in de prijslijst
]

# Een maat in de naam: "1195x110mm", "11x120cm", "110x1195mm". Afgerond op hele
# centimeters vallen die op elkaar - 1195 mm en 120 cm zijn hetzelfde armatuur -
# en de grootste maat gaat vooraan, zodat de volgorde niet meer uitmaakt.
MAAT_IN_NAAM = re.compile(
    r"\b(\d+(?:[,.]\d+)?)\s*(mm|cm)?\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(mm|cm)?"
    r"(?:\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(mm|cm)?)?", re.I)


def _cm(waarde, eenheid, andere):
    """Een getal uit een maat, in hele centimeters. Zonder eenheid telt de
       eenheid van het andere getal in dezelfde maat; staat die er ook niet bij,
       dan beslist de grootte: boven de 300 is het millimeters."""
    n = float(str(waarde).replace(",", "."))
    eh = (eenheid or andere or "").lower()
    if eh == "cm":
        return round(n)
    if eh == "mm":
        return round(n / 10)
    return round(n / 10) if n > 300 else round(n)


def maatSleutel(m):
    eh = m.group(2) or m.group(4) or m.group(6)
    getallen = [_cm(m.group(i), m.group(i + 1), eh)
                for i in (1, 3, 5) if m.group(i)]
    return "x".join(str(n) for n in sorted(getallen, reverse=True)) + "cm"


# De familie is de REEKS, niet de uitvoering. Wie "sigma" typt wil één keuze
# zien en daarna de maat en het wattage kiezen, niet zes families die allemaal
# Sigma heten. Alles wat een uitvoering van dezelfde reeks beschrijft gaat er
# daarom uit en komt terug als keuze in de tool: de maat, de generatie, de
# optiek en het formaat.
GENERATIE = re.compile(r"\b[gv]\s?\d\b", re.I)
# "-S", "-M", "-L", "-XL" achter een naam is een formaat: Lumio-S/M/L zijn
# dezelfde reeks in drie maten. Voor de leestekens platgeslagen worden, want
# daarna is het streepje een spatie en zou een losse "s" sneuvelen.
FORMAAT = re.compile(r"(?<=[a-z])-(?:xl|s|m|l)\b(?:\s*/\s*(?:xl|s|m|l)\b)*", re.I)
# De optiekwoorden uit OPTIEK, als één patroon voor de sleutel.
OPTIEK_SLEUTEL = re.compile(
    r"\b(facet|hoogglans\w*|mat(?:te)?|zwarte|microprism\w*|spiegel\w*|opaal|prisma\w*|"
    r"darklight|kruis\s*rooster|louvre|reflector)\b", re.I)


def familiesleutel(naam, maten=()):
    """Waarop artikelen tot een familie samenkomen. Zie de uitleg hierboven.

       maten zijn de afmetingen die het artikel zelf noemt. Een kaal getal in de
       naam gaat alleen weg als het daarin voorkomt: "Mado 195" naast
       "Ø195 Buitenmaat" is een maat en dus een uitvoering, maar de 5 en de 7 in
       "Retroline RIDI-VLSG-5" en "-7" zijn de armaturen waar de module in past
       en moeten uit elkaar blijven."""
    t = re.sub(r"^\s*led\b[\s-]*", "", naam.lower())
    for patroon, vervang in VERTAAL:
        t = re.sub(patroon, vervang, t)
    t = VARIANTWOORDEN.sub(" ", t)
    t = FORMAAT.sub(" ", t)
    t = MAAT_IN_NAAM.sub(" ", t)          # de maat is een keuze, geen familie
    t = GENERATIE.sub(" ", t)
    t = OPTIEK_SLEUTEL.sub(" ", t)
    # "inbouw/recessed" is na het vertalen "inbouw/inbouw": één woord.
    t = re.sub(r"\b(\w+)(?:\s*/\s*\1)+\b", r"\1", t)
    t = re.sub(r"[^a-z0-9°/]+", " ", t)
    if maten:
        t = " ".join(w for w in t.split() if not (w.isdigit() and int(w) in maten))
    return " ".join(t.split())


def matenVan(v):
    """De getallen die dit artikel als afmeting noemt, om ze uit de naam te
       kunnen halen. Buitenmaat en zaagmaat in mm, de lengte in cm én mm."""
    uit = set()
    for k in ("buitenmaat_mm", "zaagmaat_mm"):
        if isinstance(v.get(k), int):
            uit.add(v[k])
    if isinstance(v.get("lengte_cm"), int):
        uit.add(v["lengte_cm"]); uit.add(v["lengte_cm"] * 10)
    for m in MAAT_IN_NAAM.finditer(v.get("afmetingen_tekst") or ""):
        for i in (1, 3, 5):
            if m.group(i):
                uit.add(round(float(m.group(i).replace(",", "."))))
    return uit


def toonnaam(namen, maten=()):
    """De naam die de familie draagt: de REEKS. Begint bij de schrijfwijze van de
       meeste artikelen - bij gelijk spel de kortste, dan alfabetisch, zodat het
       antwoord niet van de volgorde in het bestand afhangt - en haalt daar
       dezelfde stukken uit als de sleutel. Uit de echte naam en niet uit de
       sleutel, zodat de hoofdletters blijven staan: "LED Paneel 60x60cm Sigma
       G2" wordt "LED Paneel Sigma"."""
    basis = sorted(namen.items(), key=lambda x: (-x[1], len(x[0]), x[0]))[0][0]
    t = VARIANTWOORDEN.sub(" ", basis)
    t = FORMAAT.sub(" ", t)
    t = MAAT_IN_NAAM.sub(" ", t)
    t = GENERATIE.sub(" ", t)
    t = OPTIEK_SLEUTEL.sub(" ", t)
    if maten:
        t = " ".join(w for w in t.split() if not (w.isdigit() and int(w) in maten))
    t = re.sub(r"\s*/\s*", " / ", " ".join(t.split()))
    return " ".join(t.split()).strip(" -–—,;:/") or basis


def slug(naam):
    """Een id uit een naam: kleine letters, streepjes, verder niets."""
    s = re.sub(r"[^a-z0-9]+", "-", naam.lower()).strip("-")
    return s[:60] or "familie"


def plat(s):
    return " ".join(str(s or "").lower().split())


# Welk merk voorgaat als hetzelfde artikel onder twee merken in de lijst staat.
# Wat hier niet in staat komt daarna, in de volgorde van de lijst zelf.
MERK_VOORRANG = ["pragmalux"]


def merkVoorrang(rijen, sleutel):
    """Gooi de dubbelen eruit die alleen in hun merk verschillen. Een regel telt
       als dubbel wanneer de omschrijving ZONDER het merkwoord ervoor gelijk is;
       dat is streng met opzet. Twee merken die toevallig een productnaam delen
       zijn geen dubbelen - een Pragmalux Inbouwspot Orion en een Interlight
       3-Fase Track Orion zijn verschillende armaturen - en die moeten dus
       allebei blijven staan. Geeft (overgebleven rijen, meldingen)."""
    per = {}
    for r in rijen:
        per.setdefault(sleutel(r), []).append(r)
    houd, meldingen = [], []
    for _, groep in per.items():
        merken = {r["merk"] for r in groep if r["merk"]}
        if len(merken) < 2:
            houd.extend(groep)
            continue
        rang = lambda m: (MERK_VOORRANG.index(m.lower())
                          if m.lower() in MERK_VOORRANG else len(MERK_VOORRANG))
        wint = min(merken, key=lambda m: (rang(m), m.lower()))
        blijft = [r for r in groep if r["merk"] == wint]
        weg = [r for r in groep if r["merk"] != wint]
        houd.extend(blijft)
        meldingen.append(
            f"{wint} gaat voor: {blijft[0]['artikelcode']} houdt "
            f"{', '.join(r['merk'] + ' ' + r['artikelcode'] for r in weg)} uit de lijst "
            f"({blijft[0]['omschrijving'][:60]})")
    return houd, meldingen


def catalogusfamilies(bestand):
    """Groepeer een catalogusexport op de naam in de omschrijving.
       Geeft (families, overgeslagen, meldingen)."""
    rijen = lees_bron(bestand)
    if not rijen:
        return [], 0, [f"{bestand.name} is leeg"]
    kop = [str(c or "").strip().lower() for c in rijen[0]]

    def kol(*namen):
        for n in namen:
            if n in kop:
                return kop.index(n)
        return None

    i_code = kol("artikelcode", "artikel", "artikelnummer")
    i_merk = kol("merk", "brand", "fabrikant", "leverancier")
    i_oms  = kol("omschrijving", "description")
    if i_code is None or i_oms is None:
        return [], 0, [f"{bestand.name}: kolommen Artikelcode/Omschrijving niet gevonden"]

    # Eerst de regels uitlezen, dan de merkvoorrang toepassen, dan pas groeperen:
    # anders zou een artikel dat afvalt toch al een familie gemaakt hebben.
    uitgelezen = []
    for r in rijen[1:]:
        if not r or i_code >= len(r) or not r[i_code]:
            continue
        uitgelezen.append({
            "artikelcode": str(r[i_code]).strip(),
            "omschrijving": str(r[i_oms] or "") if i_oms < len(r) else "",
            "merk": (str(r[i_merk]).strip()
                     if (i_merk is not None and i_merk < len(r) and r[i_merk]) else ""),
        })
    zonderMerk = lambda x: " ".join(
        re.sub(r"^\s*" + re.escape(x["merk"]) + r"\b[\s,-]*", "", x["omschrijving"], flags=re.I)
        .lower().split()) if x["merk"] else " ".join(x["omschrijving"].lower().split())
    uitgelezen, voorrangsmeldingen = merkVoorrang(uitgelezen, zonderMerk)

    groepen, overgeslagen, meldingen = {}, 0, list(voorrangsmeldingen)
    for rij in uitgelezen:
        code, oms, merk = rij["artikelcode"], rij["omschrijving"], rij["merk"]

        if any(code.endswith(x) for x in SNOER):
            overgeslagen += 1
            continue

        naam = naamzone(normaliseerOmschrijving(oms), merk)
        v, _ = lees_omschrijving(oms, merk)
        # Een armatuur noemt een lichtstroom of een vermogen; een frame, een
        # driver of een montagebeugel niet. Wat toch een lichtstroom noemt en
        # eruit valt wordt gemeld - dan is het het nakijken waard.
        bruikbaar = ("lichtstroom_lm" in v) or ("vermogen_w" in v)
        volledig = ("lichtstroom_lm" in v) and ("vermogen_w" in v)
        toebehoren = bool(naam) and (TOEBEHOREN_HARD.search(naam)
                                     or (TOEBEHOREN_HARD.search(oms) and not volledig)
                                     or (TOEBEHOREN_ZACHT.search(naam) and not volledig))
        # En een regel die een toebehoren noemt maar zelf geen licht geeft, IS
        # dat toebehoren. "Pragmalux LED Paneel Sigma G2 20W Universele LED
        # Driver (DALI2, 1-10V, Push-dim)" is de driver bij het paneel, niet het
        # paneel; zonder deze toets stonden er vijf van die drivers tussen de
        # Sigma-panelen en maakten de twee die alleen naar de serie heten er een
        # eigen familie "Sigma" bij.
        #
        # Het woord staat buiten de naamzone, dus de toetsen hierboven zien het
        # niet, en de zone breedtrekken kan niet: 60 echte panelen worden "Excl.
        # LED Driver" verkocht en zouden dan meevallen. Wat die 60 wel hebben is
        # een lichtopgave - een lichtstroom of een kleurtemperatuur - en een
        # driver of een losse reflector heeft die niet. Gemeten over de hele
        # catalogus haalt dit er 18 regels uit en ze zijn alle 18 toebehoren:
        # drivers voor het Sigma-, Easy- en Fora-assortiment, drivers voor
        # ledstrip, en de losse reflectoren van de Railspot Piccolo - die laatste
        # stonden in de documentatie (nu docs/vergelijker.md) al als het voorbeeld van wat eruit hoort, maar
        # vielen er tot nu toe niet uit omdat "Reflector" achter het vermogen
        # staat en dus buiten de naam valt.
        geen_lichtopgave = ("lichtstroom_lm" not in v) and ("cct_tekst" not in v)
        if not toebehoren and naam and geen_lichtopgave \
           and (TOEBEHOREN_HARD.search(oms) or TOEBEHOREN_ZACHT.search(oms)):
            toebehoren = True
        if not naam or toebehoren or not bruikbaar:
            overgeslagen += 1
            if "lichtstroom_lm" in v and naam:
                meldingen.append(f"overgeslagen maar noemt wel een lichtstroom: {code} — {oms[:80]}")
            continue

        basis, drv, extra = split_suffix(code)
        v.update({"artikelcode": code, "basiscode": basis, "omschrijving": oms})
        v.update({k: w for k, w in DRIVERS.get(drv, {}).items() if w is not None})
        v.update(EXTRA.get(extra, {}))
        # Groeperen gaat op de genormaliseerde sleutel, niet op de naam zoals hij
        # er staat; welke schrijfwijze de familie krijgt beslist toonnaam().
        # Het merk hoort bij de sleutel: dezelfde spot onder twee labels
        # (Pragmalux en White Label) is niet één familie, en anders zou de rij
        # Leverancier op het blad willekeurig een van de twee tonen.
        # De maat gaat uit de familienaam en komt terug als keuze op het artikel:
        # eerst de familie, dan de afmeting. maatSleutel() geeft één schrijfwijze
        # (grootste eerst, hele centimeters), zodat 1195mm en 120cm samenvallen.
        mm = MAAT_IN_NAAM.search(naam)
        if mm:
            v["afmeting"] = maatSleutel(mm)
        elif isinstance(v.get("buitenmaat_mm"), int):
            v["afmeting"] = "\u00d8" + str(v["buitenmaat_mm"])
        elif isinstance(v.get("lengte_cm"), int):
            v["afmeting"] = str(v["lengte_cm"]) + "cm"

        maten = matenVan(v)
        g = groepen.setdefault((merk.lower(), familiesleutel(naam, maten)),
                               {"merk": merk, "varianten": [], "namen": {}, "maten": set()})
        g["varianten"].append(v)
        g["namen"][naam] = g["namen"].get(naam, 0) + 1
        g["maten"] |= maten
        if merk and not g["merk"]:
            g["merk"] = merk

    families = []
    for sleutel, g in sorted(groepen.items()):
        naam = toonnaam(g["namen"], g["maten"])
        laag = naam.lower()
        fam = {"id": slug(naam), "naam": naam, "varianten":
               sorted(g["varianten"], key=lambda x: x["artikelcode"])}
        if g["merk"]:
            fam["merk"] = g["merk"]
        soorten = [s for s, p in SOORTEN if re.search(p, laag, re.I)]
        if soorten:
            fam["armatuurtype"] = soorten[0]
            if len(soorten) > 1:
                fam["zoektermen"] = soorten[1:]
        montage = [m for m, p in MONTAGE if re.search(p, laag, re.I)]
        if montage:
            fam["montagewijzen"] = montage
        families.append(fam)

    # Dragen twee families dezelfde naam, dan zijn ze in de keuzelijst niet uit
    # elkaar te houden. Alleen dáár komt het merk ervoor - overal anders zou het
    # 400 keer "Pragmalux" in de lijst zetten zonder iets te onderscheiden.
    perNaam = collections.Counter(f["naam"] for f in families)
    for fam in families:
        if perNaam[fam["naam"]] > 1 and fam.get("merk"):
            fam["naam"] = fam["merk"] + " " + fam["naam"]
            fam["id"] = slug(fam["naam"])

    # Twee namen die naar hetzelfde id slaan zouden elkaar in de tool overschrijven.
    geteld = collections.Counter()
    for fam in families:
        geteld[fam["id"]] += 1
        if geteld[fam["id"]] > 1:
            fam["id"] = f"{fam['id']}-{geteld[fam['id']]}"
    return families, overgeslagen, meldingen


def pasOverlaysToe(families, blokken):
    """Leg de handgeschreven blokken uit families.json over de gevonden families
       heen. Een blok wijst zijn families aan met "namen" (of met "naam"), en
       alles wat erin staat wint - dat is juist de laag die niet in de prijslijst
       staat. Geeft de meldingen over blokken die niets raakten."""
    opNaam = {}
    for fam in families:
        opNaam.setdefault(plat(fam["naam"]), []).append(fam)

    meldingen = []
    for blok in blokken:
        sleutels = [plat(x) for x in (blok.get("namen") or [blok.get("naam")]) if x]
        raak = [f for s in sleutels for f in opNaam.get(s, [])]
        if not raak:
            meldingen.append(f"[{blok.get('id', blok.get('naam', '?'))}] geen enkele familie in de "
                             f"catalogus heet {' of '.join(repr(s) for s in sleutels)}; "
                             f"dit blok doet niets")
            continue
        velden = {k: w for k, w in blok.items()
                  if k not in ("id", "namen", "varianten", "bron_excel",
                               "alleen_codes_met_prefix")}
        # De naam van de catalogus blijft staan zodra het blok er meer dan één
        # dekt - anders zouden ze allemaal hetzelfde gaan heten.
        if len(raak) > 1:
            velden.pop("naam", None)
            meldingen.append(f"[{blok.get('id', '?')}] dekt {len(raak)} families: "
                             + ", ".join(f["naam"] for f in raak))
        for f in raak:
            f.update(velden)
    return meldingen


def split_suffix(code):
    """Splits artikelcode in (basiscode, driversuffix, extrasuffix)."""
    rest, extra = code, ""
    for s in sorted(EXTRA, key=len, reverse=True):
        if rest.endswith(s):
            rest, extra = rest[: -len(s)], s
            break
    for s in sorted(DRIVERS, key=len, reverse=True):
        if s and rest.endswith(s):
            return rest[: -len(s)], s, extra
    return rest, "", extra


def bronbestand(naam):
    """Het pad naar de export van een familie. families.json noemt vaak nog een
       .xlsx terwijl er inmiddels een uitgeknipte .csv naast ligt; die wint, zodat
       overstappen op csv geen aanpassing in families.json kost."""
    pad = BRON / naam
    csv_pad = pad.with_suffix(".csv")
    if csv_pad.exists():
        return csv_pad
    return pad


def lees_bron(bestand):
    """De rijen van een export, ongeacht of het een .csv of een .xlsx is.
       Geeft een lijst van tuples, met de koprij vooraan."""
    if bestand.suffix.lower() == ".csv":
        import csv
        # utf-8-sig: Excel zet een BOM voor een csv, en die hoort niet in de
        # eerste kolomnaam terecht te komen.
        with bestand.open(newline="", encoding="utf-8-sig") as f:
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
        sys.exit("Deze export is een .xlsx en daarvoor is openpyxl nodig.\n"
                 "Draai eerst: pip install openpyxl — of maak er met "
                 "knip-export.py een .csv van.")
    ws = openpyxl.load_workbook(bestand, read_only=True).worksheets[0]
    return list(ws.iter_rows(values_only=True))


def main():
    if not FAMDEF.exists():
        sys.exit(f"Ontbreekt: {FAMDEF}\nMaak dit bestand eerst aan (zie README).")
    families = json.loads(FAMDEF.read_text(encoding="utf-8"))


    # Wat er al in armaturen.json staat. De Excel-exports blijven buiten de
    # repo, dus wie alleen een familiegegeven aanpast (een foto, een cct) heeft
    # ze niet op schijf staan. Zonder deze vangnet zou zo iemand de artikelen
    # wissen die wel meegeleverd zijn.
    eerder = {}
    if UIT.exists():
        try:
            for f in json.loads(UIT.read_text(encoding="utf-8")).get("families", []):
                if f.get("varianten"):
                    eerder[f.get("id")] = f["varianten"]
        except (json.JSONDecodeError, OSError) as e:
            print(f"Let op: {UIT.name} kon niet gelezen worden ({e}); niets om op terug te vallen.")

    meldingen, totaal = [], 0

    # De catalogus: één export met alles erin. Wat daaruit komt zijn de families
    # zelf; de blokken in families.json zijn er de handgeschreven laag overheen.
    catalogus, uitCatalogus = bronbestand(CATALOGUS), []
    if catalogus.exists():
        uitCatalogus, over, cat_meld = catalogusfamilies(catalogus)
        meldingen += cat_meld
        n = sum(len(f["varianten"]) for f in uitCatalogus)
        print(f"  {catalogus.name:34} {n:4} artikelen in {len(uitCatalogus)} families "
              f"({over} overgeslagen: toebehoren, frames, drivers)")
        totaal += n
        overlays = [f for f in families
                    if not f.get("bron_excel") and not f.get("varianten")]
        meldingen += pasOverlaysToe(uitCatalogus, overlays)
        families = [f for f in families if f not in overlays]

    for fam in families:
        if not fam.get("bron_excel"):
            # Geen export beschikbaar: varianten staan handmatig in families.json.
            n = len(fam.get("varianten", []))
            print(f"  {fam['id']:34} {n:4} artikelen  (handmatig, geen export)")
            totaal += n
            continue
        bestand = bronbestand(fam["bron_excel"])
        if not bestand.exists():
            bewaard = eerder.get(fam.get("id"))
            if bewaard:
                # De export ontbreekt, maar de omschrijvingen staan in
                # armaturen.json. Die lezen we opnieuw, zodat deze artikelen mee
                # veranderen als de lezer hierboven iets nieuws leert; wat de
                # lezer niet vindt blijft staan zoals het stond.
                bewaard = [dict(x, **lees_omschrijving(x.get("omschrijving") or "",
                                                       x.get("merk") or fam.get("merk"))[0])
                           for x in bewaard]
                fam["varianten"] = bewaard
                fam.pop("bron_excel", None)
                fam.pop("alleen_codes_met_prefix", None)
                totaal += len(bewaard)
                print(f"  {fam['id']:34} {len(bewaard):4} artikelen  (export ontbreekt, bestaande bewaard)")
                meldingen.append(f"[{fam['id']}] export {bestand.name} niet gevonden; "
                                 f"de {len(bewaard)} artikelen uit armaturen.json blijven staan. "
                                 f"Zet de export in data/bron/ als je ze wilt bijwerken.")
            else:
                meldingen.append(f"[{fam['id']}] bronbestand niet gevonden: {bestand.name}")
                fam.setdefault("varianten", [])
            continue

        rijen = lees_bron(bestand)
        if not rijen:
            meldingen.append(f"[{fam['id']}] {bestand.name} is leeg")
            fam.setdefault("varianten", [])
            continue
        kop = [str(c or "").strip().lower() for c in rijen[0]]

        def kol(*namen):
            for n in namen:
                if n in kop:
                    return kop.index(n)
            return None

        i_code, i_oms = kol("artikelcode"), kol("omschrijving")
        i_merk = kol("merk", "brand", "fabrikant", "leverancier")
        i_stat, i_bar = kol("status"), kol("barcode 1", "barcode")
        if i_code is None or i_oms is None:
            meldingen.append(f"[{fam['id']}] kolommen Artikelcode/Omschrijving niet gevonden")
            continue

        varianten, overgeslagen = [], 0
        for r in rijen[1:]:
            if not r or not r[i_code]:
                continue
            code = str(r[i_code]).strip()
            oms = str(r[i_oms] or "")
            basis, drv, extra = split_suffix(code)

            if any(code.endswith(s) for s in SNOER):
                overgeslagen += 1
                continue
            if fam.get("alleen_codes_met_prefix") and not re.match(fam["alleen_codes_met_prefix"], code):
                overgeslagen += 1
                continue

            merk = ""
            if i_merk is not None and i_merk < len(r) and r[i_merk]:
                merk = str(r[i_merk]).strip()

            v, mist = lees_omschrijving(oms, merk or fam.get("merk"))
            v.update({"artikelcode": code, "basiscode": basis, "omschrijving": oms})
            # Het merk staat al bij de familie; alleen een artikel dat ervan
            # afwijkt krijgt een eigen regel. Anders staat er 72 keer "Pragmalux"
            # in armaturen.json zonder dat het iets toevoegt.
            if merk and merk != fam.get("merk"):
                v["merk"] = merk
            v.update({k: w for k, w in DRIVERS.get(drv, {}).items() if w is not None})
            v.update(EXTRA.get(extra, {}))
            if i_stat is not None:
                v["status"] = r[i_stat]
            if i_bar is not None:
                v["barcode"] = r[i_bar]
            if mist:
                meldingen.append(f"[{fam['id']}] {code}: niet gevonden in omschrijving — {', '.join(mist)}")
            varianten.append(v)

        fam["varianten"] = sorted(varianten, key=lambda x: x["artikelcode"])
        fam.pop("bron_excel", None)
        fam.pop("alleen_codes_met_prefix", None)
        totaal += len(varianten)
        print(f"  {fam['id']:34} {len(varianten):4} artikelen  ({overgeslagen} overgeslagen)")

    families = families + uitCatalogus
    UIT.parent.mkdir(parents=True, exist_ok=True)
    UIT.write_text(json.dumps({"versie": "1.0", "families": families},
                              indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{len(families)} families, {totaal} artikelen geschreven naar {UIT.relative_to(HIER)}")
    if meldingen:
        print(f"\n{len(meldingen)} punt(en) om na te kijken:")
        for m in meldingen[:40]:
            print("  -", m)
        if len(meldingen) > 40:
            print(f"  ... en nog {len(meldingen)-40}")
    else:
        print("Geen onduidelijkheden.")


if __name__ == "__main__":
    main()
