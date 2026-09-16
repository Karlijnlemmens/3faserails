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

import json, re, sys
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
}
SNOER = ("-GST3", "-GST3S", "-EUR", "-ST3", "-ST3S", "-ST5", "-ST5S")

# Suffixen die een uitvoeringskenmerk aanduiden (waterdichte armaturen).
EXTRA = {"-S": {"sensor": True}, "-N": {"noodverlichting": "3u"},
         "-SN": {"sensor": True, "noodverlichting": "3u"}}


def getal(s):
    return float(str(s).replace(",", ".")) if s is not None else None


def lees_omschrijving(o):
    """Haal technische gegevens uit de omschrijvingstekst. Geeft (velden, ontbrekend)."""
    v, mist = {}, []

    m = re.search(r"(\d+[,.]?\d*)\s*[-–]\s*(\d+[,.]?\d*)\s*W\b", o)
    if m:
        v["vermogen_w"] = {"min": getal(m.group(1)), "max": getal(m.group(2))}
    else:
        m = re.search(r"max\.?\s*(\d+[,.]?\d*)\s*W\b", o) or re.search(r"\b(\d+[,.]?\d*)\s*W\b", o)
        if m:
            v["vermogen_w"] = {"min": None, "max": getal(m.group(1)),
                               "opmerking": "ondergrens afhankelijk van gekozen driver"}
        else:
            mist.append("vermogen")

    m = re.search(r"(\d+)\s*[-–]\s*(\d+)\s*lm\b", o)
    if m:
        v["lichtstroom_lm"] = {"min": int(m.group(1)), "max": int(m.group(2))}
    else:
        m = re.search(r"max\.?\s*(\d+)\s*lm\b", o) or re.search(r"\b(\d+)\s*lm\b", o)
        if m:
            v["lichtstroom_lm"] = {"min": None, "max": int(m.group(1))}
        else:
            mist.append("lichtstroom")

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
    if "zaagmaat_mm" not in v and "buitenmaat_mm" not in v:
        m = re.search(r"\b(\d{2,3})\s*cm\b", o)
        if m:
            v["lengte_cm"] = int(m.group(1))
        else:
            mist.append("afmeting")

    for k in ("wit", "zwart", "grijs"):
        if re.search(r"\b" + k + r"\b", o, re.I):
            v["kleur"] = k
            break
    for k in ("standaard", "verdiept", "opbouw", "inbouw", "pendel"):
        if re.search(r"\b" + k + r"\w*\b", o, re.I):
            v["uitvoering"] = k
            break

    m = re.search(r"IP\s*(\d{2})", o)
    if m:
        v["ip"] = int(m.group(1))
    if re.search(r"\bPIR\b|bewegingssensor", o, re.I):
        v["sensor"] = True
    if re.search(r"noodmodule|noodverlichting", o, re.I):
        v.setdefault("noodverlichting", "3u")
    return v, mist


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

            v, mist = lees_omschrijving(oms)
            v.update({"artikelcode": code, "basiscode": basis, "omschrijving": oms})
            v.update(DRIVERS.get(drv, {}))
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
