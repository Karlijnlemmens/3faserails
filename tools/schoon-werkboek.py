#!/usr/bin/env python3
"""Een werkboek (.xlsx) ontdoen van wie het maakte, voordat het de openbare repo in gaat.

Gebruik, vanuit de hoofdmap van het project:
    python3 tools/schoon-werkboek.py <bron.xlsx> <doel.xlsx>

Waarom: een werkboek van een collega draagt zijn naam mee in docProps/core.xml
(auteur, laatst gewijzigd door), bij een commentaar zijn naam, werk-e-mailadres en
Microsoft-account-id in xl/persons/person.xml, en het pad op zijn OneDrive in
xl/workbook.xml. Dat hoort niet in een openbare repo. Inhoud, opmaak, afbeeldingen en
de tekst van de commentaren blijven; alleen die velden worden leeggemaakt, zodat Excel
het bestand gewoon blijft openen.

Gemaakt voor de lijst van de binnendienst voor de bandrastertool
(docs/bronnen/bandraster_lijst.xlsx, november 2026). Alleen de standaardbibliotheek.
"""
import re
import sys
import zipfile


def schoon(naam, data):
    """De gewijzigde inhoud van een onderdeel, en wat er veranderd is."""
    if naam == 'docProps/core.xml':
        tekst = data.decode('utf-8')
        nieuw = re.sub(r'<dc:creator>[^<]*</dc:creator>', '<dc:creator></dc:creator>', tekst)
        nieuw = re.sub(r'<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>', '<cp:lastModifiedBy></cp:lastModifiedBy>', nieuw)
        return nieuw.encode('utf-8'), 'auteur en laatst gewijzigd door' if nieuw != tekst else None
    if naam.startswith('xl/persons/') and naam.endswith('.xml'):
        tekst = data.decode('utf-8')
        nieuw = re.sub(r'displayName="[^"]*"', 'displayName=""', tekst)
        nieuw = re.sub(r'userId="[^"]*"', 'userId=""', nieuw)
        nieuw = re.sub(r'providerId="[^"]*"', 'providerId="None"', nieuw)
        return nieuw.encode('utf-8'), 'namen en accounts bij de commentaren' if nieuw != tekst else None
    if naam == 'xl/workbook.xml':
        tekst = data.decode('utf-8')
        nieuw = re.sub(r'<mc:AlternateContent[^>]*>\s*<mc:Choice Requires="x15">\s*<x15ac:absPath[^>]*/>\s*'
                       r'</mc:Choice>\s*</mc:AlternateContent>', '', tekst)
        return nieuw.encode('utf-8'), 'pad waar het werkboek stond' if nieuw != tekst else None
    return data, None


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2].strip())
        sys.exit(1)
    bron, doel = sys.argv[1], sys.argv[2]
    gedaan = []
    with zipfile.ZipFile(bron) as zin, zipfile.ZipFile(doel, 'w', zipfile.ZIP_DEFLATED) as zuit:
        for info in zin.infolist():
            data, wat = schoon(info.filename, zin.read(info.filename))
            if wat:
                gedaan.append(info.filename + ': ' + wat)
            zuit.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED)
    print('Leeggemaakt:' if gedaan else 'Niets gevonden om leeg te maken.')
    for regel in gedaan:
        print('  ' + regel)


if __name__ == '__main__':
    main()
