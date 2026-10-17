/* Czytniki ZIP i XLSX z tools/dane/: próbka z tests/fixtures/mieszkancy, ręcznie złożone ZIP-y
   (obie metody, opis danych, komentarz na końcu) i, o ile są surowe dane, prawdziwy plik GUS. */

import fs from 'node:fs';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SUROWE, wyjscie } from '../../tools/dane/sciezki.ts';
import { arkusze, wiersze } from '../../tools/dane/xlsx.ts';
import { wpisyZip } from '../../tools/dane/zip.ts';

const PROBKA = path.resolve(import.meta.dirname, '../fixtures/mieszkancy/probka.xlsx');
const GOSPODARSTWA = path.join(
  SUROWE,
  'gus/nsp2021-gospodarstwa-rejony/gospodarstwa_w_rejonach_i_obwodach_wg_liczby_osob_nsp2021.xlsx',
);

interface WpisTestowy {
  nazwa: string;
  dane: string;
  metoda: 0 | 8;
  opis?: boolean; // rozmiary w lokalnym nagłówku zerowe, prawdziwe dopiero po danych i w katalogu
}

/** Składa ZIP bajt po bajcie, żeby sprawdzić to, czego nie da się zrobić zipfile'em z Pythona. */
function zipZ(wpisy: WpisTestowy[], komentarz = ''): Buffer {
  const lokalne: Buffer[] = [];
  const katalog: Buffer[] = [];
  let offset = 0;
  for (const w of wpisy) {
    const nazwa = Buffer.from(w.nazwa, 'utf8');
    const surowe = Buffer.from(w.dane, 'utf8');
    const dane = w.metoda === 8 ? deflateRawSync(surowe) : surowe;
    const flagi = w.opis ? 0x0808 : 0x0800;
    const dodatkowe = Buffer.from('lokalne-pole-dodatkowe');
    const lok = Buffer.alloc(30);
    lok.writeUInt32LE(0x04034b50, 0);
    lok.writeUInt16LE(20, 4);
    lok.writeUInt16LE(flagi, 6);
    lok.writeUInt16LE(w.metoda, 8);
    lok.writeUInt16LE(0x21, 12); // 1 stycznia 1980
    if (!w.opis) {
      lok.writeUInt32LE(crc32(surowe), 14);
      lok.writeUInt32LE(dane.length, 18);
      lok.writeUInt32LE(surowe.length, 22);
    }
    lok.writeUInt16LE(nazwa.length, 26);
    lok.writeUInt16LE(dodatkowe.length, 28);
    const opisDanych = Buffer.alloc(w.opis ? 16 : 0);
    if (w.opis) {
      opisDanych.writeUInt32LE(0x08074b50, 0);
      opisDanych.writeUInt32LE(crc32(surowe), 4);
      opisDanych.writeUInt32LE(dane.length, 8);
      opisDanych.writeUInt32LE(surowe.length, 12);
    }
    const kat = Buffer.alloc(46);
    kat.writeUInt32LE(0x02014b50, 0);
    kat.writeUInt16LE(20, 4);
    kat.writeUInt16LE(20, 6);
    kat.writeUInt16LE(flagi, 8);
    kat.writeUInt16LE(w.metoda, 10);
    kat.writeUInt16LE(0x21, 14);
    kat.writeUInt32LE(crc32(surowe), 16);
    kat.writeUInt32LE(dane.length, 20);
    kat.writeUInt32LE(surowe.length, 24);
    kat.writeUInt16LE(nazwa.length, 28);
    kat.writeUInt32LE(offset, 42);
    katalog.push(kat, nazwa);
    const calosc = [lok, nazwa, dodatkowe, dane, opisDanych];
    lokalne.push(...calosc);
    offset += calosc.reduce((suma, b) => suma + b.length, 0);
  }
  const katBajty = Buffer.concat(katalog);
  const kom = Buffer.from(komentarz, 'utf8');
  const koniec = Buffer.alloc(22);
  koniec.writeUInt32LE(0x06054b50, 0);
  koniec.writeUInt16LE(wpisy.length, 8);
  koniec.writeUInt16LE(wpisy.length, 10);
  koniec.writeUInt32LE(katBajty.length, 12);
  koniec.writeUInt32LE(offset, 16);
  koniec.writeUInt16LE(kom.length, 20);
  return Buffer.concat([...lokalne, katBajty, koniec, kom]);
}

