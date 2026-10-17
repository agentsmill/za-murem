/* Czytnik ZIP bez zależności, dla plików pobranych z sieci (traktowanych jak dane, nigdy jak kod).
   Czyta centralny katalog od końca pliku (rozmiary w lokalnych nagłówkach bywają zerowe, gdy ZIP ma opis
   danych), obsługuje metody 0 (bez kompresji) i 8 (deflate). Bez ZIP64, szyfrowania i weryfikacji CRC. */

import { inflateRawSync } from 'node:zlib';

const SYGNATURA_KONCA = 0x06054b50;
const SYGNATURA_KATALOGU = 0x02014b50;
const SYGNATURA_LOKALNA = 0x04034b50;
const ROZMIAR_KONCA = 22;

interface Wpis {
  nazwa: string;
  metoda: number;
  zaszyfrowany: boolean;
  rozmiarSkompresowany: number;
  rozmiar: number;
  offsetLokalny: number;
}

/** Zapis końca katalogu ma 22 bajty i komentarz do 65 535 bajtów, więc szukamy od końca; trafienie
    musi kończyć plik dokładnie komentarzem, inaczej to przypadkowe bajty z komentarza. */
function znajdzKoniec(buf: Buffer): number {
  const najdalej = Math.max(0, buf.length - ROZMIAR_KONCA - 0xffff);
  for (let i = buf.length - ROZMIAR_KONCA; i >= najdalej; i--) {
    if (buf.readUInt32LE(i) !== SYGNATURA_KONCA) continue;
    if (i + ROZMIAR_KONCA + buf.readUInt16LE(i + 20) === buf.length) return i;
  }
  throw new Error('ZIP: brak zapisu końca katalogu (plik uszkodzony, obcięty albo to nie ZIP)');
}

function katalog(buf: Buffer): Wpis[] {
  const koniec = znajdzKoniec(buf);
  const liczba = buf.readUInt16LE(koniec + 10);
  let poz = buf.readUInt32LE(koniec + 16);
  if (liczba === 0xffff || poz === 0xffffffff) throw new Error('ZIP: ZIP64 nie jest obsługiwany');
  const wpisy: Wpis[] = [];
  for (let i = 0; i < liczba; i++) {
    if (poz + 46 > buf.length || buf.readUInt32LE(poz) !== SYGNATURA_KATALOGU) {
      throw new Error('ZIP: uszkodzony centralny katalog');
    }
    const dlNazwy = buf.readUInt16LE(poz + 28);
    wpisy.push({
      nazwa: buf.toString('utf8', poz + 46, poz + 46 + dlNazwy),
      metoda: buf.readUInt16LE(poz + 10),
      zaszyfrowany: (buf.readUInt16LE(poz + 8) & 1) !== 0,
      rozmiarSkompresowany: buf.readUInt32LE(poz + 20),
      rozmiar: buf.readUInt32LE(poz + 24),
      offsetLokalny: buf.readUInt32LE(poz + 42),
    });
    poz += 46 + dlNazwy + buf.readUInt16LE(poz + 30) + buf.readUInt16LE(poz + 32);
  }
  return wpisy;
}

function rozpakuj(buf: Buffer, w: Wpis): Buffer {
  if (w.zaszyfrowany) throw new Error(`ZIP: wpis ${w.nazwa} jest zaszyfrowany`);
  const l = w.offsetLokalny;
  if (l + 30 > buf.length || buf.readUInt32LE(l) !== SYGNATURA_LOKALNA) {
    throw new Error(`ZIP: zły lokalny nagłówek wpisu ${w.nazwa}`);
  }
  // z lokalnego nagłówka bierzemy tylko długości nazwy i pola dodatkowego, żeby trafić w początek danych
  const start = l + 30 + buf.readUInt16LE(l + 26) + buf.readUInt16LE(l + 28);
  const dane = buf.subarray(start, start + w.rozmiarSkompresowany);
  if (dane.length !== w.rozmiarSkompresowany) throw new Error(`ZIP: wpis ${w.nazwa} jest obcięty`);
  let wynik: Buffer;
  if (w.metoda === 0) wynik = dane;
  else if (w.metoda === 8) wynik = inflateRawSync(dane, { maxOutputLength: Math.max(1, w.rozmiar) });
  else throw new Error(`ZIP: wpis ${w.nazwa} ma nieobsługiwaną metodę ${w.metoda}`);
  if (wynik.length !== w.rozmiar) throw new Error(`ZIP: wpis ${w.nazwa} ma inny rozmiar niż w katalogu`);
  return wynik;
}

/** Jeden wpis po nazwie albo undefined; reszty nie rozpakowuje (arkusz obwodów w pliku GUS ma prawie 300 MB).
    Dla metody 0 zwraca widok na bufor wejściowy, bez kopii. */
export function wpisZip(buf: Buffer, nazwa: string): Buffer | undefined {
  const w = katalog(buf).findLast((x) => x.nazwa === nazwa);
  return w ? rozpakuj(buf, w) : undefined;
}

/** Wszystkie pliki (bez wpisów katalogów, nazwa → zawartość). */
export function wpisyZip(buf: Buffer): Map<string, Buffer> {
  const wynik = new Map<string, Buffer>();
  for (const w of katalog(buf)) {
    if (!w.nazwa.endsWith('/')) wynik.set(w.nazwa, rozpakuj(buf, w));
  }
  return wynik;
}
