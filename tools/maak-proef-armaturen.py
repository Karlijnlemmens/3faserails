"""Maakt tools/proef-armaturen.xlsx: de proeflijst waarmee tools/controleer-logica.mjs
het inlezen van een Excel-lijst in het armaturenboek en de railtool controleert
(armaturen-excel.js). Gemaakt met openpyxl, zodat het een echt .xlsx is zoals een
rekenblad het schrijft - gedeelde teksten, een getal als artikelcode, opgemaakte tekst
in één cel - en geen nagebootst bestand.

Kolom A de code, I de artikelcode, J de omschrijving; B tot en met H en K zijn ruis
die genegeerd moet worden. Geen prijzen: de repo is openbaar.

    python3 tools/maak-proef-armaturen.py
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont

uit = Path(__file__).with_name('proef-armaturen.xlsx')

wb = Workbook()
ws = wb.active
ws.title = 'Armaturenlijst'

ws['A1'] = 'Armaturenlijst - Proefproject'
kop = {'A': 'Code', 'B': 'Aantal', 'C': 'Merk', 'D': 'Ruimte', 'I': 'Artikelnummer', 'J': 'Omschrijving', 'K': 'Opmerking'}
for k, v in kop.items():
    ws[k + '3'] = v

rijen = {
    # gelijk aan de catalogus; de artikelcode is een getal
    4: {'A': 'A', 'B': 12, 'C': 'Pragmalux', 'D': 'Kantoor', 'I': 1092379,
        'J': 'Pragmalux LED Downlight Mondial IP54 facet reflector max. 16W max. 1800lm 3000K-3500K-4000K 3-CCT CRI>90 UGR<19 60D Ø120 excl. LED Driver en frame'},
    # één woord anders dan de catalogus (3uur, de catalogus zegt 1uur)
    5: {'A': 'B', 'B': 4, 'I': '1084459-SN',
        'J': 'Pragmalux LED Plafonnière / Wandarmatuur Dura-M Wit Ø340 IP64 IK10 8-18W 750-2075lm 2200K-2700K 2-CCT + bewegingssensor + noodmodule 3uur autotest'},
    # niet in de catalogus; een & in de tekst
    6: {'A': 'C', 'I': '9999999', 'J': 'Eigen armatuur & zo', 'K': 'via de leverancier'},
    # geen omschrijving in de lijst
    7: {'A': 'D', 'I': '1047515'},
    # een tussenkop: alleen kolom A
    8: {'A': 'Gang'},
    # niet in de catalogus en geen omschrijving
    9: {'A': 'E', 'I': '8888888'},
    # gelijk, met spaties eromheen en een dubbele spatie
    11: {'A': ' G ', 'I': ' 1092416 ',
         'J': 'Pragmalux LED Downlight Mondial IP54  platte frame alu wit Ø168 buitenmaat - gatmaat Ø150'},
}
for r, cellen in rijen.items():
    for k, v in cellen.items():
        ws[f'{k}{r}'] = v
# gelijk, maar de omschrijving is opgemaakte tekst: drie stukken in één cel
ws['A10'] = 'F'
ws['I10'] = '1092409'
ws['J10'] = CellRichText('Pragmalux LED Downlight Mondial IP54 ', TextBlock(InlineFont(b=True), 'platte frame'),
                         ' alu wit Ø132 buitenmaat - gatmaat Ø120')

# een tweede blad dat niet gelezen mag worden
ws2 = wb.create_sheet('Notities')
ws2['A1'] = 'X'
ws2['I1'] = '1092423'
ws2['J1'] = 'hoort er niet bij'

wb.save(uit)
print(uit)