describe('ZIP', () => {
  it('czyta wpisy metodą 0 i 8, także z opisem danych, polem dodatkowym i komentarzem na końcu', () => {
    const buf = zipZ(
      [
        { nazwa: 'a.txt', dane: 'bez kompresji', metoda: 0 },
        { nazwa: 'katalog/b.txt', dane: 'deflate '.repeat(50), metoda: 8 },
        { nazwa: 'c.txt', dane: 'opis danych, zażółć gęślą jaźń', metoda: 8, opis: true },
        { nazwa: 'd.txt', dane: 'opis danych bez kompresji', metoda: 0, opis: true },
      ],
      'komentarz z PK\x05\x06 w środku nie psuje szukania od końca',
    );
    const wpisy = wpisyZip(buf);
    expect([...wpisy.keys()]).toEqual(['a.txt', 'katalog/b.txt', 'c.txt', 'd.txt']);
    expect(wpisy.get('a.txt')?.toString()).toBe('bez kompresji');
    expect(wpisy.get('katalog/b.txt')?.toString()).toBe('deflate '.repeat(50));
    expect(wpisy.get('c.txt')?.toString()).toBe('opis danych, zażółć gęślą jaźń');
    expect(wpisy.get('d.txt')?.toString()).toBe('opis danych bez kompresji');
  });

  it('odrzuca to, co nie jest ZIP-em, i plik obcięty', () => {
    expect(() => wpisyZip(Buffer.from('to nie jest zip'))).toThrow(/ZIP/);
    const buf = zipZ([{ nazwa: 'a.txt', dane: 'abc', metoda: 8 }]);
    expect(() => wpisyZip(buf.subarray(0, buf.length - 5))).toThrow(/ZIP/);
  });
});

describe('XLSX, próbka', () => {
  const buf = fs.readFileSync(PROBKA);

  it('podaje nazwy arkuszy w kolejności z workbook.xml', () => {
    expect(arkusze(buf)).toEqual(['Dane - rejony statystyczne', 'Inny']);
  });

  it('czyta nagłówek i wiersze ze współdzielonych ciągów i liczb', () => {
    const rows = wiersze(buf, 'Dane - rejony statystyczne');
    expect(rows).toEqual([
      ['Kod TERYT gminy', 'Nazwa gminy', 'Numer rejonu statystycznego', 'kategoria', 'liczba'],
      ['2261011', 'Gdańsk', '182350', '1', 512],
      ['2261011', 'Gdańsk', '182360', '5+', 87],
    ]);
  });

  it('wstawia null w puste komórki według atrybutu r, czyta teksty inline i liczby z ułamkiem', () => {
    const rows = wiersze(buf, 'Inny');
    expect(rows[0]).toEqual(['a', 'b', 'c', 'd']);
    expect(rows[1]).toEqual([7, 'x & y', null, 2.5]); // brak komórki C2
    expect(rows[2]).toEqual([null, null, 'r t', -1]); // brak A3, pusta B3 ze stylem
  });

  it('czyta skoroszyt złożony ręcznie: bez ciągów współdzielonych, komórki bez r, błędy, formuły, encje', () => {
    const arkusz =
      '<worksheet><sheetData><row><c t="inlineStr"><is><t>a&#10;b &#x41;</t></is></c><c t="e"><v>#N/A</v></c>' +
      '<c t="str"><f>A1</f><v>wynik &amp;lt;</v></c><c t="b"><v>1</v></c><c><f>1+1</f></c></row><row r="2"/>' +
      '</sheetData></worksheet>';
    const reczny = zipZ([
      {
        nazwa: 'xl/workbook.xml',
        dane: '<workbook><sheets><sheet name="Jedyny &amp; ostatni" r:id="rId9"/></sheets></workbook>',
        metoda: 0,
      },
      {
        nazwa: 'xl/_rels/workbook.xml.rels',
        dane: '<Relationships><Relationship Target="worksheets/a.xml" Id="rId9"/></Relationships>',
        metoda: 8,
      },
      { nazwa: 'xl/worksheets/a.xml', dane: arkusz, metoda: 8 },
    ]);
    expect(arkusze(reczny)).toEqual(['Jedyny & ostatni']);
    expect(wiersze(reczny, 'Jedyny & ostatni')).toEqual([['a\nb A', null, 'wynik &lt;', 1, null], []]);
  });

  it('zgłasza brakujący arkusz z listą tych, które są', () => {
    expect(() => wiersze(buf, 'Nie ma')).toThrow(/Nie ma.*Dane - rejony statystyczne/);
  });
});

describe('ścieżki', () => {
  it('wyjscie() składa ścieżkę w public/data/mieszkancy', () => {
    const w = wyjscie('gminy', 'x.json');
    expect(w.endsWith(path.join('public', 'data', 'mieszkancy', 'gminy', 'x.json'))).toBe(true);
    expect(path.isAbsolute(w)).toBe(true);
  });
});

describe('XLSX, surowe dane GUS', () => {
  it.skipIf(!fs.existsSync(SUROWE))('gospodarstwa z NSP 2021 mają ponad 170 000 wierszy rejonów', () => {
    const buf = fs.readFileSync(GOSPODARSTWA);
    expect(arkusze(buf)).toContain('Dane - rejony statystyczne');
    const rows = wiersze(buf, 'Dane - rejony statystyczne');
    expect(rows.length).toBeGreaterThan(170_000);
    expect(rows.every((w) => w.length === 5)).toBe(true);
    expect(rows[0][4]).toBe('Liczba gospodarstw');
    // kolumna z liczbą osób ma liczby (1 do 4) i tekst „5 i więcej”, czytane z jednego arkusza
    expect(rows[1]).toEqual(['0201011', 'gm. m. Bolesławiec', '230850', 1, 85]);
    expect(rows[5][3]).toBe('5 i więcej');
  });
});
