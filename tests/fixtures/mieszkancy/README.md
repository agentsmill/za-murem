# Próbka XLSX do testów czytnika

`probka.xlsx` to mały skoroszyt zrobiony ręcznie, bez Excela, żeby test czytnika (`tests/unit/dane-xlsx.test.ts`) chodził bez surowych danych GUS. Układ jest taki jak w plikach z NSP 2021: nazwy arkuszy w `xl/workbook.xml`, ich pliki w `xl/_rels/workbook.xml.rels`, ciągi znaków w `xl/sharedStrings.xml`, wszystko skompresowane (ZIP_DEFLATED).

- „Dane - rejony statystyczne” (plik `sheet2.xml`, w relacjach ścieżka względna): nagłówek i dwa wiersze, teksty ze współdzielonych ciągów (nazwa „Gdańsk” z rozbitego tekstu sformatowanego), liczba w ostatniej kolumnie.
- „Inny” (plik `sheet1.xml`, w relacjach ścieżka bezwzględna): teksty inline, liczba z ułamkiem, encja `&amp;`, brakująca komórka C2, pusta komórka z samym stylem B3 i brakująca A3.

Odtworzenie, z korzenia repozytorium (skrypt idzie ze standardowego wejścia, więc nie leży w katalogu fixture'a, a `-I` odcina bieżący katalog od ścieżki importów):

```bash
python3 -I - tests/fixtures/mieszkancy/probka.xlsx <<'PY'
import sys
import zipfile

XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
RELNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PAKIET = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE = 'application/vnd.openxmlformats-officedocument.spreadsheetml'

def tekst(t):
    return f'<si><t>{t}</t></si>'

# „Gdańsk” jako tekst sformatowany z dwóch kawałków, jak robi Excel przy zmianie formatu w komórce
GDANSK = '<si><r><t>Gda</t></r><r><rPr><b/></rPr><t>ńsk</t></r></si>'
wspolne = [tekst(t) for t in ('Kod TERYT gminy', 'Nazwa gminy', 'Numer rejonu statystycznego', 'kategoria', 'liczba', '2261011')]
wspolne += [GDANSK] + [tekst(t) for t in ('182350', '1', '182360', '5+')]

def s(i, ref):
    return f'<c r="{ref}" s="5" t="s"><v>{i}</v></c>'

dane = (
    '<row r="1">' + ''.join(s(i, f'{"ABCDE"[i]}1') for i in range(5)) + '</row>'
    '<row r="2">' + s(5, 'A2') + s(6, 'B2') + s(7, 'C2') + s(8, 'D2') + '<c r="E2" s="5"><v>512</v></c></row>'
    '<row r="3">' + s(5, 'A3') + s(6, 'B3') + s(9, 'C3') + s(10, 'D3') + '<c r="E3" s="5"><v>87</v></c></row>'
)

def inl(ref, t):
    return f'<c r="{ref}" t="inlineStr"><is><t>{t}</t></is></c>'

inny = (
    '<row r="1">' + inl('A1', 'a') + inl('B1', 'b') + inl('C1', 'c') + inl('D1', 'd') + '</row>'
    '<row r="2"><c r="A2"><v>7</v></c>' + inl('B2', 'x &amp; y') + '<c r="D2" t="n"><v>2.5</v></c></row>'
    '<row r="3"><c r="B3" s="1"/><c r="C3" t="inlineStr"><is><r><t>r</t></r>'
    '<r><t xml:space="preserve"> t</t></r></is></c><c r="D3"><v>-1</v></c></row>'
)

def arkusz(wiersze, zakres):
    return XML + f'<worksheet {NS}><dimension ref="{zakres}"/><sheetData>{wiersze}</sheetData></worksheet>'

pliki = {
    '[Content_Types].xml': XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'<Override PartName="/xl/workbook.xml" ContentType="{OFFICE}.sheet.main+xml"/>'
        f'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="{OFFICE}.worksheet+xml"/>'
        f'<Override PartName="/xl/worksheets/sheet2.xml" ContentType="{OFFICE}.worksheet+xml"/>'
        f'<Override PartName="/xl/sharedStrings.xml" ContentType="{OFFICE}.sharedStrings+xml"/></Types>',
    '_rels/.rels': XML + f'<Relationships xmlns="{PAKIET}">'
        f'<Relationship Id="rId1" Type="{RELNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    # kolejność kart: najpierw „Dane”, potem „Inny”, a pliki arkuszy leżą w odwrotnej kolejności
    'xl/workbook.xml': XML + f'<workbook {NS} xmlns:r="{RELNS}"><sheets>'
        '<sheet name="Dane - rejony statystyczne" sheetId="5" r:id="rId2"/>'
        '<sheet name="Inny" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': XML + f'<Relationships xmlns="{PAKIET}">'
        f'<Relationship Id="rId1" Type="{RELNS}/worksheet" Target="/xl/worksheets/sheet1.xml"/>'
        f'<Relationship Id="rId2" Type="{RELNS}/worksheet" Target="worksheets/sheet2.xml"/>'
        f'<Relationship Id="rId3" Type="{RELNS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    'xl/sharedStrings.xml': XML + f'<sst {NS} count="13" uniqueCount="{len(wspolne)}">{"".join(wspolne)}</sst>',
    'xl/worksheets/sheet2.xml': arkusz(dane, 'A1:E3'),
    'xl/worksheets/sheet1.xml': arkusz(inny, 'A1:D3'),
}

with zipfile.ZipFile(sys.argv[1], 'w') as zf:
    for nazwa, tresc in pliki.items():
        # stała data w nagłówku, żeby ponowne zrobienie pliku dawało te same bajty
        wpis = zipfile.ZipInfo(nazwa, date_time=(1980, 1, 1, 0, 0, 0))
        zf.writestr(wpis, tresc.encode('utf-8'), compress_type=zipfile.ZIP_DEFLATED)
PY
```
